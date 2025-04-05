//
//  AOSManager.swift
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 3/5/25.
//

import Foundation
import Combine
import CoreBluetooth
import UIKit
import React
import AVFoundation

struct ViewState {
  var topText: String
  var bottomText: String
  var layoutType: String
  var text: String
  var eventStr: String
}

// This class handles logic for managing devices and connections to AugmentOS servers
@objc(AOSManager) class AOSManager: NSObject, ServerCommsCallback {
  
  private var coreToken: String = ""
  private var coreTokenOwner: String = ""
  
  @objc var g1Manager: ERG1Manager?
  var micManager: OnboardMicrophoneManager!
  var serverComms: ServerComms!
  
  private var cancellables = Set<AnyCancellable>()
  private var cachedThirdPartyAppList: [ThirdPartyCloudApp] = []
  //  private var cachedWhatToStream = [String]()
  private var defaultWearable: String? = nil
  private var deviceName: String = ""
  private var contextualDashboard = true;
  private var headUpAngle = 30;
  private var brightness = 50;
  private var batteryLevel = -1;
  private var autoBrightness: Bool = false;
  private var dashboardHeight: Int = 4;
  private var sensingEnabled: Bool = false;
  private var isSearching: Bool = false;
  private var alwaysOnStatusBar: Bool = false;
  private var bypassVad: Bool = false;
  private var bypassAudioEncoding: Bool = false;
  private var settingsLoaded = false
  private let settingsLoadedSemaphore = DispatchSemaphore(value: 0)
  
  var viewStates: [ViewState] = [
    ViewState(topText: " ", bottomText: " ", layoutType: "text_wall", text: "", eventStr: ""),
    ViewState(topText: " ", bottomText: " ", layoutType: "text_wall", text: "DASHBOARD_NOT_SET", eventStr: ""),
  ]
  
  
  // mic:
  private var useOnboardMic = false;
  private var micEnabled = false;
  
  // VAD:
  private var vad: SileroVADStrategy?
  private var vadBuffer = [Data]();
  private var isSpeaking = false;
  
  override init() {
    self.vad = SileroVADStrategy()
    self.serverComms = ServerComms.getInstance()
    super.init()
    Task {
        await loadSettings()
        self.vad?.setup(sampleRate: .rate_16k,
                       frameSize: .size_1024,
                       quality: .normal,
                       silenceTriggerDurationMs: 4000,
                       speechTriggerDurationMs: 50)
    }
  }
  
  // MARK: - Public Methods (for React Native)
  
  @objc public func setup() {
    
    self.g1Manager = ERG1Manager()
    self.micManager = OnboardMicrophoneManager()
    self.serverComms.locationManager.setup()
    
    guard g1Manager != nil else {
      return
    }
    
    // Set up the ServerComms callback
    serverComms.setServerCommsCallback(self)
    
    // Set up voice data handling
    setupVoiceDataHandling()
    
    // configure on board mic:
    //    setupOnboardMicrophoneIfNeeded()
    
    // calback to handle actions when the connectionState changes (when g1 is ready)
    g1Manager!.onConnectionStateChanged = { [weak self] in
      guard let self = self else { return }
      print("G1 glasses connection changed to: \(self.g1Manager!.g1Ready ? "Connected" : "Disconnected")")
      //      self.handleRequestStatus()
      if (self.g1Manager!.g1Ready) {
        self.handleDeviceReady()
      } else {
        handleRequestStatus()
      }
    }
    
    // listen to changes in battery level:
    g1Manager!.$batteryLevel.sink { [weak self] (level: Int) in
      guard let self = self else { return }
      guard level >= 0 else { return }
      self.batteryLevel = level
      self.serverComms.sendBatteryStatus(level: self.batteryLevel, charging: false);
    }.store(in: &cancellables)
    
    // listen to headUp events:
    g1Manager!.$isHeadUp.sink { [weak self] (value: Bool) in
        guard let self = self else { return }
        self.sendCurrentState(value)
    }.store(in: &cancellables)
    
    
    // Subscribe to WebSocket status changes
    serverComms.wsManager.status
      .sink { [weak self] status in
        guard let self = self else { return }
        handleRequestStatus()
      }
      .store(in: &cancellables)
  }
  
  @objc func connectServer() {
    serverComms.connectWebSocket()
  }
  
  @objc func setCoreToken(_ coreToken: String) {
    serverComms.setAuthCredentials("", coreToken)
  }
  
  @objc func startApp(_ packageName: String) {
    serverComms.startApp(packageName: packageName)
  }
  
  @objc func stopApp(_ packageName: String) {
    serverComms.stopApp(packageName: packageName)
  }
  
  func onConnectionAck() {
    handleRequestStatus()
  }
  
