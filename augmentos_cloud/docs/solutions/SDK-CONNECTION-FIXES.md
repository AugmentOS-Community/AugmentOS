# SDK Connection Management Fixes

**Author:** Isaiah Ballah (github: isaiahb)  
**Date:** March 25, 2025  
**Version:** 1.0  

## 1. Overview

This document outlines the critical issues in the AugmentOS SDK that cause notifications and other TPAs to break after initial connection, and provides implementation details for fixing these problems. The primary focus is on improving WebSocket connection handling, error recovery, and session cleanup.

## 2. Identified Issues

From analysis of the SDK and Notify TPA code, the following critical issues have been identified:

1. **Disabled Cleanup Handlers**: Crucial cleanup code is commented out in Notify's implementation
2. **Limited Reconnection**: TPA SDK has autoReconnect disabled by default and only attempts 0 reconnections
3. **No Connection Health Monitoring**: No heartbeat mechanism to detect zombie connections
4. **Missing Error Recovery**: Insufficient error handling during WebSocket disconnections
5. **State Inconsistency**: Sessions marked active in Cloud but disconnected in TPAs

## 3. Solution Components

### 3.1 Enable and Improve Cleanup Handlers in Notify

The first issue is in the Notify TPA's implementation. Key cleanup code is commented out, which prevents proper resource cleanup:

```typescript
// Current problematic code in notify/src/index.ts
// const cleanup = [
  session.events.onPhoneNotifications((notification) => {
    // Handler implementation
  })
  // ... other event handlers ...
// ];

// // Register cleanup handlers
// cleanup.forEach(handler => this.addCleanupHandler(handler));
```

This needs to be fixed to properly register cleanup handlers for session teardown:

```typescript
// Fixed implementation
const cleanupHandlers = [
  session.events.onPhoneNotifications((notification) => {
    // Handler implementation
    notificationManager.queueNotification(notification);
  }),
  
  session.events.onConnected((settings) => {
    console.log(`\n[User ${userId}] connected to augmentos-cloud\n`);
  }),
  
  session.events.onError((error) => {
    console.error(`[User ${userId}] Error:`, error);
  }),
  
  session.events.onDisconnected((reason) => {
    console.log(`[User ${userId}] Disconnected: ${reason}`);
  }),
  
  // Cleanup function for when session ends
  () => {
    const manager = this.notificationManagers.get(sessionId);
    if (manager) {
      manager.cleanup();
      this.notificationManagers.delete(sessionId);
    }
  }
];

// Register cleanup handlers
cleanupHandlers.forEach(handler => this.addCleanupHandler(handler));
```

### 3.2 Improve TPA Session Reconnection Logic

The SDK has a major issue in `TpaSession` where reconnection is disabled by default:

