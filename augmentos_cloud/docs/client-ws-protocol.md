

# AugmentOS Cloud Protocol Documentation

## System Architecture Overview

AugmentOS Cloud is a WebSocket-based protocol for AR glasses systems. It handles:
- Real-time audio streaming and transcription
- Third Party App (TPA) integrations
- Display management
- Hardware events (buttons, head position)
- Phone notifications

The system consists of three main components:
1. Glasses Client (your AR device)
2. AugmentOS Cloud (this server)
3. Third Party Apps (TPAs)

### Core Services
- **Session Management**: Handles user sessions and state
- **Transcription**: Real-time audio processing
- **Display**: Manages what users see in their AR view
- **TPAs**: Third-party app lifecycle and communication

## WebSocket Protocol

### Endpoints
- Glasses Client: `ws://localhost:7002/glasses-ws`
- TPAs: `ws://localhost:7002/tpa-ws`

### Message Types and Examples

#### 1. Connection Initialization

```typescript
// Types
interface GlassesConnectionInitMessage {
  type: "connection_init";
  userId?: string;
  timestamp?: Date;
}

interface CloudConnectionAckMessage {
  type: "connection_ack";
  sessionId: string;
  timestamp?: Date;
}

// Example Implementation
class GlassesClient {
  private ws: WebSocket;
  private sessionId: string | null = null;

  async connect() {
    this.ws = new WebSocket('ws://localhost:7002/glasses-ws');
    
    this.ws.onopen = () => {
      // Send connection init message
      const initMessage: GlassesConnectionInitMessage = {
        type: 'connection_init',
        userId: 'user123', // Optional
      };
      this.ws.send(JSON.stringify(initMessage));
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'connection_ack') {
        this.sessionId = message.sessionId;
        console.log('Connected with session:', this.sessionId);
        this.startAudioStream(); // Start streaming audio after connection
      }
    };
  }
}
```

#### 2. Audio Streaming

```typescript
/**
 * After connection is established, stream raw audio data
 * Format: 16kHz 16-bit PCM
 */
class AudioStreamer {
  private audioContext: AudioContext;
  private ws: WebSocket;

  async startAudioStream() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new AudioContext();
    
    // Setup audio processing
    const source = this.audioContext.createMediaStreamSource(stream);
    const processor = this.audioContext.createScriptProcessor(1024, 1, 1);

    processor.onaudioprocess = (e) => {
      // Get raw audio data
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Convert to 16-bit PCM
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
      }
      
      // Send as binary message
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(pcmData.buffer);
      }
    };

    source.connect(processor);
    processor.connect(this.audioContext.destination);
  }
}
```

#### 3. Hardware Events

```typescript
// Types
interface ButtonPressEvent {
  type: 'button_press';
  buttonId: string;
  pressType: 'short' | 'long';
  timestamp: Date;
}

interface HeadPositionEvent {
  type: 'head_position';
  position: 'up' | 'down';
  timestamp: Date;
}

interface BatteryUpdateEvent {
  type: 'battery_update';
  level: number;  // 0-100
  charging: boolean;
  timeRemaining?: number;  // minutes
  timestamp: Date;
}

// Example Implementation
class HardwareEvents {
  private ws: WebSocket;

  sendButtonPress(buttonId: string, pressType: 'short' | 'long') {
    const event: ButtonPressEvent = {
      type: 'button_press',
      buttonId,
      pressType,
      timestamp: new Date()
    };
    this.ws.send(JSON.stringify(event));
  }

  sendHeadPosition(position: 'up' | 'down') {
    const event: HeadPositionEvent = {
      type: 'head_position',
      position,
      timestamp: new Date()
    };
    this.ws.send(JSON.stringify(event));
  }

  sendBatteryUpdate(level: number, charging: boolean, timeRemaining?: number) {
    const event: BatteryUpdateEvent = {
      type: 'battery_update',
      level,
      charging,
      timeRemaining,
      timestamp: new Date()
    };
    this.ws.send(JSON.stringify(event));
  }
}
```

#### 4. App Lifecycle

```typescript
// Types
interface GlassesStartAppMessage {
  type: "start_app";
  packageName: string;
  timestamp?: Date;
}

interface GlassesStopAppMessage {
  type: "stop_app";
  packageName: string;
  timestamp?: Date;
}

// Example Implementation
class AppManager {
  private ws: WebSocket;

  startApp(packageName: string) {
    const message: GlassesStartAppMessage = {
      type: 'start_app',
      packageName,
      timestamp: new Date()
    };
    this.ws.send(JSON.stringify(message));
  }

  stopApp(packageName: string) {
    const message: GlassesStopAppMessage = {
      type: 'stop_app',
      packageName,
      timestamp: new Date()
    };
    this.ws.send(JSON.stringify(message));
  }
}
```

#### 5. Phone Notifications

```typescript
// Types
interface PhoneNotificationEvent {
  type: 'phone_notification';
  notificationId: string;
  app: string;
  title: string;
  content: string;
  priority: 'low' | 'normal' | 'high';
  timestamp: Date;
}

// Example Implementation
class NotificationManager {
  private ws: WebSocket;

  sendNotification(notification: Omit<PhoneNotificationEvent, 'type' | 'timestamp'>) {
    const event: PhoneNotificationEvent = {
      type: 'phone_notification',
      ...notification,
      timestamp: new Date()
    };
    this.ws.send(JSON.stringify(event));
  }
}
```

