# SDK Zero-Effort Cleanup Implementation

**Author:** Isaiah Ballah (github: isaiahb)  
**Date:** March 25, 2025  
**Version:** 1.0  

## 1. Overview

This document outlines a solution to radically simplify the AugmentOS SDK by implementing truly automatic resource cleanup that requires zero effort from TPA developers. The Notify TPA issues highlight how the current design, which requires manual cleanup registration, is fundamentally flawed. This redesign will make the SDK fully handle all resource cleanup without any special code from developers.

## 2. Current Issues

1. **Manual Cleanup Required**: The SDK requires developers to manually register cleanup handlers
2. **Error-Prone Design**: This approach is prone to developer error (as seen in Notify)
3. **Developer Burden**: Even with improved APIs, developers still need to think about cleanup
4. **Cognitive Overhead**: Resource management adds complexity to TPA code

## 3. Solution Design

### 3.1 Core Principles

1. **Zero Developer Effort**: Cleanup should happen automatically with no developer code
2. **Smart Resource Management**: SDK should intelligently track and clean up all resources
3. **Integration with Lifecycle**: Resources should be tied to session lifecycle
4. **No Special APIs**: Regular APIs should handle cleanup without special "register" methods

### 3.2 Resource Management in TpaSession

```typescript
export class TpaSession {
  // Existing properties
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  
  // Internal properties for automatic resource tracking
  private _timers: Set<NodeJS.Timeout> = new Set();
  private _eventHandlers: Map<string, Set<Function>> = new Set();
  private _resourceGroups: Map<string, Set<{destroy: () => void}>> = new Map();
  
  // Public interfaces
  public readonly events: EventManager;
  public readonly layouts: LayoutManager;
  
  constructor(private config: TpaSessionConfig) {
    // Initialize with better defaults
    this.config = {
      augmentOSWebsocketUrl: `ws://dev.augmentos.org/tpa-ws`,
      ...config
    };
    
    // Create managers with context of this session
    this.events = new EventManager(this);
    this.layouts = new LayoutManager(this.config.packageName, this);
  }
  
  /**
   * Create a timeout that is automatically cleared on session end
   * Replaces the global setTimeout with a managed version
   */
  setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): NodeJS.Timeout {
    const timer = setTimeout(callback, ms, ...args);
    this._timers.add(timer);
    return {
      ...timer,
      // Override clearTimeout to also remove from tracked set
      unref: () => {
        this._timers.delete(timer);
        return timer.unref();
      }
    };
  }
  
  /**
   * Create an interval that is automatically cleared on session end
   * Replaces the global setInterval with a managed version
   */
  setInterval(callback: (...args: any[]) => void, ms: number, ...args: any[]): NodeJS.Timeout {
    const timer = setInterval(callback, ms, ...args);
    this._timers.add(timer);
    return {
      ...timer,
      // Override clearInterval to also remove from tracked set
      unref: () => {
        this._timers.delete(timer);
        return timer.unref();
      }
    };
  }
  
  /**
   * Clear a timeout and remove it from tracking
   */
  clearTimeout(timer: NodeJS.Timeout): void {
    clearTimeout(timer);
    this._timers.delete(timer);
  }
  
  /**
   * Clear an interval and remove it from tracking
   */
  clearInterval(timer: NodeJS.Timeout): void {
    clearInterval(timer);
    this._timers.delete(timer);
  }
  
  /**
   * Disconnect from AugmentOS Cloud and clean up all resources
   */
  disconnect(): void {
    // Perform full cleanup
    this._cleanup();
    
    // Close WebSocket if open
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.sessionId = null;
  }
  
  /**
   * Clean up all resources associated with this session
   * This is called automatically when the session ends or disconnects
   */
  private _cleanup(): void {
    // Clear all timers
    for (const timer of this._timers) {
      clearTimeout(timer);
    }
    this._timers.clear();
    
    // Clean up resource groups
    for (const [_, resources] of this._resourceGroups) {
      for (const resource of resources) {
        try {
          resource.destroy();
        } catch (error) {
          console.error('Error cleaning up resource:', error);
        }
      }
    }
    this._resourceGroups.clear();
  }
  
  // For internal use by the SDK components
  _addResource(groupName: string, resource: {destroy: () => void}): void {
    if (!this._resourceGroups.has(groupName)) {
      this._resourceGroups.set(groupName, new Set());
    }
    this._resourceGroups.get(groupName)?.add(resource);
  }
  
  // The rest of the implementation...
}
```

### 3.3 Automatic Notification Manager Cleanup

We can redesign the NotificationManager to use the built-in timers and automatically clean up:

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
    
    // Auto-register with session for cleanup
    this.session._addResource('notificationManagers', {
      destroy: () => this.cleanup()
    });
  }

  queueNotification(notification: PhoneNotification): void {
    // Implementation remains the same, but using session.setTimeout
    // ...
    
    if (!this.isDisplayingNotification) {
      this.displayNextNotification();
    }
  }
  
  private displayNextNotification(): void {
    // Clear any existing timeout
    if (this.timeoutId) {
      this.session.clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
    
    // Rest of display logic...
    
    // Use session's managed setTimeout
    this.timeoutId = this.session.setTimeout(() => {
      this.displayNextNotification();
    }, NOTIFICATION_DISPLAY_DURATION);
  }

  // Cleanup is internal and called automatically
  private cleanup(): void {
    if (this.timeoutId) {
      this.session.clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }
}
```

### 3.4 Smart Event Management

