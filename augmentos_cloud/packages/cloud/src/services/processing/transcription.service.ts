/**
 * @fileoverview Service for real-time audio transcription using Azure Speech Services.
 * Handles continuous audio stream processing, transcription, and result distribution.
 * 
 * Primary responsibilities:
 * - Real-time audio transcription
 * - Interim and final result handling
 * - Speaker diarization
 * - Stream lifecycle management
 * - Result broadcasting to TPAs
 */

import * as azureSpeechSDK from 'microsoft-cognitiveservices-speech-sdk';
import {
  Recognizer,
  SessionEventArgs,
  SpeechRecognitionCanceledEventArgs,
  SpeechRecognitionEventArgs,
  ProfanityOption,
  OutputFormat,
  AudioInputStream,
  AudioConfig,
  SpeechRecognizer
} from 'microsoft-cognitiveservices-speech-sdk';
import { AZURE_SPEECH_REGION, AZURE_SPEECH_KEY } from '../../env';

/**
 * Base interface for transcription results.
 * Both interim and final results extend this.
 */
export interface TranscriptionBase {
  text: string;
  startTime: number;        // Relative to session start
  endTime: number;
  speakerId?: string;       // For speaker diarization: currently not supported
  confidence?: number;      // For confidence scoring: currently not supported
}

/**
 * Interface for interim (in-progress) transcription results.
 */
export interface InterimTranscriptionResult extends TranscriptionBase {
  isFinal: false;
}

/**
 * Interface for final transcription results.
 */
export interface FinalTranscriptionResult extends TranscriptionBase {
  isFinal: true;
  duration: number;         // Total duration of the segment
}

/**
 * The format of transcription data sent to TPAs.
 * Design decision: Unified format for both interim and final results
 * to simplify TPA implementation.
 */
export interface TranscriptionStreamData {
  type: 'interim' | 'final';
  text: string;
  startTime: number;
  endTime: number;
  speakerId?: string;
  confidence?: number;
  duration?: number;        // Only present for final results
  isFinal: boolean;
}

/**
 * Configuration options for the transcription service.
 */
export interface TranscriptionServiceConfig {
  speechRecognitionLanguage?: string;
  enableProfanityFilter?: boolean;
  enablePunctuation?: boolean;
}

/**
 * Interface defining the public API of the transcription service.
 */
export interface ITranscriptionService {
  startTranscription(
    sessionId: string,
    onInterimResult: (result: InterimTranscriptionResult) => void,
    onFinalResult: (result: FinalTranscriptionResult) => void
  ): { 
    recognizer: SpeechRecognizer; 
    pushStream: azureSpeechSDK.PushAudioInputStream;
  };
}

/**
 * Implementation of the transcription service using Azure Speech Services.
 * Design decisions:
 * 1. Push stream model for real-time audio
 * 2. Continuous recognition with separate interim/final handlers
 * 3. Relative timestamps for easier client-side handling
 * 4. Built-in error recovery and session management
 */
export class TranscriptionService implements ITranscriptionService {
  private speechConfig: azureSpeechSDK.SpeechConfig;
  private sessionStartTime = 0;
  
  /**
   * Creates a new TranscriptionService instance.
   * @param config - Optional configuration parameters
   * @throws Error if Azure credentials are missing
   */
  constructor(config: TranscriptionServiceConfig = {}) {
    const AZURE_SPEECH_REGION='centralus';
    const AZURE_SPEECH_KEY = "7ZV4RSmaAP3NgnvDW8R8mgvQpq2QDtNM7GMbQH0w4sJqzpDngK8PJQQJ99BAAC1i4TkXJ3w3AAAYACOGYFdi";
    //const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION;
    if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION) {
      throw new Error('Azure Speech key and region are required for TranscriptionService.');
    }
    
    this.speechConfig = azureSpeechSDK.SpeechConfig.fromSubscription(
      AZURE_SPEECH_KEY,
      AZURE_SPEECH_REGION
    );
    
