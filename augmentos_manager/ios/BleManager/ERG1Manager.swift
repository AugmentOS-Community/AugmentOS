//
//  ERG1Manager.swift
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 3/3/25.
//

import Combine
import CoreBluetooth
import Foundation
import UIKit
import React

extension Data {
  func chunked(into size: Int) -> [Data] {
    var chunks = [Data]()
    var index = 0
    while index < count {
      let chunkSize = Swift.min(size, count - index)
      let chunk = subdata(in: index..<(index + chunkSize))
      chunks.append(chunk)
      index += chunkSize
    }
    return chunks
  }
  
  func hexEncodedString() -> String {
    return map { String(format: "%02x", $0) }.joined()
  }
}

struct SendRequest {
  let data: Data
  let onlyLeft: Bool
  let onlyRight: Bool
  var waitTime: Int
  
  init(data: Data, onlyLeft: Bool = false, onlyRight: Bool = false, waitTime: Int = -1) {
    self.data = data
    self.onlyLeft = onlyLeft
    self.onlyRight = onlyRight
    self.waitTime = waitTime
  }
}

struct SendRequest2 {
  let data: Data
  let onlyLeft: Bool
  let onlyRight: Bool
  var waitTime: Int
  
  init(data: Data, onlyLeft: Bool = false, onlyRight: Bool = false, waitTime: Int = -1) {
    self.data = data
    self.onlyLeft = onlyLeft
    self.onlyRight = onlyRight
    self.waitTime = waitTime
  }
}

// Simple struct to hold app info
struct AppInfo {
  let id: String
  let name: String
}

enum GlassesError: Error {
  case missingGlasses(String)
}


class BooleanWaiter {
  private var flag = true
  private let semaphore = DispatchSemaphore(value: 0)
  
  func waitWhileTrue(_ timeout: DispatchTime) -> Bool {
    guard flag else { return true }
    let result = semaphore.wait(timeout: timeout)
    return result == .success
  }
  
  func setTrue() {
    flag = true
  }
  
  func setFalse() {
    flag = false
    semaphore.signal()
  }
  
  var isTrue: Bool {
    return flag
  }
}

struct ViewState {
  var topText: String
  var bottomText: String
  var layoutType: String
  var text: String
}

@objc(ERG1Manager) class ERG1Manager: NSObject {
  
  // todo: we probably don't need this
  @objc static func requiresMainQueueSetup() -> Bool { return true }
  
  var onConnectionStateChanged: (() -> Void)?
  private var _g1Ready: Bool = false
  public var g1Ready: Bool {
    get { return _g1Ready }
    set {
      let oldValue = _g1Ready
      _g1Ready = newValue
      if oldValue != newValue {
        // Call the callback when state changes
        onConnectionStateChanged?()
      }
      if (!newValue) {
        // Reset battery levels when disconnected
        batteryLevel = -1
        leftBatteryLevel = -1
        rightBatteryLevel = -1
      }
    }
  }
  
  @Published public var voiceData: Data = Data()
  @Published public var aiListening: Bool = false
  @Published public var batteryLevel: Int = -1
  @Published public var caseBatteryLevel: Int = -1
  @Published public var leftBatteryLevel: Int = -1
  @Published public var rightBatteryLevel: Int = -1
  
  var viewStates: [ViewState] = [
    ViewState(topText: " ", bottomText: " ", layoutType: "text_wall", text: ""),
    ViewState(topText: " ", bottomText: " ", layoutType: "text_wall", text: "AUGMENTOS_SERVER_NOT_CONNECTED"),
  ]
  
  enum AiMode: String {
    case AI_REQUESTED
    case AI_MIC_ON
    case AI_IDLE
  }
  
  let UART_SERVICE_UUID = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
  let UART_TX_CHAR_UUID = CBUUID(string: "6E400002-B5A3-F393-E0A9-E50E24DCCA9E")
  let UART_RX_CHAR_UUID = CBUUID(string: "6E400003-B5A3-F393-E0A9-E50E24DCCA9E")
  
  var sendQueue: [Array<SendRequest>] = []
  var isWorkerRunning = false
  let sendQueueLock = NSLock()
  
  // Waiters for synchronization
  let leftWaiter = BooleanWaiter()
  let rightWaiter = BooleanWaiter()
  let leftServicesWaiter = BooleanWaiter()
  let rightServicesWaiter = BooleanWaiter()
  
  // Constants
  var DEVICE_SEARCH_ID = "74_"
  let DELAY_BETWEEN_CHUNKS_SEND: UInt64 = 16_000_000 // 16ms
  let DELAY_BETWEEN_SENDS_MS: UInt64 = 8_000_000 // 8ms
  let INITIAL_CONNECTION_DELAY_MS: UInt64 = 350_000_000 // 350ms
  public var textHelper = G1Text()
  
  public let WHITELIST_CMD: UInt8 = 0x04 // Command ID for whitelist
  
  public static let _bluetoothQueue = DispatchQueue(label: "BluetoothG1", qos: .userInitiated)
  
  private var aiMode: AiMode = .AI_IDLE {
    didSet {
      if aiMode == .AI_MIC_ON {
        aiListening = true
      } else {
        aiListening = false
      }
    }
  }
  
  private var responseModel:AiResponseToG1Model?
  private var receivedAck = false
  private var displayingResponseAiRightAck: Bool = false
  private var displayingResponseAiLeftAck: Bool = false
  
  private var evenaiSeq: UInt8 = 0
  private var centralManager: CBCentralManager!
  private var leftPeripheral: CBPeripheral?
  private var rightPeripheral: CBPeripheral?
  private var connectedDevices: [String: (CBPeripheral?, CBPeripheral?)] = [:]
  var lastConnectionTimestamp: Date = Date.distantPast
  private var leftInitialized: Bool = false
  private var rightInitialized: Bool = false
  private var isHeadUp = false
  public var dashboardEnabled = true
  
  private var aiTriggerTimeoutTimer: Timer?
  
  override init() {
    super.init()
    centralManager = CBCentralManager(delegate: self, queue: ERG1Manager._bluetoothQueue)
  }
  
  // @@@ REACT NATIVE FUNCTIONS @@@
  
  @objc func RN_setSearchId(_ searchId: String) {
    print("SETTING SEARCH_ID: \(searchId)")
    DEVICE_SEARCH_ID = searchId
  }
  
