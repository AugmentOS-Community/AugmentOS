/**
 * 🎯 TPA Session Module
 * 
 * Manages an active Third Party App session with AugmentOS Cloud.
 * Handles real-time communication, event subscriptions, and display management.
 */
import WebSocket from 'ws';
import { EventManager } from './events';
import { LayoutManager } from './layouts';
import { ResourceTracker } from '../../utils/resource-tracker';
import {
  // Message types
  TpaToCloudMessage,
  CloudToTpaMessage,
  TpaConnectionInit,
  TpaSubscriptionUpdate,
  TpaToCloudMessageType,
  CloudToTpaMessageType,

  // Event data types
  StreamType,
  ButtonPress,
  HeadPosition,
  PhoneNotification,
  TranscriptionData,

  // Type guards
  isTpaConnectionAck,
  isTpaConnectionError,
  isDataStream,
  isAppStopped,
  isSettingsUpdate,

  // Other types
  AppSettings,
  AppSetting,
  TpaConfig,
  validateTpaConfig,
  AudioChunk,
  isAudioChunk
} from '../../types';

/**
 * ⚙️ Configuration options for TPA Session
 * 
 * @example
 * ```typescript
 * const config: TpaSessionConfig = {
 *   packageName: 'org.example.myapp',
 *   apiKey: 'your_api_key',
 *   autoReconnect: true
 * };
 * ```
 */
export interface TpaSessionConfig {
  /** 📦 Unique identifier for your TPA (e.g., 'org.company.appname') */
  packageName: string;
  /** 🔑 API key for authentication with AugmentOS Cloud */
  apiKey: string;
  /** 🔌 WebSocket server URL (default: 'ws://localhost:7002/tpa-ws') */
  augmentOSWebsocketUrl?: string;
  /** 🔄 Automatically attempt to reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** 🔁 Maximum number of reconnection attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** ⏱️ Base delay between reconnection attempts in ms (default: 1000) */
  reconnectDelay?: number;
}

/**
 * 🚀 TPA Session Implementation
 * 
 * Manages a live connection between your TPA and AugmentOS Cloud.
 * Provides interfaces for:
 * - 🎮 Event handling (transcription, head position, etc.)
 * - 📱 Display management in AR view
 * - 🔌 Connection lifecycle
 * - 🔄 Automatic reconnection
 * 
 * @example
 * ```typescript
 * const session = new TpaSession({
 *   packageName: 'org.example.myapp',
 *   apiKey: 'your_api_key'
 * });
 * 
 * // Handle events
 * session.onTranscription((data) => {
 *   session.layouts.showTextWall(data.text);
 * });
 * 
 * // Connect to cloud
 * await session.connect('session_123');
 * ```
 */
export class TpaSession {
  /** WebSocket connection to AugmentOS Cloud */
  private ws: WebSocket | null = null;
  /** Current session identifier */
  private sessionId: string | null = null;
  /** Number of reconnection attempts made */
  private reconnectAttempts = 0;
  /** Active event subscriptions */
  private subscriptions = new Set<StreamType>();
  /** Resource tracker for automatic cleanup */
  private resources = new ResourceTracker();
  /** User settings for this TPA */
  private settings: AppSettings = [];
  /** TPA configuration loaded from tpa_config.json */
  private tpaConfig: TpaConfig | null = null;
  /** Whether to update subscriptions when settings change */
  private shouldUpdateSubscriptionsOnSettingsChange = false;
  /** Custom subscription handler for settings-based subscriptions */
  private subscriptionSettingsHandler?: (settings: AppSettings) => StreamType[];
  /** Settings that should trigger subscription updates when changed */
  private subscriptionUpdateTriggers: string[] = [];

  /** 🎮 Event management interface */
  public readonly events: EventManager;
  /** 📱 Layout management interface */
  public readonly layouts: LayoutManager;

