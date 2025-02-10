# AugmentOS TPA Integration Guide

## Overview

Third Party Applications (TPAs) in AugmentOS can:
1. Receive real-time transcriptions
2. Send display updates to user glasses
3. Subscribe to hardware events (buttons, head movement)
4. Handle phone notifications
5. Receive translations

## Integration Flow

1. TPA receives webhook when user starts app
2. TPA connects to WebSocket server
3. TPA subscribes to desired data streams
4. TPA receives events and can send display updates

## Implementation Guide

### 1. Webhook Handler

```typescript
/**
 * Express/Node.js example of webhook handler
 */
interface WebhookPayload {
  type: 'session_request';
  sessionId: string;
  userId: string;
  timestamp: string;
}

app.post('/webhook', async (req, res) => {
  const payload = req.body as WebhookPayload;
  
  // Start WebSocket connection for this session
  connectToWebSocket(payload.sessionId);
  
  res.status(200).send('OK');
});
```

### 2. WebSocket Connection

```typescript
/**
 * TPA WebSocket client implementation
 */
export class AugmentOSTpaClient {
  private ws: WebSocket;
  private sessionId: string;
  private appId: string;
  private apiKey: string;

  constructor(config: {
    appId: string;
    apiKey: string;
    sessionId: string;
    serverUrl: string;
  }) {
    this.appId = config.appId;
    this.apiKey = config.apiKey;
    this.sessionId = config.sessionId;
    this.ws = new WebSocket(config.serverUrl);
    this.setupHandlers();
  }

  private setupHandlers() {
    this.ws.onopen = () => {
      this.sendConnectionInit();
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleServerMessage(message);
    };

    this.ws.onclose = () => {
      console.log('Connection closed');
      // Implement reconnection logic if needed
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  private sendConnectionInit() {
    const initMessage: TpaConnectionInitMessage = {
      type: 'tpa_connection_init',
      appId: this.appId,
      sessionId: this.sessionId,
      apiKey: this.apiKey,
      timestamp: new Date()
    };
    this.send(initMessage);
  }

  /**
   * Subscribe to specific data streams
   */
  subscribe(subscriptions: Subscription[]) {
    const message: TpaSubscriptionUpdateMessage = {
      type: 'subscription_update',
      subscriptions,
      timestamp: new Date()
    };
    this.send(message);
  }

  /**
   * Send a display update to user's glasses
   */
  updateDisplay(layout: Layout, durationMs?: number) {
    const message: TpaDisplayEventMessage = {
      type: 'display_event',
      appId: this.appId,
      layout,
      durationMs,
      timestamp: new Date()
    };
    this.send(message);
  }

  private handleServerMessage(message: CloudToTpaMessage) {
    switch (message.type) {
      case 'tpa_connection_ack':
        console.log('Connected successfully');
        break;

      case 'data_stream':
        this.handleDataStream(message);
        break;

      case 'tpa_connection_error':
        console.error('Connection error:', message.message);
        break;

      case 'settings_update':
        console.log('Settings updated:', message.settings);
        break;
    }
  }

  private handleDataStream(message: CloudDataStreamMessage) {
    switch (message.streamType) {
      case 'transcription':
        this.handleTranscription(message.data);
        break;

      case 'button_press':
        this.handleButtonPress(message.data);
        break;

      case 'head_position':
        this.handleHeadPosition(message.data);
        break;

      case 'phone_notifications':
        this.handleNotification(message.data);
        break;
    }
  }

  private send(message: any) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}
```

### 3. Display Layouts

```typescript
/**
 * Available layout types for sending to glasses
 */
interface TextWall {
  layoutType: 'text_wall';
  text: string;
}

interface TextRows {
  layoutType: 'text_rows';
  text: string[];
}

interface TextLine {
  layoutType: 'text_line';
  text: string;
}

interface ReferenceCard {
  layoutType: 'reference_card';
  title: string;
  text: string;
}

type Layout = TextWall | TextRows | TextLine | ReferenceCard;

// Example usage:
client.updateDisplay({
  layoutType: 'text_wall',
  text: 'Hello from TPA!'
}, 3000);  // Show for 3 seconds
```