  // this scans for new (un-paired) glasses to connect to:
  @objc func RN_startScan() -> Bool {
    guard centralManager.state == .poweredOn else {
      print("Bluetooth is not powered on.")
      return false
    }
    
    print("startScan()")
    print("search ID: \(DEVICE_SEARCH_ID)")
    
    // send our already connected devices to RN:
    let devices = getConnectedDevices()
    for device in devices {
      if let name = device.name {
        print("Connected to device: \(name)")
        if name.contains("_L_") && name.contains(DEVICE_SEARCH_ID) {
          leftPeripheral = device
          device.delegate = self
          device.discoverServices([UART_SERVICE_UUID])
        } else if name.contains("_R_") && name.contains(DEVICE_SEARCH_ID) {
          rightPeripheral = device
          device.delegate = self
          device.discoverServices([UART_SERVICE_UUID])
        }
        emitDiscoveredDevice(name);
      }
    }
    
    centralManager.scanForPeripherals(withServices: nil, options: nil)
    print("Scanning for devices...")
    return true
  }
  
  @objc public func RN_pairById(_ id: String) -> Bool {
    self.DEVICE_SEARCH_ID = id + "_"
    RN_startScan();
    return true
  }
  
  // connect to glasses we've already paired with:
  @objc public func RN_connectGlasses() -> Bool {
    if let leftPeripheral = leftPeripheral {
      centralManager.connect(leftPeripheral, options: nil)
    }
    
    if let rightPeripheral = rightPeripheral {
      centralManager.connect(rightPeripheral, options: nil)
    }
    // just return if we don't have both a left and right arm:
    guard let leftPeripheral, let rightPeripheral else {
      return false;
    }
    print("Connected to both glasses, starting heartbeat timer and turning off silent mode...");
    startHeartbeatTimer();
    Task {
      await setSilentMode(false);
    }
    return true
  }
  
  @objc public func RN_sendText(_ text: String) -> Void {
    // Use Task to handle async operations properly
    Task {
      
      let displayText = "\(text)"
      guard let textData = displayText.data(using: .utf8) else { return }
      
      var command: [UInt8] = [
        0x4E,           // SEND_RESULT command
        0x00,           // sequence number
        0x01,           // total packages
        0x00,           // current package
        0x71,           // screen status (0x70 Text Show | 0x01 New Content)
        0x00,           // char position 0
        0x00,           // char position 1
        0x01,           // page number
        0x01            // max pages
      ]
      command.append(contentsOf: Array(textData))
      
      await sendCommand(command)
      
      //      let success = await sendText(text: text)
      //      print("Send text operation completed with result: \(success)")
    }
  }
  
  @objc public func RN_sendTextWall(_ text: String) -> Void {
    let chunks = textHelper.createTextWallChunks(text)
    //      sendChunks(chunks)
    for chunk in chunks {
      print("Sending chunk: \(chunk)")
      Task {
        await sendCommand(chunk)
      }
    }
  }
  
  
  @objc public func RN_sendDoubleTextWall(_ top: String, _ bottom: String) -> Void {
    let chunks = textHelper.createDoubleTextWallChunks(textTop: top, textBottom: bottom)
    Task {
      for chunk in chunks {
        usleep(50000)// sleep for 50ms// TODO: ios not sure if necessary
        await sendCommand(chunk)
      }
    }
  }
  
  public func handleDisplayEvent(_ event: [String: Any]) -> Void {
    
    guard let view = event["view"] as? String else {
      print("invalid view")
      return
    }
    let isDashboard = view == "dashboard"
    
    var stateIndex = 0;
    if (isDashboard) {
      stateIndex = 1
    } else {
      stateIndex = 0
    }
    
    let layout = event["layout"] as! [String: Any];
    self.viewStates[stateIndex].layoutType = layout["layoutType"] as! String
    
    switch self.viewStates[stateIndex].layoutType {
    case "text_wall":
      self.viewStates[stateIndex].text = layout["text"] as? String ?? " "
      break
    case "double_text_wall":
      self.viewStates[stateIndex].topText = layout["topText"] as? String ?? " "
      self.viewStates[stateIndex].bottomText = layout["bottomText"] as? String ?? " "
      break
    default:
      break
    }
    
    // send the state we just received if the user is currently in that state:
    if (stateIndex == 0 && !isHeadUp) {
      sendCurrentState(false)
    } else if (stateIndex == 1 && isHeadUp) {
      sendCurrentState(true)
    }
  }
  
  public func sendCurrentState(_ isDashboard: Bool) -> Void {
    Task {
      var currentViewState: ViewState!;
      if (isDashboard) {
        currentViewState = self.viewStates[1]
      } else {
        currentViewState = self.viewStates[0]
      }
      
      if (isDashboard && !dashboardEnabled) {
        return
      }
      
      let layoutType = currentViewState.layoutType
      switch layoutType {
      case "text_wall":
        let text = currentViewState.text
        //        let chunks = textHelper.createTextWallChunks(text)
        //        for chunk in chunks {
        //          print("Sending chunk: \(chunk)")
        //          await sendCommand(chunk)
        //        }
        RN_sendText(text);
        break
      case "double_text_wall":
        let topText = currentViewState.topText
        let bottomText = currentViewState.bottomText
        RN_sendDoubleTextWall(topText, bottomText);
        break
      default:
        break
      }
      
    }
  }
  
  @objc func RN_stopScan() {
    centralManager.stopScan()
    print("Stopped scanning for devices")
  }
  
  @objc func disconnect() {
    if let leftPeripheral = leftPeripheral {
      centralManager.cancelPeripheralConnection(leftPeripheral)
    }
    
    if let rightPeripheral = rightPeripheral {
      centralManager.cancelPeripheralConnection(rightPeripheral)
    }
    
    leftPeripheral = nil
    rightPeripheral = nil
    self.g1Ready = false
    
    print("Disconnected from glasses")
  }
  
  // @@@ END REACT NATIVE FUNCTIONS
  
  private func startAITriggerTimeoutTimer() {
    let backgroundQueue = DispatchQueue(label: "com.sample.aiTriggerTimerQueue", qos: .default)
    
    backgroundQueue.async { [weak self] in
      self?.aiTriggerTimeoutTimer = Timer(timeInterval: 6.0, repeats: false) { [weak self] _ in
        guard let self = self else { return }
        guard let rightPeripheral = self.rightPeripheral else { return }
        guard let leftPeripheral = self.leftPeripheral else { return }
        sendMicOn(to: rightPeripheral, isOn: false)
        
        if let leftChar = getWriteCharacteristic(for: leftPeripheral),
           let rightChar = getWriteCharacteristic(for: rightPeripheral) {
          exitAllFunctions(to: leftPeripheral, characteristic: leftChar)
          exitAllFunctions(to: rightPeripheral, characteristic: rightChar)
        }
      }
      
      RunLoop.current.add((self?.aiTriggerTimeoutTimer)!, forMode: .default)
      RunLoop.current.run()
    }
  }
  