  constructor(private config: TpaSessionConfig) {
    // Set defaults and merge with provided config
    this.config = {
      augmentOSWebsocketUrl: `ws://localhost:8002/tpa-ws`, // Use localhost as default
      autoReconnect: false,
      maxReconnectAttempts: 0,
      reconnectDelay: 1000,
      ...config
    };
    
    // Make sure the URL is correctly formatted to prevent double protocol issues
    if (this.config.augmentOSWebsocketUrl) {
      try {
        const url = new URL(this.config.augmentOSWebsocketUrl);
        if (!['ws:', 'wss:'].includes(url.protocol)) {
          // Fix URLs with incorrect protocol (e.g., 'ws://http://host')
          const fixedUrl = this.config.augmentOSWebsocketUrl.replace(/^ws:\/\/http:\/\//, 'ws://');
          this.config.augmentOSWebsocketUrl = fixedUrl;
          console.warn(`⚠️ [${this.config.packageName}] Fixed malformed WebSocket URL: ${fixedUrl}`);
        }
      } catch (error) {
        console.error(`⚠️ [${this.config.packageName}] Invalid WebSocket URL format: ${this.config.augmentOSWebsocketUrl}`);
      }
    }
    
    // Log initialization
    console.log(`🚀 [${this.config.packageName}] TPA Session initialized`);
    console.log(`🚀 [${this.config.packageName}] WebSocket URL: ${this.config.augmentOSWebsocketUrl}`);
    
    // Validate URL format - give early warning for obvious issues
    // Check URL format but handle undefined case
    if (this.config.augmentOSWebsocketUrl) {
      try {
        const url = new URL(this.config.augmentOSWebsocketUrl);
        if (!['ws:', 'wss:'].includes(url.protocol)) {
          console.error(`⚠️ [${this.config.packageName}] Invalid WebSocket URL protocol: ${url.protocol}. Should be ws: or wss:`);
        }
      } catch (error) {
        console.error(`⚠️ [${this.config.packageName}] Invalid WebSocket URL format: ${this.config.augmentOSWebsocketUrl}`);
      }
    }

    this.events = new EventManager(this.subscribe.bind(this));
    this.layouts = new LayoutManager(
      config.packageName,
      this.send.bind(this)
    );
  }

  // =====================================
  // 🎮 Direct Event Handling Interface
  // =====================================

  /**
   * 🎤 Listen for speech transcription events
   * @param handler - Function to handle transcription data
   * @returns Cleanup function to remove the handler
   */
  onTranscription(handler: (data: TranscriptionData) => void): () => void {
    return this.events.onTranscription(handler);
  }

  /**
   * 👤 Listen for head position changes
   * @param handler - Function to handle head position updates
   * @returns Cleanup function to remove the handler
   */
  onHeadPosition(handler: (data: HeadPosition) => void): () => void {
    return this.events.onHeadPosition(handler);
  }

  /**
   * 🔘 Listen for hardware button press events
   * @param handler - Function to handle button events
   * @returns Cleanup function to remove the handler
   */
  onButtonPress(handler: (data: ButtonPress) => void): () => void {
    return this.events.onButtonPress(handler);
  }

  /**
   * 📱 Listen for phone notification events
   * @param handler - Function to handle notifications
   * @returns Cleanup function to remove the handler
   */
  onPhoneNotifications(handler: (data: PhoneNotification) => void): () => void {
    return this.events.onPhoneNotifications(handler);
  }

  // =====================================
  // 📡 Pub/Sub Interface
  // =====================================

  /**
   * 📬 Subscribe to a specific event stream
   * @param type - Type of event to subscribe to
   */
  subscribe(type: StreamType): void {
    this.subscriptions.add(type);
    if (this.ws?.readyState === 1) {
      this.updateSubscriptions();
    }
  }

  /**
   * 🎯 Generic event listener (pub/sub style)
   * @param event - Event name to listen for
   * @param handler - Event handler function
   */
  on<T extends StreamType>(event: T, handler: (data: any) => void): () => void {
    return this.events.on(event, handler);
  }

  // =====================================
  // 🔌 Connection Management
  // =====================================

  /**
   * 🚀 Connect to AugmentOS Cloud
   * @param sessionId - Unique session identifier
   * @returns Promise that resolves when connected
   */
  async connect(sessionId: string): Promise<void> {
    this.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      try {
        // Clear previous resources if reconnecting
        if (this.ws) {
          // Don't call full dispose() as that would clear subscriptions
          if (this.ws.readyState !== 3) { // 3 = CLOSED
            this.ws.close();
          }
          this.ws = null;
        }

        // Validate WebSocket URL before attempting connection
        if (!this.config.augmentOSWebsocketUrl) {
          console.error('WebSocket URL is missing or undefined');
          reject(new Error('WebSocket URL is required'));
          return;
        }

        // Add debug logging for connection attempts
        console.log(`🔌🔌🔌 [${this.config.packageName}] Attempting to connect to: ${this.config.augmentOSWebsocketUrl}`);
        console.log(`🔌🔌🔌 [${this.config.packageName}] Session ID: ${sessionId}`);
        
        // Create connection with error handling
        this.ws = new WebSocket(this.config.augmentOSWebsocketUrl);
        
        // Track WebSocket for automatic cleanup
        this.resources.track(() => {
          if (this.ws && this.ws.readyState !== 3) { // 3 = CLOSED
            this.ws.close();
          }
        });

        this.ws.on('open', () => {
          try {
            this.sendConnectionInit();
          } catch (error: unknown) {
            console.error('Error during connection initialization:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.events.emit('error', new Error(`Connection initialization failed: ${errorMessage}`));
            reject(error);
          }
        });

        // Message handler with comprehensive error recovery
        const messageHandler = async (data: Buffer | string, isBinary: boolean) => {
          try {
            // Handle binary messages (typically audio data)
            if (isBinary && Buffer.isBuffer(data)) {
              try {
                // Validate buffer before processing
                if (data.length === 0) {
                  this.events.emit('error', new Error('Received empty binary data'));
                  return;
                }
                
                // Convert Node.js Buffer to ArrayBuffer safely
                const arrayBuf: ArrayBufferLike = data.buffer.slice(
                  data.byteOffset,
                  data.byteOffset + data.byteLength
                );
                
                // Create AUDIO_CHUNK event message with validation
                const audioChunk: AudioChunk = {
                  type: StreamType.AUDIO_CHUNK,
                  arrayBuffer: arrayBuf,
                  timestamp: new Date() // Ensure timestamp is present
                };

                this.handleMessage(audioChunk);
                return;
              } catch (binaryError: unknown) {
                console.error('Error processing binary message:', binaryError);
                const errorMessage = binaryError instanceof Error ? binaryError.message : String(binaryError);
                this.events.emit('error', new Error(`Failed to process binary message: ${errorMessage}`));
                return;
              }
            }

            // Handle ArrayBuffer data type directly
            if (data instanceof ArrayBuffer) {
              return;
            }

            // Handle JSON messages with validation
            try {
              // Convert string data to JSON safely
              let jsonData: string;
              if (typeof data === 'string') {
                jsonData = data;
              } else if (Buffer.isBuffer(data)) {
                jsonData = data.toString('utf8');
              } else {
                throw new Error('Unknown message format');
              }
              
              // Validate JSON before parsing
              if (!jsonData || jsonData.trim() === '') {
                this.events.emit('error', new Error('Received empty JSON message'));
                return;
              }
              
              // Parse JSON with error handling
              const message = JSON.parse(jsonData) as CloudToTpaMessage;
              
              // Basic schema validation
              if (!message || typeof message !== 'object' || !('type' in message)) {
                this.events.emit('error', new Error('Malformed message: missing type property'));
                return;
              }
              
              // Process the validated message
              this.handleMessage(message);
            } catch (jsonError: unknown) {
              console.error('JSON parsing error:', jsonError);
              const errorMessage = jsonError instanceof Error ? jsonError.message : String(jsonError);
              this.events.emit('error', new Error(`Failed to parse JSON message: ${errorMessage}`));
            }
          } catch (messageError: unknown) {
            // Final catch - should never reach here if individual handlers work correctly
            console.error('Unhandled message processing error:', messageError);
            const errorMessage = messageError instanceof Error ? messageError.message : String(messageError);
            this.events.emit('error', new Error(`Unhandled message error: ${errorMessage}`));
          }
        };
        
        this.ws.on('message', messageHandler);
        
        // Track event handler removal for automatic cleanup
        this.resources.track(() => {
          if (this.ws) {
            this.ws.off('message', messageHandler);
          }
        });

        // Connection closure handler
        const closeHandler = (code: number, reason: string) => {
          const reasonStr = reason ? `: ${reason}` : '';
          this.events.emit('disconnected', `Connection closed (code: ${code})${reasonStr}`);
          this.handleReconnection();
        };
        
        this.ws.on('close', closeHandler);
        
        // Track event handler removal
        this.resources.track(() => {
          if (this.ws) {
            this.ws.off('close', closeHandler);
          }
        });

        // Connection error handler
        const errorHandler = (error: Error) => {
          console.error('WebSocket error:', error);
          this.events.emit('error', error);
        };
        
        // Enhanced error handler with detailed logging
        this.ws.on('error', (error) => {
          console.error(`⛔️⛔️⛔️ [${this.config.packageName}] WebSocket connection error:`, error);
          console.error(`⛔️⛔️⛔️ [${this.config.packageName}] Attempted URL: ${this.config.augmentOSWebsocketUrl}`);
          console.error(`⛔️⛔️⛔️ [${this.config.packageName}] Session ID: ${sessionId}`);
          
          // Try to provide more context
          const errMsg = error.message || '';
          if (errMsg.includes('ECONNREFUSED')) {
            console.error(`⛔️⛔️⛔️ [${this.config.packageName}] Connection refused - Check if the server is running at the specified URL`);
          } else if (errMsg.includes('ETIMEDOUT')) {
            console.error(`⛔️⛔️⛔️ [${this.config.packageName}] Connection timed out - Check network connectivity and firewall rules`);
          }
          
          errorHandler(error);
        });
        
        // Track event handler removal
        this.resources.track(() => {
          if (this.ws) {
            this.ws.off('error', errorHandler);
          }
        });

        // Set up connection success handler
        const connectedCleanup = this.events.onConnected(() => resolve());
        
        // Track event handler removal
        this.resources.track(connectedCleanup);

        // Connection timeout with configurable duration
        const timeoutMs = 5000; // 5 seconds default
        const connectionTimeout = this.resources.setTimeout(() => {
          // Use tracked timeout that will be auto-cleared
          console.error(`⏱️⏱️⏱️ [${this.config.packageName}] Connection timed out after ${timeoutMs}ms`);
          console.error(`⏱️⏱️⏱️ [${this.config.packageName}] Attempted URL: ${this.config.augmentOSWebsocketUrl}`);
          console.error(`⏱️⏱️⏱️ [${this.config.packageName}] Session ID: ${sessionId}`);
          console.error(`⏱️⏱️⏱️ [${this.config.packageName}] Check cloud service is running and TPA server is registered`);
          
          this.events.emit('error', new Error(`Connection timeout after ${timeoutMs}ms`));
          reject(new Error('Connection timeout'));
        }, timeoutMs);

        // Clear timeout on successful connection
        const timeoutCleanup = this.events.onConnected(() => {
          clearTimeout(connectionTimeout);
          resolve();
        });
        
        // Track event handler removal
        this.resources.track(timeoutCleanup);

      } catch (connectionError: unknown) {
        console.error('Connection setup error:', connectionError);
        const errorMessage = connectionError instanceof Error ? connectionError.message : String(connectionError);
        reject(new Error(`Failed to setup connection: ${errorMessage}`));
      }
    });
  }

