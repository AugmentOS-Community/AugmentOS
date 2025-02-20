import * as azureSpeechSDK from 'microsoft-cognitiveservices-speech-sdk';
import {
  SessionEventArgs,
  SpeechRecognitionCanceledEventArgs,
  ProfanityOption,
  OutputFormat,
  AudioInputStream,
  AudioConfig,
  ConversationTranscriber,
  ConversationTranscriptionEventArgs
} from 'microsoft-cognitiveservices-speech-sdk';
import { TranscriptionData, UserSession } from '@augmentos/types';
import { AZURE_SPEECH_KEY, AZURE_SPEECH_REGION } from '@augmentos/config';
import webSocketService from '../core/websocket.service';

export interface InterimTranscriptionResult extends TranscriptionData {
  type: 'transcription-interim';
  isFinal: false;
}

export interface FinalTranscriptionResult extends TranscriptionData {
  type: 'transcription-final',
  isFinal: true;
  duration: number;
}

export class TranscriptionService {
  private speechConfig: azureSpeechSDK.SpeechConfig;
  private sessionStartTime = 0;

  constructor(config: {
    speechRecognitionLanguage?: string;
    enableProfanityFilter?: boolean;
  } = {}) {
    console.log('🎤 Initializing TranscriptionService...');

    if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION) {
      console.error('❌ Missing Azure credentials!');
      throw new Error('Azure Speech key and region are required');
    }

    this.speechConfig = azureSpeechSDK.SpeechConfig.fromSubscription(
      AZURE_SPEECH_KEY,
      AZURE_SPEECH_REGION
    );

    this.speechConfig.speechRecognitionLanguage = config.speechRecognitionLanguage || 'en-US';
    this.speechConfig.setProfanity(ProfanityOption.Raw);
    this.speechConfig.outputFormat = OutputFormat.Simple;