### 4. Subscription Types

```typescript
type Subscription = 
  | 'button_press' 
  | 'phone_notifications' 
  | 'open_dashboard' 
  | 'audio_chunk' 
  | 'video' 
  | 'transcription' 
  | 'translation' 
  | 'all' 
  | '*';

// Example usage:
client.subscribe(['transcription', 'button_press']);
```

### 5. Complete TPA Example

```typescript
/**
 * Example TPA implementation
 */
class ExampleTPA {
  private client: AugmentOSTpaClient;

  constructor() {
    // Setup express server for webhook
    const app = express();
    app.post('/webhook', this.handleWebhook.bind(this));
    app.listen(7010);
  }

  private async handleWebhook(req: Request, res: Response) {
    const payload = req.body as WebhookPayload;
    
    // Initialize client
    this.client = new AugmentOSTpaClient({
      appId: 'org.example.tpa',
      apiKey: process.env.API_KEY,
      sessionId: payload.sessionId,
      serverUrl: 'ws://localhost:7002/tpa-ws'
    });

    // Subscribe to desired events
    this.client.subscribe(['transcription', 'button_press']);

    // Send welcome message
    this.client.updateDisplay({
      layoutType: 'reference_card',
      title: 'Welcome!',
      text: 'TPA initialized successfully'
    }, 3000);

    res.status(200).send('OK');
  }

  /**
   * Example transcription handler
   */
  private handleTranscription(data: TranscriptionResult) {
    if (data.isFinal) {
      // Update display with final transcription
      this.client.updateDisplay({
        layoutType: 'text_wall',
        text: data.text
      });
    }
  }

  /**
   * Example button press handler
   */
  private handleButtonPress(data: ButtonPressEvent) {
    if (data.pressType === 'long') {
      this.client.updateDisplay({
        layoutType: 'text_line',
        text: 'Long press detected!'
      });
    }
  }
}
```

## Best Practices

1. **Connection Management**
   - Handle reconnection with exponential backoff
   - Validate all messages before sending
   - Keep track of subscription state

2. **Display Updates**
   - Keep updates concise and readable
   - Use appropriate layouts for content
   - Set reasonable display durations

3. **Data Handling**
   - Process transcriptions efficiently
   - Handle interim and final results appropriately
   - Respect user privacy

4. **Error Handling**
   - Implement proper error recovery
   - Log errors appropriately
   - Maintain good user experience

## Tips

1. **Transcription Handling**
   - Interim results come frequently - don't update display for every one
   - Final results are good for display updates
   - Consider batching/debouncing updates

2. **Display Updates**
   - Don't flood the user with updates
   - Use appropriate durations
   - Consider user context

3. **Button Events**
   - Handle both short and long presses
   - Don't require complex button combinations
   - Provide clear feedback

4. **Performance**
   - Process data efficiently
   - Minimize display updates
   - Clean up resources when not needed

## Testing

1. Use the mock client at `ws://localhost:7002/glasses-ws`
2. Test all subscription types
3. Verify display updates
4. Test error conditions

## Common Issues

1. **WebSocket Disconnects**
   - Implement reconnection logic
   - Maintain subscription state
   - Handle graceful degradation

2. **Message Ordering**
   - Handle out-of-order messages
   - Track message timestamps
   - Implement proper queuing if needed

3. **Rate Limits**
   - Don't flood with display updates
   - Implement proper throttling
   - Handle backpressure

## Security

1. Keep API keys secure
2. Validate all incoming data
3. Handle sensitive information appropriately
4. Use secure WebSocket connections in production

## Support

For questions or issues:
1. Check documentation
2. Review error logs
3. Contact support team
