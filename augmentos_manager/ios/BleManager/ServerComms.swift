//
//  ServerComms.swift
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 3/5/25.
//

import Foundation
import Combine

protocol ServerCommsCallback {
  func onConnectionAck()
  func onAppStateChange(_ apps: [ThirdPartyCloudApp])
  func onConnectionError(_ error: String)
  func onAuthError()
  func onMicrophoneStateChange(_ isEnabled: Bool)
  func onDisplayEvent(_ event: [String: Any])
  func onRequestSingle(_ dataType: String)
}

class ServerComms {
  private static var instance: ServerComms?
  
  private let wsManager = WebSocketManager()
  private var speechRecCallback: ((([String: Any]) -> Void))?
  private var serverCommsCallback: ServerCommsCallback?
  private var coreToken: String = ""
  private var userid: String = ""
  
  // Audio queue system
  private let audioQueue = DispatchQueue(label: "com.augmentos.audioQueue")
  private var audioBuffer = ArrayBlockingQueue<Data>(capacity: 100) // 10 seconds of audio assuming similar frame rates
  private var audioSenderThread: Thread?
  private var audioSenderRunning = false
  private var cancellables = Set<AnyCancellable>()
  
  private var reconnecting: Bool = false
  
  static func getInstance() -> ServerComms {
    if instance == nil {
      instance = ServerComms()
    }
    return instance!
  }
  
  private init() {
    // Subscribe to WebSocket messages
    wsManager.messages
      .sink { [weak self] message in
        self?.handleIncomingMessage(message)
      }
      .store(in: &cancellables)
    
    // Subscribe to WebSocket status changes
    wsManager.status
      .sink { [weak self] status in
        self?.handleStatusChange(status)
      }
      .store(in: &cancellables)
    
    startAudioSenderThread()
  }
  
  func setAuthCredentials(_ userid: String, _ coreToken: String) {
    self.coreToken = coreToken
    self.userid = userid
  }
  
  func setServerCommsCallback(_ callback: ServerCommsCallback) {
    self.serverCommsCallback = callback
  }
  
  func setSpeechRecCallback(_ callback: @escaping ([String: Any]) -> Void) {
    self.speechRecCallback = callback
  }
  
  // MARK: - Connection Management
  
  func connectWebSocket() {
    guard let url = URL(string: getServerUrl()) else {
      print("Invalid server URL")
      return
    }
    wsManager.connect(url: url, coreToken: self.coreToken)
    // TODO: ios this is a bit of hack:
    wsManager.sendVadStatus(true)
  }
  
  func isWebSocketConnected() -> Bool {
    return wsManager.isConnected()
  }
  
  // MARK: - Audio / VAD
  
  func sendAudioChunk(_ audioData: Data) {
    // If the queue is full, remove the oldest entry before adding a new one
    audioBuffer.offer(audioData)
  }
  
  func sendVadStatus(_ isSpeaking: Bool) {
    do {
      let vadMsg: [String: Any] = [
        "type": "VAD",
        "status": isSpeaking
      ]
      
      let jsonData = try JSONSerialization.data(withJSONObject: vadMsg)
      if let jsonString = String(data: jsonData, encoding: .utf8) {
        wsManager.sendText(jsonString)
      }
    } catch {
      print("Error building VAD JSON: \(error)")
    }
  }
  
  func updateAsrConfig(languages: [[String: Any]]) {
    guard wsManager.isConnected() else {
      print("Cannot send ASR config: not connected.")
      return
    }
    
    do {
      let configMsg: [String: Any] = [
        "type": "config",
        "streams": languages
      ]
      
      let jsonData = try JSONSerialization.data(withJSONObject: configMsg)
      if let jsonString = String(data: jsonData, encoding: .utf8) {
        wsManager.sendText(jsonString)
      }
    } catch {
      print("Error building config message: \(error)")
    }
  }
  
  // MARK: - App Lifecycle
  
  func startApp(packageName: String) {
    do {
      let msg: [String: Any] = [
        "type": "start_app",
        "packageName": packageName,
        "timestamp": Int(Date().timeIntervalSince1970 * 1000)
      ]
      
      let jsonData = try JSONSerialization.data(withJSONObject: msg)
      if let jsonString = String(data: jsonData, encoding: .utf8) {
        wsManager.sendText(jsonString)
      }
    } catch {
      print("Error building start_app JSON: \(error)")
    }
  }
  