  //  func checkIfMicNeedsTobeEnabled() {
  //    print("checkIfMicNeedsTobeEnabled() micEnabled: \(self.micEnabled) g1Ready: \(self.g1Manager.g1Ready) whatToStreamCount: \(self.cachedWhatToStream.count)")
  //    // only bother checking if the mic isn't already enabled
  //    guard !self.micEnabled else { return }
  //    // check if device is ready, if not, return:
  //    guard self.g1Manager.g1Ready else { return }
  //
  //    for what in self.cachedWhatToStream {
  //      if what.contains("transcription") {
  //        onMicrophoneStateChange(true)
  //        break
  //      }
  //    }
  //  }
  
  func onAppStateChange(_ apps: [ThirdPartyCloudApp]/*, _ whatToStream: [String]*/) {
    self.cachedThirdPartyAppList = apps
    //    self.cachedWhatToStream = whatToStream
    
    //    checkIfMicNeedsTobeEnabled()
    handleRequestStatus()
  }
  
  func onConnectionError(_ error: String) {
    handleRequestStatus()
  }
  
  func onAuthError() {}
  
  // MARK: - Voice Data Handling
  
  private func checkSetVadStatus(speaking: Bool) {
    if (speaking != self.isSpeaking) {
      self.isSpeaking = speaking
      serverComms.sendVadStatus(self.isSpeaking)
    }
  }
  
  private func emptyVadBuffer() {
    // go through the buffer, popping from the first element in the array (FIFO):
    while !vadBuffer.isEmpty {
      let chunk = vadBuffer.removeFirst()
      serverComms.sendAudioChunk(chunk)
    }
  }
  
  private func addToVadBuffer(_ chunk: Data) {
    let MAX_BUFFER_SIZE = 20;
    vadBuffer.append(chunk)
    while(vadBuffer.count > MAX_BUFFER_SIZE) {
      // pop from the front of the array:
      vadBuffer.removeFirst()
    }
  }
  
  private func setupVoiceDataHandling() {
    
    // handle incoming PCM data from the microphone manager and feed to the VAD:
    micManager.voiceData
      .sink { [weak self] pcmData in
        guard let self = self else { return }
        
        
        // feed PCM to the VAD:
        guard let vad = self.vad else {
          print("VAD not initialized")
          return
        }
        
        
        if self.bypassVad {
//          let pcmConverter = PcmConverter()
//          let lc3Data = pcmConverter.encode(pcmData) as Data
//          checkSetVadStatus(speaking: true)
//          // first send out whatever's in the vadBuffer (if there is anything):
//          emptyVadBuffer()
//          self.serverComms.sendAudioChunk(lc3Data)
          self.serverComms.sendAudioChunk(pcmData)
          return
        }
        
        // convert audioData to Int16 array:
        let pcmDataArray = pcmData.withUnsafeBytes { pointer -> [Int16] in
          Array(UnsafeBufferPointer(
            start: pointer.bindMemory(to: Int16.self).baseAddress,
            count: pointer.count / MemoryLayout<Int16>.stride
          ))
        }
      
        vad.checkVAD(pcm: pcmDataArray) { [weak self] state in
          guard let self = self else { return }
          //            self.handler?(state)
          print("VAD State: \(state)")
        }
      
        // encode the pcmData as LC3:
//        let pcmConverter = PcmConverter()
//        let lc3Data = pcmConverter.encode(pcmData) as Data
        
        
        let vadState = vad.currentState()
        if vadState == .speeching {
          checkSetVadStatus(speaking: true)
          // first send out whatever's in the vadBuffer (if there is anything):
          emptyVadBuffer()
//          self.serverComms.sendAudioChunk(lc3Data)
          self.serverComms.sendAudioChunk(pcmData)
        } else {
          checkSetVadStatus(speaking: false)
          // add to the vadBuffer:
//          addToVadBuffer(lc3Data)
          addToVadBuffer(pcmData)
        }
        
      }
      .store(in: &cancellables)
    
    // decode the g1 audio data to PCM and feed to the VAD:
    self.g1Manager!.$compressedVoiceData.sink { [weak self] rawLC3Data in
      guard let self = self else { return }
      
      // Ensure we have enough data to process
      guard rawLC3Data.count > 2 else {
        print("Received invalid PCM data size: \(rawLC3Data.count)")
        return
      }
      
      // Skip the first 2 bytes which are command bytes
      let lc3Data = rawLC3Data.subdata(in: 2..<rawLC3Data.count)
      
      // Ensure we have valid PCM data
      guard lc3Data.count > 0 else {
        print("No PCM data after removing command bytes")
        return
      }
      
      
      if self.bypassVad {
        checkSetVadStatus(speaking: true)
        // first send out whatever's in the vadBuffer (if there is anything):
        emptyVadBuffer()
        let pcmConverter = PcmConverter()
        let pcmData = pcmConverter.decode(lc3Data) as Data
//        self.serverComms.sendAudioChunk(lc3Data)
        self.serverComms.sendAudioChunk(pcmData)
        return
      }
        
      let pcmConverter = PcmConverter()
      let pcmData = pcmConverter.decode(lc3Data) as Data
      
      guard pcmData.count > 0 else {
        print("PCM conversion resulted in empty data")
        return
      }
      
      // feed PCM to the VAD:
      guard let vad = self.vad else {
        print("VAD not initialized")
        return
      }
      
      // convert audioData to Int16 array:
      let pcmDataArray = pcmData.withUnsafeBytes { pointer -> [Int16] in
        Array(UnsafeBufferPointer(
          start: pointer.bindMemory(to: Int16.self).baseAddress,
          count: pointer.count / MemoryLayout<Int16>.stride
        ))
      }
      
      vad.checkVAD(pcm: pcmDataArray) { [weak self] state in
        guard let self = self else { return }
        print("VAD State: \(state)")
      }
      
      let vadState = vad.currentState()
      if vadState == .speeching {
        checkSetVadStatus(speaking: true)
        // first send out whatever's in the vadBuffer (if there is anything):
        emptyVadBuffer()
//        self.serverComms.sendAudioChunk(lc3Data)
        self.serverComms.sendAudioChunk(pcmData)
      } else {
        checkSetVadStatus(speaking: false)
        // add to the vadBuffer:
//        addToVadBuffer(lc3Data)
        addToVadBuffer(pcmData)
      }
    }
    .store(in: &cancellables)
  }
  
