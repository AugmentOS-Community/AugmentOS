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
import {
  StreamType,
  TranscriptionData,
  TranslationData,
  UserSession,
  ExtendedStreamType,
  getLanguageInfo
} from '@augmentos/sdk';
import webSocketService from '../core/websocket.service';
import subscriptionService from '../core/subscription.service';

export const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || "";
export const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY || "";

/**
 * Extend the UserSession type with our new property.
 */
export type ExtendedUserSession = UserSession & {
  transcriptionStreams?: Map<string, ASRStreamInstance>;
};

/**
 * Interface for an individual ASR stream instance.
 */
export interface ASRStreamInstance {
  recognizer: ConversationTranscriber | azureSpeechSDK.TranslationRecognizer;
  pushStream: AudioInputStream;
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
    // Remove profanity filtering by setting to Raw (i.e. unfiltered text)
    this.speechConfig.setProfanity(ProfanityOption.Raw);
    this.speechConfig.outputFormat = OutputFormat.Simple;

    console.log('✅ TranscriptionService initialized with config:', {
      language: this.speechConfig.speechRecognitionLanguage,
      region: AZURE_SPEECH_REGION,
      format: 'Simple'
    });
  }

  updateTranscriptionStreams(userSession: ExtendedUserSession, desiredSubscriptions: ExtendedStreamType[]): void {
    if (!userSession.transcriptionStreams) {
      userSession.transcriptionStreams = new Map<string, ASRStreamInstance>();
    }
    const desiredSet = new Set(desiredSubscriptions);

    // Create new streams if needed
    desiredSet.forEach(subscription => {
      if (!userSession.transcriptionStreams!.has(subscription)) {
        console.log(`Starting new transcription stream for ${subscription}`);
        const newStream = this.createASRStreamForSubscription(subscription, userSession);
        userSession.transcriptionStreams!.set(subscription, newStream);
      }
    });

    // Stop streams no longer desired
    userSession.transcriptionStreams!.forEach((streamInstance, key) => {
      if (!desiredSet.has(key)) {
        console.log(`Stopping transcription stream for ${key}`);
        this.stopIndividualTranscriptionStream(streamInstance, key);
        userSession.transcriptionStreams!.delete(key);
      }
    });
  }

  private createASRStreamForSubscription(subscription: ExtendedStreamType, userSession: ExtendedUserSession): ASRStreamInstance {
    // Use the updated parse logic – which returns transcribeLanguage and translateLanguage.
    const languageInfo = getLanguageInfo(subscription);
    if (!languageInfo) {
      throw new Error(`Invalid language subscription: ${subscription}`);
    }

    const pushStream = azureSpeechSDK.AudioInputStream.createPushStream();
    const audioConfig = AudioConfig.fromStreamInput(pushStream);

    let recognizer: ConversationTranscriber | azureSpeechSDK.TranslationRecognizer;
    if (languageInfo.type === StreamType.TRANSLATION && languageInfo.translateLanguage) {
      // Here, use transcribeLanguage and translateLanguage.
      const translationConfig = azureSpeechSDK.SpeechTranslationConfig.fromSubscription(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION);
      translationConfig.speechRecognitionLanguage = languageInfo.transcribeLanguage;
      translationConfig.addTargetLanguage(languageInfo.translateLanguage);
      // Remove profanity filtering for translation by setting to Raw
      translationConfig.setProfanity(ProfanityOption.Raw);
      recognizer = new azureSpeechSDK.TranslationRecognizer(translationConfig, audioConfig);
      recognizer.startContinuousRecognitionAsync(
        () => { console.log(`✅ Started translation stream for ${subscription}`); },
        (error) => {
          console.error(`❌ Failed to start translation stream for ${subscription}:`, error);
          this.stopIndividualTranscriptionStream({ recognizer, pushStream }, subscription);
        }
      );
    } else {
      const speechConfig = azureSpeechSDK.SpeechConfig.fromSubscription(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION);
      speechConfig.speechRecognitionLanguage = languageInfo.transcribeLanguage;
      // Remove profanity filtering for transcription by setting to Raw
      speechConfig.setProfanity(ProfanityOption.Raw);
      recognizer = new ConversationTranscriber(speechConfig, audioConfig);
      recognizer.startTranscribingAsync(
        () => { console.log(`✅ Started transcription stream for ${subscription}`); },
        (error: any) => {
          console.error(`❌ Failed to start transcription stream for ${subscription}:`, error);
          this.stopIndividualTranscriptionStream({ recognizer, pushStream }, subscription);
        }
      );
    }

    const streamInstance: ASRStreamInstance = { recognizer, pushStream };
    this.setupRecognitionHandlersForInstance(streamInstance, userSession, subscription, languageInfo);
    return streamInstance;
  }

  private stopIndividualTranscriptionStream(streamInstance: ASRStreamInstance, subscription: string): void {
    if (streamInstance.recognizer) {
      if (subscription.includes(StreamType.TRANSLATION)) {
        (streamInstance.recognizer as azureSpeechSDK.TranslationRecognizer).stopContinuousRecognitionAsync(
          () => { console.log(`✅ Stopped translation stream for ${subscription}`); },
          (error: any) => { console.error(`❌ Error stopping translation stream for ${subscription}:`, error); }
        );
      } else {
        (streamInstance.recognizer as ConversationTranscriber).stopTranscribingAsync(
          () => { console.log(`✅ Stopped transcription stream for ${subscription}`); },
          (error: any) => { console.error(`❌ Error stopping transcription stream for ${subscription}:`, error); }
        );
      }
      streamInstance.recognizer.close();
    }
    if (streamInstance.pushStream) {
      try {
        streamInstance.pushStream.close();
      } catch (error) {
        console.warn('⚠️ Error closing push stream:', error);
      }
    }
  }

  private setupRecognitionHandlersForInstance(
    instance: ASRStreamInstance,
    userSession: ExtendedUserSession,
    subscription: ExtendedStreamType,
    languageInfo: { type: StreamType; transcribeLanguage: string; translateLanguage?: string }
  ): void {
    if (languageInfo.type === StreamType.TRANSLATION) {
      // Translation branch: use recognizing and recognized.
      (instance.recognizer as azureSpeechSDK.TranslationRecognizer).recognizing = (_sender: any, event: any) => {
        if (!event.result.translations) return;

        // TODO: Find a better way to handle this

        const translateLanguage = languageInfo.translateLanguage == "zh-CN" ? "zh-Hans" : languageInfo.translateLanguage?.split('-')[0];
        const translatedText = languageInfo.transcribeLanguage === languageInfo.translateLanguage ? event.result.text : event.result.translations.get(translateLanguage);
        console.log(`🎤 TRANSLATION [Interim][${userSession.userId}][${subscription}]: ${translatedText}`);
        const translationData: TranslationData = {
          type: StreamType.TRANSLATION,
          text: translatedText,
          startTime: this.calculateRelativeTime(event.result.offset),
          endTime: this.calculateRelativeTime(event.result.offset + event.result.duration),
          isFinal: false,
          speakerId: event.result.speakerId,
          transcribeLanguage: languageInfo.transcribeLanguage,
          translateLanguage: languageInfo.translateLanguage
        };
        this.broadcastTranscriptionResult(userSession, translationData);
        this.updateTranscriptHistory(userSession, event, false);
      };

      (instance.recognizer as azureSpeechSDK.TranslationRecognizer).recognized = (_sender: any, event: any) => {
        if (!event.result.translations) return;
        const translateLanguage = languageInfo.translateLanguage == "zh-CN" ? "zh-Hans" : languageInfo.translateLanguage?.split('-')[0];
        const translatedText = languageInfo.transcribeLanguage === languageInfo.translateLanguage ? event.result.text : event.result.translations.get(translateLanguage);

        const translationData: TranslationData = {
          type: StreamType.TRANSLATION,
          isFinal: true,
          text: translatedText,
          startTime: this.calculateRelativeTime(event.result.offset),
          endTime: this.calculateRelativeTime(event.result.offset + event.result.duration),
          speakerId: event.result.speakerId,
          duration: event.result.duration,
          transcribeLanguage: languageInfo.transcribeLanguage,
          translateLanguage: languageInfo.translateLanguage
        };
        this.broadcastTranscriptionResult(userSession, translationData);
        this.updateTranscriptHistory(userSession, event, true);
      };
    } else {
      // Transcription branch.
      (instance.recognizer as ConversationTranscriber).transcribing = (_sender: any, event: ConversationTranscriptionEventArgs) => {
        if (!event.result.text) return;
        console.log(`🎤 TRANSCRIPTION [Interim][${userSession.userId}][${subscription}]: ${event.result.text}`);
        const transcriptionData: TranscriptionData = {
          type: StreamType.TRANSCRIPTION,
          text: event.result.text,
          startTime: this.calculateRelativeTime(event.result.offset),
          endTime: this.calculateRelativeTime(event.result.offset + event.result.duration),
          isFinal: false,
          speakerId: event.result.speakerId,
          transcribeLanguage: languageInfo.transcribeLanguage
        };

        console.log('\n\n\n#### transcriptionData:', event.result.language, "\n\n\n");

        if (languageInfo.transcribeLanguage === 'en-US') {
          this.updateTranscriptHistory(userSession, event, false);
        }
        this.broadcastTranscriptionResult(userSession, transcriptionData);
      };

      (instance.recognizer as ConversationTranscriber).transcribed = (_sender: any, event: ConversationTranscriptionEventArgs) => {
        if (!event.result.text) return;
        console.log(`✅ TRANSCRIPTION [Final][${userSession.userId}][${subscription}]: ${event.result.text}`);
        const transcriptionData: TranscriptionData = {
          type: StreamType.TRANSCRIPTION,
          isFinal: true,
          text: event.result.text,
          startTime: this.calculateRelativeTime(event.result.offset),
          endTime: this.calculateRelativeTime(event.result.offset + event.result.duration),
          speakerId: event.result.speakerId,
          duration: event.result.duration,
          transcribeLanguage: languageInfo.transcribeLanguage
        };
        // console.log('\n\n\n#### result:', true, "\n\n\n");
        // console.log('\n\n\n#### languageInfo.transcribeLanguage:', event.result.language, "\n\n\n");
        if (languageInfo.transcribeLanguage === 'en-US') {
          this.updateTranscriptHistory(userSession, event, true);
        }
        this.broadcastTranscriptionResult(userSession, transcriptionData);
      };
    }

    // Common event handlers.
    instance.recognizer.canceled = (_sender: any, event: SpeechRecognitionCanceledEventArgs) => {
      console.error(`❌ Recognition canceled for ${subscription}:`, {
        reason: event.reason,
        errorCode: event.errorCode,
        errorDetails: event.errorDetails
      });
      this.stopIndividualTranscriptionStream(instance, subscription);
    };

    instance.recognizer.sessionStarted = (_sender: any, _event: SessionEventArgs) => {
      console.log(`📢 Recognition session started for ${subscription}`);
    };

    instance.recognizer.sessionStopped = (_sender: any, _event: SessionEventArgs) => {
      console.log(`🛑 Recognition session stopped for ${subscription}`);
    };
  }

  private calculateRelativeTime(absoluteTime: number): number {
    return absoluteTime - this.sessionStartTime;
  }

  private broadcastTranscriptionResult(userSession: ExtendedUserSession, data: TranscriptionData | TranslationData): void {
    console.log('📢 Broadcasting transcription/translation result');
    try {
      const streamType = data.type === StreamType.TRANSLATION ? StreamType.TRANSLATION : StreamType.TRANSCRIPTION;
      console.log("🎤 Broadcasting result: ", streamType, data);
      webSocketService.broadcastToTpa(userSession.sessionId, streamType, data);
    } catch (error) {
      console.error('❌ Error broadcasting result:', error);
    }
  }

  feedAudioToTranscriptionStreams(userSession: ExtendedUserSession, audioData: Uint8Array) {
    if (!userSession.transcriptionStreams) return console.error('No transcription streams found for session');
    userSession.transcriptionStreams.forEach(instance => {
      (instance.pushStream as any).write(audioData);
    });
  }

  /***********************
   * Legacy Methods
   ***********************/
  startTranscription(userSession: UserSession): void {
    const extSession = userSession as ExtendedUserSession;
    const minimalSubs = subscriptionService.getMinimalLanguageSubscriptions(extSession.sessionId);
    this.updateTranscriptionStreams(extSession, minimalSubs);
  }

  stopTranscription(userSession: UserSession): void {
    const extSession = userSession as ExtendedUserSession;
    this.updateTranscriptionStreams(extSession, []);
  }

  handlePushStreamError(userSession: UserSession, error: any): void {
    console.error('Handling push stream error:', error);
    this.stopTranscription(userSession);
  }

  private updateTranscriptHistory(userSession: ExtendedUserSession, event: ConversationTranscriptionEventArgs, isFinal: boolean): void {
    const segments = userSession.transcript.segments;
    const hasInterimLast = segments.length > 0 && !segments[segments.length - 1].isFinal;

    console.log('\n\n\n########', event.result.language, "\n\n\n");
    // Only save English transcriptions.
    // if (event.result.language !== 'en-US') {
    //   console.log("🚫 Skipping non-English transcription");
    //   return;
    // }

    const currentTime = new Date();

    if (isFinal) {
      if (hasInterimLast) {
        segments.pop();
      }
      segments.push({
        resultId: event.result.resultId,
        speakerId: event.result.speakerId,
        text: event.result.text,
        timestamp: currentTime,
        isFinal: true
      });
    } 
    else {
      if (hasInterimLast) {
        segments[segments.length - 1] = {
          resultId: event.result.resultId,
          speakerId: event.result.speakerId,
          text: event.result.text,
          timestamp: currentTime,
          isFinal: false
        };
      } else {
        segments.push({
          resultId: event.result.resultId,
          speakerId: event.result.speakerId,
          text: event.result.text,
          timestamp: currentTime,
          isFinal: false
        });
      }
    }

    console.log('\n\n\nsegments:', segments, "\n\n\n");

    // Prune old segments (older than 30 minutes)
    const thirtyMinutesAgo = new Date(currentTime.getTime() - 30 * 60 * 1000);
    userSession.transcript.segments = segments.filter(
      seg => seg.timestamp && new Date(seg.timestamp) >= thirtyMinutesAgo
    );
  }
}

export const transcriptionService = new TranscriptionService();
export default transcriptionService;