    // Configure speech recognition settings
    this.speechConfig.speechRecognitionLanguage = config.speechRecognitionLanguage || 'en-US';
    
    if (config.enableProfanityFilter) {
      this.speechConfig.setProfanity(ProfanityOption.Removed);
    }

    // Enable detailed output for better result parsing
    this.speechConfig.outputFormat = OutputFormat.Detailed;
  }

  /**
   * Starts transcription for a session.
   * @param sessionId - Session identifier
   * @param onInterimResult - Callback for interim results
   * @param onFinalResult - Callback for final results
   * @returns Object containing recognizer and push stream
   */
  startTranscription(
    sessionId: string,
    onInterimResult: (result: InterimTranscriptionResult) => void,
    onFinalResult: (result: FinalTranscriptionResult) => void
  ): { recognizer: SpeechRecognizer; pushStream: azureSpeechSDK.PushAudioInputStream } {
    this.sessionStartTime = Date.now();
    const pushStream = AudioInputStream.createPushStream();
    const audioConfig = AudioConfig.fromStreamInput(pushStream);
    const recognizer = new SpeechRecognizer(this.speechConfig, audioConfig);

    // Set up recognition handlers
    this.setupRecognitionHandlers(recognizer, sessionId, onInterimResult, onFinalResult);

    // Start continuous recognition
    recognizer.startContinuousRecognitionAsync(
      () => console.log(`[Session ${sessionId}] Continuous recognition started`),
      (err) => console.error(`[Session ${sessionId}] Error starting recognition:`, err)
    );

    return { recognizer, pushStream };
  }

  /**
   * Sets up all recognition event handlers.
   * @param recognizer - Speech recognizer instance
   * @param sessionId - Session identifier
   * @param onInterimResult - Interim result callback
   * @param onFinalResult - Final result callback
   * @private
   */
  private setupRecognitionHandlers(
    recognizer: SpeechRecognizer,
    sessionId: string,
    onInterimResult: (result: InterimTranscriptionResult) => void,
    onFinalResult: (result: FinalTranscriptionResult) => void
  ): void {
    // Handle interim results
    recognizer.recognizing = (_sender: any, event: SpeechRecognitionEventArgs) => {
      if (!event.result.text) return;

      const result: InterimTranscriptionResult = {
        text: event.result.text,
        startTime: this.calculateRelativeTime(event.result.offset),
        endTime: this.calculateRelativeTime(event.result.offset + event.result.duration),
        isFinal: false,
        speakerId: event.result.speakerId,
        // confidence: event.result.confidence
      };

      onInterimResult(result);
    };

    // Handle final results
    recognizer.recognized = (_sender: any, event: SpeechRecognitionEventArgs) => {
      if (!event.result.text) return;

      const result: FinalTranscriptionResult = {
        text: event.result.text,
        startTime: this.calculateRelativeTime(event.result.offset),
        endTime: this.calculateRelativeTime(event.result.offset + event.result.duration),
        isFinal: true,
        speakerId: event.result.speakerId,
        // confidence: event.result.confidence,
        duration: event.result.duration
      };

      onFinalResult(result);
    };

    // Handle cancellation
    recognizer.canceled = (_sender: any, event: SpeechRecognitionCanceledEventArgs) => {
      console.error(`[Session ${sessionId}] Recognition canceled:`, event);
    };

    // Handle session lifecycle
    recognizer.sessionStarted = (_sender: any, _event: SessionEventArgs) => {
      console.log(`[Session ${sessionId}] Recognition session started`);
    };

    recognizer.sessionStopped = (_sender: any, _event: SessionEventArgs) => {
      console.log(`[Session ${sessionId}] Recognition session stopped`);
    };
  }

  /**
   * Calculates time relative to session start.
   * @param absoluteTime - Absolute timestamp
   * @returns Time relative to session start in milliseconds
   * @private
   */
  private calculateRelativeTime(absoluteTime: number): number {
    return absoluteTime - this.sessionStartTime;
  }
}

// Create singleton instance
export const transcriptionService = new TranscriptionService();
export default transcriptionService;
