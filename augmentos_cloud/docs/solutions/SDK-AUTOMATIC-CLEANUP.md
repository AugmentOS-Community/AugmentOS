# SDK Automatic Resource Cleanup Implementation

**Author:** Isaiah Ballah (github: isaiahb)  
**Date:** March 25, 2025  
**Version:** 1.0  

## 1. Overview

This document outlines a solution to improve the AugmentOS SDK by implementing automatic resource cleanup. Currently, the SDK requires TPA developers to manually implement cleanup handlers, which has led to issues like those in the Notify TPA where critical cleanup code is commented out. This redesign will make the SDK more developer-friendly and prevent resource leaks.

## 2. Current Issues

1. **Manual Cleanup Required**: The SDK requires developers to manually register cleanup handlers
2. **Error-Prone Design**: This approach is prone to developer error (as seen in Notify's implementation)
3. **Resource Leaks**: When cleanup is missed, resources like timers and event listeners remain active
4. **Inconsistent State**: Improper cleanup leads to zombie sessions and memory leaks

## 3. Solution Design

### 3.1 Core Principles

1. **Automatic Resource Tracking**: The SDK should automatically track resources that need cleanup
2. **Implicit Cleanup**: Session termination should automatically clean up all associated resources
3. **Developer-Friendly API**: The event API should be simple and not require manual cleanup
4. **Resilient by Default**: TPAs should be resilient to common failure scenarios without special code

### 3.2 Improved TpaSession Design

```typescript
export class TpaSession {
  // Existing properties
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  
  // New properties for resource tracking
  private eventHandlers: Map<string, Set<Function>> = new Map();
  private timers: Set<NodeJS.Timeout> = new Set();
  private cleanupFunctions: Set<Function> = new Set();
  
  // Public interfaces remain the same
  public readonly events: EventManager;
  public readonly layouts: LayoutManager;
  
  constructor(private config: TpaSessionConfig) {
    // Initialize with better defaults
    this.config = {
      augmentOSWebsocketUrl: `ws://dev.augmentos.org/tpa-ws`,
      ...config
    };
    
    // Create event and layout managers with context of this session
    this.events = new EventManager(this);
    this.layouts = new LayoutManager(this.config.packageName, this);
  }
  
  // Public methods for resource management
  
  /**
   * Register a timer that will be automatically cleared on cleanup
   */
  public registerTimer(timer: NodeJS.Timeout): NodeJS.Timeout {
    this.timers.add(timer);
    return timer;
  }
  
  /**
   * Register a custom cleanup function
   */
  public registerCleanup(cleanup: Function): void {
    this.cleanupFunctions.add(cleanup);
  }
  
  /**
   * Register an event handler for a specific event
   */
  public registerEventHandler(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)?.add(handler);
  }
  
  /**
   * Disconnect session and clean up all resources
   */
  public disconnect(): void {
    // Perform all cleanup operations
    this.cleanup();
    
    // Close WebSocket if open
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.sessionId = null;
  }
  
  /**
   * Clean up all resources associated with this session
   */
  private cleanup(): void {
    // Clear all timers
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    
    // Run all cleanup functions
    this.cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        console.error('Error in cleanup function:', error);
      }
    });
    this.cleanupFunctions.clear();
    
    // Clear event handlers
    this.eventHandlers.clear();
  }
  
  // Rest of the class implementation...
}
```

### 3.3 Improved EventManager Design

```typescript
export class EventManager {
  constructor(private session: TpaSession) {}
  
  /**
   * Listen for speech transcription events
   * @param handler - Function to handle transcription data
   */
  onTranscription(handler: (data: TranscriptionData) => void): void {
    // Register for stream type
    this.session.subscribe(StreamType.TRANSCRIPTION);
    
    // Register event handler
    this.session.registerEventHandler(StreamType.TRANSCRIPTION, handler);
  }
  