  func startHeartbeatTimer() {
    let backgroundQueue = DispatchQueue(label: "com.sample.heartbeatTimerQueue", qos: .background)
    
    backgroundQueue.async { [weak self] in
      let timer = Timer(timeInterval: 15.0, repeats: true) { [weak self] _ in
        guard let self = self else { return }
        guard let leftPeripheral = self.leftPeripheral else { return }
        self.sendHeartbeat(to: leftPeripheral)
        guard let rightPeripheral = self.rightPeripheral else { return }
        self.sendHeartbeat(to: rightPeripheral)
      }
      
      RunLoop.current.add(timer, forMode: .default)
      RunLoop.current.run()
    }
  }
  
  private func findCharacteristic(uuid: CBUUID, peripheral: CBPeripheral) -> CBCharacteristic? {
    for service in peripheral.services ?? [] {
      for characteristic in service.characteristics ?? [] {
        if characteristic.uuid == uuid {
          return characteristic
        }
      }
    }
    return nil
  }
  
  private func getConnectedDevices() -> [CBPeripheral] {
    let connectedPeripherals = centralManager.retrieveConnectedPeripherals(withServices: [UART_SERVICE_UUID])
    //    for peripheral in connectedPeripherals {
    //      print("Connected device: \(peripheral.name ?? "Unknown") - UUID: \(peripheral.identifier.uuidString)")
    //    }
    return connectedPeripherals
  }
  
  private func handleNotification(from peripheral: CBPeripheral, data: Data) {
    guard let command = data.first else { return }// ensure the data isn't empty
    
    //      print("received from G1: \(data.hexEncodedString())")
    
    
    // Clear the appropriate waiter when we get acknowledgment
    if data.count > 1 {
      let command = data[0]
      let response = data.count > 1 ? data[1] : 0
      
      // Check for ACK response in various commands
      if command == Commands.BLE_REQ_EVENAI.rawValue && response == CommandResponse.ACK.rawValue {
        if peripheral == rightPeripheral {
          rightWaiter.setFalse()
          print("Right glass acknowledged")
        } else if peripheral == leftPeripheral {
          leftWaiter.setFalse()
          print("Left glass acknowledged")
        }
      }
    }
    
    switch Commands(rawValue: command) {
    case .BLE_REQ_INIT:
      handleInitResponse(from: peripheral, success: data[1] == CommandResponse.ACK.rawValue)
      break
    case .BLE_REQ_MIC_ON:
      let acknowledge = CommandResponse(rawValue: data[1])
      if acknowledge == .ACK {
        if aiMode == .AI_REQUESTED {
          aiMode = .AI_MIC_ON
          print("Microphone turned on successfully")
        } else {
          print("Microphone turned on in continuous listening mode")
        }
      } else {
        print("Microphone activation failed")
        aiMode = .AI_IDLE
      }
    case .BLE_REQ_TRANSFER_MIC_DATA:
      self.voiceData = data
      //          print("Got voice data: " + String(data.count))
      break
    case .BLE_REQ_HEARTBEAT:
      // battery info
      guard data.count >= 6 && data[1] == 0x66 else {
        break
      }
      
      // Response format: 2C 66 [battery%] [flags] [voltage_low] [voltage_high] ...
      let batteryPercent = Int(data[2])
      let flags = data[3]
      let voltageLow = Int(data[4])
      let voltageHigh = Int(data[5])
      let rawVoltage = (voltageHigh << 8) | voltageLow
      let voltage = rawVoltage / 10  // Scale down by 10 to get actual millivolts
      
//      print("Raw battery data - Battery: \(batteryPercent)%, Voltage: \(voltage)mV, Flags: 0x\(String(format: "%02X", flags))")
      
      // if left, update left battery level, if right, update right battery level
      if peripheral == leftPeripheral {
        if leftBatteryLevel != batteryPercent {
          print("Left glass battery: \(batteryPercent)%")
          leftBatteryLevel = batteryPercent
        }
      } else if peripheral == rightPeripheral {
        if rightBatteryLevel != batteryPercent {
          print("Right glass battery: \(batteryPercent)%")
          rightBatteryLevel = batteryPercent
        }
      }
      
      // update the main battery level as the lower of the two
      batteryLevel = min(leftBatteryLevel, rightBatteryLevel)
      break
    case .BLE_REQ_EVENAI:
      guard data.count > 1 else { break }
      let acknowledge = CommandResponse(rawValue: data[1])
      if acknowledge == .ACK {
        if peripheral == self.rightPeripheral {
          rightWaiter.setFalse()
          self.displayingResponseAiRightAck = true
        }
        if peripheral == self.leftPeripheral {
          leftWaiter.setFalse()
          self.displayingResponseAiLeftAck = true
        }
        receivedAck = self.displayingResponseAiRightAck && self.displayingResponseAiLeftAck
      }
      
      print("Received EvenAI response: \(data.hexEncodedString())")
    case .BLE_REQ_DEVICE_ORDER:
      let order = data[1]
      switch DeviceOrders(rawValue: order) {
      case .HEAD_UP:
        isHeadUp = true
        sendCurrentState(true)
        break
      case .HEAD_UP2:
        isHeadUp = true
        sendCurrentState(true)
        break
      case .HEAD_DOWN:
        isHeadUp = false
        sendCurrentState(false)
        break
      case .HEAD_DOWN2:
        isHeadUp = false
        sendCurrentState(false)
        break
      case .ACTIVATED:
        print("ACTIVATED")
        break
      case .SILENCED:
        print("SILENCED")
        break
      case .DISPLAY_READY:
        self.responseModel = nil
      case .TRIGGER_FOR_AI:
        if let rightPeripheral {
          aiTriggerTimeoutTimer?.invalidate()
          aiTriggerTimeoutTimer = nil
          startAITriggerTimeoutTimer()
          aiMode = .AI_REQUESTED
          sendMicOn(to: rightPeripheral, isOn: true)
        }
        print("Trigger AI")
      case .TRIGGER_FOR_STOP_RECORDING:
        aiTriggerTimeoutTimer?.invalidate()
        aiTriggerTimeoutTimer = nil
        aiMode = .AI_IDLE
      case .TRIGGER_CHANGE_PAGE:
        guard var responseModel else { return }
        print("Change Page right")
        if responseModel.currentPage < responseModel.totalPages {
          responseModel.currentPage += 1
          self.responseModel = responseModel
          Task {
            await self.manualTextControl()
          }
        } else {
          print("Change Page left")
          if responseModel.currentPage > 1 {
            responseModel.currentPage -= 1
            self.responseModel = responseModel
            Task {
              await self.manualTextControl()
            }
          }
        }
      default:
        print("Received device order: \(data.subdata(in: 1..<data.count).hexEncodedString())")
        break
      }
    default:
      //          print("received from G1(not handled): \(data.hexEncodedString())")
      break
    }
  }
}
// MARK: Commands
extension ERG1Manager {
  
