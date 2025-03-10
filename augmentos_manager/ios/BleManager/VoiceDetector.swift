//
//  VoiceDetector.swift
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 3/9/25.
//


import Foundation
import Accelerate
import AVFoundation

class VoiceDetector {
    // Configuration parameters
    private let sampleRate: Float
    private let energyThreshold: Float
    private let zcrThreshold: Float
    private let minVoiceDuration: Float
    private let frameSize: Int
    private let smoothingFactor: Float
    
    // State variables
    private var voiceDetected: Bool = false
    private var voiceStartTime: CFTimeInterval = 0
    private var energyHistory: [Float] = []
    private var zcrHistory: [Float] = []
    private let historyMaxLength: Int = 10
    
    init(sampleRate: Float = 44100,
         energyThreshold: Float = 0.015,
         zcrThreshold: Float = 0.1,
         minVoiceDuration: Float = 0.25,
         frameSize: Int = 512,
         smoothingFactor: Float = 0.2) {
        
        self.sampleRate = sampleRate
        self.energyThreshold = energyThreshold
        self.zcrThreshold = zcrThreshold
        self.minVoiceDuration = minVoiceDuration
        self.frameSize = frameSize
        self.smoothingFactor = smoothingFactor
    }
    
    /// Calculate signal energy (root mean square)
    private func calculateEnergy(frame: [Float]) -> Float {
        var sum: Float = 0
        vDSP_measqv(frame, 1, &sum, vDSP_Length(frame.count))
        return sqrt(sum / Float(frame.count))
    }
    
    /// Calculate zero-crossing rate
    private func calculateZCR(frame: [Float]) -> Float {
        var zcr: Int = 0
        for i in 1..<frame.count {
            if (frame[i] >= 0 && frame[i-1] < 0) || (frame[i] < 0 && frame[i-1] >= 0) {
                zcr += 1
            }
        }
        return Float(zcr) / Float(frame.count - 1)
    }
    
    /// Extract spectral features for better voice detection
    private func extractSpectralFeatures(frame: [Float]) -> (centroid: Float, rolloff: Float) {
        // For better detection, we can analyze spectral properties
        // This is a simplified implementation - for production use, consider FFT analysis
        
        var magnitudes = [Float](repeating: 0, count: frame.count / 2)
        // Compute FFT magnitudes (simplified - actual implementation would use vDSP_fft functions)
        
        // Spectral centroid calculation (simplified)
        let centroid: Float = 0.0
        
        // Spectral rolloff calculation (simplified)
        let rolloff: Float = 0.0
        
        return (centroid, rolloff)
    }
    
    /// Update history arrays with new values
    private func updateHistory(energy: Float, zcr: Float) {
        energyHistory.append(energy)
        zcrHistory.append(zcr)
        
        if energyHistory.count > historyMaxLength {
            energyHistory.removeFirst()
        }
        
        if zcrHistory.count > historyMaxLength {
            zcrHistory.removeFirst()
        }
    }
    
    /// Get average of the history values
    private func getAverageEnergy() -> Float {
        if energyHistory.isEmpty { return 0 }
        return energyHistory.reduce(0, +) / Float(energyHistory.count)
    }
    
    private func getAverageZCR() -> Float {
        if zcrHistory.isEmpty { return 0 }
        return zcrHistory.reduce(0, +) / Float(zcrHistory.count)
    }
    
    /// Process PCM data to detect voice
    func processAudio(pcmData: [Int16]) -> Bool {
        // Convert Int16 PCM data to floating point for processing
        var floatData = [Float](repeating: 0, count: pcmData.count)
        vDSP_vflt16(pcmData, 1, &floatData, 1, vDSP_Length(pcmData.count))
        
        // Normalize the data
        var normalizationFactor: Float = 1.0 / 32768.0
        vDSP_vsmul(floatData, 1, &normalizationFactor, &floatData, 1, vDSP_Length(pcmData.count))
        
        var voiceDetectionResult = false
        
        // Process data in frames
        for i in stride(from: 0, to: pcmData.count, by: frameSize) {
            let frameEnd = min(i + frameSize, pcmData.count)
            let frame = Array(floatData[i..<frameEnd])
            
            // Skip frames that are too small
            if frame.count < frameSize / 2 {
                continue
            }
            
            // Calculate energy and ZCR for the current frame
            let energy = calculateEnergy(frame: frame)
            let zcr = calculateZCR(frame: frame)
            
            // Optional: Extract spectral features for better detection
            // let (spectralCentroid, spectralRolloff) = extractSpectralFeatures(frame: frame)
            
            // Update history
            updateHistory(energy: energy, zcr: zcr)
            
            // Get average values from history for smoother detection
            let avgEnergy = getAverageEnergy()
            let avgZCR = getAverageZCR()
            
            // Simple voice detection logic
            let currentTime = CACurrentMediaTime()
            
            if avgEnergy > energyThreshold && avgZCR < zcrThreshold {
                // Potential voice detected
                if !voiceDetected {
                    voiceDetected = true
                    voiceStartTime = currentTime
                }
            } else {
                if voiceDetected && (currentTime - voiceStartTime > Double(minVoiceDuration)) {
                    // Voice segment ended and was long enough to be considered voice
                    voiceDetectionResult = true
                }
                voiceDetected = false
            }
        }
        
        return voiceDetectionResult || voiceDetected
    }
    
    /// Alternative interface using AudioBuffer
    func processAudioBuffer(buffer: AVAudioPCMBuffer) -> Bool {
        guard let channelData = buffer.int16ChannelData else {
            return false
        }
        
        let channelCount = Int(buffer.format.channelCount)
        let frameLength = Int(buffer.frameLength)
        
        // For simplicity, just process the first channel if it's stereo
        let stride = buffer.stride
        
        var samples = [Int16]()
        for i in 0..<frameLength {
            samples.append(channelData[0][i * stride])
        }
        
        return processAudio(pcmData: samples)
    }
}

// Example usage:
/*
let detector = VoiceDetector(
    sampleRate: 44100,
    energyThreshold: 0.01,   // Adjust based on your environment and microphone
    zcrThreshold: 0.2,       // Adjust based on testing
    minVoiceDuration: 0.2    // 200ms minimum for a voice segment
)

// When new PCM data arrives:
let isVoice = detector.processAudio(pcmData: incomingPcmData)
if isVoice {
    print("Voice detected!")
}
*/