    console.log('✅ TranscriptionService initialized with config:', {
      language: this.speechConfig.speechRecognitionLanguage,
      region: AZURE_SPEECH_REGION,
      format: 'Simple'
    });
  }

  startTranscription(userSession: UserSession) {
    console.log(`\n🎙️ [Session ${userSession.sessionId}] Starting transcription...`);
    console.log('Current session state:', {
      hasRecognizer: !!userSession.recognizer,
      hasPushStream: !!userSession.pushStream,
      isTranscribing: userSession.isTranscribing,
      bufferedAudioChunks: userSession.bufferedAudio.length
    });

    if (userSession.recognizer && userSession.pushStream) {
      console.log('⚠️ Transcription already active, reusing existing resources');
      return { recognizer: userSession.recognizer, pushStream: userSession.pushStream };
    }

    this.sessionStartTime = Date.now();

    try {
      console.log('🔄 Creating new transcription resources...');
      const pushStream = AudioInputStream.createPushStream();
      const audioConfig = AudioConfig.fromStreamInput(pushStream);
      const recognizer = new ConversationTranscriber(this.speechConfig, audioConfig);

      userSession.pushStream = pushStream;
      userSession.recognizer = recognizer;

      console.log('✅ Created new recognizer and push stream');

      // Set up recognition handlers
      this.setupRecognitionHandlers(userSession, recognizer);

      // Start recognition
      console.log('🚀 Starting continuous recognition...\n');
      recognizer.startTranscribingAsync(
        () => {
          console.log('✅ Recognition started successfully');
          userSession.isTranscribing = true;

          // Process buffered audio
          if (userSession.bufferedAudio.length > 0) {
            console.log(`📦 Processing ${userSession.bufferedAudio.length} buffered audio chunks`);
            userSession.bufferedAudio.forEach((chunk, index) => {
              try {
                pushStream.write(chunk);
              } catch (error) {
                console.error(`❌ Error processing buffered chunk ${index + 1}:`, error);
              }
            });
            userSession.bufferedAudio = [];
          }
        },
        (error) => {
          console.error('❌ Failed to start recognition:', error);
          this.cleanupTranscriptionResources(userSession);
        }
      );

      return { recognizer, pushStream };
    } catch (error) {
      console.error('❌ Error creating transcription:', error);
      this.cleanupTranscriptionResources(userSession);
      throw error;
    }
  }

  private setupRecognitionHandlers(userSession: UserSession, recognizer: ConversationTranscriber) {
    recognizer.transcribing = (_sender: any, event: ConversationTranscriptionEventArgs) => {
      if (!event.result.text) return;
      console.log(`🎤 [Interim] ${event.result.text}`);

      const result: InterimTranscriptionResult = {
        type: 'transcription-interim',
        text: event.result.text,
        startTime: this.calculateRelativeTime(event.result.offset),
        endTime: this.calculateRelativeTime(event.result.offset + event.result.duration),
        isFinal: false,
        speakerId: event.result.speakerId,
      };

      this.broadcastTranscriptionResult(userSession, result);

      // TODO(isaiah): For now we're only saving final transcriptions to the transcript history.
      // this.updateTranscriptHistory(userSession, event, false);
    };

    recognizer.transcribed = (_sender: any, event: ConversationTranscriptionEventArgs) => {
      if (!event.result.text) return;
      console.log(`✅ [Final] ${event.result.text}`);

      const result: FinalTranscriptionResult = {
        type: 'transcription-final',
        text: event.result.text,
        startTime: this.calculateRelativeTime(event.result.offset),
        endTime: this.calculateRelativeTime(event.result.offset + event.result.duration),
        isFinal: true,
        speakerId: event.result.speakerId,
        duration: event.result.duration
      };

      this.broadcastTranscriptionResult(userSession, result);
      this.updateTranscriptHistory(userSession, event, true);
    };

    recognizer.canceled = (_sender: any, event: SpeechRecognitionCanceledEventArgs) => {
      console.error('❌ Recognition canceled:', {
        reason: event.reason,
        errorCode: event.errorCode,
        errorDetails: event.errorDetails
      });
      this.cleanupTranscriptionResources(userSession);
    };

    recognizer.sessionStarted = (_sender: any, _event: SessionEventArgs) => {
      console.log('📢 Recognition session started');
    };

    recognizer.sessionStopped = (_sender: any, _event: SessionEventArgs) => {
      console.log('🛑 Recognition session stopped');
    };
  }

  stopTranscription(userSession: UserSession) {
    console.log(`\n🛑 [Session ${userSession.sessionId}] Stopping transcription...`);
    console.log('Current session state:', {
      hasRecognizer: !!userSession.recognizer,
      hasPushStream: !!userSession.pushStream,
      isTranscribing: userSession.isTranscribing
    });

    if (!userSession.recognizer) {
      console.log('ℹ️ No recognizer to stop');
      return;
    }

    try {
      userSession.recognizer.stopTranscribingAsync(
        () => {
          console.log('✅ Recognition stopped successfully');
          this.cleanupTranscriptionResources(userSession);
        },
        (error) => {
          console.error('❌ Error stopping recognition:', error);
          this.cleanupTranscriptionResources(userSession);
        }
      );
    } catch (error) {
      console.error('❌ Error in stopTranscription:', error);
      this.cleanupTranscriptionResources(userSession);
    }
  }

  private cleanupTranscriptionResources(userSession: UserSession) {
    console.log('🧹 Cleaning up transcription resources...');

    if (userSession.pushStream) {
      try {
        userSession.pushStream.close();
        console.log('✅ Closed push stream');
      } catch (error) {
        console.warn('⚠️ Error closing pushStream:', error);
      }
      userSession.pushStream = undefined;
    }

    if (userSession.recognizer) {
      try {
        userSession.recognizer.close();
        console.log('✅ Closed recognizer');
      } catch (error) {
        console.warn('⚠️ Error closing recognizer:', error);
      }
      userSession.recognizer = undefined;
    }

    userSession.isTranscribing = false;
    console.log('✅ Cleanup complete');
  }

  private calculateRelativeTime(absoluteTime: number): number {
    return absoluteTime - this.sessionStartTime;
  }

  private updateTranscriptHistory(userSession: UserSession, event: ConversationTranscriptionEventArgs, isFinal: boolean) {
    console.log('📝 Updating transcript history...');
    // let addSegment = false;

    // if (userSession.transcript.segments.length > 0) {
    //   const lastSegment = userSession.transcript.segments[userSession.transcript.segments.length - 1];
    //   if (lastSegment.resultId === event.result.resultId) {
    //     console.log('🔄 Updating existing segment');
    //     lastSegment.text = event.result.text;
    //     lastSegment.timestamp = new Date();
    //   } else {
    //     console.log('➕ Adding new segment');
    //     addSegment = true;
    //   }
    // } else {
    //   console.log('➕ Adding first segment');
    //   addSegment = true;
    // }

    if (isFinal) {
      // Add a new segment to the transcript history
      userSession.transcript.segments.push({
        resultId: event.result.resultId,
        speakerId: event.result.speakerId,
        text: event.result.text,
        timestamp: new Date(),
        isFinal
      });
    }
  }

  // Inside TranscriptionService class
  private broadcastTranscriptionResult(userSession: UserSession, results: TranscriptionData) {
    console.log('📢 Broadcasting transcription result');

    try {
      // Use the webSocketService's broadcast method
      webSocketService.broadcastToTpa(
        userSession.sessionId,
        'transcription',
        results
      );
    } catch (error) {
      console.error('❌ Error broadcasting transcription:', error);
      console.log('Failed to broadcast:', {
        sessionId: userSession.sessionId,
        resultType: results.type,
        text: results.text?.slice(0, 50) + '...'  // Log first 50 chars
      });
    }
  }

}

export const transcriptionService = new TranscriptionService();
export default transcriptionService;