  /**
   * Listen for phone notification events
   * @param handler - Function to handle notifications
   */
  onPhoneNotifications(handler: (data: PhoneNotification) => void): void {
    // Register for stream type
    this.session.subscribe(StreamType.PHONE_NOTIFICATION);
    
    // Register event handler
    this.session.registerEventHandler(StreamType.PHONE_NOTIFICATION, handler);
  }
  
  /**
   * Emit an event to registered handlers
   */
  emit(event: string, data: any): void {
    const handlers = this.session.getEventHandlers(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in ${event} handler:`, error);
        }
      });
    }
  }
  
  // Other event methods follow the same pattern
}
```

### 3.4 Improved TpaServer Design

```typescript
export class TpaServer {
  // Existing properties
  private app: Express;
  private activeSessions = new Map<string, TpaSession>();
  
  // No more need for cleanupHandlers array
  
  /**
   * Handle a session request webhook
   */
  private async handleSessionRequest(request: SessionWebhookRequest, res: express.Response): Promise<void> {
    const { sessionId, userId } = request;
    console.log(`\n\n🗣️ Received session request for user ${userId}, session ${sessionId}\n\n`);
    
    // Check if we already have an active session and clean it up if needed
    const existingSession = this.activeSessions.get(sessionId);
    if (existingSession) {
      existingSession.disconnect(); // Will handle all cleanup automatically
      this.activeSessions.delete(sessionId);
    }
    
    // Create new TPA session
    const session = new TpaSession({
      packageName: this.config.packageName,
      apiKey: this.config.apiKey,
      augmentOSWebsocketUrl: request.augmentOSWebsocketUrl || this.config.augmentOSWebsocketUrl,
    });
    
    // Set up automatic cleanup when session disconnects
    session.events.onDisconnected(() => {
      console.log(`👋 Session ${sessionId} disconnected`);
      this.activeSessions.delete(sessionId);
    });
    
    session.events.onError((error) => {
      console.error(`❌ [Session ${sessionId}] Error:`, error);
    });
    
    // Start the session
    try {
      await session.connect(sessionId);
      this.activeSessions.set(sessionId, session);
      await this.onSession(session, sessionId, userId);
      res.status(200).json({ status: 'success' } as WebhookResponse);
    } catch (error) {
      console.error('❌ Failed to connect:', error);
      session.disconnect(); // Will handle all cleanup automatically
      res.status(500).json({
        status: 'error',
        message: 'Failed to connect'
      } as WebhookResponse);
    }
  }
  
  /**
   * Stop the Server
   * Gracefully shuts down the server and cleans up all sessions.
   */
  public stop(): void {
    console.log('\n🛑 Shutting down...');
    
    // Disconnect all sessions (will handle cleanup automatically)
    for (const [sessionId, session] of this.activeSessions) {
      console.log(`👋 Closing session ${sessionId}`);
      session.disconnect();
    }
    this.activeSessions.clear();
    
    process.exit(0);
  }
  
  // Rest of the class implementation...
}
```

### 3.5 Connection Health Monitoring

While we don't need extensive reconnection logic for data center TPAs, basic connection validation is still valuable:

```typescript
// Add to TpaSession
private lastActivityTime: number = Date.now();
private connectionWatchdog: NodeJS.Timeout | null = null;
private readonly CONNECTION_TIMEOUT = 60000; // 1 minute

private startConnectionWatchdog(): void {
  // Clear any existing watchdog
  if (this.connectionWatchdog) {
    clearInterval(this.connectionWatchdog);
  }
  
  this.lastActivityTime = Date.now();
  
  // Create new watchdog timer
  this.connectionWatchdog = setInterval(() => {
    const timeSinceActivity = Date.now() - this.lastActivityTime;
    
    // If no activity for 1 minute, consider connection stale
    if (timeSinceActivity > this.CONNECTION_TIMEOUT) {
      console.warn(`Connection inactive for ${timeSinceActivity}ms, closing`);
      this.disconnect();
    }
  }, 30000); // Check every 30 seconds
  
  // Ensure the timer is cleaned up
  this.registerTimer(this.connectionWatchdog);
}

// Update message handling to track activity
private handleMessage(message: CloudToTpaMessage): void {
  // Update last activity time
  this.lastActivityTime = Date.now();
  
  // Rest of message handling...
}
```

## 4. Fixed Notify Implementation

With the improved SDK design, the Notify implementation becomes much simpler and more robust:

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
    
    // Add cleanup when session ends
    session.registerCleanup(() => {
      const manager = this.notificationManagers.get(sessionId);
      if (manager) {
        manager.cleanup();
        this.notificationManagers.delete(sessionId);
      }
    });
    
    // Welcome message
    session.layouts.showReferenceCard(
      "Notify", 
      "Notification service connected", 
      { durationMs: 3000 }
    );

    // Set up event handlers - no need to keep references anymore
    session.events.onPhoneNotifications((notification) => {
      console.log(
        `[Session ${sessionId}] Received phone notification:`,
        JSON.stringify(notification, null, 2)
      );

      // Check for duplicates and queue notification
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
    });

    // Set up other event handlers
    session.events.onConnected((settings) => {
      console.log(`\n[User ${userId}] connected to augmentos-cloud\n`);
    });

    session.events.onError((error) => {
      console.error(`[User ${userId}] Error:`, error);
    });
  }
}
```

### 4.1 NotificationManager Improvements

The `NotificationManager` class should also be updated to use the automatic resource tracking:

```typescript
class NotificationManager {
  private notificationQueue: QueuedNotification[] = [];
  private isDisplayingNotification: boolean = false;
  private timeoutId?: NodeJS.Timeout;
  private session: TpaSession;
  private userId: string;