  // MARK: - ServerCommsCallback Implementation
  
  func onMicrophoneStateChange(_ isEnabled: Bool) {
    // in any case, clear the vadBuffer:
    self.vadBuffer.removeAll()
    self.micEnabled = isEnabled
    
    // Handle microphone state change if needed
    Task {
      let glassesMic = self.micEnabled && !self.useOnboardMic
      print("user enabled microphone: \(isEnabled) useOnboardMic: \(self.useOnboardMic) glassesMic: \(glassesMic)")
      //      await self.g1Manager.setMicEnabled(enabled: isEnabled)
      await self.g1Manager?.setMicEnabled(enabled: glassesMic)
      
      setOnboardMicEnabled(self.useOnboardMic && self.micEnabled)
    }
  }
  
  // TODO: ios this name is a bit misleading:
  func setOnboardMicEnabled(_ isEnabled: Bool) {
    Task {
      if isEnabled {
        if !micManager.checkPermissions() {
          var gavePerm = await micManager.requestPermissions()
          if !gavePerm {
            // TODO: show an error
            return
          }
        }
        
        if !micManager.isRecording {
          micManager.startRecording()
        }
      } else {
        if micManager.isRecording {
          micManager.stopRecording()
        }
      }
    }
  }
  
  //  func onDashboardDisplayEvent(_ event: [String: Any]) {
  //    print("got dashboard display event")
  ////    onDisplayEvent?(["event": event, "type": "dashboard"])
  //    print(event)
  ////    Task {
  ////      await self.g1Manager.sendText(text: "\(event)")
  ////    }
  //  }
  
  // send whatever was there before sending something else:
  public func clearState() -> Void {
    sendCurrentState(self.g1Manager?.isHeadUp ?? false)
  }
  
  public func sendCurrentState(_ isDashboard: Bool) -> Void {
    Task {
      var currentViewState: ViewState!;
      if (isDashboard) {
        currentViewState = self.viewStates[1]
      } else {
        currentViewState = self.viewStates[0]
      }
      
      if (isDashboard && !contextualDashboard) {
        return
      }
      
      let eventStr = currentViewState.eventStr
      CoreCommsService.emitter.sendEvent(withName: "CoreMessageEvent", body: eventStr)
      
      let layoutType = currentViewState.layoutType
      switch layoutType {
      case "text_wall":
        let text = currentViewState.text
        //        let chunks = textHelper.createTextWallChunks(text)
        //        for chunk in chunks {
        //          print("Sending chunk: \(chunk)")
        //          await sendCommand(chunk)
        //        }
        self.g1Manager?.RN_sendText(text);
        break
      case "double_text_wall":
        let topText = currentViewState.topText
        let bottomText = currentViewState.bottomText
        self.g1Manager?.RN_sendDoubleTextWall(topText, bottomText);
        break
      case "reference_card":
        self.g1Manager?.RN_sendText(currentViewState.topText + "\n\n" + currentViewState.bottomText);
        break
      default:
        print("UNHANDLED LAYOUT_TYPE \(layoutType)")
        break
      }
      
    }
  }
  