  // Handle whitelist functionality
  func getWhitelistChunks() -> [UInt8] {
    // Define the hardcoded whitelist JSON
    let apps = [
      AppInfo(id: "com.augment.os", name: "AugmentOS"),
      AppInfo(id: "io.heckel.ntfy", name: "ntfy")
    ]
    let whitelistJson = createWhitelistJson(apps: apps)
    
    print("Creating chunks for hardcoded whitelist: \(whitelistJson)")
    
    // Convert JSON to bytes and split into chunks
    return createWhitelistChunks(json: whitelistJson)
  }
  
  private func createWhitelistJson(apps: [AppInfo]) -> String {
    do {
      // Create app list array
      var appListArray: [[String: Any]] = []
      for app in apps {
        let appDict: [String: Any] = [
          "id": app.id,
          "name": app.name
        ]
        appListArray.append(appDict)
      }
      
      // Create the whitelist dictionary
      let whitelistDict: [String: Any] = [
        "calendar_enable": false,
        "call_enable": false,
        "msg_enable": false,
        "ios_mail_enable": false,
        "app": [
          "list": appListArray,
          "enable": true
        ]
      ]
      
      // Convert to JSON string
      let jsonData = try JSONSerialization.data(withJSONObject: whitelistDict, options: [])
      if let jsonString = String(data: jsonData, encoding: .utf8) {
        return jsonString
      } else {
        return "{}"
      }
    } catch {
      print("Error creating whitelist JSON: \(error.localizedDescription)")
      return "{}"
    }
  }
  
  // Helper function to split JSON into chunks
  private func createWhitelistChunks(json: String) -> [UInt8] {
    let MAX_CHUNK_SIZE = 180 - 4 // Reserve space for the header
    guard let jsonData = json.data(using: .utf8) else { return [] }
    
    let totalChunks = Int(ceil(Double(jsonData.count) / Double(MAX_CHUNK_SIZE)))
    var chunks: [Data] = []
    
    for i in 0..<totalChunks {
      let start = i * MAX_CHUNK_SIZE
      let end = min(start + MAX_CHUNK_SIZE, jsonData.count)
      let range = start..<end
      let payloadChunk = jsonData.subdata(in: range)
      
      // Create the header: [WHITELIST_CMD, total_chunks, chunk_index]
      var headerData = Data()
      headerData.append(WHITELIST_CMD)
      headerData.append(UInt8(totalChunks))
      headerData.append(UInt8(i))
      
      // Combine header and payload
      var chunkData = Data()
      chunkData.append(headerData)
      chunkData.append(payloadChunk)
      
      chunks.append(chunkData)
    }
    
    // Convert Data objects to [UInt8] array:
    return chunks.flatMap { Array($0) }
  }
  
  func exitAllFunctions(to peripheral: CBPeripheral, characteristic: CBCharacteristic) {
    var data = Data()
    data.append(Commands.BLE_EXIT_ALL_FUNCTIONS.rawValue)
    peripheral.writeValue(data, for: characteristic, type: .withoutResponse)
  }
  