```typescript
// Current problematic code in sdk/src/tpa/session/index.ts
constructor(private config: TpaSessionConfig) {
  this.config = {
    augmentOSWebsocketUrl: `ws://dev.augmentos.org/tpa-ws`,
    autoReconnect: false,  // Reconnect disabled by default
    maxReconnectAttempts: 0,  // 0 reconnect attempts
    reconnectDelay: 1000,
    ...config
  };
  // ...
}
```

This should be updated to enable reconnection by default:

```typescript
// Fixed implementation
constructor(private config: TpaSessionConfig) {
  this.config = {
    augmentOSWebsocketUrl: `ws://dev.augmentos.org/tpa-ws`,
    autoReconnect: true,  // Enable reconnection by default
    maxReconnectAttempts: 5,  // Allow up to 5 reconnection attempts
    reconnectDelay: 1000,
    ...config
  };
  
  this.events = new EventManager(this.subscribe.bind(this));
  this.layouts = new LayoutManager(
    config.packageName,
    this.send.bind(this)
  );
}
```

Additionally, the reconnection handling needs improvement:

```typescript
// Improved reconnection handling
private async handleReconnection(): Promise<void> {
  if (!this.config.autoReconnect || !this.sessionId) {
    this.events.emit('disconnected', 'Connection closed permanently');
    return;
  }
  
  if (this.reconnectAttempts >= (this.config.maxReconnectAttempts || 5)) {
    this.events.emit('disconnected', `Connection failed after ${this.reconnectAttempts} attempts`);
    return;
  }
  
  // Calculate backoff with jitter to prevent reconnection storms
  const baseDelay = this.config.reconnectDelay || 1000;
  const maxJitter = Math.min(baseDelay * 0.2, 1000); // 20% jitter, max 1 second
  const jitter = Math.random() * maxJitter;
  const delay = baseDelay * Math.pow(1.5, this.reconnectAttempts) + jitter;
  
  this.reconnectAttempts++;
  
  this.events.emit('reconnecting', {
    attempt: this.reconnectAttempts,
    maxAttempts: this.config.maxReconnectAttempts,
    delay
  });
  
  await new Promise(resolve => setTimeout(resolve, delay));
  
  try {
    await this.connect(this.sessionId);
    this.reconnectAttempts = 0;
    this.events.emit('reconnected', {});
  } catch (error) {
    // If we haven't reached max attempts, the next reconnection will be triggered
    // by the 'close' event from the failed connection attempt
    this.events.emit('error', new Error(`Reconnection attempt ${this.reconnectAttempts} failed`));
  }
}
```

### 3.3 Implement WebSocket Health Monitoring

To detect zombie connections, we need to add a heartbeat mechanism:

```typescript
// Add to TpaSession class

private heartbeatInterval: NodeJS.Timeout | null = null;
private lastPongTime: number = 0;
private readonly HEARTBEAT_INTERVAL = 15000; // 15 seconds
private readonly HEARTBEAT_TIMEOUT = 45000; // 45 seconds

/**
 * Start heartbeat monitoring
 */
private startHeartbeat(): void {
  // Clear any existing interval
  if (this.heartbeatInterval) {
    clearInterval(this.heartbeatInterval);
  }
  
  this.lastPongTime = Date.now();
  
  // Set up ping interval
  this.heartbeatInterval = setInterval(() => {
    try {
      // Check if we've received a pong recently
      const timeSinceLastPong = Date.now() - this.lastPongTime;
      if (timeSinceLastPong > this.HEARTBEAT_TIMEOUT) {
        console.warn(`No heartbeat response for ${timeSinceLastPong}ms, closing connection`);
        
        // Force close the WebSocket to trigger reconnection
        if (this.ws) {
          this.ws.terminate();
        }
        return;
      }
      
      // Send ping if connection is open
      if (this.ws && this.ws.readyState === 1) {
        this.ws.ping();
      }
    } catch (error) {
      console.error('Error in heartbeat:', error);
    }
  }, this.HEARTBEAT_INTERVAL);
}

/**
 * Stop heartbeat monitoring
 */
private stopHeartbeat(): void {
  if (this.heartbeatInterval) {
    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
  }
}
```

Add the heartbeat handling to the WebSocket setup:

```typescript
// Add to connect method after this.ws = new WebSocket(...)
this.ws.on('pong', () => {
  this.lastPongTime = Date.now();
});

// Start heartbeat after connection opens
this.ws.on('open', () => {
  this.sendConnectionInit();
  this.startHeartbeat();
});

// Stop heartbeat when connection closes
this.ws.on('close', () => {
  this.stopHeartbeat();
  this.events.emit('disconnected', 'Connection closed');
  this.handleReconnection();
});

// Also add to disconnect method
disconnect(): void {
  this.stopHeartbeat();
  if (this.ws) {
    this.ws.close();
    this.ws = null;
  }
  this.sessionId = null;
  this.subscriptions.clear();
}
```

### 3.4 Enhance Error Handling

Improve error handling in the SDK to better handle failure scenarios:

```typescript
// Improve message handling with better error handling
private handleMessage(message: CloudToTpaMessage): void {
  try {
    // Existing message handling code...
    
    // Using type guards to determine message type
    if (isTpaConnectionAck(message)) {
      this.events.emit('connected', message.settings);
      this.updateSubscriptions();
    }
    else if (isTpaConnectionError(message)) {
      const error = new Error(message.message);
      this.events.emit('error', error);
      
      // If it's an authentication error, don't retry
      if (message.message.includes('auth') || message.message.includes('key')) {
        this.config.autoReconnect = false;
      }
    }
    // ... other message handling ...
    
  } catch (error) {
    console.error('Error handling message:', error);
    this.events.emit('error', new Error('Failed to process message'));
  }
}

