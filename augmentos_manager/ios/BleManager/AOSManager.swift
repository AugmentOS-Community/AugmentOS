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
  
  
  // mic:
  private var useOnboardMic = false;
  private var micEnabled = false;
  
  // VAD:
  private var vad: SileroVADStrategy?
  private var vadBuffer = [Data]();
  private var isSpeaking = false;
  
  override init() {
    self.vad = SileroVADStrategy()
    self.vad?.setup(sampleRate: .rate_16k, frameSize: .size_1024, quality: .normal, silenceTriggerDurationMs: 4000, speechTriggerDurationMs: 50);
    self.serverComms = ServerComms.getInstance()
    super.init()

  }
  
  // MARK: - Public Methods (for React Native)
  
  @objc public func setup() {
    
    self.g1Manager = ERG1Manager()
    self.micManager = OnboardMicrophoneManager()
    self.serverComms.locationManager.setup()
    Task {
      await loadSettings()
    }
    
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
        let pcmConverter = PcmConverter()
        let lc3Data = pcmConverter.encode(pcmData) as Data
        
        
        let vadState = vad.currentState()
        if vadState == .speeching {
          checkSetVadStatus(speaking: true)
          // first send out whatever's in the vadBuffer (if there is anything):
          emptyVadBuffer()
          self.serverComms.sendAudioChunk(lc3Data)
        } else {
          checkSetVadStatus(speaking: false)
          // add to the vadBuffer:
          addToVadBuffer(lc3Data)
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
        self.serverComms.sendAudioChunk(lc3Data)
      } else {
        checkSetVadStatus(speaking: false)
        // add to the vadBuffer:
        addToVadBuffer(lc3Data)
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
  
  func onDisplayEvent(_ event: [String: Any]) {
    //    print("displayEvent \(event)", event)
    
    self.g1Manager?.handleDisplayEvent(event)
    
    // forward to the glasses mirror:
    let wrapperObj: [String: Any] = ["glasses_display_event": event]
    do {
      let jsonData = try JSONSerialization.data(withJSONObject: wrapperObj, options: [])
      if let jsonString = String(data: jsonData, encoding: .utf8) {
        RNEventEmitter.emitter.sendEvent(withName: "CoreMessageIntentEvent", body: jsonString)
      }
    } catch {
      print("Error converting to JSON: \(error)")
    }
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
    if (modelName.contains("Virtual")) {
      self.deviceName = "Virtual Wearable"
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
          self.g1Manager?.dashboardEnabled = enabled
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
    
    let isVirtualWearable = self.deviceName == "Virtual Wearable"
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
        RNEventEmitter.emitter.sendEvent(withName: "CoreMessageIntentEvent", body: jsonString)
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
      await loadSettings()
      await self.g1Manager?.setSilentMode(false)// turn off silent mode
      await self.g1Manager?.getBatteryStatus()
      self.g1Manager?.RN_sendText("// BOOTING AUGMENTOS")
      
      // send loaded settings to glasses:
      self.g1Manager?.RN_getBatteryStatus()
      try? await Task.sleep(nanoseconds: 400_000_000)
      self.g1Manager?.RN_setHeadUpAngle(headUpAngle)
      try? await Task.sleep(nanoseconds: 400_000_000)
      self.g1Manager?.dashboardEnabled = contextualDashboard
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
    
    // just g1's for now:
    Task {
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
    
    // wait for the g1's to be fully ready:
    Task {
      while !Task.isCancelled {
        print("checking if g1 is ready...")
        if self.g1Manager?.g1Ready ?? false {
          // we actualy don't need this line:
          //          handleDeviceReady()
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
  }
  
  private func saveSettings() {
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
    
    // For numeric values, provide the default if the key doesn't exist
    if defaults.object(forKey: SettingsKeys.headUpAngle) != nil {
      headUpAngle = defaults.integer(forKey: SettingsKeys.headUpAngle)
    }
    
    if defaults.object(forKey: SettingsKeys.brightness) != nil {
      brightness = defaults.integer(forKey: SettingsKeys.brightness)
    }
    
    
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
