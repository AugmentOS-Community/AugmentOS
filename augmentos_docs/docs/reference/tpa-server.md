---
sidebar_position: 2
title: TpaServer
---

# TpaServer

`TpaServer` is the base class for creating Third Party Application (TPA) servers that handle webhook requests from AugmentOS Cloud to manage TPA sessions.

```typescript
import { TpaServer } from '@augmentos/sdk';
```

## Constructor

```typescript
constructor(config: TpaServerConfig)
```

**Parameters:**
- `config`: [Configuration](#configuration) options for the TPA server

## Methods

### getExpressApp()

Exposes the internal Express app instance for adding custom routes or middleware.

```typescript
getExpressApp(): express.Express
```

**Returns:** The Express application instance.

### onSession() _[protected]_

Override this method to handle the initiation of a new TPA session when a user starts your app. Implement your TPA's core logic here (e.g., setting up event listeners).

```typescript
protected onSession(
  session: TpaSession, 
  sessionId: string, 
  userId: string
): Promise<void>
```

**Parameters:**
- `session`: The [`TpaSession`](#tpasession) instance for this specific user session
- `sessionId`: The unique identifier for this session
- `userId`: The unique identifier for the user

**Returns:** A Promise that resolves when session initialization is complete

### onStop() _[protected]_

Override this method to handle cleanup when a TPA session is stopped by the user or system.

```typescript
protected onStop(
  sessionId: string, 
  userId: string, 
  reason: string
): Promise<void>
```

**Parameters:**
- `sessionId`: The unique identifier for the session being stopped
- `userId`: The unique identifier for the user
- `reason`: The reason the session was stopped ('user_disabled', 'system_stop', 'error')

**Returns:** A Promise that resolves when session cleanup is complete

### start()

Starts the TPA server, making it listen for incoming webhook requests.

```typescript
start(): Promise<void>
```

**Returns:** A promise that resolves when the server has successfully started.

### stop()

Gracefully shuts down the TPA server, cleaning up all active sessions and resources.

```typescript
stop(): void
```

### generateToken() _[protected]_

Generates a JWT token suitable for TPA authentication, typically used for webviews. See [Token Utilities](/reference/token-utils) for more details.

```typescript
protected generateToken(
  userId: string, 
  sessionId: string, 
  secretKey: string
): string
```

**Parameters:**
- `userId`: The user's identifier
- `sessionId`: The session identifier
- `secretKey`: Your TPA's secret key (should match the one configured in AugmentOS Cloud)

**Returns:** The generated JWT token string

### addCleanupHandler() _[protected]_

Registers a function to be executed during the server's graceful shutdown process.

```typescript
protected addCleanupHandler(handler: () => void): void
```

**Parameters:**
- `handler`: The cleanup function to add

## Configuration

```typescript
interface TpaServerConfig {
  /** Your unique TPA identifier (e.g., 'org.company.appname'). Must match console.augmentos.org. */
  packageName: string;
  
  /** Your API key obtained from console.augmentos.org for authentication. */
  apiKey: string;
  
  /** The port number the TPA server will listen on. Defaults to 7010. */
  port?: number;
  
  /** [DEPRECATED] The SDK automatically uses '/webhook'. Do not set. */
  webhookPath?: string;
  
  /** Path to a directory for serving static files (e.g., images, logos). Set to `false` to disable. Defaults to `false`. */
  publicDir?: string | false;
  
  /** [DEPRECATED] The WebSocket URL is provided dynamically via webhooks. Do not set. */
  augmentOSWebsocketUrl?: string;
  
  /** Whether to enable the `/health` endpoint for status checks. Defaults to `true`. */
  healthCheck?: boolean;
}
```