// Add a method to validate connection health
public isConnectionHealthy(): boolean {
  if (!this.ws) return false;
  
  // Check WebSocket readyState (1 = OPEN)
  if (this.ws.readyState !== 1) return false;
  
  // Check heartbeat status
  const timeSinceLastPong = Date.now() - this.lastPongTime;
  return timeSinceLastPong < this.HEARTBEAT_TIMEOUT;
}
```

### 3.5 Improve TPA Server Connection Management

Enhance the TpaServer class to better handle connection lifecycle:

```typescript
// Add connection tracking to the TpaServer
private connectionAttempts = new Map<string, number>();
private readonly MAX_CONNECTION_ATTEMPTS = 3;

// Improve session handling
private async handleSessionRequest(request: SessionWebhookRequest, res: express.Response): Promise<void> {
  const { sessionId, userId } = request;
  console.log(`\n\n🗣️ Received session request for user ${userId}, session ${sessionId}\n\n`);
  
  // Check if we already have an active session for this ID
  const existingSession = this.activeSessions.get(sessionId);
  if (existingSession) {
    if (existingSession.isConnectionHealthy()) {
      console.log(`Session ${sessionId} is already active and healthy`);
      res.status(200).json({ status: 'success', message: 'Session already active' } as WebhookResponse);
      return;
    } else {
      console.log(`Found unhealthy session ${sessionId}, replacing it`);
      existingSession.disconnect();
      this.activeSessions.delete(sessionId);
    }
  }
  
  // Track connection attempts
  const attempts = (this.connectionAttempts.get(sessionId) || 0) + 1;
  this.connectionAttempts.set(sessionId, attempts);
  
  if (attempts > this.MAX_CONNECTION_ATTEMPTS) {
    console.error(`Too many connection attempts for session ${sessionId}`);
    res.status(429).json({
      status: 'error',
      message: 'Too many connection attempts'
    } as WebhookResponse);
    return;
  }
  
  // Create new TPA session
  const session = new TpaSession({
    packageName: this.config.packageName,
    apiKey: this.config.apiKey,
    augmentOSWebsocketUrl: request.augmentOSWebsocketUrl || this.config.augmentOSWebsocketUrl,
    autoReconnect: true,
    maxReconnectAttempts: 5
  });
  
  // Setup session event handlers
  const cleanupDisconnect = session.events.onDisconnected(() => {
    console.log(`👋 Session ${sessionId} disconnected`);
    this.activeSessions.delete(sessionId);
    
    // Reset connection attempts after successful session that later disconnected
    this.connectionAttempts.delete(sessionId);
  });
  
  const cleanupError = session.events.onError((error) => {
    console.error(`❌ [Session ${sessionId}] Error:`, error);
  });
  
  // Start the session
  try {
    await session.connect(sessionId);
    this.activeSessions.set(sessionId, session);
    
    // Reset connection attempts after successful connection
    this.connectionAttempts.delete(sessionId);
    
    await this.onSession(session, sessionId, userId);
    res.status(200).json({ status: 'success' } as WebhookResponse);
  } catch (error) {
    console.error('❌ Failed to connect:', error);
    cleanupDisconnect();
    cleanupError();
    res.status(500).json({
      status: 'error',
      message: 'Failed to connect'
    } as WebhookResponse);
  }
}
```

## 4. Update Notify Implementation

To fix the Notify TPA, we need to update its implementation:

```typescript
class NotifyServer extends TpaServer {
  // Map to store notification managers for each session
  private notificationManagers = new Map<string, NotificationManager>();

