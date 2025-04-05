# AugmentOS Cloud Events

*Last updated: March 31, 2025*

AugmentOS Cloud uses an event-driven architecture to communicate real-time data from the smartglasses to your AugmentOS app. Your app can *subscribe* to specific events and receive data as it becomes available. This document describes how to subscribe to events, the available event types, and the data structure for each event.

## Subscribing to Events

The `TpaSession` class in the `@augmentos/sdk` provides several ways to subscribe to events.  You'll typically do this within the `onSession` method of your `TpaServer`:

```typescript
protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
  // ... your session setup ...

  // Subscribe to transcription events
  const unsubscribe = session.events.onTranscription((data) => {
    // Handle transcription data
    console.log(data.text);
  });

  // ... other event subscriptions ...

  // **Important:** Unsubscribe when the session ends.
  this.addCleanupHandler(unsubscribe);
}
```

The `session.events` object provides a consistent interface for all event subscriptions.  All subscription methods return an `unsubscribe` function, which you *must* call when you no longer need the subscription (typically when the session ends).

### Subscription Methods

You can subscribe to events using these methods:

1.  **Direct Methods (Recommended):**  The `events` object provides convenience methods for the most common event types. These methods are type-safe and provide the best developer experience.

    ```typescript
    session.events.onTranscription((data: TranscriptionData) => { ... });
    session.events.onHeadPosition((data: HeadPosition) => { ... });
    session.events.onButtonPress((data: ButtonPress) => { ... });
    // ... other direct methods ...
    ```

2.  **Generic `on` Method:** Use this for events that don't have a dedicated method, or for custom event types:

    ```typescript
    import { StreamType, ButtonPress } from '@augmentos/sdk';

    session.events.on<ButtonPress>(StreamType.BUTTON_PRESS, (data) => {
      // Handle button press data
      console.log(data.buttonId);
    });
    ```

3. **Subscribe method:** Use this to manually signal to the backend which streams your app wants to subscripbe to.
    ```typescript
    session.subscribe(StreamType.TRANSCRIPTION);
    ```

    The first two approaches automatically manage subscriptions for you, however for some use cases you may want to manually set the stream subscriptions.

### Unsubscribing from Events

Always unsubscribe from events when they are no longer needed to prevent memory leaks and unexpected behavior:

```typescript
const unsubscribe = session.events.onTranscription((data) => {
  // ... handle transcription ...
});

// Later, when you no longer need the subscription:
unsubscribe();
```

A good practice is to store the unsubscribe functions and call them in a cleanup handler:

```typescript
const cleanupHandlers: (() => void)[] = [];

// ... within your onSession method ...
cleanupHandlers.push(session.events.onTranscription((data) => { ... }));
cleanupHandlers.push(session.events.onHeadPosition((data) => { ... }));

// ...

// Add a cleanup handler to your TpaServer
cleanupHandlers.forEach(handler => this.addCleanupHandler(handler));
```

## Available Events

The following table lists the available event types, their descriptions, and the corresponding data types.  The `StreamType` enum in `@augmentos/sdk` provides the canonical names for these events.

