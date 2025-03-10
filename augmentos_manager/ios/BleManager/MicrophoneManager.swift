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
  private var audioRecording = [Data]();
  private var audioPlayer: AVAudioPlayer?
  
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
    
    audioRecording.removeAll()
    
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
    
    //    inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, time in
    //      guard let self = self else { return }
    //
    //      let frameCount = Int(buffer.frameLength)
    //
    //      // Create a 16-bit PCM data buffer
    //      var pcmData: Data
    //      // Convert to 16-bit PCM at 16kHz if needed
    //      let convertedBuffer = AVAudioPCMBuffer(pcmFormat: converter.outputFormat,
    //                                             frameCapacity: AVAudioFrameCount(frameCount))!
    //      var error: NSError? = nil
    //      let status = converter.convert(to: convertedBuffer, error: &error, withInputFrom: { _, outStatus in
    //        outStatus.pointee = .haveData
    //        return buffer
    //      })
    //
    //      if status == .haveData && error == nil {
    //        // Use the converted int16 data
    //        pcmData = self.extractInt16Data(from: convertedBuffer)
    //        self.audioRecording.append(pcmData)
    //      } else {
    //        print("Conversion error: \(error?.localizedDescription ?? "unknown")")
    //        return
    //      }
    //
    ////      // Convert pcmData to lc3:
    ////      let pcmConverter = PcmConverter()
    ////      let lc3Data = pcmConverter.encode(pcmData)
    ////
    ////      if lc3Data.count > 0 {
    ////        print("Got LC3 data of size: \(lc3Data.count) from PCM data of size: \(pcmData.count)")
    ////      } else {
    ////        print("LC3 conversion resulted in empty data")
    ////      }
    ////
    ////      // Publish the audio data
    ////      self.voiceDataSubject.send(lc3Data as Data)
    //    }
    
    inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, time in
      guard let self = self else { return }
      
      let frameCount = Int(buffer.frameLength)
      
      // Calculate the correct output buffer capacity based on sample rate conversion
      // For downsampling from inputFormat.sampleRate to 16000 Hz
      let outputCapacity = AVAudioFrameCount(Double(frameCount) * (16000.0 / inputFormat.sampleRate))
      
      // Create a 16-bit PCM data buffer with adjusted capacity
      let convertedBuffer = AVAudioPCMBuffer(pcmFormat: converter.outputFormat, frameCapacity: outputCapacity)!
      
      var error: NSError? = nil
      let status = converter.convert(to: convertedBuffer, error: &error, withInputFrom: { _, outStatus in
        outStatus.pointee = .haveData
        return buffer
      })
      
      var pcmData: Data;
      
      if status == .haveData && error == nil {
        // Use the converted int16 data
        pcmData = self.extractInt16Data(from: convertedBuffer)
        self.audioRecording.append(pcmData)
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
    // play back the audio (for testing only):
//    playbackRecordedAudio()
  }
  
  
  /// Play back the recorded audio data
  private func playbackRecordedAudio() {
    guard !audioRecording.isEmpty else {
      print("No audio data to play back")
      return
    }
    
    // Combine all audio chunks into a single data object
    let combinedData = audioRecording.reduce(Data()) { $0 + $1 }
    
    do {
      // Reset audio session for playback
      let playbackSession = AVAudioSession.sharedInstance()
      try playbackSession.setCategory(.playback, mode: .default)
      try playbackSession.setActive(true)
      
      // Create a temporary WAV file with proper headers
      let tempDirectoryURL = FileManager.default.temporaryDirectory
      let tempFileURL = tempDirectoryURL.appendingPathComponent("temp_recording.wav")
      
      // Create WAV file with appropriate headers
      createWavFile(with: combinedData, at: tempFileURL)
      
      // Create audio player from the WAV file
      audioPlayer = try AVAudioPlayer(contentsOf: tempFileURL)
      audioPlayer?.prepareToPlay()
      audioPlayer?.play()
      
      print("Playing back recorded audio, data size: \(combinedData.count) bytes")
    } catch {
      print("Audio playback error: \(error.localizedDescription)")
    }
  }
  
  /// Create a WAV file with the proper headers for the recorded PCM data
  private func createWavFile(with pcmData: Data, at url: URL) {
    // WAV header parameters
    let sampleRate: UInt32 = 16000
    let numChannels: UInt16 = 1
    let bitsPerSample: UInt16 = 16
    
    // Create WAV header
    var header = Data()
    
    // RIFF chunk descriptor
    header.append("RIFF".data(using: .ascii)!)
    let fileSize = UInt32(pcmData.count + 36) // File size minus 8 bytes for RIFF and fileSize
    header.append(withUnsafeBytes(of: fileSize.littleEndian) { Data($0) })
    header.append("WAVE".data(using: .ascii)!)
    
    // fmt sub-chunk
    header.append("fmt ".data(using: .ascii)!)
    var subchunk1Size: UInt32 = 16 // Size of the fmt sub-chunk
    header.append(withUnsafeBytes(of: subchunk1Size.littleEndian) { Data($0) })
    var audioFormat: UInt16 = 1 // PCM = 1
    header.append(withUnsafeBytes(of: audioFormat.littleEndian) { Data($0) })
    header.append(withUnsafeBytes(of: numChannels.littleEndian) { Data($0) })
    header.append(withUnsafeBytes(of: sampleRate.littleEndian) { Data($0) })
    
    let byteRate = UInt32(sampleRate * UInt32(numChannels) * UInt32(bitsPerSample) / 8)
    header.append(withUnsafeBytes(of: byteRate.littleEndian) { Data($0) })
    
    let blockAlign = UInt16(numChannels * bitsPerSample / 8)
    header.append(withUnsafeBytes(of: blockAlign.littleEndian) { Data($0) })
    header.append(withUnsafeBytes(of: bitsPerSample.littleEndian) { Data($0) })
    
    // data sub-chunk
    header.append("data".data(using: .ascii)!)
    let subchunk2Size = UInt32(pcmData.count)
    header.append(withUnsafeBytes(of: subchunk2Size.littleEndian) { Data($0) })
    
    // Combine header with PCM data
    let wavData = header + pcmData
    
    // Write WAV file
    try? wavData.write(to: url)
  }
  
  // MARK: - Cleanup
  
  func cleanup() {
    stopRecording()
  }
}