  constructor(session: TpaSession, userId: string) {
    this.session = session;
    this.userId = userId;
  }

  // When setting a timeout, register it with the session
  private displayNextNotification(): void {
    // Clear any existing timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
    
    // Rest of display logic...
    
    // Register timeout with session for automatic cleanup
    this.timeoutId = this.session.registerTimer(setTimeout(() => {
      this.displayNextNotification();
    }, NOTIFICATION_DISPLAY_DURATION));
  }

  // Cleanup is still defined but will be called automatically
  cleanup(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }
}
```

## 5. Implementation Plan

### 5.1 Phase 1: SDK Core Redesign (2-3 days)

1. Update `TpaSession` to track resources automatically
2. Update `EventManager` to integrate with automatic resource tracking
3. Add basic connection health monitoring
4. Update `TpaServer` to leverage automatic cleanup

### 5.2 Phase 2: Update Notify TPA (1 day)

1. Simplify Notify implementation with new SDK
2. Fix notification handling to use automatic resource tracking
3. Remove manual cleanup handler tracking

### 5.3 Phase 3: Testing and Documentation (1-2 days)

1. Test resource cleanup in various scenarios
2. Document the improved API and design
3. Update examples to reflect the new, simpler approach

## 6. Benefits

1. **Improved Developer Experience**: TPAs no longer need to worry about manual cleanup
2. **Resilient by Default**: All resources automatically managed
3. **Fewer Bugs**: Eliminates an entire class of developer errors
4. **Consistent State**: Prevents resource leaks and zombie sessions
5. **Simplified Code**: TPA implementations become cleaner and more focused

## 7. Migration Strategy

Since this is a breaking change to the SDK, we need a sensible migration strategy:

1. **Version Bump**: Release as a new major version of the SDK
2. **Deprecation Warning**: Add deprecation warnings to the old cleanup methods
3. **Documentation**: Provide clear migration guide and examples
4. **Update System TPAs**: Update all system TPAs first to validate the design
5. **Gradual Rollout**: Allow both versions to be used in parallel during transition

## 8. Success Metrics

1. **Code Simplicity**: Reduced SDK integration code in TPAs
2. **Reliability**: Zero resource leaks from improper cleanup
3. **Memory Usage**: Stable memory usage over time
4. **Developer Sentiment**: Positive feedback on the improved API