  /**
   * Handles a new session connection
   */
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`Setting up notification service for session ${sessionId}, user ${userId}`);
    
    // Create notification manager for this session
    const notificationManager = new NotificationManager(session, userId);
    this.notificationManagers.set(sessionId, notificationManager);
    
    // Welcome message
    session.layouts.showReferenceCard(
      "Notify", 
      "Notification service connected", 
      { durationMs: 3000 }
    );

    // Register event handlers with proper cleanup
    const cleanupHandlers = [
      // Handle phone notifications
      session.events.onPhoneNotifications((notification) => {
        console.log(
          `[Session ${sessionId}] Received phone notification:`,
          JSON.stringify(notification, null, 2)
        );

        // Check if this notification is already in the queue
        const existingNotifications = notificationManager.getQueuedNotifications();
        const isDuplicate = existingNotifications.some(existing => 
          existing.notification.title === notification.title && 
          existing.notification.content === notification.content &&
          existing.notification.app === notification.app
        );

        if (isDuplicate) {
          console.log(`[Session ${sessionId}] Duplicate notification detected, skipping`);
          return;
        }

        notificationManager.queueNotification(notification);
      }),

      // Handle connection events
      session.events.onConnected((settings) => {
        console.log(`\n[User ${userId}] connected to augmentos-cloud\n`);
      }),
      
      // Handle reconnection events
      session.events.onReconnected(() => {
        console.log(`\n[User ${userId}] reconnected to augmentos-cloud\n`);
      }),
      
      // Handle reconnection attempts
      session.events.onReconnecting((info) => {
        console.log(`\n[User ${userId}] attempting to reconnect (${info.attempt}/${info.maxAttempts})\n`);
      }),

      // Handle errors
      session.events.onError((error) => {
        console.error(`[User ${userId}] Error:`, error);
      }),
      
      // Handle disconnections
      session.events.onDisconnected((reason) => {
        console.log(`[User ${userId}] Disconnected: ${reason}`);
      }),

      // Cleanup function for when session ends
      () => {
        const manager = this.notificationManagers.get(sessionId);
        if (manager) {
          manager.cleanup();
          this.notificationManagers.delete(sessionId);
        }
      }
    ];

    // Register cleanup handlers
    cleanupHandlers.forEach(handler => this.addCleanupHandler(handler));
  }
}
```

## 5. Implementation Steps

### 5.1 Phase 1: SDK Fixes (1-2 days)

1. Update TpaSession default configuration to enable reconnection
2. Implement heartbeat mechanism for connection health monitoring
3. Improve error handling and connection state management
4. Update TpaServer to better handle connection lifecycle
5. Add connection health validation methods

### 5.2 Phase 2: Notify TPA Fixes (1 day)

1. Fix the commented-out cleanup handlers
2. Add proper event handlers for connection lifecycle events
3. Improve error and disconnection handling
4. Update configuration to use the improved reconnection settings

### 5.3 Phase 3: Testing (1-2 days)

1. Test reconnection scenarios:
   - Network interruptions
   - Server restarts
   - Long periods of inactivity
2. Test with different notification sources and frequencies
3. Verify cleanup properly releases resources
4. Compare performance and stability with previous implementation

## 6. Expected Benefits

1. **Improved Stability**: Notifications will continue working even after network glitches
2. **Better Resource Management**: Proper cleanup will prevent memory leaks
3. **Connection Health Awareness**: Heartbeat mechanism will detect zombie connections
4. **Enhanced Recovery**: Automatic reconnection with backoff for transient issues
5. **Consistent State**: Clear connection state management across components

## 7. Rollout Plan

1. Update the SDK first with all connection improvements
2. Publish new SDK version
3. Update Notify TPA to use new SDK version and fix its implementation
4. Test thoroughly in development environment
5. Deploy to staging for further testing
6. Roll out to production once verified

## 8. Success Metrics

1. **Connection Stability**: Connections remain healthy for days without interruption
2. **Recovery Rate**: 99% of temporary disconnections recover without user intervention
3. **Resource Utilization**: Memory usage remains stable over time
4. **User Experience**: Notifications continue to work reliably 
5. **Error Rates**: Significant reduction in connection and timeout errors