  private func sendMicOn(to peripheral: CBPeripheral, isOn: Bool) {
    var micOnData = Data()
    micOnData.append(Commands.BLE_REQ_MIC_ON.rawValue)
    if isOn {
      micOnData.append(0x01)
    } else {
      micOnData.append(0x00)
    }
    
    if let txChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: peripheral) {
      peripheral.writeValue(micOnData, for: txChar, type: .withResponse)
    }
  }
  
  private func sendInitCommand(to peripheral: CBPeripheral, characteristic: CBCharacteristic) {
    let initData = Data([Commands.BLE_REQ_INIT.rawValue, 0x01])
    peripheral.writeValue(initData, for: characteristic, type: .withResponse)
  }
  
  private func handleInitResponse(from peripheral: CBPeripheral, success: Bool) {
    if peripheral == leftPeripheral {
      leftInitialized = success
      print("Left arm initialized: \(success)")
    } else if peripheral == rightPeripheral {
      rightInitialized = success
      print("Right arm initialized: \(success)")
    }
    
    // Only proceed if both glasses are initialized
    if leftInitialized && rightInitialized {
      print("Both arms initialized")
      g1Ready = true
      Task {
        await getBatteryStatus()
      }
    }
  }
  
  private func sendHeartbeat(to peripheral: CBPeripheral) {
    var heartbeatData = Data()
    heartbeatData.append(Commands.BLE_REQ_HEARTBEAT.rawValue)
    heartbeatData.append(UInt8(0x02 & 0xFF))
    
    if let txChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: peripheral) {
      let hexString = heartbeatData.map { String(format: "%02X", $0) }.joined()
      peripheral.writeValue(heartbeatData, for: txChar, type: .withoutResponse)
    }
  }
  
  
  public func sendCommand(_ command: [UInt8]) async {
    // Ensure command is exactly 20 bytes
    var paddedCommand = command
    while paddedCommand.count < 20 {
      paddedCommand.append(0x00)
    }
    
    // Convert to Data
    let commandData = Data(paddedCommand)
//    print("Sending command to glasses: \(paddedCommand.map { String(format: "%02X", $0) }.joined(separator: " "))")
    
    
    // Then send to left glass
    if let leftPeripheral = leftPeripheral,
       let characteristic = leftPeripheral.services?
      .first(where: { $0.uuid == UART_SERVICE_UUID })?
      .characteristics?
      .first(where: { $0.uuid == UART_TX_CHAR_UUID }) {
      leftPeripheral.writeValue(commandData, for: characteristic, type: .withResponse)
      try? await Task.sleep(nanoseconds: 50 * 1_000_000) // 50ms delay after sending
    }
    
    // Send to right glass first
    if let rightPeripheral = rightPeripheral,
       let characteristic = rightPeripheral.services?
      .first(where: { $0.uuid == UART_SERVICE_UUID })?
      .characteristics?
      .first(where: { $0.uuid == UART_TX_CHAR_UUID }) {
      rightPeripheral.writeValue(commandData, for: characteristic, type: .withResponse)
      try? await Task.sleep(nanoseconds: 50 * 1_000_000) // 50ms delay after sending
    }
  }
  
  
  func sendWhitelist() {
    print("sending whitelist")
    Task {
      var data = getWhitelistChunks()
      await sendCommand(data)
    }
  }
  
  // Non-blocking function to add new send request
  func sendDataSequentially(_ data: Data, onlyLeft: Bool = false, onlyRight: Bool = false, waitTime: Int = -1) {
    let requests = [SendRequest(data: data, onlyLeft: onlyLeft, onlyRight: onlyRight, waitTime: waitTime)]
    
    sendQueueLock.lock()
    sendQueue.append(requests)
    sendQueueLock.unlock()
    
    startWorkerIfNeeded()
  }
  
  // Non-blocking function to add multiple chunks
  func sendDataSequentially(_ chunks: [Data], onlyLeft: Bool = false, onlyRight: Bool = false) {
    let requests = chunks.map { SendRequest(data: $0, onlyLeft: onlyLeft, onlyRight: onlyRight) }
    
    sendQueueLock.lock()
    sendQueue.append(requests)
    sendQueueLock.unlock()
    
    startWorkerIfNeeded()
  }
  
  // Start the worker if it's not already running
  func startWorkerIfNeeded() {
    sendQueueLock.lock()
    defer { sendQueueLock.unlock() }
    
    if !isWorkerRunning {
      isWorkerRunning = true
      Task {
        await processQueue()
      }
    }
  }
  
  // Process the queue in background
  func processQueue() async {
    print("Starting queue processing")
    
    // First wait until services are setup
    print("Waiting for services to be ready")
    let servicesReadyTimeout = DispatchTime.now() + .seconds(10)
    
    // Wait until both peripherals are ready to receive data
    let leftReady = await withCheckedContinuation { continuation in
      Task {
        let result = leftServicesWaiter.waitWhileTrue(servicesReadyTimeout)
        continuation.resume(returning: result)
      }
    }
    
    let rightReady = await withCheckedContinuation { continuation in
      Task {
        let result = rightServicesWaiter.waitWhileTrue(servicesReadyTimeout)
        continuation.resume(returning: result)
      }
    }
    
    if !leftReady || !rightReady {
      print("Timed out waiting for services to be ready")
      isWorkerRunning = false
      return
    }
    
    print("Services are ready, processing queue")
    
    // Process each request in the queue
    while true {
      // Pop the next batch of requests
      sendQueueLock.lock()
      let requests = sendQueue.isEmpty ? nil : sendQueue.removeFirst()
      sendQueueLock.unlock()
      
      guard let requests = requests, !requests.isEmpty else {
        // No more requests, exit the worker
        isWorkerRunning = false
        print("No more requests, worker stopped")
        return
      }
      
      // Process each request in the batch
      for request in requests {
        // Force an initial delay after connection
        let timeSinceConnection = Date().timeIntervalSince(lastConnectionTimestamp)
        if timeSinceConnection < 0.35 { // 350ms
          try? await Task.sleep(nanoseconds: INITIAL_CONNECTION_DELAY_MS - UInt64(timeSinceConnection * 1_000_000_000))
        }
        
        var leftSuccess = true
        var rightSuccess = true
        
        // Send to left glass if requested
        if !request.onlyRight, let leftGlassGatt = leftPeripheral, let leftTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: leftGlassGatt), g1Ready {
          leftWaiter.setTrue()
          print("sending to left");
          
          // Send the data and wait for completion
          leftGlassGatt.writeValue(request.data, for: leftTxChar, type: .withResponse)
          
          // Wait for acknowledgment
          let leftAckTimeout = DispatchTime.now() + .milliseconds(300)
          leftSuccess = await withCheckedContinuation { continuation in
            Task {
              let result = leftWaiter.waitWhileTrue(leftAckTimeout)
              continuation.resume(returning: result)
            }
          }
          
          if !leftSuccess {
            print("Left glass write timed out")
          }
        }
        
        // Add small delay between sending to left and right
        try? await Task.sleep(nanoseconds: DELAY_BETWEEN_SENDS_MS)
        
        // Send to right glass if requested
        if !request.onlyLeft, let rightGlassGatt = rightPeripheral, let rightTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: rightGlassGatt), g1Ready {
          rightWaiter.setTrue()
          
          print("sending to right");
          
          // Send the data and wait for completion
          rightGlassGatt.writeValue(request.data, for: rightTxChar, type: .withResponse)
          
          // Wait for acknowledgment
          let rightAckTimeout = DispatchTime.now() + .milliseconds(300)
          rightSuccess = await withCheckedContinuation { continuation in
            Task {
              let result = rightWaiter.waitWhileTrue(rightAckTimeout)
              continuation.resume(returning: result)
            }
          }
          
          if !rightSuccess {
            print("Right glass write timed out")
          }
        }
        
        // Add delay between chunks
        try? await Task.sleep(nanoseconds: DELAY_BETWEEN_CHUNKS_SEND)
        
        // Add custom wait time if specified
        if request.waitTime > 0 {
          try? await Task.sleep(nanoseconds: UInt64(request.waitTime) * 1_000_000)
        }
        
        // If both glasses failed, we might want to try again or exit
        if !leftSuccess && !rightSuccess {
          print("Both glasses failed to acknowledge")
          // Consider reinserting the request or notifying failure
        }
      }
    }
  }
  
  public func sendText(text: String, newScreen: Bool = true, currentPage: UInt8 = 1, maxPages: UInt8 = 1, isCommand: Bool = false, status: DisplayStatus = .NORMAL_TEXT) async -> Bool {
    print("Starting sendText with: \(text)")
    print("Left peripheral connected: \(leftPeripheral != nil)")
    print("Right peripheral connected: \(rightPeripheral != nil)")
    
    // Check if glasses are connected
    guard g1Ready, leftPeripheral != nil, rightPeripheral != nil else {
      print("Glasses not ready or not connected")
      return false
    }
    
    // Format text into lines for display
    let lines = formatTextLines(text: text)
    let displayText = lines.joined(separator: "\n")
    // Use the improved sendTextPacket with our new queue system
    return await sendTextPacket(displayText: displayText, newScreen: true, status: status, currentPage: 1, maxPages: 1)
  }
  
  // TODO: ios fix this broken garbage
  // Updated sendTextPacket to use the queue system
  //  private func sendTextPacket(displayText: String, newScreen: Bool, status: DisplayStatus, currentPage: UInt8, maxPages: UInt8) async -> Bool {
  //      // Convert text to UTF-8 data
  //      guard let textData = displayText.data(using: .utf8) else {
  //          print("Failed to convert text to UTF-8 data")
  //          return false
  //      }
  //
  //      // Split text into manageable chunks
  //      let chunks = textData.chunked(into: 191)
  //      print("Text split into \(chunks.count) chunks")
  //
  //      // Track completion with a dedicated task
  //      return await withCheckedContinuation { continuation in
  //          Task {
  //              var allChunksSucceeded = true
  //
  //              // Process each chunk
  //              for (i, chunk) in chunks.enumerated() {
  //                  // Create display command
  //                  var displayCommand = Data()
  //                  displayCommand.append(0x4E) // Text display command
  //                  displayCommand.append(0x71) // Direct text subcode
  //                  displayCommand.append(UInt8(chunk.count)) // Text length
  //                  displayCommand.append(chunk)
  //
  //                  // Send display command through queue
  //                  sendDataSequentially(displayCommand, waitTime: 50)
  //
  //                  // Create AI packet for proper display state
  //                  let header = Data([
  //                      Commands.BLE_REQ_EVENAI.rawValue,
  //                      evenaiSeq,
  //                      UInt8(chunks.count),
  //                      UInt8(i),
  //                      status.rawValue | (newScreen ? 1 : 0),
  //                      0, 0,
  //                      currentPage,
  //                      maxPages
  //                  ])
  //                  let aiPacket = header + chunk
  //
  //                  // Try multiple times for reliable delivery
  //                  var chunkSucceeded = false
  //
  //                  for attempt in 1...3 {
  //                      print("Attempt \(attempt) to send text packet chunk \(i+1)/\(chunks.count)")
  //
  //                      // Reset acknowledgment flags
  ////                      rightWaiter.setTrue()
  ////                      leftWaiter.setTrue()
  //
  //                      // Send AI packet through queue with increased wait time
  //                      sendDataSequentially(aiPacket, waitTime: 100)
  //
  //                      // Wait for a bit to ensure the request is processed
  //                      try? await Task.sleep(nanoseconds: 500_000_000) // 500ms
  //
  //                      // Check if both peripherals acknowledged
  //                      if !rightWaiter.isTrue && !leftWaiter.isTrue {
  //                          print("Both glasses acknowledged packet on attempt \(attempt)")
  //                          chunkSucceeded = true
  //                          break
  //                      }
  //
  //                      // Wait before retry
  //                      try? await Task.sleep(nanoseconds: 100_000_000) // 100ms
  //                  }
  //
  //                  if !chunkSucceeded {
  //                      print("Failed to get acknowledgment for chunk \(i+1) after multiple attempts")
  //                      allChunksSucceeded = false
  //                      break
  //                  }
  //
  //                  // Increment sequence number for next chunk
  //                  evenaiSeq += 1
  //              }
  //
  //              continuation.resume(returning: allChunksSucceeded)
  //          }
  //      }
  //  }
  
  private func sendTextPacket(displayText: String, newScreen: Bool, status: DisplayStatus, currentPage: UInt8, maxPages: UInt8) async -> Bool {
    guard let textData = displayText.data(using: .utf8) else { return false }
    let chunks = textData.chunked(into: 191)
    
    for (i, chunk) in chunks.enumerated() {
      // Reset acknowledgment flags
      receivedAck = false
      displayingResponseAiRightAck = false
      displayingResponseAiLeftAck = false
      
      // First send the text display command
      var displayCommand = Data()
      displayCommand.append(0x4E) // Text display command
      displayCommand.append(0x71) // Direct text subcode
      displayCommand.append(UInt8(chunk.count)) // Text length
      displayCommand.append(chunk)
      
      if let leftChar = getWriteCharacteristic(for: leftPeripheral),
         let rightChar = getWriteCharacteristic(for: rightPeripheral) {
        
        // Send display command to both glasses
        rightPeripheral?.writeValue(displayCommand, for: rightChar, type: .withResponse)
        try? await Task.sleep(nanoseconds: 50 * 1_000_000) // 50ms delay
        leftPeripheral?.writeValue(displayCommand, for: leftChar, type: .withResponse)
        try? await Task.sleep(nanoseconds: 50 * 1_000_000) // 50ms delay
        
        // Then send the AI packet for proper display state
        let header = Data([Commands.BLE_REQ_EVENAI.rawValue, evenaiSeq, UInt8(chunks.count), UInt8(i), status.rawValue | (newScreen ? 1 : 0), 0, 0, currentPage, maxPages])
        let aiPacket = header + chunk
        
        // Try up to 3 times for each glass
        for attempt in 1...3 {
          print("Attempt \(attempt) to send text packet")
          
          rightPeripheral?.writeValue(aiPacket, for: rightChar, type: .withResponse)
          try? await Task.sleep(nanoseconds: 20 * 1_000_000) // 20ms delay
          leftPeripheral?.writeValue(aiPacket, for: leftChar, type: .withResponse)
          
          // Wait for acknowledgments
          let ackTimeout = 0.3 // 300ms timeout
          let startTime = Date()
          
          while Date().timeIntervalSince(startTime) < ackTimeout {
            if displayingResponseAiRightAck && displayingResponseAiLeftAck {
              print("Both glasses acknowledged packet")
              receivedAck = true
              break
            }
            try? await Task.sleep(nanoseconds: 10 * 1_000_000) // 10ms check interval
          }
          
          if receivedAck {
            break // Success, move to next chunk
          } else {
            print("Attempt \(attempt) failed. Right ack: \(displayingResponseAiRightAck), Left ack: \(displayingResponseAiLeftAck)")
            if attempt == 3 {
              print("Failed to get acknowledgment from glasses after 3 attempts")
              return false
            }
            // Reset flags for next attempt
            displayingResponseAiRightAck = false
            displayingResponseAiLeftAck = false
            try? await Task.sleep(nanoseconds: 50 * 1_000_000) // 50ms delay before retry
          }
        }
        evenaiSeq += 1
      }
    }
    return true
  }
  
  
  private func formatTextLines(text: String) -> [String] {
    let paragraphs = text.split(separator: "\n", omittingEmptySubsequences: false).map { String($0) }
    var lines = [String]()
    
    for paragraph in paragraphs {
      if paragraph.isEmpty {
        lines.append("") // Keep empty lines for spacing
        continue
      }
      
      var remainingText = paragraph
      while remainingText.count > 40 {
        // Try to find a space to break at
        var endIndex = remainingText.index(remainingText.startIndex, offsetBy: 40)
        
        // Look backward for a space to break at
        while endIndex > remainingText.startIndex && !remainingText[endIndex].isWhitespace {
          endIndex = remainingText.index(before: endIndex)
        }
        
        // If no space found, force break at character 40
        if endIndex == remainingText.startIndex {
          endIndex = remainingText.index(remainingText.startIndex, offsetBy: 40)
        }
        
        let line = String(remainingText[..<endIndex])
        lines.append(line)
        
        // Skip the space we broke at
        if endIndex < remainingText.endIndex && remainingText[endIndex].isWhitespace {
          endIndex = remainingText.index(after: endIndex)
        }
        
        remainingText = String(remainingText[endIndex...])
      }
      
      if !remainingText.isEmpty {
        lines.append(remainingText)
      }
    }
    
    return lines
  }
  
  private func manualTextControl() async -> Bool {
    guard let responseModel else {
      print("No response model available")
      return false
    }
    
    let lines = responseModel.lines
    let startIdx = Int((responseModel.currentPage - 1) * 4)
    let endIdx = min(startIdx + 4, lines.count)
    
    guard startIdx < endIdx else {
      print("Invalid page range")
      return false
    }
    
    let pageLines = Array(lines[startIdx..<endIdx])
    let displayText = pageLines.joined(separator: "\n")
    
    // Make multiple attempts for reliability
    for attempt in 1...3 {
      print("Manual text control attempt \(attempt)")
      if await sendTextPacket(
        displayText: displayText,
        newScreen: responseModel.newScreen,
        status: responseModel.status,
        currentPage: responseModel.currentPage,
        maxPages: responseModel.totalPages
      ) {
        return true
      }
      try? await Task.sleep(nanoseconds: 100 * 1_000_000)
    }
    
    print("Manual text control failed after multiple attempts")
    return false
  }
  
  private func waitForAck(timeout: TimeInterval) async -> Bool {
    return await withCheckedContinuation { continuation in
      DispatchQueue.global().asyncAfter(deadline: .now() + timeout) {
        continuation.resume(returning: self.receivedAck)
      }
    }
  }
  
  @objc public func RN_setBrightness(_ level: Int, autoMode: Bool = false) {
    // Convert from percentage (0-100) to the correct range (0-41)
    let mappedLevel = min(41, max(0, Int((Double(level) / 100.0) * 41.0)))
    
    // Create and capture the UInt8 value
    let brightnessLevel = UInt8(mappedLevel)
    
    // Call the async function from a non-async context
    Task {
      let success = await setBrightness(brightnessLevel, autoMode: autoMode)
      if !success {
        NSLog("Failed to set brightness to level \(level)% (mapped to \(mappedLevel))")
      }
    }
  }
  
  public func setBrightness(_ level: UInt8, autoMode: Bool = false) async -> Bool {
    // Ensure level is between 0x00 and 0x29 (0-41)
    var lvl: UInt8 = level
    if (level > 0x29) {
      lvl = 0x29
    }
    
    let command: [UInt8] = [Commands.BRIGHTNESS.rawValue, lvl, autoMode ? 0x01 : 0x00]
    
    // Send to both glasses with proper timing
    if let rightGlass = rightPeripheral,
       let rightTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: rightGlass) {
      rightGlass.writeValue(Data(command), for: rightTxChar, type: .withResponse)
      try? await Task.sleep(nanoseconds: 50 * 1_000_000) // 50ms delay
    }
    
    if let leftGlass = leftPeripheral,
       let leftTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: leftGlass) {
      leftGlass.writeValue(Data(command), for: leftTxChar, type: .withResponse)
    }
    
    return true
  }
  
  @objc public func RN_setHeadUpAngle(_ angle: Int) {
    var agl: Int = angle
    if (angle < 0) {
      agl = 0;
    } else if (angle > 60) {
      agl = 60;
    }
    
    // Call the async function from a non-async context
    Task {
      let success = await setHeadUpAngle(UInt8(agl))
      if !success {
        NSLog("Failed to set angle to \(angle)")
      }
    }
  }
  
  public func setHeadUpAngle(_ angle: UInt8) async -> Bool {
    
    let command: [UInt8] = [Commands.HEAD_UP_ANGLE.rawValue, angle, 0x01]
    
    // Send to both glasses with proper timing
    if let rightGlass = rightPeripheral,
       let rightTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: rightGlass) {
      rightGlass.writeValue(Data(command), for: rightTxChar, type: .withResponse)
      try? await Task.sleep(nanoseconds: 50 * 1_000_000) // 50ms delay
    }
    
    if let leftGlass = leftPeripheral,
       let leftTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: leftGlass) {
      leftGlass.writeValue(Data(command), for: leftTxChar, type: .withResponse)
    }
    return true
  }
  
  @objc public func RN_getBatteryStatus() {
    Task {
      await getBatteryStatus()
    }
  }
  
  public func getBatteryStatus() async {
    print("getBatteryStatus()")
    
    // Build battery status command
    let command: [UInt8] = [0x2C, 0x01]
    
    // Send to both glasses
    if let rightGlass = rightPeripheral,
       let rightTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: rightGlass) {
      rightGlass.writeValue(Data(command), for: rightTxChar, type: .withResponse)
      try? await Task.sleep(nanoseconds: 50 * 1_000_000) // 50ms delay
    }
    
    if let leftGlass = leftPeripheral,
       let leftTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: leftGlass) {
      leftGlass.writeValue(Data(command), for: leftTxChar, type: .withResponse)
    }
  }
  
  public func setSilentMode(_ enabled: Bool) async -> Bool {
    let command: [UInt8] = [Commands.SILENT_MODE.rawValue, enabled ? 0x0C : 0x0A, 0x00]
    
    // Send to both glasses with proper timing
    if let rightGlass = rightPeripheral,
       let rightTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: rightGlass) {
      rightGlass.writeValue(Data(command), for: rightTxChar, type: .withResponse)
      try? await Task.sleep(nanoseconds: 50 * 1_000_000) // 50ms delay
    }
    
    if let leftGlass = leftPeripheral,
       let leftTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: leftGlass) {
      leftGlass.writeValue(Data(command), for: leftTxChar, type: .withResponse)
    }
    return true
  }
  
  public func setDashboardPosition(_ position: DashboardPosition) async -> Bool {
    guard let rightGlass = rightPeripheral,
          let leftGlass = leftPeripheral,
          let rightTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: rightGlass),
          let leftTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: leftGlass) else {
      return false
    }
    
    // Build dashboard position command
    var command = Data()
    command.append(Commands.DASHBOARD_POSITION_COMMAND.rawValue)
    command.append(0x07) // Length
    command.append(0x00) // Sequence
    command.append(0x01) // Fixed value
    command.append(0x02) // Fixed value
    command.append(0x01) // State ON
    command.append(position.rawValue) // Position value
    
    // Send command to both glasses with proper timing
    rightGlass.writeValue(command, for: rightTxChar, type: .withResponse)
    try? await Task.sleep(nanoseconds: 50 * 1_000_000) // 50ms delay
    leftGlass.writeValue(command, for: leftTxChar, type: .withResponse)
    return true
  }
  
  @objc public func RN_setMicEnabled(_ enabled: Bool) {
    Task {
      await setMicEnabled(enabled: enabled)
    }
  }
  
  public func setMicEnabled(enabled: Bool) async -> Bool {
    guard let rightGlass = rightPeripheral,
          let rightTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: rightGlass) else {
      return false
    }
    
    sendMicOn(to: rightGlass, isOn: enabled)
    return true
  }
  
  
}