  /**
   * 👋 Disconnect from AugmentOS Cloud
   */
  disconnect(): void {
    // Use the resource tracker to clean up everything
    this.resources.dispose();
    
    // Clean up additional resources not handled by the tracker
    this.ws = null;
    this.sessionId = null;
    this.subscriptions.clear();
    this.reconnectAttempts = 0;
  }

  /**
   * 🛠️ Get all current user settings
   * @returns A copy of the current settings array
   */
  getSettings(): AppSettings {
    return [...this.settings]; // Return a copy to prevent accidental mutations
  }

  /**
   * 🔍 Get a specific setting value by key
   * @param key The setting key to look for
   * @returns The setting's value, or undefined if not found
   */
  getSetting<T>(key: string): T | undefined {
    const setting = this.settings.find(s => s.key === key);
    return setting ? (setting.value as T) : undefined;
  }

  /**
   * ⚙️ Configure settings-based subscription updates
   * This allows TPAs to automatically update their subscriptions when certain settings change
   * @param options Configuration options for settings-based subscriptions
   */
  setSubscriptionSettings(options: {
    updateOnChange: string[]; // Setting keys that should trigger subscription updates
    handler: (settings: AppSettings) => StreamType[]; // Handler that returns new subscriptions
  }): void {
    this.shouldUpdateSubscriptionsOnSettingsChange = true;
    this.subscriptionUpdateTriggers = options.updateOnChange;
    this.subscriptionSettingsHandler = options.handler;
    
    // If we already have settings, update subscriptions immediately
    if (this.settings.length > 0) {
      this.updateSubscriptionsFromSettings();
    }
  }

