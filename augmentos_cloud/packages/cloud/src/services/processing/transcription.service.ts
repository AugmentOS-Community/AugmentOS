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
  // UserSession,
  ExtendedStreamType,
  getLanguageInfo,
  TranscriptSegment,
  CloudToTpaMessage,
  DataStream,
  CloudToTpaMessageType
} from '@augmentos/sdk';
// import webSocketService from '../websocket/websocket.service';
import subscriptionService from '../session/subscription.service';
import { logger as rootLogger } from '../logging/pino-logger';
import UserSession from '../session/UserSession';
import { sessionService } from '../session/session.service';

// Define module name constant for consistent logging
const SERVICE_NAME = 'transcription.service';
// Create a module-level logger for system-wide events
const logger = rootLogger.child({ service: SERVICE_NAME });

export const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || "";
export const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY || "";

/**
 * Extend the UserSession type with our new property.
 */
// export type ExtendedUserSession = UserSession & {
//   transcriptionStreams?: Map<string, ASRStreamInstance>;
// };

/**
 * Interface for an individual ASR stream instance.
 */
export interface ASRStreamInstance {
  recognizer: ConversationTranscriber | azureSpeechSDK.TranslationRecognizer;
  pushStream: AudioInputStream;
  isReady?: boolean;
  startTime?: number;
}

export class TranscriptionService {
  private speechConfig: azureSpeechSDK.SpeechConfig;
  private sessionStartTime = 0;

  constructor(config: {
    speechRecognitionLanguage?: string;
    enableProfanityFilter?: boolean;
  } = {}) {
    logger.info('Initializing TranscriptionService');

    if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION) {
      logger.error({
        hasKey: !!AZURE_SPEECH_KEY,
        hasRegion: !!AZURE_SPEECH_REGION,
        keyLength: AZURE_SPEECH_KEY?.length || 0,
        region: AZURE_SPEECH_REGION || 'undefined'
      }, 'Missing Azure credentials');
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

    logger.info({
      language: this.speechConfig.speechRecognitionLanguage,
      region: AZURE_SPEECH_REGION,
      format: 'Simple'
    }, 'TranscriptionService initialized');
  }