| Event Type                     | `StreamType` Constant              | Description                                                                          | Data Type                        |
| :----------------------------- | :---------------------------------- | :----------------------------------------------------------------------------------- | :-------------------------------- |
| Transcription                  | `StreamType.TRANSCRIPTION`          | Real-time speech-to-text transcription.                                         | `TranscriptionData`              |
| Translation                    | `StreamType.TRANSLATION`            | Real-time translation of transcribed text.                                     | `TranslationData`              |
| Head Position                  | `StreamType.HEAD_POSITION`          | User's head position ('up' or 'down').                                           | `HeadPosition`                   |
| Button Press                   | `StreamType.BUTTON_PRESS`           | Hardware button press on the glasses.                                          | `ButtonPress`                    |
| Phone Notification             | `StreamType.PHONE_NOTIFICATION`     | Notification received from the user's connected phone.                           | `PhoneNotification`              |
| Glasses Battery Update         | `StreamType.GLASSES_BATTERY_UPDATE` | Battery level update from the glasses.                                        | `GlassesBatteryUpdate`           |
| Phone Battery Update           | `StreamType.PHONE_BATTERY_UPDATE`   | Battery level update from the phone.                                           | `PhoneBatteryUpdate`             |
| Glasses Connection State       | `StreamType.GLASSES_CONNECTION_STATE` | Connection status of the glasses.                                             | `GlassesConnectionState`         |
| Location Update                | `StreamType.LOCATION_UPDATE`        | User's GPS location.                                                             | `LocationUpdate`                 |
| Voice Activity Detection (VAD) | `StreamType.VAD`                    | Indicates whether voice activity is detected.                                  | `Vad`                            |
| Notification Dismissed         | `StreamType.NOTIFICATION_DISMISSED` | User dismissed a notification.                                                    | `NotificationDismissed`          |
| Audio Chunk                    | `StreamType.AUDIO_CHUNK`            | Raw audio data (for advanced use cases).                                      | `ArrayBuffer`                   |
| Video                         |  `StreamType.VIDEO`               | Raw video data.                                             | `ArrayBuffer`       |
| Start App                      | `StreamType.START_APP`              | User requested to start your app (you don't usually need to handle this directly). | `undefined` |
| Stop App                       | `StreamType.STOP_APP`               | User requested to stop your app (you don't usually need to handle this directly).  | `undefined` |
| Open Dashboard                 | `StreamType.OPEN_DASHBOARD`             | User requested to open the dashboard (you don't usually need to handle this directly).              | `undefined` |
| All                    | `StreamType.ALL`           | All available streams for the user.                        | `any`     |
| Wildcard               | `StreamType.WILDCARD`     |   Wildcard for all available streams for the user.                   | `any`      |

**System Events:**

These events are not tied to specific data streams and are handled using `session.events.on<EventName>()`:

| Event Name       | Description                                            | Data Type       |
| :--------------- | :----------------------------------------------------- | :-------------- |
| `connected`      | Emitted when the WebSocket connection is established.   | `AppSettings` (or undefined) |
| `disconnected`   | Emitted when the WebSocket connection is closed.       | `string` (reason) |
| `error`          | Emitted when an error occurs.                          | `Error`         |
| `settings_update`| Emitted when the user updates the app's settings       | `AppSettings`                    |

## Event Data Types

The following TypeScript interfaces define the structure of the data you'll receive with each event.

```typescript
// In packages/sdk/types/src/messages/glasses-to-cloud.ts
interface TranscriptionData {
  type: StreamType.TRANSCRIPTION;
  text: string;
  isFinal: boolean;
  transcribeLanguage?: string;
  startTime: number;
  endTime: number;
  speakerId?: string;
  duration?: number;
}
```

```typescript
// In packages/sdk/types/src/messages/cloud-to-tpa.ts
interface TranslationData {
  type: StreamType.TRANSLATION;
  text: string;
  isFinal: boolean;
  startTime: number;
  endTime: number;
  speakerId?: string;
  duration?: number;
  transcribeLanguage?: string;
  translateLanguage?: string;
}
```

```typescript
// In packages/sdk/types/src/messages/glasses-to-cloud.ts
interface HeadPosition {
    type: GlassesToCloudMessageType.HEAD_POSITION;
    sessionId: string;
    position: 'up' | 'down';
    timestamp: string;
}
```

```typescript
// In packages/sdk/types/src/messages/glasses-to-cloud.ts
interface ButtonPress {
  type: GlassesToCloudMessageType.BUTTON_PRESS;
  sessionId: string;
  buttonId: string; // This could be an enum in a future version
  pressType: 'short' | 'long';
  timestamp: string;
}
```

```typescript
// In packages/sdk/types/src/messages/glasses-to-cloud.ts
interface PhoneNotification {
    type: StreamType.PHONE_NOTIFICATION;
    sessionId: string;
    app: string;        // e.g., 'com.android.email'
    title: string;
    content: string;    // Notification body
    timestamp: Date;    // When the notification was received
    priority: 'low' | 'normal' | 'high';
}
```

```typescript
// In packages/sdk/types/src/messages/glasses-to-cloud.ts
interface GlassesBatteryUpdate {
  type: GlassesToCloudMessageType.GLASSES_BATTERY_UPDATE;
  sessionId: string;
  level: number; // 0-100
  charging: boolean;
  timeRemaining?: number;
  timestamp: string;
}
```

```typescript
// In packages/sdk/types/src/messages/glasses-to-cloud.ts
interface PhoneBatteryUpdate {
  type: GlassesToCloudMessageType.PHONE_BATTERY_UPDATE;
  sessionId: string;
  level: number; // 0-100
  charging: boolean;
  timeRemaining?: number;
  timestamp: string;
}
```

```typescript
// In packages/sdk/types/src/messages/glasses-to-cloud.ts
interface GlassesConnectionState {
  type: GlassesToCloudMessageType.GLASSES_CONNECTION_STATE;
  sessionId: string;
  modelName: string;
  status: 'BLUETOOTH_CONNECTING' | 'BLUETOOTH_CONNECTED' |
          'BLUETOOTH_DISCONNECTED' | 'WIFI_CONNECTING' |
          'WIFI_CONNECTED' | 'WIFI_DISCONNECTED' | 'CONNECTED' |
          'DISCONNECTED' | 'RECONNECTING' | 'UNKNOWN';
  batterySaver: boolean;
  doNotDisturb: boolean;
  timestamp: string;
}
```

```typescript
// In packages/sdk/types/src/messages/glasses-to-cloud.ts
interface LocationUpdate {
  type: StreamType.LOCATION_UPDATE;
  sessionId: string;
  lat: number;
  lng: number;
  timestamp: Date;
}
```

```typescript
// In packages/sdk/types/src/messages/glasses-to-cloud.ts
interface Vad {
  type: StreamType.VAD;
  sessionId: string;
  status: boolean | "true" | "false";
  timestamp: Date;
}
```

```typescript
// In packages/sdk/types/src/messages/glasses-to-cloud.ts
interface NotificationDismissed {
  type: StreamType.NOTIFICATION_DISMISSED;
  sessionId: string;
  notificationId: string; // Or whatever ID is used
  timestamp: Date;
}
```

```typescript
// In packages/sdk/types/src/messages/cloud-to-tpa.ts
interface AudioChunk {
  type: StreamType.AUDIO_CHUNK,
  sessionId: string,
  arrayBuffer: ArrayBufferLike
  timestamp: Date,
}
```