// MARK: BLE Stubs
extension ERG1Manager: CBCentralManagerDelegate, CBPeripheralDelegate {
  
  func getWriteCharacteristic(for peripheral: CBPeripheral?) -> CBCharacteristic? {
    guard let peripheral = peripheral else { return nil }
    for service in peripheral.services ?? [] {
      if service.uuid == UART_SERVICE_UUID {
        for characteristic in service.characteristics ?? [] where characteristic.uuid == UART_TX_CHAR_UUID {
          return characteristic
        }
      }
    }
    return nil
  }
  
  func writePacket(peripheral: CBPeripheral? ,_ packet: Data, to characteristic: CBCharacteristic) async -> Bool {
    guard let peripheral else { return false }
    guard let leftPeripheral else { return false }
    guard let rightPeripheral else { return false }
    if leftPeripheral.identifier.uuidString == peripheral.identifier.uuidString {
      leftPeripheral.writeValue(packet, for: characteristic, type: .withoutResponse)
    }
    
    if rightPeripheral.identifier.uuidString == peripheral.identifier.uuidString {
      rightPeripheral.writeValue(packet, for: characteristic, type: .withoutResponse)
    }
    let timeoutDuration = 0.08
    let timeoutDate = Date().addingTimeInterval(timeoutDuration)
    
    while Date() < timeoutDate {
      if receivedAck {
        return true
      }
      await Task.sleep(UInt64(0.1 * Double(NSEC_PER_SEC)))
    }
    return false
  }
  