### Complete Client Implementation

Here's a complete client implementation that handles all features:

```typescript
/**
 * Complete AugmentOS client implementation
 */
export class AugmentOSClient {
  private ws: WebSocket;
  private sessionId: string | null = null;
  private audioContext: AudioContext | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second

  constructor(private serverUrl: string) {}

  /**
   * Initializes the connection to AugmentOS Cloud
   */
  async connect() {
    try {
      this.ws = new WebSocket(this.serverUrl);
      this.setupWebSocketHandlers();
      await this.waitForConnection();
      this.reconnectAttempts = 0; // Reset on successful connection
    } catch (error) {
      console.error('Connection failed:', error);
      await this.handleReconnection();
    }
  }

  /**
   * Sets up WebSocket event handlers
   */
  private setupWebSocketHandlers() {
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.sendConnectionInit();
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleServerMessage(message);
    };

    this.ws.onclose = async () => {
      console.log('WebSocket closed');
      await this.handleReconnection();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  /**
   * Handles reconnection with exponential backoff
   */
  private async handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    console.log(`Reconnecting in ${delay}ms...`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    this.reconnectAttempts++;
    
    await this.connect();
  }

  /**
   * Sends connection initialization message
   */
  private sendConnectionInit() {
    const initMessage: GlassesConnectionInitMessage = {
      type: 'connection_init',
      userId: 'user123', // Replace with actual user ID
      timestamp: new Date()
    };
    this.send(initMessage);
  }

  /**
   * Handles incoming server messages
   */
  private handleServerMessage(message: any) {
    switch (message.type) {
      case 'connection_ack':
        this.sessionId = message.sessionId;
        this.startAudioStream();
        break;

      case 'connection_error':
        console.error('Connection error:', message.message);
        break;

      case 'display_event':
        // Handle display updates
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  /**
   * Starts audio streaming after connection is established
   */
  private async startAudioStream() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext();
      
      const source = this.audioContext.createMediaStreamSource(stream);
      const processor = this.audioContext.createScriptProcessor(1024, 1, 1);

      processor.onaudioprocess = (e) => {
        if (!this.sessionId) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(pcmData.buffer);
        }
      };

      source.connect(processor);
      processor.connect(this.audioContext.destination);
    } catch (error) {
      console.error('Failed to start audio stream:', error);
    }
  }

  /**
   * Sends a hardware event
   */
  sendHardwareEvent(event: ButtonPressEvent | HeadPositionEvent | BatteryUpdateEvent) {
    this.send(event);
  }

  /**
   * Starts a TPA
   */
  startApp(packageName: string) {
    const message: GlassesStartAppMessage = {
      type: 'start_app',
      packageName,
      timestamp: new Date()
    };
    this.send(message);
  }

  /**
   * Stops a TPA
   */
  stopApp(packageName: string) {
    const message: GlassesStopAppMessage = {
      type: 'stop_app',
      packageName,
      timestamp: new Date()
    };
    this.send(message);
  }

  /**
   * Sends a phone notification
   */
  sendNotification(notification: Omit<PhoneNotificationEvent, 'type' | 'timestamp'>) {
    const message: PhoneNotificationEvent = {
      type: 'phone_notification',
      ...notification,
      timestamp: new Date()
    };
    this.send(message);
  }

  /**
   * Helper method to send messages
   */
  private send(message: any) {
    if (this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not open, message not sent');
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Waits for WebSocket connection
   */
  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const maxWait = 5000; // 5 seconds
      const interval = 100; // Check every 100ms
      let elapsed = 0;

      const check = setInterval(() => {
        if (this.ws.readyState === WebSocket.OPEN) {
          clearInterval(check);
          resolve();
        } else if (elapsed >= maxWait) {
          clearInterval(check);
          reject(new Error('Connection timeout'));
        }
        elapsed += interval;
      }, interval);
    });
  }

  /**
   * Closes the connection
   */
  disconnect() {
    if (this.audioContext) {
      this.audioContext.close();
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Usage example:
const client = new AugmentOSClient('ws://localhost:7002/glasses-ws');
await client.connect();
```

## Error Handling

The system uses standard WebSocket close codes:
- 1000: Normal closure
- 1001: Going away
- 1002: Protocol error
- 1003: Unsupported data
- 1008: Policy violation
- 1011: Internal error

Custom error messages are sent via the CloudConnectionErrorMessage type.

## Best Practices

1. **Connection Management**
   - Implement exponential backoff for reconnection
   - Handle connection errors gracefully
   - Maintain heartbeat/ping

2. **Audio Streaming**
   - Buffer audio before connection is fully established
   - Ensure correct audio format (16kHz, 16-bit PCM)
   - Monitor audio stream health

3. **Event Handling**
   - Include timestamps with all events
   - Validate message formats before sending
   - Handle all message types appropriately

4. **Error Handling**
   - Log all errors appropriately
   - Implement proper error recovery
   - Maintain user experience during errors

## Security Considerations

1. Use secure WebSocket connections (wss://) in production
2. Implement proper authentication
3. Validate all message data
4. Handle sensitive data appropriately

## Rate Limits

- Audio streaming: 16kHz continuous
- Other events: No specific rate limits currently
- TPAs: Subject to subscription limits