The EventManager should be redesigned to automatically handle subscription cleanup:

```typescript
export class EventManager {
  private handlers: Map<string, Set<Function>> = new Map();
  
  constructor(private session: TpaSession) {}
  
  /**
   * Listen for transcription events
   */
  onTranscription(handler: (data: TranscriptionData) => void): void {
    this.on(StreamType.TRANSCRIPTION, handler);
  }
  
  /**
   * Listen for phone notification events
   */
  onPhoneNotifications(handler: (data: PhoneNotification) => void): void {
    this.on(StreamType.PHONE_NOTIFICATION, handler);
  }
  
  /**
   * Generic event subscription with automatic cleanup
   */
  on(event: string, handler: Function): void {
    // Ensure we're subscribed to the stream if it's a stream type
    if (Object.values(StreamType).includes(event as StreamType)) {
      // Tell the session to subscribe to this stream
      this.session.subscribe(event as StreamType);
    }
    
    // Register handler
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)?.add(handler);
  }
  
  /**
   * Emit an event to all registered handlers
   */
  emit(event: string, data: any): void {
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      for (const handler of eventHandlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in ${event} handler:`, error);
        }
      }
    }
  }
}
```

### 3.5 Improved TpaServer Implementation

The TpaServer also needs to be updated to follow this zero-effort approach:

```typescript
export class TpaServer {
  // Existing properties
  private app: Express;
  private activeSessions = new Map<string, TpaSession>();
  
  /**
   * Handles a new session connection - this is the only method devs need to implement
   */
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`New session: ${sessionId} for user ${userId}`);
    
    // Developers just write their code here without worrying about cleanup
  }
  
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
    
    // Set up automatic session tracking and cleanup
    session.events.onDisconnected(() => {
      this.activeSessions.delete(sessionId);
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
}
```

## 4. Fixed Notify Implementation

With the new zero-effort design, the Notify implementation becomes drastically simpler:

```typescript
class NotifyServer extends TpaServer {
  /**
   * Handles a new session connection
   */
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`Setting up notification service for session ${sessionId}, user ${userId}`);
    
    // Create notification manager - no need to worry about cleanup!
    const notificationManager = new NotificationManager(session, userId);
    
    // Welcome message
    session.layouts.showReferenceCard(
      "Notify", 
      "Notification service connected", 
      { durationMs: 3000 }
    );

    // Set up event handlers - no need to track for cleanup
    session.events.onPhoneNotifications((notification) => {
      console.log(`[Session ${sessionId}] Received notification:`, notification);

      // Check for duplicates
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

    // Other event handlers - no cleanup worries
    session.events.onConnected(() => {
      console.log(`[User ${userId}] connected to augmentos-cloud`);
    });

    session.events.onError((error) => {
      console.error(`[User ${userId}] Error:`, error);
    });
  }
}
```

## 5. Benefits of Zero-Effort Design

1. **Completely Error-Proof**: Developers simply can't make cleanup mistakes
2. **Dramatically Simplified Code**: TPA implementations become much cleaner
3. **Reduced Cognitive Load**: Developers don't need to think about resource management
4. **No Special APIs**: Standard APIs handle cleanup automatically
5. **Better Abstractions**: Resource lifecycle is tied to session lifecycle

## 6. Implementation Plan

### 6.1 Phase 1: SDK Core Redesign (3-4 days)

1. Implement automatic resource tracking in TpaSession
2. Create timer management wrappers (setTimeout, setInterval)
3. Build smart event management system
4. Update TpaServer to leverage this design

### 6.2 Phase 2: Resource Tracking (2-3 days)

1. Implement automatic tracking for different resource types
2. Ensure all resources are properly cleaned up on session end
3. Add resource group management for batch cleanup

### 6.3 Phase 3: Update Notify and Test (2-3 days)

1. Simplify Notify implementation with new SDK
2. Test automatic cleanup in various scenarios
3. Ensure proper operation with zero cleanup code

## 7. Before vs. After Example

### Before: Manual Cleanup with Potential for Errors

```typescript
protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
  // Create objects that need cleanup
  const notificationManager = new NotificationManager(session, userId);
  
  // Set timers that need cleanup
  const timer = setTimeout(() => { /* some logic */ }, 5000);
  
  // Register event handlers that need tracking for cleanup
  const handlers = [
    session.events.onPhoneNotifications((notification) => {
      notificationManager.queueNotification(notification);
    }),
    
    // Cleanup function that often gets forgotten
    () => {
      clearTimeout(timer);
      notificationManager.cleanup();
    }
  ];
  
  // This crucial line often gets commented out or forgotten
  handlers.forEach(handler => this.addCleanupHandler(handler));
}
```

### After: Zero-Effort Automatic Cleanup

```typescript
protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
  // Create objects - cleanup handled automatically
  const notificationManager = new NotificationManager(session, userId);
  
  // Set timers - cleanup handled automatically
  session.setTimeout(() => { /* some logic */ }, 5000);
  
  // Register event handlers - cleanup handled automatically
  session.events.onPhoneNotifications((notification) => {
    notificationManager.queueNotification(notification);
  });
}
```

## 8. Success Metrics

1. **Code Reduction**: 30-50% less code in TPA implementations
2. **Zero Cleanup Bugs**: Eliminate resource leak issues
3. **Developer Satisfaction**: Positive feedback on simplified API
4. **Memory Stability**: Consistent memory usage over extended runtime
5. **Faster Onboarding**: New developers can create TPAs without understanding cleanup