  /**
   * 🔄 Update subscriptions based on current settings
   * Called automatically when relevant settings change
   */
  private updateSubscriptionsFromSettings(): void {
    if (!this.subscriptionSettingsHandler) return;
    
    try {
      // Get new subscriptions from handler
      const newSubscriptions = this.subscriptionSettingsHandler(this.settings);
      
      // Update all subscriptions at once
      this.subscriptions.clear();
      newSubscriptions.forEach(subscription => {
        this.subscriptions.add(subscription);
      });
      
      // Send subscription update to cloud if connected
      if (this.ws && this.ws.readyState === 1) {
        this.updateSubscriptions();
      }
    } catch (error: unknown) {
      console.error('Error updating subscriptions from settings:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.events.emit('error', new Error(`Failed to update subscriptions: ${errorMessage}`));
    }
  }

  /**
   * 🧪 For testing: Update settings locally
   * In normal operation, settings come from the cloud
   * @param newSettings The new settings to apply
   */
  updateSettingsForTesting(newSettings: AppSettings): void {
    this.settings = newSettings;
    this.events.emit('settings_update', this.settings);
    
    // Check if we should update subscriptions
    if (this.shouldUpdateSubscriptionsOnSettingsChange) {
      this.updateSubscriptionsFromSettings();
    }
  }
  
  /**
   * 📝 Load configuration from a JSON file
   * @param jsonData JSON string containing TPA configuration
   * @returns The loaded configuration
   * @throws Error if the configuration is invalid
   */
  loadConfigFromJson(jsonData: string): TpaConfig {
    try {
      const parsedConfig = JSON.parse(jsonData);
      
      if (validateTpaConfig(parsedConfig)) {
        this.tpaConfig = parsedConfig;
        return parsedConfig;
      } else {
        throw new Error('Invalid TPA configuration format');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load TPA configuration: ${errorMessage}`);
    }
  }
  
  /**
   * 📋 Get the loaded TPA configuration
   * @returns The current TPA configuration or null if not loaded
   */
  getConfig(): TpaConfig | null {
    return this.tpaConfig;
  }
  
  /**
   * 🔍 Get default settings from the TPA configuration
   * @returns Array of settings with default values
   * @throws Error if configuration is not loaded
   */
  getDefaultSettings(): AppSettings {
    if (!this.tpaConfig) {
      throw new Error('TPA configuration not loaded. Call loadConfigFromJson first.');
    }
    
    return this.tpaConfig.settings
      .filter((s: AppSetting | { type: 'group'; title: string }): s is AppSetting => s.type !== 'group')
      .map((s: AppSetting) => ({
        ...s,
        value: s.defaultValue  // Set value to defaultValue
      }));
  }
  
  /**
   * 🔍 Get setting schema from configuration
   * @param key Setting key to look up
   * @returns The setting schema or undefined if not found
   */
  getSettingSchema(key: string): AppSetting | undefined {
    if (!this.tpaConfig) return undefined;
    
    const setting = this.tpaConfig.settings.find((s: AppSetting | { type: 'group'; title: string }) => 
      s.type !== 'group' && 'key' in s && s.key === key
    );
    
    return setting as AppSetting | undefined;
  }

  // =====================================
  // 🔧 Private Methods
  // =====================================

  /**
   * 📨 Handle incoming messages from cloud
   */
  private handleMessage(message: CloudToTpaMessage): void {
    try {
      // Validate message before processing
      if (!this.validateMessage(message)) {
        this.events.emit('error', new Error('Invalid message format received'));
        return;
      }

      // Handle binary data (audio or video)
      if (message instanceof ArrayBuffer) {
        this.handleBinaryMessage(message);
        return;
      }

      // Using type guards to determine message type and safely handle each case
      try {
        if (isTpaConnectionAck(message)) {
          // Store settings from connection acknowledgment
          this.settings = message.settings || [];
          
          // Store config if provided
          if (message.config && validateTpaConfig(message.config)) {
            this.tpaConfig = message.config;
          }
          
          // Use default settings from config if no settings were provided
          if (this.settings.length === 0 && this.tpaConfig) {
            try {
              this.settings = this.getDefaultSettings();
            } catch (error) {
              console.warn('Failed to load default settings from config:', error);
            }
          }
          
          // Emit connected event with settings
          this.events.emit('connected', this.settings);
          
          // Update subscriptions (normal flow)
          this.updateSubscriptions();
          
          // If settings-based subscriptions are enabled, update those too
          if (this.shouldUpdateSubscriptionsOnSettingsChange && this.settings.length > 0) {
            this.updateSubscriptionsFromSettings();
          }
        }
        else if (isTpaConnectionError(message)) {
          const errorMessage = message.message || 'Unknown connection error';
          this.events.emit('error', new Error(errorMessage));
        }
        else if (message.type === StreamType.AUDIO_CHUNK) {
          if (this.subscriptions.has(StreamType.AUDIO_CHUNK)) {
            // Only process if we're subscribed to avoid unnecessary processing
            this.events.emit(StreamType.AUDIO_CHUNK, message);
          }
        }
        else if (isDataStream(message)) {
          // Ensure streamType exists before emitting the event
          if (message.streamType && this.subscriptions.has(message.streamType)) {
            const sanitizedData = this.sanitizeEventData(message.streamType, message.data);
            this.events.emit(message.streamType, sanitizedData);
          }
        }
        else if (isSettingsUpdate(message)) {
          // Store previous settings to check for changes
          const prevSettings = [...this.settings];
          
          // Update settings
          this.settings = message.settings || [];
          
          // Emit settings update event
          this.events.emit('settings_update', this.settings);
          
          // Check if we should update subscriptions
          if (this.shouldUpdateSubscriptionsOnSettingsChange) {
            // Check if any subscription trigger settings changed
            const shouldUpdateSubs = this.subscriptionUpdateTriggers.some(key => {
              const oldSetting = prevSettings.find(s => s.key === key);
              const newSetting = this.settings.find(s => s.key === key);
              return (!oldSetting && newSetting) || 
                (oldSetting && newSetting && oldSetting.value !== newSetting.value);
            });
            
            if (shouldUpdateSubs) {
              this.updateSubscriptionsFromSettings();
            }
          }
        }
        else if (isAppStopped(message)) {
          const reason = message.reason || 'unknown';
          const displayReason = `App stopped: ${reason}`;
          this.events.emit('disconnected', displayReason);
        }
        // Handle unrecognized message types gracefully
        else {
          this.events.emit('error', new Error(`Unrecognized message type: ${(message as any).type}`));
        }
      } catch (processingError: unknown) {
        // Catch any errors during message processing to prevent TPA crashes
        console.error('Error processing message:', processingError);
        const errorMessage = processingError instanceof Error ? processingError.message : String(processingError);
        this.events.emit('error', new Error(`Error processing message: ${errorMessage}`));
      }
    } catch (error: unknown) {
      // Final safety net to ensure the TPA doesn't crash on any unexpected errors
      console.error('Unexpected error in message handler:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.events.emit('error', new Error(`Unexpected error in message handler: ${errorMessage}`));
    }
  }
  
  /**
   * 🧪 Validate incoming message structure
   * @param message - Message to validate
   * @returns boolean indicating if the message is valid
   */
  private validateMessage(message: CloudToTpaMessage): boolean {
    // Handle ArrayBuffer case separately
    if (message instanceof ArrayBuffer) {
      return true; // ArrayBuffers are always considered valid at this level
    }
    
    // Check if message is null or undefined
    if (!message) {
      return false;
    }
    
    // Check if message has a type property
    if (!('type' in message)) {
      return false;
    }
    
    // All other message types should be objects with a type property
    return true;
  }
  
  /**
   * 📦 Handle binary message data (audio or video)
   * @param buffer - Binary data as ArrayBuffer
   */
  private handleBinaryMessage(buffer: ArrayBuffer): void {
    try {
      // Safety check - only process if we're subscribed to avoid unnecessary work
      if (!this.subscriptions.has(StreamType.AUDIO_CHUNK)) {
        return;
      }
      
      // Validate buffer has content before processing
      if (!buffer || buffer.byteLength === 0) {
        this.events.emit('error', new Error('Received empty binary message'));
        return;
      }

      // Create a safety wrapped audio chunk with proper defaults
      const audioChunk: AudioChunk = {
        type: StreamType.AUDIO_CHUNK,
        timestamp: new Date(),
        arrayBuffer: buffer,
        sampleRate: 16000 // Default sample rate
      };

      // Emit to subscribers
      this.events.emit(StreamType.AUDIO_CHUNK, audioChunk);
    } catch (error: unknown) {
      console.error('Error processing binary message:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.events.emit('error', new Error(`Error processing binary message: ${errorMessage}`));
    }
  }
  
  /**
   * 🧹 Sanitize event data to prevent crashes from malformed data
   * @param streamType - The type of stream data
   * @param data - The potentially unsafe data to sanitize
   * @returns Sanitized data safe for processing
   */
  private sanitizeEventData(streamType: StreamType, data: unknown): any {
    try {
      // If data is null or undefined, return an empty object to prevent crashes
      if (data === null || data === undefined) {
        return {};
      }
      
      // For specific stream types, perform targeted sanitization
      switch (streamType) {
        case StreamType.TRANSCRIPTION:
          // Ensure text field exists and is a string
          if (typeof (data as TranscriptionData).text !== 'string') {
            return { 
              text: '', 
              isFinal: true, 
              startTime: Date.now(), 
              endTime: Date.now() 
            };
          }
          break;
          
        case StreamType.HEAD_POSITION:
          // Ensure position data has required numeric fields
          // Handle HeadPosition - Note the property position instead of x,y,z
          const pos = data as any;
          if (typeof pos?.position !== 'string') {
            return { position: 'up', timestamp: new Date() };
          }
          break;
          
        case StreamType.BUTTON_PRESS:
          // Ensure button type is valid
          const btn = data as any;
          if (!btn.buttonId || !btn.pressType) {
            return { buttonId: 'unknown', pressType: 'short', timestamp: new Date() };
          }
          break;
      }
      
      return data;
    } catch (error: unknown) {
      console.error(`Error sanitizing ${streamType} data:`, error);
      // Return a safe empty object if something goes wrong
      return {};
    }
  }

  /**
   * 🔐 Send connection initialization message
   */
  private sendConnectionInit(): void {
    const message: TpaConnectionInit = {
      type: TpaToCloudMessageType.CONNECTION_INIT,
      sessionId: this.sessionId!,
      packageName: this.config.packageName,
      apiKey: this.config.apiKey,
      timestamp: new Date()
    };
    this.send(message);
  }

  /**
   * 📝 Update subscription list with cloud
   */
  private updateSubscriptions(): void {
    const message: TpaSubscriptionUpdate = {
      type: TpaToCloudMessageType.SUBSCRIPTION_UPDATE,
      packageName: this.config.packageName,
      subscriptions: Array.from(this.subscriptions),
      sessionId: this.sessionId!,
      timestamp: new Date()
    };
    this.send(message);
  }

  /**
   * 🔄 Handle reconnection with exponential backoff
   */
  private async handleReconnection(): Promise<void> {
    if (!this.config.autoReconnect ||
      !this.sessionId ||
      this.reconnectAttempts >= (this.config.maxReconnectAttempts || 5)) {
      return;
    }

    const delay = (this.config.reconnectDelay || 1000) * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    // Use the resource tracker for the timeout
    await new Promise<void>(resolve => {
      this.resources.setTimeout(() => resolve(), delay);
    });

    try {
      await this.connect(this.sessionId);
      this.reconnectAttempts = 0;
    } catch (error) {
      this.events.emit('error', new Error('Reconnection failed'));
    }
  }

  /**
   * 📤 Send message to cloud with validation and error handling
   * @throws {Error} If WebSocket is not connected
   */
  private send(message: TpaToCloudMessage): void {
    try {
      // Verify WebSocket connection is valid
      if (!this.ws) {
        throw new Error('WebSocket connection not established');
      }
      
      if (this.ws.readyState !== 1) {
        const stateMap: Record<number, string> = {
          0: 'CONNECTING',
          1: 'OPEN',
          2: 'CLOSING',
          3: 'CLOSED'
        };
        const stateName = stateMap[this.ws.readyState] || 'UNKNOWN';
        throw new Error(`WebSocket not connected (current state: ${stateName})`);
      }
      
      // Validate message before sending
      if (!message || typeof message !== 'object') {
        throw new Error('Invalid message: must be an object');
      }
      
      if (!('type' in message)) {
        throw new Error('Invalid message: missing "type" property');
      }
      
      // Ensure message format is consistent
      if (!('timestamp' in message) || !(message.timestamp instanceof Date)) {
        message.timestamp = new Date();
      }
      
      // Try to send with error handling
      try {
        const serializedMessage = JSON.stringify(message);
        this.ws.send(serializedMessage);
      } catch (sendError: unknown) {
        const errorMessage = sendError instanceof Error ? sendError.message : String(sendError);
        throw new Error(`Failed to send message: ${errorMessage}`);
      }
    } catch (error: unknown) {
      // Log the error and emit an event so TPA developers are aware
      console.error('Message send error:', error);
      
      // Ensure we always emit an Error object
      if (error instanceof Error) {
        this.events.emit('error', error);
      } else {
        this.events.emit('error', new Error(String(error)));
      }
      
      // Re-throw to maintain the original function behavior
      throw error;
    }
  }
}