  func stopApp(packageName: String) {
    do {
      let msg: [String: Any] = [
        "type": "stop_app",
        "packageName": packageName,
        "timestamp": Int(Date().timeIntervalSince1970 * 1000)
      ]
      
      let jsonData = try JSONSerialization.data(withJSONObject: msg)
      if let jsonString = String(data: jsonData, encoding: .utf8) {
        wsManager.sendText(jsonString)
      }
    } catch {
      print("Error building stop_app JSON: \(error)")
    }
  }
  
  // MARK: - Hardware Events
  
  func sendButtonPress(buttonId: String, pressType: String) {
    do {
      let event: [String: Any] = [
        "type": "button_press",
        "buttonId": buttonId,
        "pressType": pressType,
        "timestamp": Int(Date().timeIntervalSince1970 * 1000)
      ]
      
      let jsonData = try JSONSerialization.data(withJSONObject: event)
      if let jsonString = String(data: jsonData, encoding: .utf8) {
        wsManager.sendText(jsonString)
      }
    } catch {
      print("Error building button_press JSON: \(error)")
    }
  }
  
  // Add other event methods as needed (sendHeadPosition, sendGlassesBatteryUpdate, etc.)
  
  // MARK: - Message Handling
  
  private func handleIncomingMessage(_ msg: [String: Any]) {
    guard let type = msg["type"] as? String else { return }
    
    print("Received message of type: \(type)")
    
    switch type {
    case "connection_ack":
      print("Received connection_ack")
      startAudioSenderThread()
      if let callback = serverCommsCallback {
        callback.onAppStateChange(parseAppList(msg: msg))
        callback.onConnectionAck()
      }
      
    case "app_state_change":
      if let callback = serverCommsCallback {
        callback.onAppStateChange(parseAppList(msg: msg))
      }
      
    case "connection_error":
      let errorMsg = msg["message"] as? String ?? "Unknown error"
      if let callback = serverCommsCallback {
        callback.onConnectionError(errorMsg)
      }
      
    case "auth_error":
      if let callback = serverCommsCallback {
        callback.onAuthError()
      }
      
    case "microphone_state_change":
      let isMicrophoneEnabled = msg["isMicrophoneEnabled"] as? Bool ?? true
      if let callback = serverCommsCallback {
        callback.onMicrophoneStateChange(isMicrophoneEnabled)
      }
      
    case "display_event":
      if let view = msg["view"] as? String {
        if let callback = serverCommsCallback {
          callback.onDisplayEvent(msg)
        }
      }
      
    case "request_single":
      if let dataType = msg["data_type"] as? String, let callback = serverCommsCallback {
        callback.onRequestSingle(dataType)
      }
      
    case "interim", "final":
      // Pass speech messages to speech recognition callback
      if let callback = speechRecCallback {
        callback(msg)
      } else {
        print("Received speech message but speechRecCallback is null!")
      }
      
    case "reconnect":
      print("Server is requesting a reconnect.")
      
    default:
      print("Unknown message type: \(type) / full: \(msg)")
    }
  }
  
