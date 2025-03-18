/**
 * 🎮 Event Manager Module
 */
import EventEmitter from 'events';
import { 
  StreamType,
  ExtendedStreamType,
  getBaseStreamType,
  parseLanguageStream,
  createTranscriptionStream,
  createTranslationStream,
  AppSettings,
  WebSocketError,
  // Event data types
  ButtonPress,
  HeadPosition,
  PhoneNotification,
  TranscriptionData,
  TranslationData,
  GlassesBatteryUpdate,
  PhoneBatteryUpdate,
  GlassesConnectionState,
  LocationUpdate,
  Vad,
  NotificationDismissed,
  AudioChunk,
  CalendarEvent
} from '../../types';

/** 🎯 Type-safe event handler function */
type Handler<T> = (data: T) => void;

/** 🔄 System events not tied to streams */
interface SystemEvents {
  'connected': AppSettings | undefined;
  'disconnected': string;
  'error': WebSocketError | Error;
  'settings_update': AppSettings;
}

/** 📡 All possible event types */
type EventType = ExtendedStreamType | keyof SystemEvents;

/** 📦 Map of stream types to their data types */
interface StreamDataTypes {
  [StreamType.BUTTON_PRESS]: ButtonPress;
  [StreamType.HEAD_POSITION]: HeadPosition;
  [StreamType.PHONE_NOTIFICATION]: PhoneNotification;
  [StreamType.TRANSCRIPTION]: TranscriptionData;
  [StreamType.TRANSLATION]: TranslationData;
  [StreamType.GLASSES_BATTERY_UPDATE]: GlassesBatteryUpdate;
  [StreamType.PHONE_BATTERY_UPDATE]: PhoneBatteryUpdate;
  [StreamType.GLASSES_CONNECTION_STATE]: GlassesConnectionState;
  [StreamType.LOCATION_UPDATE]: LocationUpdate;
  [StreamType.CALENDAR_EVENT]: CalendarEvent;
  [StreamType.VAD]: Vad;
  [StreamType.NOTIFICATION_DISMISSED]: NotificationDismissed;
  [StreamType.AUDIO_CHUNK]: AudioChunk;
  [StreamType.VIDEO]: ArrayBuffer;
  [StreamType.OPEN_DASHBOARD]: never;
  [StreamType.START_APP]: never;
  [StreamType.STOP_APP]: never;
  [StreamType.ALL]: never;
  [StreamType.WILDCARD]: never;
}

/** 📦 Data type for an event */
type EventData<T extends EventType> = 
  T extends keyof SystemEvents 
    ? SystemEvents[T] 
    : T extends keyof StreamDataTypes 
      ? StreamDataTypes[T] 
      : T extends string 
        ? T extends `${StreamType.TRANSCRIPTION}:${string}` 
          ? TranscriptionData 
          : T extends `${StreamType.TRANSLATION}:${string}` 
            ? TranslationData 
            : any
        : any;

export class EventManager {
  private emitter: EventEmitter;
  private handlers: Map<EventType, Set<Handler<unknown>>>;

  constructor(private subscribe: (type: ExtendedStreamType) => void, private unsubscribe: (type: ExtendedStreamType) => void) {
    this.emitter = new EventEmitter();
    this.handlers = new Map();
  }

  // Convenience handlers for common event types

  onTranscription(handler: Handler<TranscriptionData>) {
    // console.log("streamType@#", StreamType.TRANSCRIPTION);
    return this.addHandler(createTranscriptionStream("en-US"), handler);
  }

  /**
   * 🎤 Listen for transcription in a specific language
   * @param language - Language code (e.g., "en-US")
   * @param handler - Function to handle transcription data
   * @returns Cleanup function to remove the handler
   */
  onTranscriptionForLanguage(language: string, handler: Handler<TranscriptionData>) {
    const streamType = createTranscriptionStream(language);
    return this.addHandler(streamType, handler);
  }

  onTranslation(handler: Handler<TranslationData>) {
    return this.addHandler(StreamType.TRANSLATION, handler);
  }

