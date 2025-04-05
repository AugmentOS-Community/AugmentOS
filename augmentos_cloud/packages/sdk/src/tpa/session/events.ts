/**
 * 🎮 Event Manager Module
 */
import EventEmitter from 'events';
import { 
  StreamType,
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
type EventType = StreamType | keyof SystemEvents;

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
type EventData<T extends EventType> = T extends keyof StreamDataTypes 
  ? StreamDataTypes[T] 
  : T extends keyof SystemEvents 
    ? SystemEvents[T] 
    : never;

export class EventManager {
  private emitter: EventEmitter;
  private handlers: Map<EventType, Set<Handler<unknown>>>;

  constructor(private subscribe: (type: StreamType) => void) {
    this.emitter = new EventEmitter();
    this.handlers = new Map();
  }

  // Convenience handlers for common event types

  onTranscription(handler: Handler<TranscriptionData>) {
    return this.addHandler(StreamType.TRANSCRIPTION, handler);
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
   * 🔄 Listen for changes to a specific setting
   * @param key - Setting key to monitor
   * @param handler - Function to handle setting value changes
   * @returns Cleanup function to remove the handler
   */
  onSettingChange<T>(key: string, handler: (value: T, previousValue: T | undefined) => void): () => void {
    let previousValue: T | undefined = undefined;
    
    const settingsHandler = (settings: AppSettings) => {
      try {
        const setting = settings.find(s => s.key === key);
        if (setting) {
          // Only call handler if value has changed
          if (setting.value !== previousValue) {
            const newValue = setting.value as T;
            handler(newValue, previousValue);
            previousValue = newValue;
          }
        }
      } catch (error: unknown) {
        console.error(`Error in onSettingChange handler for key "${key}":`, error);
      }
    };
    
    this.emitter.on('settings_update', settingsHandler);
    this.emitter.on('connected', settingsHandler); // Also check when first connected
    
    return () => {
      this.emitter.off('settings_update', settingsHandler);
      this.emitter.off('connected', settingsHandler);
    };
  }

  /**
   * 🔄 Generic event handler
   * 
   * Use this for stream types without specific handler methods
   */
  on<T extends StreamType>(type: T, handler: Handler<StreamDataTypes[T]>): () => void {
    return this.addHandler(type, handler);
  }

  /**
   * ➕ Add an event handler and subscribe if needed
   */
  private addHandler<T extends StreamType>(
    type: T, 
    handler: Handler<StreamDataTypes[T]>
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
  private removeHandler<T extends StreamType>(
    type: T, 
    handler: Handler<StreamDataTypes[T]>
  ): void {
    const handlers = this.handlers.get(type);
    if (!handlers) return;

    handlers.delete(handler as Handler<unknown>);
    if (handlers.size === 0) {
      this.handlers.delete(type);
    }
  }

  /**
   * 📡 Emit an event to all registered handlers with error isolation
   */
  emit<T extends EventType>(event: T, data: EventData<T>): void {
    try {
      // Emit to EventEmitter handlers (system events)
      this.emitter.emit(event, data);

      // Emit to stream handlers if applicable
      const handlers = this.handlers.get(event);
      if (handlers) {
        // Create array of handlers to prevent modification during iteration
        const handlersArray = Array.from(handlers);
        
        // Execute each handler in isolated try/catch to prevent one handler
        // from crashing the entire TPA
        handlersArray.forEach(handler => {
          try {
            (handler as Handler<EventData<T>>)(data);
          } catch (handlerError: unknown) {
            // Log the error but don't let it propagate
            console.error(`Error in handler for event '${String(event)}':`, handlerError);
            
            // Emit an error event for tracking purposes
            if (event !== 'error') { // Prevent infinite recursion
              const errorMessage = handlerError instanceof Error 
                ? handlerError.message 
                : String(handlerError);
              
              this.emitter.emit('error', new Error(
                `Handler error for event '${String(event)}': ${errorMessage}`
              ));
            }
          }
        });
      }
    } catch (emitError: unknown) {
      // Catch any errors in the emission process itself
      console.error(`Fatal error emitting event '${String(event)}':`, emitError);
      
      // Try to emit an error event if we're not already handling an error
      if (event !== 'error') {
        try {
          const errorMessage = emitError instanceof Error 
            ? emitError.message 
            : String(emitError);
            
          this.emitter.emit('error', new Error(
            `Event emission error for '${String(event)}': ${errorMessage}`
          ));
        } catch (nestedError) {
          // If even this fails, just log it - nothing more we can do
          console.error('Failed to emit error event:', nestedError);
        }
      }
    }
  }
}