  public func parsePlaceholders(_ text: String) -> String {
      let dateFormatter = DateFormatter()
      dateFormatter.dateFormat = "M/dd, h:mm"
      let formattedDate = dateFormatter.string(from: Date())
      
      // 12-hour time format (with leading zeros for hours)
      let time12Format = DateFormatter()
      time12Format.dateFormat = "hh:mm"
      let time12 = time12Format.string(from: Date())
      
      // 24-hour time format
      let time24Format = DateFormatter()
      time24Format.dateFormat = "HH:mm"
      let time24 = time24Format.string(from: Date())
      
      // Current date with format MM/dd
      let dateFormat = DateFormatter()
      dateFormat.dateFormat = "MM/dd"
      let currentDate = dateFormat.string(from: Date())
      
      var placeholders: [String: String] = [:]
      placeholders["$no_datetime$"] = formattedDate
      placeholders["$DATE$"] = currentDate
      placeholders["$TIME12$"] = time12
      placeholders["$TIME24$"] = time24
    
      if batteryLevel == -1 {
        placeholders["$GBATT$"] = ""
      } else {
        placeholders["$GBATT$"] = "\(batteryLevel)%"
      }
      
      var result = text
      for (key, value) in placeholders {
          result = result.replacingOccurrences(of: key, with: value)
      }
      
      return result
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
    
    // save the state string to forward to the mirror:
    // forward to the glasses mirror:
    let wrapperObj: [String: Any] = ["glasses_display_event": event]
    var eventStr = ""
    do {
      let jsonData = try JSONSerialization.data(withJSONObject: wrapperObj, options: [])
      eventStr = String(data: jsonData, encoding: .utf8) ?? ""
    } catch {
      print("Error converting to JSON: \(error)")
    }
    
    self.viewStates[stateIndex].eventStr = eventStr
    let layout = event["layout"] as! [String: Any];
    let layoutType = layout["layoutType"] as! String
    self.viewStates[stateIndex].layoutType = layoutType
    
    
    
    var text = layout["text"] as? String ?? " "
    var topText = layout["topText"] as? String ?? " "
    var bottomText = layout["bottomText"] as? String ?? " "
    var title = layout["title"] as? String ?? " "
    
    text = parsePlaceholders(text)
    topText = parsePlaceholders(topText)
    bottomText = parsePlaceholders(bottomText)
    title = parsePlaceholders(title)
    
    switch layoutType {
    case "text_wall":
      self.viewStates[stateIndex].text = text
      break
    case "double_text_wall":
      self.viewStates[stateIndex].topText = topText
      self.viewStates[stateIndex].bottomText = bottomText
      break
    case "reference_card":
      self.viewStates[stateIndex].topText = text
      self.viewStates[stateIndex].bottomText = title
    default:
      print("UNHANDLED LAYOUT_TYPE \(layoutType)")
      break
    }
    
    let headUp = self.g1Manager?.isHeadUp ?? false
    // send the state we just received if the user is currently in that state:
    if (stateIndex == 0 && !headUp) {
      sendCurrentState(false)
    } else if (stateIndex == 1 && headUp) {
      sendCurrentState(true)
    }
  }
  
  func onDisplayEvent(_ event: [String: Any]) {
    //    print("displayEvent \(event)", event)
    
    handleDisplayEvent(event)
  }
  
  func onRequestSingle(_ dataType: String) {
    // Handle single data request
    if dataType == "battery" {
      // Send battery status if needed
    }
    // TODO:
    handleRequestStatus()
  }
  
  func handleSearchForCompatibleDeviceNames(_ modelName: String) {
    print("Searching for compatible device names for: \(modelName)")
    if (modelName.contains("Simulated")) {
      self.deviceName = "Simulated Glasses"
      self.useOnboardMic = true;
      self.micEnabled = true;
//      onMicrophoneStateChange(true)
      saveSettings()
      handleRequestStatus()
    } else if (modelName.contains("Audio")) {
      self.deviceName = "Audio Wearable"
      self.useOnboardMic = true;
      self.micEnabled = true;
//      onMicrophoneStateChange(true)
      saveSettings()
      handleRequestStatus()
    } else if (modelName.contains("G1")) {
      self.g1Manager?.RN_startScan()
    }
  }
  
