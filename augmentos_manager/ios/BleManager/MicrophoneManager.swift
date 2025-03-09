//
//  OnboardMicrophoneManager.swift
//  AugmentOS_Manager
//
//  Created on 3/8/25.
//

import Foundation
import AVFoundation
import Combine

class OnboardMicrophoneManager {
  // MARK: - Properties
  
  /// Publisher for voice data
  private let voiceDataSubject = PassthroughSubject<Data, Never>()
  
  /// Public access to voice data stream
  var voiceData: AnyPublisher<Data, Never> {
    return voiceDataSubject.eraseToAnyPublisher()
  }
  
  /// Audio recording components
  private var audioEngine: AVAudioEngine?
  private var audioSession: AVAudioSession?
  
  /// Recording state
  private(set) var isRecording = false
  
  // MARK: - Initialization
  
  init() {
    // Default initialization
    
  }
  
  // MARK: - Public Methods
  
  /// Request microphone permissions
  func requestPermissions() async -> Bool {
    return await withCheckedContinuation { continuation in
      AVAudioSession.sharedInstance().requestRecordPermission { granted in
        DispatchQueue.main.async {
          continuation.resume(returning: granted)
        }
      }
    }
  }
  
  /// Check if microphone permissions have been granted
  func checkPermissions() -> Bool {
    return AVAudioSession.sharedInstance().recordPermission == .granted
  }
  
  
  // MARK: - Private Helpers
  
  /// Convert AVAudioPCMBuffer to Data
  private func convertBufferToData(_ buffer: AVAudioPCMBuffer) -> Data {
    let channelCount = Int(buffer.format.channelCount)
    let length = Int(buffer.frameLength)
    let data = NSMutableData()
    
    if buffer.format.commonFormat == .pcmFormatInt16 {
      // Already in Int16 format
      let channels = UnsafeBufferPointer(start: buffer.int16ChannelData,
                                         count: channelCount)
      
      for frame in 0..<length {
        for channel in 0..<channelCount {
          var value = channels[channel][frame]
          data.append(&value, length: 2)
        }
      }
    }
    
    return data as Data
  }
  
  /// Extract Int16 data from a converted buffer
  private func extractInt16Data(from buffer: AVAudioPCMBuffer) -> Data {
    let channelCount = Int(buffer.format.channelCount)
    let frameCount = Int(buffer.frameLength)
    let data = NSMutableData()
    
    // Safely get int16 data (won't be nil if buffer is in Int16 format)
    guard let int16Data = buffer.int16ChannelData else {
      print("Error: Buffer does not contain int16 data")
      return Data()
    }
    
    let channels = UnsafeBufferPointer(start: int16Data, count: channelCount)
    
    // Extract each sample
    for frame in 0..<frameCount {
      for channel in 0..<channelCount {
        var sample = channels[channel][frame]
        data.append(&sample, length: 2)
      }
    }
    
    return data as Data
  }
  
  /// Start recording from the onboard microphone
  func startRecording() -> Bool {
    // Don't restart if already recording
    if isRecording {
      return true
    }
    
    // Check permissions first
    guard checkPermissions() else {
      print("Microphone permissions not granted")
      return false
    }
    
    // Initialize audio session
    audioSession = AVAudioSession.sharedInstance()
    do {
      try audioSession?.setCategory(.record, mode: .default)
      try audioSession?.setActive(true)
    } catch {
      print("Failed to set up audio session: \(error)")
      return false
    }
    
    // Initialize audio engine and input node
    audioEngine = AVAudioEngine()
    guard let inputNode = audioEngine?.inputNode else {
      print("Failed to get audio input node")
      return false
    }
    
    // Get the native input format - typically 48kHz floating point samples
    let inputFormat = inputNode.inputFormat(forBus: 0)
    print("Input format: \(inputFormat)")
    
    // Set up a converter node if you need 16-bit PCM
    let converter = AVAudioConverter(from: inputFormat, to: AVAudioFormat(commonFormat: .pcmFormatInt16,
                                                                          sampleRate: 16000,
                                                                          channels: 1,
                                                                          interleaved: true)!)
    
    guard let converter = converter else {
      print("converter is nil")
      return false
    }
    
    // Install tap using native format for maximum compatibility
    inputNode.installTap(onBus: 0, bufferSize: 512, format: inputFormat) { [weak self] buffer, time in
      guard let self = self else { return }
      
      // Get float samples directly as recommended in the StackOverflow answer
      let samples = buffer.floatChannelData?[0]
      let frameCount = Int(buffer.frameLength)
      
      // Create a 16-bit PCM data buffer
      var pcmData: Data
      // Convert to 16-bit PCM at 16kHz if needed
      let convertedBuffer = AVAudioPCMBuffer(pcmFormat: converter.outputFormat,
                                             frameCapacity: AVAudioFrameCount(frameCount))!
      var error: NSError? = nil
      let status = converter.convert(to: convertedBuffer, error: &error, withInputFrom: { _, outStatus in
        outStatus.pointee = .haveData
        return buffer
      })
      
      if status == .haveData && error == nil {
        // Use the converted int16 data
        pcmData = self.extractInt16Data(from: convertedBuffer)
      } else {
        print("Conversion error: \(error?.localizedDescription ?? "unknown")")
        return
      }
      
      // Convert pcmData to lc3:
      let pcmConverter = PcmConverter()
      let lc3Data = pcmConverter.encode(pcmData)
      
      if lc3Data.count > 0 {
        print("Got LC3 data of size: \(lc3Data.count) from PCM data of size: \(pcmData.count)")
      } else {
        print("LC3 conversion resulted in empty data")
      }
      
      // Publish the audio data
      self.voiceDataSubject.send(lc3Data as Data)
    }
    
    // Start the audio engine
    do {
      try audioEngine?.start()
      isRecording = true
      print("Onboard microphone started recording")
      return true
    } catch {
      print("Failed to start audio engine: \(error)")
      return false
    }
  }
  
  
  /// Stop recording from the onboard microphone
  func stopRecording() {
    guard isRecording else {
      return
    }
    
    // Remove the tap and stop the engine
    audioEngine?.inputNode.removeTap(onBus: 0)
    audioEngine?.stop()
    
    // Clean up
    try? audioSession?.setActive(false)
    audioEngine = nil
    audioSession = nil
    isRecording = false
    
    print("Onboard microphone stopped recording")
  }
  
  // MARK: - Cleanup
  
  func cleanup() {
    stopRecording()
  }
}
