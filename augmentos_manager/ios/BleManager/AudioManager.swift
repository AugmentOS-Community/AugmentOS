//
//  AudioManager.swift
//  AugmentOS_Manager
//
//  Created by Assistant on date
//

import Foundation
import AVFoundation
import Combine

class AudioManager {
    private static var instance: AudioManager?

    private var players: [String: AVPlayer] = [:] // requestId -> player

    private var streamingPlayers: [String: AVAudioPlayer] = [:] // requestId -> streaming player
    private var cancellables = Set<AnyCancellable>()

    static func getInstance() -> AudioManager {
        if instance == nil {
            instance = AudioManager()
        }
        return instance!
    }

    private init() {
        setupAudioSession()
    }

    private func setupAudioSession() {
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .default, options: [.allowBluetooth, .allowBluetoothA2DP])
            try audioSession.setActive(true)
            print("AudioManager: Audio session configured successfully")
        } catch {
            print("AudioManager: Failed to setup audio session: \(error)")
        }
    }

    func playAudio(
        requestId: String,
        audioUrl: String,
        volume: Float = 1.0,
        stopOtherAudio: Bool = true
    ) {
        print("AudioManager: playAudio called with requestId: \(requestId)")

        if stopOtherAudio {
            stopAllAudio()
        }

        playAudioFromUrl(requestId: requestId, url: audioUrl, volume: volume)
    }

    private func playAudioFromUrl(requestId: String, url: String, volume: Float) {
        guard let audioUrl = URL(string: url) else {
            print("AudioManager: Invalid URL: \(url)")
            sendAudioPlayResponse(requestId: requestId, success: false, error: "Invalid URL")
            return
        }

        print("AudioManager: Playing audio from URL: \(url)")

        let player = AVPlayer(url: audioUrl)
        player.volume = volume
        players[requestId] = player

        // Add observer for when playback ends
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player.currentItem,
            queue: .main
        ) { [weak self] _ in
            self?.players.removeValue(forKey: requestId)
            self?.sendAudioPlayResponse(requestId: requestId, success: true, duration: nil)
        }

        player.play()
        print("AudioManager: Started playing audio from URL for requestId: \(requestId)")
    }



    private func playCompleteAudioData(requestId: String, data: Data, volume: Float) {
        do {
            let player = try AVAudioPlayer(data: data)
            player.volume = volume
            player.delegate = self
            streamingPlayers[requestId] = player

            player.play()
            print("AudioManager: Started playing audio data for requestId: \(requestId)")
        } catch {
            print("AudioManager: Failed to create audio player: \(error)")
            sendAudioPlayResponse(requestId: requestId, success: false, error: error.localizedDescription)
        }
    }

    func stopAudio(requestId: String) {
        if let player = players[requestId] {
            player.pause()
            players.removeValue(forKey: requestId)
        }

        if let streamingPlayer = streamingPlayers[requestId] {
            streamingPlayer.stop()
            streamingPlayers.removeValue(forKey: requestId)
        }


        print("AudioManager: Stopped audio for requestId: \(requestId)")
    }

    func stopAllAudio() {
        for (_, player) in players {
            player.pause()
        }
        players.removeAll()

        for (_, streamingPlayer) in streamingPlayers {
            streamingPlayer.stop()
        }
        streamingPlayers.removeAll()


        print("AudioManager: Stopped all audio")
    }

        private func sendAudioPlayResponse(requestId: String, success: Bool, error: String? = nil, duration: Double? = nil) {
        print("AudioManager: Sending audio play response - requestId: \(requestId), success: \(success), error: \(error ?? "none")")

        // Send response back through AOSManager which will forward to React Native
        let aosManager = AOSManager.getInstance()
        aosManager.sendAudioPlayResponse(requestId: requestId, success: success, error: error, duration: duration)
    }
}

// MARK: - AVAudioPlayerDelegate
extension AudioManager: AVAudioPlayerDelegate {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        // Find the requestId for this player
        for (requestId, streamingPlayer) in streamingPlayers {
            if streamingPlayer === player {
                streamingPlayers.removeValue(forKey: requestId)
                sendAudioPlayResponse(requestId: requestId, success: flag, duration: player.duration)
                break
            }
        }
    }

    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        // Find the requestId for this player
        for (requestId, streamingPlayer) in streamingPlayers {
            if streamingPlayer === player {
                streamingPlayers.removeValue(forKey: requestId)
                sendAudioPlayResponse(requestId: requestId, success: false, error: error?.localizedDescription)
                break
            }
        }
    }
}