  @objc func handleCommand(_ command: String) {
    print("Received command: \(command)")
    
    if !settingsLoaded {
        // Wait for settings to load with a timeout
        let timeout = DispatchTime.now() + .seconds(5) // 5 second timeout
        let result = settingsLoadedSemaphore.wait(timeout: timeout)
        
        if result == .timedOut {
            print("Warning: Settings load timed out, proceeding with default values")
        }
    }
    
    // Define command types enum
    enum CommandType: String {
      case setAuthSecretKey = "set_auth_secret_key"
      case requestStatus = "request_status"
      case connectWearable = "connect_wearable"
      case disconnectWearable = "disconnect_wearable"
      case searchForCompatibleDeviceNames = "search_for_compatible_device_names"
      case enableContextualDashboard = "enable_contextual_dashboard"
      case forceCoreOnboardMic = "force_core_onboard_mic"
      case ping = "ping"
      case forgetSmartGlasses = "forget_smart_glasses"
      case startApp = "start_app"
      case stopApp = "stop_app"
      case updateGlassesHeadUpAngle = "update_glasses_headUp_angle"
      case updateGlassesBrightness = "update_glasses_brightness"
      case updateGlassesDashboardHeight = "update_glasses_dashboard_height"
      case enableSensing = "enable_sensing"
      case enableAlwaysOnStatusBar = "enable_always_on_status_bar"
      case bypassVad = "bypass_vad_for_debugging"
      case bypassAudioEncoding = "bypass_audio_encoding_for_debugging"
      case unknown
    }
    
    // Try to parse JSON
    guard let data = command.data(using: .utf8) else {
      print("Could not convert command string to data")
      return
    }
    
    do {
      if let jsonDict = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] {
        // Extract command type
        guard let commandString = jsonDict["command"] as? String else {
          print("Invalid command format: missing 'command' field")
          return
        }
        
        let commandType = CommandType(rawValue: commandString) ?? .unknown
        let params = jsonDict["params"] as? [String: Any]
        
        // Process based on command type
        switch commandType {
        case .setAuthSecretKey:
          if let params = params,
             let userId = params["userId"] as? String,
             let authSecretKey = params["authSecretKey"] as? String {
            handleSetAuthSecretKey(userId: userId, authSecretKey: authSecretKey)
          } else {
            print("set_auth_secret_key invalid params")
          }
          handleRequestStatus()
          
        case .requestStatus:
          handleRequestStatus()
          
        case .connectWearable:
          if let params = params, let modelName = params["model_name"] as? String, let deviceName = params["device_name"] as? String {
            handleConnectWearable(modelName: modelName, deviceName: deviceName)
          } else {
            print("connect_wearable invalid params, connecting to default device")
            handleConnectWearable(modelName: "", deviceName: "")
          }
          
        case .disconnectWearable:
          self.g1Manager?.RN_sendText(" ")// clear the screen
          handleDisconnectWearable()
          handleRequestStatus()
          break
          
        case .forgetSmartGlasses:
          handleDisconnectWearable()
          self.defaultWearable = nil
          self.deviceName = ""
          self.g1Manager?.DEVICE_SEARCH_ID = ""
          saveSettings()
          handleRequestStatus()
          break
          
        case .searchForCompatibleDeviceNames:
          if let params = params, let modelName = params["model_name"] as? String {
            print("Searching for compatible device names for: \(modelName)")
            handleSearchForCompatibleDeviceNames(modelName)
          } else {
            print("search_for_compatible_device_names invalid params")
          }
          
        case .enableContextualDashboard:
          guard let params = params, let enabled = params["enabled"] as? Bool else {
            print("enable_contextual_dashboard invalid params")
            break
          }
          self.contextualDashboard = enabled
          saveSettings()
          handleRequestStatus()// to update the UI
          break
        case .forceCoreOnboardMic:
          guard let params = params, let enabled = params["enabled"] as? Bool else {
            print("force_core_onboard_mic invalid params")
            break
          }
          self.useOnboardMic = enabled
          onMicrophoneStateChange(self.micEnabled)
          saveSettings()
          handleRequestStatus()// to update the UI
          break
        case .startApp:
          if let params = params, let target = params["target"] as? String {
            print("Starting app: \(target)")
            serverComms.startApp(packageName: target)
          } else {
            print("start_app invalid params")
          }
          handleRequestStatus()
          break
        case .stopApp:
          if let params = params, let target = params["target"] as? String {
            print("Stopping app: \(target)")
            serverComms.stopApp(packageName: target)
          } else {
            print("stop_app invalid params")
          }
          break
        case .unknown:
          print("Unknown command type: \(commandString)")
          handleRequestStatus()
        case .ping:
          break
        case .updateGlassesHeadUpAngle:
          guard let params = params, let value = params["headUpAngle"] as? Int else {
            print("update_glasses_headUp_angle invalid params")
            break
          }
          self.headUpAngle = value
          self.g1Manager?.RN_setHeadUpAngle(value)
          saveSettings()
          handleRequestStatus()// to update the UI
          break
        case .updateGlassesBrightness:
          guard let params = params, let value = params["brightness"] as? Int, let autoBrightness = params["autoLight"] as? Bool else {
            print("update_glasses_brightness invalid params")
            break
          }
          self.brightness = value
          self.autoBrightness = autoBrightness
          Task {
            self.g1Manager?.RN_setBrightness(value, autoMode: autoBrightness)
            self.g1Manager?.RN_sendText("Set brightness to \(value)%")
            try? await Task.sleep(nanoseconds: 700_000_000) // 0.7 seconds
            self.g1Manager?.RN_sendText(" ")// clear screen
          }
          saveSettings()
          handleRequestStatus()// to update the UI
          break
        case .updateGlassesDashboardHeight:
          guard let params = params, let value = params["height"] as? Int else {
            print("update_glasses_brightness invalid params")
            break
          }
          self.dashboardHeight = value
          Task {
            self.g1Manager?.RN_setDashboardPosition(value)
            self.g1Manager?.RN_sendText("Set dashboard position to \(value)")
            try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
            self.g1Manager?.RN_sendText(" ")// clear screen
          }
          saveSettings()
          handleRequestStatus()// to update the UI
          break
        case .enableSensing:
          guard let params = params, let enabled = params["enabled"] as? Bool else {
            print("enable_sensing invalid params")
            break
          }
          self.sensingEnabled = enabled
          saveSettings()
          handleRequestStatus()// to update the UI
          break
        case .enableAlwaysOnStatusBar:
          guard let params = params, let enabled = params["enabled"] as? Bool else {
            print("enable_always_on_status_bar invalid params")
            break
          }
          self.alwaysOnStatusBar = enabled
          saveSettings()
          handleRequestStatus()// to update the UI
          break
        case .bypassVad:
          guard let params = params, let enabled = params["enabled"] as? Bool else {
            print("bypass_vad invalid params")
            break
          }
          self.bypassVad = enabled
          saveSettings()
          handleRequestStatus()// to update the UI
          break
        case .bypassAudioEncoding:
          guard let params = params, let enabled = params["enabled"] as? Bool else {
            print("bypass_audio_encoding invalid params")
            break
          }
          self.bypassAudioEncoding = enabled
        }
      }
    } catch {
      print("Error parsing JSON command: \(error.localizedDescription)")
    }
  }
  
  // Handler methods for each command type
  private func handleSetAuthSecretKey(userId: String, authSecretKey: String) {
    self.setup()// finish init():
    self.coreToken = authSecretKey
    self.coreTokenOwner = userId
    print("Setting auth secret key for user: \(userId)")
    serverComms.setAuthCredentials(userId, authSecretKey)
    print("Connecting to AugmentOS...")
    serverComms.connectWebSocket()
  }
  
  private func handleDisconnectWearable() {
    self.g1Manager?.disconnect()
    handleRequestStatus()
  }
  
  private func handleRequestStatus() {
    // construct the status object:
    
    let isVirtualWearable = self.deviceName == "Simulated Glasses"
    let isAudioWearable = self.deviceName == "Audio Wearable"
    
    let isGlassesConnected = self.g1Manager?.g1Ready ?? false
    
    // also referenced as glasses_info:
    var connectedGlasses: [String: Any] = [:];
    
    if (isVirtualWearable) {
      connectedGlasses = [
        "model_name": self.deviceName,
        //        "battery_life": -1,
        "auto_brightness": false,
        "is_searching": self.isSearching,
      ]
      self.defaultWearable = self.deviceName
    } else if isAudioWearable {
      
      
    } else if isGlassesConnected {
      connectedGlasses = [
        "model_name": "Even Realities G1",
        "battery_life": self.batteryLevel,
        "headUp_angle": self.headUpAngle,
        "brightness": self.brightness,
        "auto_brightness": self.autoBrightness,
        "dashboard_height": self.dashboardHeight,
        "is_searching": self.isSearching,
      ]
      self.defaultWearable = "Even Realities G1"
    }
    
    let cloudConnectionStatus = self.serverComms.isWebSocketConnected() ? "CONNECTED" : "DISCONNECTED"
    
    let coreInfo: [String: Any] = [
      "augmentos_core_version": "Unknown",
      "cloud_connection_status": cloudConnectionStatus,
      "default_wearable": self.defaultWearable as Any,
      "force_core_onboard_mic": self.useOnboardMic,
      "sensing_enabled": self.sensingEnabled,
      "always_on_status_bar": self.alwaysOnStatusBar,
      "bypass_vad_for_debugging": self.bypassVad,
      "bypass_audio_encoding_for_debugging": self.bypassAudioEncoding,
      "core_token": self.coreToken,
      "puck_connected": true,
    ]
    
    // hardcoded list of apps:
    var apps: [[String: Any]] = []
    
    for tpa in self.cachedThirdPartyAppList {
      if tpa.name == "Notify" { continue }// TODO: ios notifications don't work so don't display the TPA
      let tpaDict = [
        "packageName": tpa.packageName,
        "name": tpa.name,
        "description": tpa.description,
        "webhookURL": tpa.webhookURL,
        "logoURL": tpa.logoURL,
        "is_running": tpa.isRunning,
        "is_foreground": false
      ] as [String: Any]
      apps.append(tpaDict)
    }
    
    let authObj: [String: Any] = [
      "core_token_owner": self.coreTokenOwner,
      //      "core_token_status":
    ]
    
    let statusObj: [String: Any] = [
      "connected_glasses": connectedGlasses,
      "apps": apps,
      "core_info": coreInfo,
      "auth": authObj
    ]
    let wrapperObj: [String: Any] = ["status": statusObj]
    
    // print("wrapperStatusObj \(wrapperObj)")
    // must convert to string before sending:
    do {
      let jsonData = try JSONSerialization.data(withJSONObject: wrapperObj, options: [])
      if let jsonString = String(data: jsonData, encoding: .utf8) {
        CoreCommsService.emitter.sendEvent(withName: "CoreMessageEvent", body: jsonString)
      }
    } catch {
      print("Error converting to JSON: \(error)")
    }
    saveSettings()
  }
  
  private func playStartupSequence() {
    print("playStartupSequence()")
    // Arrow frames for the animation
    let arrowFrames = ["↑", "↗", "↑", "↖"]
    
    let delay = 0.25 // Frame delay in seconds
    let totalCycles = 2 // Number of animation cycles
    
    // Variables to track animation state
    var frameIndex = 0
    var cycles = 0
    
    // Create a dispatch queue for the animation
    let animationQueue = DispatchQueue.global(qos: .userInteractive)
    
    // Function to display the current animation frame
    func displayFrame() {
      // Check if we've completed all cycles
      if cycles >= totalCycles {
        // End animation with final message
        self.g1Manager?.RN_sendText("                  /// AugmentOS Connected \\\\\\")
        animationQueue.asyncAfter(deadline: .now() + 1.0) {
          self.g1Manager?.RN_sendText(" ")
        }
        return
      }
      
      // Display current animation frame
      let frameText = "                    \(arrowFrames[frameIndex]) AugmentOS Booting \(arrowFrames[frameIndex])"
      self.g1Manager?.RN_sendText(frameText)
      
      // Move to next frame
      frameIndex = (frameIndex + 1) % arrowFrames.count
      
      // Count completed cycles
      if frameIndex == 0 {
        cycles += 1
      }
      
      // Schedule next frame
      animationQueue.asyncAfter(deadline: .now() + delay) {
        displayFrame()
      }
    }
    
    // Start the animation after a short initial delay
    animationQueue.asyncAfter(deadline: .now() + 0.35) {
      displayFrame()
    }
  }
  
  private func handleDeviceReady() {
    self.isSearching = false
    self.defaultWearable = "Even Realities G1"
    self.handleRequestStatus()
    // load settings and send the animation:
    Task {
      
      // give the glasses some extra time to finish booting:
      try? await Task.sleep(nanoseconds: 1_000_000_000) // 3 seconds
      await self.g1Manager?.setSilentMode(false)// turn off silent mode
      await self.g1Manager?.getBatteryStatus()
      self.g1Manager?.RN_sendText("// BOOTING AUGMENTOS")
      
      // send loaded settings to glasses:
      self.g1Manager?.RN_getBatteryStatus()
      try? await Task.sleep(nanoseconds: 400_000_000)
      self.g1Manager?.RN_setHeadUpAngle(headUpAngle)
      try? await Task.sleep(nanoseconds: 400_000_000)
      self.g1Manager?.RN_setHeadUpAngle(headUpAngle)
      try? await Task.sleep(nanoseconds: 400_000_000)
      self.g1Manager?.RN_setBrightness(brightness, autoMode: autoBrightness)
      try? await Task.sleep(nanoseconds: 400_000_000)
      self.g1Manager?.RN_setDashboardPosition(dashboardHeight)
      try? await Task.sleep(nanoseconds: 400_000_000) // 1 second
//      playStartupSequence()
      self.g1Manager?.RN_sendText("// AUGMENTOS CONNECTED")
      try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
      self.g1Manager?.RN_sendText(" ")// clear screen
      
      
      // send to the server our battery status:
      self.serverComms.sendBatteryStatus(level: self.batteryLevel, charging: false)
      
      
      // enable the mic if it was last on:
      print("ENABLING MIC STATE: \(self.micEnabled)")
      onMicrophoneStateChange(self.micEnabled)
      self.handleRequestStatus()
    }
  }
  
  private func handleConnectWearable(modelName: String, deviceName: String) {
    print("Connecting to wearable: \(modelName)")
    
    if (modelName.contains("Virtual") || deviceName.contains("Virtual") || self.deviceName.contains("Virtual")) {
      // we don't need to search for a virtual device
      return
    }
    
    self.isSearching = true
    handleRequestStatus()// update the UI
    
    print("deviceName: \(deviceName) selfDeviceName: \(self.deviceName)")
    
    // just g1's for now:
    Task {
      self.g1Manager?.disconnect()
      
      if (deviceName != "") {
        self.deviceName = deviceName
        saveSettings()
        self.g1Manager?.RN_pairById(deviceName)
      } else if self.deviceName != "" {
        self.g1Manager?.RN_pairById(self.deviceName)
      } else {
        print("this shouldn't happen (we don't have a deviceName saved, connecting will fail if we aren't already paired)")
        self.g1Manager?.RN_startScan()
      }
    }
    
//    // wait for the g1's to be fully ready:
    Task {
      while !Task.isCancelled {
        print("checking if g1 is ready... \(self.g1Manager?.g1Ready ?? false)")
        print("leftReady \(self.g1Manager?.leftReady ?? false) rightReady \(self.g1Manager?.rightReady ?? false)")
        if self.g1Manager?.g1Ready ?? false {
          // we actualy don't need this line:
          //          handleDeviceReady()
          handleRequestStatus()
          break
        } else {
          // todo: ios not the cleanest solution here
          self.g1Manager?.RN_startScan()
        }
        
        try? await Task.sleep(nanoseconds: 15_000_000_000) // 15 seconds
      }
    }
  }
  
  
  // MARK: - Settings Management
  
  private enum SettingsKeys {
    static let defaultWearable = "defaultWearable"
    static let deviceName = "deviceName"
    static let useOnboardMic = "useBoardMic"
    static let contextualDashboard = "contextualDashboard"
    static let headUpAngle = "headUpAngle"
    static let brightness = "brightness"
    static let autoBrightness = "autoBrightness"
    static let sensingEnabled = "sensingEnabled"
    static let dashboardHeight = "dashboardHeight"
    static let alwaysOnStatusBar = "alwaysOnStatusBar"
    static let bypassVad = "bypassVad"
    static let bypassAudioEncoding = "bypassAudioEncoding"
  }
  
  private func saveSettings() {
    
    print("about to save settings, waiting for loaded settings first: \(settingsLoaded)")
    if !settingsLoaded {
        // Wait for settings to load with a timeout
        let timeout = DispatchTime.now() + .seconds(5) // 5 second timeout
        let result = settingsLoadedSemaphore.wait(timeout: timeout)
        
        if result == .timedOut {
            print("Warning: Settings load timed out, proceeding with default values")
        }
    }
    
    let defaults = UserDefaults.standard
    
    // Save each setting with its corresponding key
    defaults.set(defaultWearable, forKey: SettingsKeys.defaultWearable)
    defaults.set(deviceName, forKey: SettingsKeys.deviceName)
    defaults.set(useOnboardMic, forKey: SettingsKeys.useOnboardMic)
    defaults.set(contextualDashboard, forKey: SettingsKeys.contextualDashboard)
    defaults.set(headUpAngle, forKey: SettingsKeys.headUpAngle)
    defaults.set(brightness, forKey: SettingsKeys.brightness)
    defaults.set(autoBrightness, forKey: SettingsKeys.autoBrightness)
    defaults.set(sensingEnabled, forKey: SettingsKeys.sensingEnabled)
    defaults.set(dashboardHeight, forKey: SettingsKeys.dashboardHeight)
    defaults.set(alwaysOnStatusBar, forKey: SettingsKeys.alwaysOnStatusBar)
    defaults.set(bypassVad, forKey: SettingsKeys.bypassVad)
    defaults.set(bypassAudioEncoding, forKey: SettingsKeys.bypassAudioEncoding)
    
    // Force immediate save (optional, as UserDefaults typically saves when appropriate)
    defaults.synchronize()
    
//    print("settings saved")
//    print("Settings saved: Default Wearable: \(defaultWearable ?? "None"), Use Onboard Mic: \(useOnboardMic), " +
//          "Contextual Dashboard: \(contextualDashboard), Head Up Angle: \(headUpAngle), Brightness: \(brightness)")
  }
  
  private func loadSettings() async {
    let defaults = UserDefaults.standard
    
    // Load each setting with appropriate type handling
    defaultWearable = defaults.string(forKey: SettingsKeys.defaultWearable)
    deviceName = defaults.string(forKey: SettingsKeys.deviceName) ?? ""
    useOnboardMic = defaults.bool(forKey: SettingsKeys.useOnboardMic)
    contextualDashboard = defaults.bool(forKey: SettingsKeys.contextualDashboard)
    autoBrightness = defaults.bool(forKey: SettingsKeys.autoBrightness)
    sensingEnabled = defaults.bool(forKey: SettingsKeys.sensingEnabled)
    dashboardHeight = defaults.integer(forKey: SettingsKeys.dashboardHeight)
    alwaysOnStatusBar = defaults.bool(forKey: SettingsKeys.alwaysOnStatusBar)
    bypassVad = defaults.bool(forKey: SettingsKeys.bypassVad)
    bypassAudioEncoding = defaults.bool(forKey: SettingsKeys.bypassAudioEncoding)
    
    // For numeric values, provide the default if the key doesn't exist
    if defaults.object(forKey: SettingsKeys.headUpAngle) != nil {
      headUpAngle = defaults.integer(forKey: SettingsKeys.headUpAngle)
    }
    
    if defaults.object(forKey: SettingsKeys.brightness) != nil {
      brightness = defaults.integer(forKey: SettingsKeys.brightness)
    }
    
    // Mark settings as loaded and signal completion
    self.settingsLoaded = true
    self.settingsLoadedSemaphore.signal()
    print("Settings Loaded!")
    
    
//    if (self.g1Manager.g1Ready) {
//      self.g1Manager.RN_getBatteryStatus()
//      try? await Task.sleep(nanoseconds: 400_000_000)
//      self.g1Manager.dashboardEnabled = contextualDashboard
//      try? await Task.sleep(nanoseconds: 400_000_000)
//      self.g1Manager.RN_setHeadUpAngle(headUpAngle)
//      try? await Task.sleep(nanoseconds: 400_000_000)
//      self.g1Manager.RN_setBrightness(brightness, autoMode: autoBrightness)
//      try? await Task.sleep(nanoseconds: 400_000_000)
//      self.g1Manager.RN_setDashboardPosition(dashboardHeight)
//    }
    
    print("Settings loaded: Default Wearable: \(defaultWearable ?? "None"), Use Device Mic: \(useOnboardMic), " +
          "Contextual Dashboard: \(contextualDashboard), Head Up Angle: \(headUpAngle), Brightness: \(brightness)")
  }
  
  // MARK: - Cleanup
  
  @objc func cleanup() {
    cancellables.removeAll()
    saveSettings()
  }
}