  public func emitDiscoveredDevice(_ name: String) {
    if name.contains("_L_") || name.contains("_R_") {
      // exampleName = "Even G1_74_L_57863C
      // get first 2 characters after the first _:
      let underscoreIndex = name.firstIndex(of: "_")!
      let startIndex = name.index(after: underscoreIndex)
      let endIndex = name.index(underscoreIndex, offsetBy: 3)
      let parsedNum = name[startIndex..<endIndex]
      let res: [String: Any] = [
        "model_name": "Even Realities G1",
        "device_name": parsedNum,
      ]
      let eventBody: [String: Any] = [
        "compatible_glasses_search_result": res,
      ]
      // must convert to string before sending:
      do {
        let jsonData = try JSONSerialization.data(withJSONObject: eventBody, options: [])
        if let jsonString = String(data: jsonData, encoding: .utf8) {
          RNEventEmitter.emitter.sendEvent(withName: "CoreMessageIntentEvent", body: jsonString)
        }
      } catch {
        print("Error converting to JSON: \(error)")
      }
    }
  }
  
  // On BT discovery, automatically connect to both arms if we have them:
  public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
    
    if let name = peripheral.name {
      
      print("found peripheral: \(name)")
      
      if name.contains("_L_") && name.contains(DEVICE_SEARCH_ID) {
        print("Found left arm: \(name)")
        leftPeripheral = peripheral
      } else if name.contains("_R_") && name.contains(DEVICE_SEARCH_ID) {
        print("Found right arm: \(name)")
        rightPeripheral = peripheral
      }
      
      emitDiscoveredDevice(name);
      
      if leftPeripheral != nil && rightPeripheral != nil {
        central.stopScan()
        RN_connectGlasses()
      }
    }
  }
  
  // Update didConnect to set timestamp
  public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    peripheral.delegate = self
    peripheral.discoverServices([UART_SERVICE_UUID])
    
    // Update the last connection timestamp
    lastConnectionTimestamp = Date()
    print("Connected to peripheral: \(peripheral.name ?? "Unknown")")
    
    
    // Emit connection event
    let isLeft = peripheral == leftPeripheral
    let eventBody: [String: Any] = [
      "side": isLeft ? "left" : "right",
      "name": peripheral.name ?? "Unknown",
      "id": peripheral.identifier.uuidString
    ]
    // TODO: ios not actually used for anything yet, but we should trigger a re-connect if it was disconnected:
    //    RNEventEmitter.emitter.sendEvent(withName: "onConnectionStateChanged", body: eventBody)
  }
  
  public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: (any Error)?) {
    //    if peripheral == leftPeripheral {
    //      g1Ready = true
    //    }
  }
  
  public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    if let services = peripheral.services {
      for service in services where service.uuid == UART_SERVICE_UUID {
        peripheral.discoverCharacteristics([UART_TX_CHAR_UUID, UART_RX_CHAR_UUID], for: service)
      }
    }
  }
  
  // Update peripheral(_:didDiscoverCharacteristicsFor:error:) to set services waiters
  public func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    guard let characteristics = service.characteristics else { return }
    
    if service.uuid.isEqual(UART_SERVICE_UUID) {
      for characteristic in characteristics {
        if characteristic.uuid == UART_TX_CHAR_UUID {
          sendInitCommand(to: peripheral, characteristic: characteristic)
        } else if characteristic.uuid == UART_RX_CHAR_UUID {
          peripheral.setNotifyValue(true, for: characteristic)
        }
      }
      
      // Mark the services as ready
      if peripheral == leftPeripheral {
        leftServicesWaiter.setFalse()
        print("Left glass services discovered and ready")
      } else if peripheral == rightPeripheral {
        rightServicesWaiter.setFalse()
        print("Right glass services discovered and ready")
      }
    }
  }
  
  // called whenever bluetooth is initialized / turned on or off:
  public func centralManagerDidUpdateState(_ central: CBCentralManager) {
    if central.state == .poweredOn {
      print("Bluetooth powered on")
      g1Ready = false
      // TODO: ios re-enable once stopScan is implemented, because otherwise we discover peripherals too early before RN gets notified:
      RN_startScan()
    } else {
      print("Bluetooth is not available.")
    }
  }
  
  // Update didUpdateValueFor to set waiters
  public func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    if let error = error {
      print("Error updating value for characteristic: \(error.localizedDescription)")
      return
    }
    
    guard let data = characteristic.value else {
      print("Characteristic value is nil.")
      return
    }
    
    // Process the notification data
    handleNotification(from: peripheral, data: data)
  }
}