  updateTranscriptionStreams(userSession: UserSession, desiredSubscriptions: ExtendedStreamType[]): void {
    const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });
    const desiredSet = new Set(desiredSubscriptions);

    // Create new streams if needed
    desiredSet.forEach(subscription => {
      if (!userSession.transcriptionStreams!.has(subscription)) {
        sessionLogger.info({ subscription }, 'Starting new transcription stream');
        try {
          const newStream = this.createASRStreamForSubscription(subscription, userSession);
          userSession.transcriptionStreams!.set(subscription, newStream);
        } catch (error) {
          sessionLogger.error({ subscription, error }, 'Failed to create transcription stream, will retry later');
          
          // Schedule retry after 2 seconds
          setTimeout(() => {
            if (desiredSet.has(subscription) && !userSession.transcriptionStreams!.has(subscription)) {
              sessionLogger.info({ subscription }, 'Retrying transcription stream creation');
              try {
                const retryStream = this.createASRStreamForSubscription(subscription, userSession);
                userSession.transcriptionStreams!.set(subscription, retryStream);
              } catch (retryError) {
                sessionLogger.error({ subscription, error: retryError }, 'Retry failed for transcription stream');
              }
            }
          }, 2000);
        }
      }
    });

    // Stop streams no longer desired
    userSession.transcriptionStreams!.forEach((streamInstance, key) => {
      if (!desiredSet.has(key)) {
        sessionLogger.info({ subscription: key }, 'Stopping transcription stream');
        this.stopIndividualTranscriptionStream(streamInstance, key, userSession);
        userSession.transcriptionStreams!.delete(key);
      }
    });
  }

  private createASRStreamForSubscription(subscription: ExtendedStreamType, userSession: UserSession): ASRStreamInstance {
    const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });

    // Use the updated parse logic – which returns transcribeLanguage and translateLanguage.
    const languageInfo = getLanguageInfo(subscription);
    if (!languageInfo) {
      sessionLogger.error({ subscription }, 'Invalid language subscription');
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

      sessionLogger.debug({
        subscription,
        from: languageInfo.transcribeLanguage,
        to: languageInfo.translateLanguage,
        operation: 'startTranslation'
      }, 'Starting translation stream');

      recognizer.startContinuousRecognitionAsync(
        () => {
          sessionLogger.info({ subscription }, 'Translation stream started');
        },
        (error) => {
          sessionLogger.error({
            error,
            subscription,
            from: languageInfo.transcribeLanguage,
            to: languageInfo.translateLanguage
          }, 'Failed to start translation stream');

          this.stopIndividualTranscriptionStream({ recognizer, pushStream }, subscription, userSession);
        }
      );
    } else {
      const speechConfig = azureSpeechSDK.SpeechConfig.fromSubscription(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION);
      speechConfig.speechRecognitionLanguage = languageInfo.transcribeLanguage;
      // Remove profanity filtering for transcription by setting to Raw
      speechConfig.setProfanity(ProfanityOption.Raw);
      recognizer = new ConversationTranscriber(speechConfig, audioConfig);

      sessionLogger.debug({
        subscription,
        language: languageInfo.transcribeLanguage,
        operation: 'startTranscription'
      }, 'Starting transcription stream');

      recognizer.startTranscribingAsync(
        () => {
          sessionLogger.info({ subscription }, 'Transcription stream started');
        },
        (error: any) => {
          sessionLogger.error({
            error,
            subscription,
            language: languageInfo.transcribeLanguage
          }, 'Failed to start transcription stream');

          this.stopIndividualTranscriptionStream({ recognizer, pushStream }, subscription, userSession);
        }
      );
    }

    const streamInstance: ASRStreamInstance = { 
      recognizer, 
      pushStream, 
      isReady: false,
      startTime: Date.now()
    };
    this.setupRecognitionHandlersForInstance(streamInstance, userSession, subscription, languageInfo);
    
    return streamInstance;
  }

  private stopIndividualTranscriptionStream(
    streamInstance: ASRStreamInstance,
    subscription: string,
    userSession?: UserSession
  ): void {
    // Use session logger if available, otherwise fall back to module logger
    const loggerToUse = userSession
      ? userSession.logger.child({ service: SERVICE_NAME })
      : logger;

    if (streamInstance.recognizer) {
      try {
        if (subscription.includes(StreamType.TRANSLATION)) {
          (streamInstance.recognizer as azureSpeechSDK.TranslationRecognizer).stopContinuousRecognitionAsync(
            () => {
              loggerToUse.info({ subscription }, 'Stopped translation stream');
            },
            (error: any) => {
              loggerToUse.error({ error, subscription }, 'Error stopping translation stream');
            }
          );
        } else {
          (streamInstance.recognizer as ConversationTranscriber).stopTranscribingAsync(
            () => {
              loggerToUse.info({ subscription }, 'Stopped transcription stream');
            },
            (error: any) => {
              loggerToUse.error({ error, subscription }, 'Error stopping transcription stream');
            }
          );
        }

        try {
          streamInstance.recognizer.close();
        } catch (error) {
          loggerToUse.warn({ error, subscription }, 'Error closing recognizer');
        }
      } catch (error) {
        loggerToUse.error({ error, subscription }, 'Error in stopIndividualTranscriptionStream');
      }
    }

    if (streamInstance.pushStream) {
      try {
        streamInstance.pushStream.close();
      } catch (error) {
        loggerToUse.warn({ error }, 'Error closing push stream');
      }
    }
  }

  private setupRecognitionHandlersForInstance(
    instance: ASRStreamInstance,
    userSession: UserSession,
    subscription: ExtendedStreamType,
    languageInfo: { type: StreamType; transcribeLanguage: string; translateLanguage?: string }
  ): void {
    const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });

    if (languageInfo.type === StreamType.TRANSLATION) {
      // Translation branch: use recognizing and recognized.
      (instance.recognizer as azureSpeechSDK.TranslationRecognizer).recognizing = (_sender: any, event: any) => {
        if (!event.result.translations) return;

        // console.log('3223 event.result.translations', event.result.translations);

        // console.log('event.result.text', event.result.translations);
        // TODO: Find a better way to handle this
        const translateLanguage = languageInfo.translateLanguage == "zh-CN" ? "zh-Hans" : languageInfo.translateLanguage?.split('-')[0];
        // console.log('4242 translateLanguage', translateLanguage);
        const translatedText = languageInfo.transcribeLanguage === languageInfo.translateLanguage ? event.result.text : event.result.translations.get(languageInfo.translateLanguage);
        // console.log('5555 translatedText', translatedText);
        const didTranslate = translatedText.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '').trim() !== event.result.text.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '').trim();
        // console.log('6666 didTranslate', didTranslate);
        const detectedSourceLang = didTranslate ? languageInfo.transcribeLanguage : languageInfo.translateLanguage;

        // console.log('detectedSourceLang', detectedSourceLang);
        // console.log('languageInfo.translateLanguage', languageInfo.translateLanguage);
        // console.log('languageInfo.transcribeLanguage', languageInfo.transcribeLanguage);
        // console.log('didTranslate', didTranslate);
        // console.log('translatedText', translatedText);
        // console.log('event.result.text', event.result.text);

        sessionLogger.debug({ 
          subscription,
          from: detectedSourceLang,
          to: languageInfo.translateLanguage,
          text: translatedText,
          isFinal: false,
          speakerId: event.result.speakerId
        }, 'Translation interim result');

        const translationData: TranslationData = {
          type: StreamType.TRANSLATION,
          text: translatedText,
          originalText: event.result.text,
          startTime: this.calculateRelativeTime(event.result.offset),
          endTime: this.calculateRelativeTime(event.result.offset + event.result.duration),
          isFinal: false,
          speakerId: event.result.speakerId,
          transcribeLanguage: languageInfo.transcribeLanguage,
          translateLanguage: languageInfo.translateLanguage,
          didTranslate: didTranslate
        };

        // console.log('translationData', translationData);

        this.broadcastTranscriptionResult(userSession, translationData);

        // Save transcript in the appropriate language
        this.updateTranscriptHistory(userSession, event, false, languageInfo.translateLanguage);
      };

      (instance.recognizer as azureSpeechSDK.TranslationRecognizer).recognized = (_sender: any, event: any) => {
        if (!event.result.translations) return;

        const translateLanguage = languageInfo.translateLanguage == "zh-CN" ? "zh-Hans" : languageInfo.translateLanguage?.split('-')[0];
        // Note(isaiah): without splitting, it was breaking translation. Need to investigate why.
        // const translateLanguage = languageInfo.translateLanguage == "zh-CN" ? "zh-Hans" : languageInfo.translateLanguage;//?.split('-')[0]; 
        const translatedText = languageInfo.transcribeLanguage === languageInfo.translateLanguage ? event.result.text : event.result.translations.get(languageInfo.translateLanguage);
        // const translatedText = languageInfo.transcribeLanguage === languageInfo.translateLanguage ? event.result.text : event.result.translations.get(translateLanguage);
        // Compare normalized text to determine if translation occurred
        const didTranslate = translatedText.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '').trim() !== event.result.text.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '').trim();
        const detectedSourceLang = didTranslate ? languageInfo.transcribeLanguage : languageInfo.translateLanguage;

        sessionLogger.debug({
          subscription,
          from: detectedSourceLang,
          to: languageInfo.translateLanguage,
          text: translatedText,
          isFinal: true,
          speakerId: event.result.speakerId,
          duration: event.result.duration
        }, 'Translation final result');

        const translationData: TranslationData = {
          type: StreamType.TRANSLATION,
          isFinal: true,
          text: translatedText,
          originalText: event.result.text,
          startTime: this.calculateRelativeTime(event.result.offset),
          endTime: this.calculateRelativeTime(event.result.offset + event.result.duration),
          speakerId: event.result.speakerId,
          duration: event.result.duration,
          transcribeLanguage: languageInfo.transcribeLanguage,
          translateLanguage: languageInfo.translateLanguage,
          didTranslate: didTranslate
        };
        this.broadcastTranscriptionResult(userSession, translationData);

        // Save transcript in the appropriate language
        this.updateTranscriptHistory(userSession, event, true, languageInfo.translateLanguage);
      };
    } else {
      // Transcription branch.
      (instance.recognizer as ConversationTranscriber).transcribing = (_sender: any, event: ConversationTranscriptionEventArgs) => {
        if (!event.result.text) return;

        sessionLogger.debug({
          subscription,
          language: languageInfo.transcribeLanguage,
          text: event.result.text,
          isFinal: false,
          speakerId: event.result.speakerId
        }, 'Transcription interim result');

        const transcriptionData: TranscriptionData = {
          type: StreamType.TRANSCRIPTION,
          text: event.result.text,
          startTime: this.calculateRelativeTime(event.result.offset),
          endTime: this.calculateRelativeTime(event.result.offset + event.result.duration),
          isFinal: false,
          speakerId: event.result.speakerId,
          transcribeLanguage: languageInfo.transcribeLanguage
        };

        // Save transcript for all languages, not just English
        this.updateTranscriptHistory(userSession, event, false, languageInfo.transcribeLanguage);
        this.broadcastTranscriptionResult(userSession, transcriptionData);
      };

      (instance.recognizer as ConversationTranscriber).transcribed = (_sender: any, event: ConversationTranscriptionEventArgs) => {
        if (!event.result.text) return;

        sessionLogger.debug({
          subscription,
          language: languageInfo.transcribeLanguage,
          text: event.result.text,
          isFinal: true,
          speakerId: event.result.speakerId,
          duration: event.result.duration
        }, 'Transcription final result');

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

        // Save transcript for all languages, not just English
        this.updateTranscriptHistory(userSession, event, true, languageInfo.transcribeLanguage);
        this.broadcastTranscriptionResult(userSession, transcriptionData);
      };
    }

    // Common event handlers.
    instance.recognizer.canceled = (_sender: any, event: SpeechRecognitionCanceledEventArgs) => {
      const isInvalidOperation = event.errorCode === 7;
      
      sessionLogger.error({
        subscription,
        reason: event.reason,
        errorCode: event.errorCode,
        errorDetails: event.errorDetails,
        isInvalidOperation,
        streamAge: Date.now() - (instance.startTime || 0),
        wasReady: instance.isReady,
        azureErrorMapping: isInvalidOperation ? 'SPXERR_INVALID_OPERATION' : 'UNKNOWN'
      }, isInvalidOperation ? 'Recognition canceled with InvalidOperation (error 7)' : 'Recognition canceled');
      sessionLogger.debug({ event }, 'Detailed cancellation event');

      this.stopIndividualTranscriptionStream(instance, subscription, userSession);
      
      // Remove the failed stream from the map
      userSession.transcriptionStreams?.delete(subscription);
      
      // If the error is a temporary issue (not authentication or invalid operation), schedule a retry
      if (event.errorCode !== 1 && event.errorCode !== 2 && event.errorCode !== 7) { // Not authentication, authorization, or invalid operation errors
        sessionLogger.info({ subscription }, 'Scheduling retry for canceled recognition stream');
        setTimeout(() => {
          // Check if the subscription is still needed and stream doesn't exist
          const currentSubscriptions = subscriptionService.getMinimalLanguageSubscriptions(userSession.sessionId);
          if (currentSubscriptions.includes(subscription as ExtendedStreamType) && 
              !userSession.transcriptionStreams?.has(subscription)) {
            sessionLogger.info({ subscription }, 'Retrying canceled transcription stream');
            try {
              const retryStream = this.createASRStreamForSubscription(subscription, userSession);
              userSession.transcriptionStreams?.set(subscription, retryStream);
            } catch (retryError) {
              sessionLogger.error({ subscription, error: retryError }, 'Retry failed for canceled stream');
            }
          }
        }, 3000); // 3 second delay for retries
      }
    };

    instance.recognizer.sessionStarted = (_sender: any, _event: SessionEventArgs) => {
      sessionLogger.info({ subscription }, 'Recognition session started');
      instance.isReady = true;
    };

    instance.recognizer.sessionStopped = (_sender: any, _event: SessionEventArgs) => {
      sessionLogger.info({ subscription }, 'Recognition session stopped');
    };
  }

  private calculateRelativeTime(absoluteTime: number): number {
    return absoluteTime - this.sessionStartTime;
  }

  // TODO(isaiah): copied from the old websocket service, Need to rethink how to cleanly implement this.
  //   /**
  //    * 🗣️📣 Broadcasts data to all TPAs subscribed to a specific stream type.
  //    * @param userSessionId - ID of the user's glasses session
  //    * @param streamType - Type of data stream
  //    * @param data - Data to broadcast
  //    */
  private broadcastToTpa(userSession: UserSession, streamType: StreamType, data: CloudToTpaMessage): void {
    // const userSession = sessionService.getSession(userSessionId);
    // if (!userSession) {
    //   logger.error(`[transcription.service]: User session not found for ${userSessionId}`);
    //   return;
    // }

    // If the stream is transcription or translation and data has language info,
    // construct an effective subscription string.
    let effectiveSubscription: ExtendedStreamType = streamType;
    // For translation, you might also include target language if available.
    if (streamType === StreamType.TRANSLATION) {
      effectiveSubscription = `${streamType}:${(data as any).transcribeLanguage}-to-${(data as any).translateLanguage}`;
    } else if (streamType === StreamType.TRANSCRIPTION && !(data as any).transcribeLanguage) {
      effectiveSubscription = `${streamType}:en-US`;
    } else if (streamType === StreamType.TRANSCRIPTION) {
      effectiveSubscription = `${streamType}:${(data as any).transcribeLanguage}`;
    }

    const subscribedApps = subscriptionService.getSubscribedApps(userSession, effectiveSubscription);

    // Send to all subscribed apps using centralized messaging with automatic resurrection
    subscribedApps.forEach(async (packageName) => {
      const tpaSessionId = `${userSession.sessionId}-${packageName}`;
      
      // CloudDataStreamMessage
      const dataStream: DataStream = {
        type: CloudToTpaMessageType.DATA_STREAM,
        sessionId: tpaSessionId,
        streamType, // Base type remains the same in the message.
        data,      // The data now may contain language info.
        timestamp: new Date()
      };

      try {
        // Use centralized messaging with automatic resurrection
        const result = await userSession.appManager.sendMessageToTpa(packageName, dataStream);
        
        if (!result.sent) {
          userSession.logger.warn({ 
            service: SERVICE_NAME, 
            packageName,
            resurrectionTriggered: result.resurrectionTriggered,
            error: result.error
          }, `Failed to send transcription data to TPA ${packageName}`);
        } else if (result.resurrectionTriggered) {
          userSession.logger.warn({ 
            service: SERVICE_NAME, 
            packageName 
          }, `Transcription data sent to TPA ${packageName} after resurrection`);
        }
      } catch (error) {
        userSession.logger.error({ 
          service: SERVICE_NAME, 
          packageName,
          error: error instanceof Error ? error.message : String(error)
        }, `Error sending transcription data to TPA ${packageName}`);
      }
    });
  }

  private broadcastTranscriptionResult(userSession: UserSession, data: TranscriptionData | TranslationData): void {
    const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });

    sessionLogger.debug({
      data,
      operation: 'broadcast'
    }, 'Broadcasting transcription/translation result');

    try {
      const streamType = data.type === StreamType.TRANSLATION ? StreamType.TRANSLATION : StreamType.TRANSCRIPTION;
      this.broadcastToTpa(userSession, streamType, data);
    } catch (error) {
      sessionLogger.error({
        error,
        data,
        operation: 'broadcast'
      }, 'Error broadcasting result');
    }
  }

  feedAudioToTranscriptionStreams(userSession: UserSession, audioData: Uint8Array) {
    
    if (!userSession.transcriptionStreams) {
      const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });
      sessionLogger.error({
        operation: 'feedAudio'
      }, 'No transcription streams found for session');
      return;
    }
    
    // Too verbose to log every audio feed, so we can comment this out.
    // sessionLogger.debug({ 
      //   numStreams: userSession.transcriptionStreams.size,
      //   dataSize: audioData.length,
      //   operation: 'feedAudio'
      // }, 'Feeding audio data to transcription streams');
      
      userSession.transcriptionStreams.forEach((instance, key) => {
        try {
          // Check if stream is ready for audio data
          if (!instance.isReady) {
            // Only warn if stream has been initializing for more than 5 seconds
            const streamAge = Date.now() - (instance.startTime || 0);
            if (streamAge > 5000) {
              const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });
              sessionLogger.warn({ 
                streamKey: key, 
                streamAge,
                startTime: instance.startTime
              }, 'Stream not ready after 5 seconds, skipping audio data');
            }
            return;
          }

          // Check if stream is closed before writing
          if ((instance.pushStream as any)?._readableState?.destroyed || 
              (instance.pushStream as any)?._readableState?.ended) {
            const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });
            sessionLogger.warn({ streamKey: key }, 'Skipping write to destroyed/ended stream');
            return;
          }
          
          (instance.pushStream as any).write(audioData);
        } catch (error: unknown) {
          const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });
          
          // Enhanced error logging with detailed Azure diagnostics
          const errorDetails = {
            // Stream context
            streamKey: key,
            userId: userSession.userId,
            operation: 'feedAudio',
            
            // Audio context
            audioDataSize: audioData.length,
            audioDataType: audioData.constructor.name,
            
            // Azure-specific error details
            errorCode: (error as any)?.code || (error as any)?.errorCode,
            errorDetails: (error as any)?.errorDetails || (error as any)?.details,
            azureReason: (error as any)?.reason,
            azureResultId: (error as any)?.resultId,
            errorName: (error as any)?.name,
            errorMessage: (error as any)?.message,
            
            // Stream state diagnostics
            pushStreamState: {
              exists: !!instance.pushStream,
              closed: (instance.pushStream as any)?._readableState?.ended,
              destroyed: (instance.pushStream as any)?._readableState?.destroyed,
              readable: (instance.pushStream as any)?._readableState?.readable,
              internalState: (instance.pushStream as any)?._state
            },
            
            recognizerState: {
              exists: !!instance.recognizer,
              state: (instance.recognizer as any)?._impl?.privReco?.privSessionId || 'unknown'
            },
            
            // Runtime info
            azureSDKInfo: 'microsoft-cognitiveservices-speech-sdk',
            timestamp: new Date().toISOString()
          };
          
          // Enrich the error object if it's an Error instance
          if (error instanceof Error) {
            sessionLogger.error(error, 'Error writing to push stream');
            sessionLogger.debug({ errorDetails }, 'push stream Error Detailed error information');
          }

          // Remove dead streams to prevent repeated errors
          if ((error as any)?.message === "Stream closed" || 
              (error as any)?.name === "InvalidOperation") {
            sessionLogger.warn({ streamKey: key }, 'Removing closed/invalid stream to prevent spam');
            userSession.transcriptionStreams?.delete(key);
          }
        }
      });
  }

  /***********************
   * Legacy Methods
   ***********************/
  startTranscription(userSession: UserSession): void {
    const extSession = userSession as UserSession;
    const sessionLogger = extSession.logger.child({ service: SERVICE_NAME });

    sessionLogger.info({
      sessionId: extSession.sessionId,
      operation: 'startTranscription'
    }, 'Starting transcription (legacy method)');

    const minimalSubs = subscriptionService.getMinimalLanguageSubscriptions(extSession.sessionId);

    sessionLogger.debug({
      subscriptions: minimalSubs,
      operation: 'startTranscription'
    }, 'Retrieved minimal language subscriptions');

    this.updateTranscriptionStreams(extSession, minimalSubs);
  }

  stopTranscription(userSession: UserSession): void {
    const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });

    sessionLogger.info({
      sessionId: userSession.sessionId,
      operation: 'stopTranscription'
    }, 'Stopping all transcription streams (legacy method)');

    this.updateTranscriptionStreams(userSession, []);
  }

  handlePushStreamError(userSession: UserSession, error: any): void {
    const extSession = userSession as UserSession;
    const sessionLogger = extSession.logger.child({ service: SERVICE_NAME });

    sessionLogger.error({
      error,
      sessionId: extSession.sessionId,
      operation: 'handlePushStreamError'
    }, 'Handling push stream error, stopping transcription');

    this.stopTranscription(userSession);
  }

  private updateTranscriptHistory(
    userSession: UserSession,
    event: ConversationTranscriptionEventArgs,
    isFinal: boolean,
    language: string = 'en-US'
  ): void {
    const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });

    // Initialize languageSegments if it doesn't exist
    if (!userSession.transcript.languageSegments) {
      sessionLogger.debug({ language }, 'Initializing language segments map');
      userSession.transcript.languageSegments = new Map<string, TranscriptSegment[]>();
    }

    // Ensure the language entry exists in the map
    if (!userSession.transcript.languageSegments.has(language)) {
      sessionLogger.debug({ language }, 'Creating new language segment array');
      userSession.transcript.languageSegments.set(language, []);
    }

    // Handle both the language-specific segments and (for backward compatibility) the legacy segments
    const segments = language === 'en-US' ? userSession.transcript.segments : [];
    const languageSegments = userSession.transcript.languageSegments.get(language)!;

    // Check if we need to update an interim segment
    const hasInterimLastLegacy = segments.length > 0 && !segments[segments.length - 1].isFinal;
    const hasInterimLastLanguage = languageSegments.length > 0 && !languageSegments[languageSegments.length - 1].isFinal;

    const currentTime = new Date();
    const newSegment = {
      resultId: event.result.resultId,
      speakerId: event.result.speakerId,
      text: event.result.text,
      timestamp: currentTime,
      isFinal: isFinal
    };

    // Handle final segment
    if (isFinal) {
      // For language-specific segments
      if (hasInterimLastLanguage) {
        languageSegments.pop(); // Remove the interim segment
      }
      languageSegments.push({ ...newSegment });

      // For backward compatibility with legacy segments (English only)
      if (language === 'en-US') {
        if (hasInterimLastLegacy) {
          segments.pop(); // Remove the interim segment
        }
        segments.push({ ...newSegment });
      }
    }
    // Handle interim segment
    else {
      // For language-specific segments
      if (hasInterimLastLanguage) {
        languageSegments[languageSegments.length - 1] = { ...newSegment };
      } else {
        languageSegments.push({ ...newSegment });
      }

      // For backward compatibility with legacy segments (English only)
      if (language === 'en-US') {
        if (hasInterimLastLegacy) {
          segments[segments.length - 1] = { ...newSegment };
        } else {
          segments.push({ ...newSegment });
        }
      }
    }

    // Prune old segments (older than 30 minutes)
    const thirtyMinutesAgo = new Date(currentTime.getTime() - 30 * 60 * 1000);

    // Update language-specific segments
    const filteredLanguageSegments = languageSegments.filter(
      seg => seg.timestamp && new Date(seg.timestamp) >= thirtyMinutesAgo
    );
    userSession.transcript.languageSegments.set(language, filteredLanguageSegments);

    // Update legacy segments (English only) for backward compatibility
    if (language === 'en-US') {
      const filteredSegments = segments.filter(
        seg => seg.timestamp && new Date(seg.timestamp) >= thirtyMinutesAgo
      );
      userSession.transcript.segments = filteredSegments;
    }

    sessionLogger.debug({
      language,
      segmentCount: languageSegments.length,
      isFinal: isFinal,
      operation: 'updateTranscript',
      textLength: event.result.text.length,
      resultId: event.result.resultId,
      speakerId: event.result.speakerId
    }, 'Updated transcript history');
  }
}

export const transcriptionService = new TranscriptionService();
export default transcriptionService;