  private func attemptReconnect(_ override: Bool = false) {
    if self.reconnecting && !override { return }
    self.reconnecting = true
    
    self.connectWebSocket()
    
    // if after 3 seconds we're still not connected, run this function again:
    DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
      if self.wsManager.isConnected() {
        self.reconnecting = false
        return
      }
      self.attemptReconnect(true)
    }
  }
  
  private func handleStatusChange(_ status: WebSocketStatus) {
    print("handleStatusChange: \(status)")
    
    if status == .disconnected || status == .error {
      stopAudioSenderThread()
      attemptReconnect()
    }
  }
  
  // MARK: - Audio Queue Sender Thread
  
  private func startAudioSenderThread() {
    if audioSenderThread != nil { return }
    
    audioSenderRunning = true
    audioSenderThread = Thread {
      while self.audioSenderRunning {
        if let chunk = self.audioBuffer.poll() {
          if self.wsManager.isConnected() {
            self.wsManager.sendBinary(chunk)
          } else {
            // Re-enqueue the chunk if not connected, then wait a bit
            self.audioBuffer.offer(chunk)
            Thread.sleep(forTimeInterval: 0.1)
          }
        } else {
          // No data in queue, wait a bit
          Thread.sleep(forTimeInterval: 0.01)
        }
      }
    }
    
    audioSenderThread?.name = "AudioSenderThread"
    audioSenderThread?.start()
  }
  
  private func stopAudioSenderThread() {
    print("stopping audio sender thread")
    audioSenderRunning = false
    audioSenderThread = nil
  }
  
  // MARK: - Helper methods
  
  private func getServerUrl() -> String {
    let host = RNCConfig.env(for: "AUGMENTOS_HOST")!;
    let port = RNCConfig.env(for: "AUGMENTOS_PORT")!;
    let secure = RNCConfig.env(for: "AUGMENTOS_SECURE")!
    let secureServer = secure.contains("true")
    let url = "\(secureServer ? "wss" : "ws")://\(host):\(port)/glasses-ws"
    print("getServerUrl(): \(url)")
    return url
  }
  
  func parseAppList(msg: [String: Any]) -> [ThirdPartyCloudApp] {
    var installedApps: [[String: Any]]?
    var activeAppPackageNames: [String]?
    
    // Try to grab installedApps at the top level
    installedApps = msg["installedApps"] as? [[String: Any]]
    
    // If not found, look for "userSession.installedApps"
    if installedApps == nil {
      if let userSession = msg["userSession"] as? [String: Any] {
        installedApps = userSession["installedApps"] as? [[String: Any]]
      }
    }
    
    // Similarly, try to find activeAppPackageNames at top level or under userSession
    activeAppPackageNames = msg["activeAppPackageNames"] as? [String]
    if activeAppPackageNames == nil {
      if let userSession = msg["userSession"] as? [String: Any] {
        activeAppPackageNames = userSession["activeAppPackageNames"] as? [String]
      }
    }
    
    // Convert activeAppPackageNames into a Set for easy lookup
    var runningPackageNames = Set<String>()
    if let activeApps = activeAppPackageNames {
      for packageName in activeApps {
        if !packageName.isEmpty {
          runningPackageNames.insert(packageName)
        }
      }
    }
    
    // Build a list of ThirdPartyCloudApp objects from installedApps
    var appList: [ThirdPartyCloudApp] = []
    if let apps = installedApps {
      for appJson in apps {
        // Extract packageName first so we can check isRunning
        let packageName = appJson["packageName"] as? String ?? "unknown.package"
        
        // Check if package is in runningPackageNames
        let isRunning = runningPackageNames.contains(packageName)
        
        // Create the ThirdPartyCloudApp
        let app = ThirdPartyCloudApp(
          packageName: packageName,
          name: appJson["name"] as? String ?? "Unknown App",
          description: appJson["description"] as? String ?? "No description available.",
          webhookURL: appJson["webhookURL"] as? String ?? "",
          logoURL: appJson["logoURL"] as? String ?? "",
          isRunning: isRunning
        )
        appList.append(app)
      }
    }
    
    return appList
  }
}

// A simple implementation of ArrayBlockingQueue for Swift
class ArrayBlockingQueue<T> {
  private let queue = DispatchQueue(label: "ArrayBlockingQueue", attributes: .concurrent)
  private var array: [T] = []
  private let capacity: Int
  
  init(capacity: Int) {
    self.capacity = capacity
  }
  
  func offer(_ element: T) -> Bool {
    var result = false
    
    queue.sync(flags: .barrier) {
      if self.array.count < self.capacity {
        self.array.append(element)
        result = true
      } else if self.array.count > 0 {
        // If queue is full, remove the oldest item
        self.array.removeFirst()
        self.array.append(element)
        result = true
      }
    }
    
    return result
  }
  
  func poll() -> T? {
    var result: T?
    
    queue.sync(flags: .barrier) {
      if !self.array.isEmpty {
        result = self.array.removeFirst()
      }
    }
    
    return result
  }
  
  func take() -> T? {
    // Simple implementation - in a real blocking queue, this would actually block
    // until an element is available
    return poll()
  }
}
