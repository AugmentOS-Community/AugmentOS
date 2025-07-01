// Handle React Native imports with fallback for type issues
let Platform: any;
let NativeModules: any;

try {
  const RN = require('react-native');
  Platform = RN.Platform;
  NativeModules = RN.NativeModules;
} catch (e) {
  console.warn('Failed to import from react-native');
  Platform = { OS: 'unknown' };
  NativeModules = {};
}

interface AudioManagerNative {
  playAudio(
    requestId: string,
    audioUrl?: string,
    audioData?: string,
    mimeType?: string,
    volume?: number,
    stopOtherAudio?: boolean,
    streamAction?: string
  ): Promise<string>;

  stopAudio(requestId: string): Promise<string>;
  stopAllAudio(): Promise<string>;
}

// For Android, we use the native module
const AndroidAudioManager: AudioManagerNative | null = Platform.OS === 'android'
  ? NativeModules.AudioManagerModule
  : null;

// For iOS, we'll need to create a similar bridge or handle it differently
const iOSAudioManager: AudioManagerNative | null = Platform.OS === 'ios'
  ? NativeModules.IOSAudioManager // This would need to be implemented
  : null;

export interface AudioPlayRequest {
  requestId: string;
  audioUrl?: string;
  audioData?: string;
  mimeType?: string;
  volume?: number;
  stopOtherAudio?: boolean;
  streamAction?: 'start' | 'append' | 'end';
}

export class AudioManager {
  private static instance: AudioManager;

  private constructor() {}

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  public async playAudio(request: AudioPlayRequest): Promise<void> {
    const {
      requestId,
      audioUrl,
      audioData,
      mimeType,
      volume = 1.0,
      stopOtherAudio = true,
      streamAction
    } = request;



          try {
        if (Platform.OS === 'android' && AndroidAudioManager) {
          const result = await AndroidAudioManager.playAudio(
            requestId,
            audioUrl || '',
            audioData || '',
            mimeType || '',
            volume,
            stopOtherAudio,
            streamAction || ''
          );
        } else if (Platform.OS === 'ios') {
          // For iOS, we'll call the native AudioManager directly
          // This is a temporary solution - in production you'd want a proper bridge
          await this.playAudioIOS(request);
        } else {
          throw new Error(`AudioManager not available for platform: ${Platform.OS}`);
        }
      } catch (error) {
        throw error;
      }
  }

  public async stopAudio(requestId: string): Promise<void> {
    console.log(`AudioManager: Stopping audio for requestId: ${requestId}`);

    try {
      if (Platform.OS === 'android' && AndroidAudioManager) {
        await AndroidAudioManager.stopAudio(requestId);
      } else if (Platform.OS === 'ios') {
        await this.stopAudioIOS(requestId);
      } else {
        throw new Error(`AudioManager not available for platform: ${Platform.OS}`);
      }
    } catch (error) {
      console.error(`AudioManager: Failed to stop audio for requestId ${requestId}:`, error);
      throw error;
    }
  }

  public async stopAllAudio(): Promise<void> {
    console.log('AudioManager: Stopping all audio');

    try {
      if (Platform.OS === 'android' && AndroidAudioManager) {
        await AndroidAudioManager.stopAllAudio();
      } else if (Platform.OS === 'ios') {
        await this.stopAllAudioIOS();
      } else {
        throw new Error(`AudioManager not available for platform: ${Platform.OS}`);
      }
    } catch (error) {
      console.error('AudioManager: Failed to stop all audio:', error);
      throw error;
    }
  }

  // iOS-specific implementations (these would ideally be moved to a native bridge)
  private async playAudioIOS(request: AudioPlayRequest): Promise<void> {
    // For now, we'll use a workaround that calls the iOS AudioManager
    // In a production app, you'd want to create a proper React Native bridge
    const { requestId, audioUrl, audioData, mimeType, volume, stopOtherAudio, streamAction } = request;

    // This is a placeholder - you'd need to implement an iOS native module
    // similar to the Android one, or use a different approach
    console.log('AudioManager: iOS playback not yet implemented via React Native bridge');

    // Temporary: we could use react-native-sound or expo-av for basic functionality
    // but for streaming support, a custom native module would be better
  }

  private async stopAudioIOS(requestId: string): Promise<void> {
    console.log(`AudioManager: iOS stop audio for ${requestId} not yet implemented`);
  }

  private async stopAllAudioIOS(): Promise<void> {
    console.log('AudioManager: iOS stop all audio not yet implemented');
  }

  // Utility method to handle incoming audio play requests from WebSocket
  public async handleAudioPlayRequest(message: any): Promise<void> {
    const {
      requestId,
      audioUrl,
      audioData,
      mimeType,
      volume,
      stopOtherAudio,
      streamAction
    } = message;

    if (!requestId) {
      throw new Error('Audio play request missing requestId');
    }

    await this.playAudio({
      requestId,
      audioUrl,
      audioData,
      mimeType,
      volume,
      stopOtherAudio,
      streamAction
    });
  }
}

export default AudioManager.getInstance();