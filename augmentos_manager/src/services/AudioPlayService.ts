import AudioManager, { AudioPlayRequest } from '../managers/AudioManager';

export interface AudioPlayRequestMessage {
  type: 'audio_play_request';
  requestId: string;
  audioUrl: string;
  volume?: number;
  stopOtherAudio?: boolean;
}

export interface AudioPlayResponse {
  requestId: string;
  success: boolean;
  error?: string;
  duration?: number;
}

export type AudioPlayResponseCallback = (response: AudioPlayResponse) => void;

export class AudioPlayService {
  private static instance: AudioPlayService;
  private responseCallback: AudioPlayResponseCallback | null = null;

  private constructor() {}

  public static getInstance(): AudioPlayService {
    if (!AudioPlayService.instance) {
      AudioPlayService.instance = new AudioPlayService();
    }
    return AudioPlayService.instance;
  }

  /**
   * Set the callback function that will be called when audio responses are received
   */
  public setResponseCallback(callback: AudioPlayResponseCallback): void {
    this.responseCallback = callback;
  }

  /**
   * Handle a response from the native audio layer
   */
  public handleAudioPlayResponse(response: AudioPlayResponse): void {
    console.log(`AudioPlayService: Received response for requestId: ${response.requestId}, success: ${response.success}`);

    if (this.responseCallback) {
      this.responseCallback(response);
    } else {
      console.warn('AudioPlayService: No response callback set, dropping response');
    }
  }

  /**
   * Handle an incoming audio play request message
   */
  public async handleAudioPlayRequest(message: AudioPlayRequestMessage): Promise<void> {
    console.log(`AudioPlayService: Handling audio play request for requestId: ${message.requestId}`);

    try {
      const request: AudioPlayRequest = {
        requestId: message.requestId,
        audioUrl: message.audioUrl,
        volume: message.volume,
        stopOtherAudio: message.stopOtherAudio
      };

      await AudioManager.playAudio(request);
      console.log(`AudioPlayService: Started audio play for requestId: ${message.requestId}`);

    } catch (error) {
      console.error(`AudioPlayService: Failed to start audio play for requestId ${message.requestId}:`, error);

      // Send error response immediately
      this.handleAudioPlayResponse({
        requestId: message.requestId,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Stop audio playback for a specific request
   */
  public async stopAudio(requestId: string): Promise<void> {
    try {
      await AudioManager.stopAudio(requestId);
      console.log(`AudioPlayService: Stopped audio for requestId: ${requestId}`);
    } catch (error) {
      console.error(`AudioPlayService: Failed to stop audio for requestId ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Stop all audio playback
   */
  public async stopAllAudio(): Promise<void> {
    try {
      await AudioManager.stopAllAudio();
      console.log('AudioPlayService: Stopped all audio');
    } catch (error) {
      console.error('AudioPlayService: Failed to stop all audio:', error);
      throw error;
    }
  }

  /**
   * Parse and handle a generic message that might be an audio play request
   */
  public async handleMessage(message: any): Promise<boolean> {
    if (message && message.type === 'audio_play_request') {
      await this.handleAudioPlayRequest(message as AudioPlayRequestMessage);
      return true;
    }

    return false;
  }
}

export default AudioPlayService.getInstance();