  /**
   * 🌐 Listen for translation between specific languages
   * @param sourceLanguage - Source language code (e.g., "es-ES")
   * @param targetLanguage - Target language code (e.g., "en-US")
   * @param handler - Function to handle translation data
   * @returns Cleanup function to remove the handler
   */
  onTranslationForLanguages(sourceLanguage: string, targetLanguage: string, handler: Handler<TranslationData>) {
    const streamType = createTranslationStream(sourceLanguage, targetLanguage);
    return this.addHandler(streamType, handler);
  }

  onHeadPosition(handler: Handler<HeadPosition>) {
    return this.addHandler(StreamType.HEAD_POSITION, handler);
  }

  onButtonPress(handler: Handler<ButtonPress>) {
    return this.addHandler(StreamType.BUTTON_PRESS, handler);
  }

  onPhoneNotifications(handler: Handler<PhoneNotification>) {
    return this.addHandler(StreamType.PHONE_NOTIFICATION, handler);
  }

  onGlassesBattery(handler: Handler<GlassesBatteryUpdate>) {
    return this.addHandler(StreamType.GLASSES_BATTERY_UPDATE, handler);
  }

  onPhoneBattery(handler: Handler<PhoneBatteryUpdate>) {
    return this.addHandler(StreamType.PHONE_BATTERY_UPDATE, handler);
  }

  onVoiceActivity(handler: Handler<Vad>) {
    return this.addHandler(StreamType.VAD, handler);
  }

  onLocation(handler: Handler<LocationUpdate>) {
    return this.addHandler(StreamType.LOCATION_UPDATE, handler);
  }

  onCalendarEvent(handler: Handler<CalendarEvent>) {
    return this.addHandler(StreamType.CALENDAR_EVENT, handler);
  }

  /**
   * 🎤 Listen for audio chunk data
   * @param handler - Function to handle audio chunks
   * @returns Cleanup function to remove the handler
   */
  onAudioChunk(handler: Handler<AudioChunk>) {
    return this.addHandler(StreamType.AUDIO_CHUNK, handler);
  }

  // System event handlers

  onConnected(handler: Handler<SystemEvents['connected']>) {
    this.emitter.on('connected', handler);
    return () => this.emitter.off('connected', handler);
  }

  onDisconnected(handler: Handler<SystemEvents['disconnected']>) {
    this.emitter.on('disconnected', handler);
    return () => this.emitter.off('disconnected', handler);
  }

  onError(handler: Handler<SystemEvents['error']>) {
    this.emitter.on('error', handler);
    return () => this.emitter.off('error', handler);
  }

  onSettingsUpdate(handler: Handler<SystemEvents['settings_update']>) {
    this.emitter.on('settings_update', handler);
    return () => this.emitter.off('settings_update', handler);
  }

  /**
   * 🔄 Generic event handler
   * 
   * Use this for stream types without specific handler methods
   */
  on<T extends ExtendedStreamType>(type: T, handler: Handler<EventData<T>>): () => void {
    return this.addHandler(type, handler);
  }

  /**
   * ➕ Add an event handler and subscribe if needed
   */
  private addHandler<T extends ExtendedStreamType>(
    type: T, 
    handler: Handler<EventData<T>>
  ): () => void {
    const handlers = this.handlers.get(type) ?? new Set();
    if (handlers.size === 0) {
      this.handlers.set(type, handlers);
      this.subscribe(type);
    }

    handlers.add(handler as Handler<unknown>);
    return () => this.removeHandler(type, handler);
  }

  /**
   * ➖ Remove an event handler
   */
  private removeHandler<T extends ExtendedStreamType>(
    type: T, 
    handler: Handler<EventData<T>>
  ): void {
    const handlers = this.handlers.get(type);
    if (!handlers) return;

    handlers.delete(handler as Handler<unknown>);
    if (handlers.size === 0) {
      this.handlers.delete(type);
      this.unsubscribe(type);
    }
  }

  /**
   * 📡 Emit an event to all registered handlers
   */
  emit<T extends EventType>(eventType: T, data: EventData<T>): void {
    // Emit to EventEmitter handlers (system events)
    this.emitter.emit(eventType, data);

    // Emit to stream handlers if applicable
    const handlers = this.handlers.get(eventType);

    if (handlers) {
      handlers.forEach(handler => {
        (handler as Handler<EventData<T>>)(data);
      });
    }
  }
}