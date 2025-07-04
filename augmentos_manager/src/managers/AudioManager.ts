import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import AudioPlayService from '../services/AudioPlayService';

const { AudioManagerModule } = NativeModules;

export interface AudioPlayRequest {
  requestId: string;
  audioUrl: string;
  volume?: number;
  stopOtherAudio?: boolean;
}

class AudioManagerClass {
  private eventEmitter: NativeEventEmitter | null = null;
  private responseListener: any = null;

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners() {
    if (Platform.OS === 'android' && AudioManagerModule) {
      // Set up event listener for responses from Android
      this.eventEmitter = new NativeEventEmitter(AudioManagerModule);

      this.responseListener = this.eventEmitter.addListener(
        'AudioPlayResponse',
        (response) => {
          console.log('AudioManager: Received response from native:', response);
          AudioPlayService.handleAudioPlayResponse(response);
        }
      );
    }
    // iOS responses are handled through ServerComms directly
  }

  async playAudio(request: AudioPlayRequest): Promise<void> {
    console.log(`AudioManager: Playing audio for requestId: ${request.requestId}`);

    if (Platform.OS === 'ios') {
      // iOS implementation - responses are handled through ServerComms
      const { AOSManager } = NativeModules;
      return AOSManager.playAudio(
        request.requestId,
        request.audioUrl,
        request.volume || 1.0,
        request.stopOtherAudio !== false
      );
    } else if (Platform.OS === 'android') {
      // Android implementation - responses come through event emitter
      if (!AudioManagerModule) {
        throw new Error('AudioManagerModule is not available');
      }

      return AudioManagerModule.playAudio(
        request.requestId,
        request.audioUrl,
        request.volume || 1.0,
        request.stopOtherAudio !== false
      );
    } else {
      throw new Error(`Unsupported platform: ${Platform.OS}`);
    }
  }

  async stopAudio(requestId: string): Promise<void> {
    console.log(`AudioManager: Stopping audio for requestId: ${requestId}`);

    if (Platform.OS === 'ios') {
      const { AOSManager } = NativeModules;
      return AOSManager.stopAudio(requestId);
    } else if (Platform.OS === 'android') {
      if (!AudioManagerModule) {
        throw new Error('AudioManagerModule is not available');
      }
      return AudioManagerModule.stopAudio(requestId);
    } else {
      throw new Error(`Unsupported platform: ${Platform.OS}`);
    }
  }

  async stopAllAudio(): Promise<void> {
    console.log('AudioManager: Stopping all audio');

    if (Platform.OS === 'ios') {
      const { AOSManager } = NativeModules;
      return AOSManager.stopAllAudio();
    } else if (Platform.OS === 'android') {
      if (!AudioManagerModule) {
        throw new Error('AudioManagerModule is not available');
      }
      return AudioManagerModule.stopAllAudio();
    } else {
      throw new Error(`Unsupported platform: ${Platform.OS}`);
    }
  }

  cleanup() {
    if (this.responseListener) {
      this.responseListener.remove();
      this.responseListener = null;
    }
  }
}

const AudioManager = new AudioManagerClass();
export default AudioManager;