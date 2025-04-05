# TPA Audit and SDK Recommendations

## Overview

This document presents findings from an audit of existing Third-Party Applications (TPAs) in the AugmentOS ecosystem, identifying patterns, issues, and opportunities for SDK improvements. The analysis will inform the improved SDK design outlined in the `IMPROVED-SDK-DESIGN.md` document.

## Current TPA Implementation Patterns

### SDK Adoption Status

TPAs in the ecosystem fall into two categories:

**Using SDK (TpaServer/TpaSession):**
- `aughog`: Uses SDK with proper resource management
- `notify`: Uses SDK for session and notification handling
- `flash`: Uses SDK with clean event subscription model
- `isaiah`: Demo/test implementations using SDK

**Manual WebSocket Implementation:**
- `dashboard-manager`: Directly manages WebSockets and sessions
- `livecaptions`: Custom WebSocket implementation for real-time transcription
- `livetranslation`: Custom translation with direct WebSocket usage
- `miraai`: AI assistant with custom WebSocket implementation

## Common Issues Identified

### 1. Session Reconnection Failures

**Observed in:** `dashboard-manager`, `livecaptions`, `miraai`

When users disconnect and reconnect, these TPAs fail to properly recover session state:

```typescript
// From dashboard-manager - completely loses state on disconnect
ws.on('close', (message) => {
  console.log(`[Session ${sessionId}] 🛑TPA Disconnected`);
  activeSessions.delete(sessionId);
});
```

**Impact:** Dashboard breaks with error: `[Dashboard Manager] Called updateDashboard without a session ID`

**Recommendation for SDK:** Implement the automatic state preservation in `TpaApp` as described in the improved SDK design.

### 2. Resource Leaks

**Observed in:** `dashboard-manager`, `livecaptions`

Timers, event handlers, and other resources aren't properly cleaned up:

```typescript
// Global interval in dashboard-manager never gets cleaned up
setTimeout(() => {
  // Run updateDashboard 5 seconds after the file runs.
  updateDashboard();
  // Then, schedule it to run every 5 seconds.
  setInterval(() => updateDashboard(), 60000);
}, 5000);
```

**Impact:** Memory leaks and zombie processes consuming resources even after sessions end.

**Recommendation for SDK:** Implement the `ResourceTracker` as proposed in the improved SDK design, ensuring all resources are automatically tracked and cleaned up.

### 3. WebSocket URL Configuration

**Observed in:** `miraai`, `dashboard-manager`

Inconsistent URL handling across environments:

```typescript
// Protocol mismatch in miraai - using http protocol in hostname
const CLOUD_HOST_NAME = process.env.CLOUD_HOST_NAME || "http://localhost:8002";
const ws = new WebSocket(`ws://${CLOUD_HOST_NAME}/tpa-ws`);
```

**Impact:** Connection failures in different environments (Docker, production, etc.)

**Recommendation for SDK:** Implement environment-aware URL configuration in the `ConnectionManager` that handles different deployment environments automatically.

### 4. Error Handling Inconsistency

**Observed in:** All manual implementations

Minimal or inconsistent error handling:

```typescript
// From livecaptions - no recovery logic
ws.on('error', (error) => {
  console.error(`[Session ${sessionId}] WebSocket error:`, error);
});
```

**Impact:** Silent failures or crashes when errors occur.

**Recommendation for SDK:** Implement comprehensive error handling in the `EventListener` class and support graceful degradation patterns.

### 5. Global State Management

**Observed in:** `dashboard-manager`, `livecaptions`, `miraai`

Using global maps and variables for state:

```typescript
// Global state in dashboard-manager
const activeSessions = new Map<string, SessionInfo>();
const userLanguageSettings: Map<string, string> = new Map();
```

**Impact:** State inconsistency, especially during reconnections.

**Recommendation for SDK:** Implement the `StateManager` as proposed in the improved SDK design, providing a consistent pattern for state management.

## Positive Patterns to Adopt

### 1. Session Cleanup in Flash TPA

The Flash TPA demonstrates good cleanup practices using the SDK:

```typescript
// Store cleanup functions
const cleanup = [
  session.events.onTranscription((data) => {
    // Handler logic...
  }),
  
  session.events.onConnected((settings) => {
    // Handler logic...
  })
];

// Add cleanup handlers
cleanup.forEach(handler => this.addCleanupHandler(handler));
```

**Recommendation:** The improved SDK should maintain this clean pattern but make it automatic.

### 2. Environment Detection in Aughog

Aughog shows good environment-aware configuration:

```typescript
// In a container environment, use the service name
if (process.env.CONTAINER_ENVIRONMENT === 'true' || CLOUD_HOST_NAME === 'cloud') {
  wsUrl = 'ws://cloud/tpa-ws';
  logger.info(`🔌 Using Docker internal URL: ${wsUrl}`);
} else if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
  // Production environment - use secure WebSocket
  wsUrl = `wss://${process.env.PUBLIC_HOST_NAME || 'dev.augmentos.org'}/tpa-ws`;
  logger.info(`🔌 Using production URL: ${wsUrl}`);
} else {
  // Local development
  wsUrl = `ws://${CLOUD_HOST_NAME}/tpa-ws`;
  logger.info(`🔌 Using local development URL: ${wsUrl}`);
}
```

**Recommendation:** Build this logic into the Connection Management aspect of `TpaApp`.

### 3. Notification Queuing in Notify

Notify implements good debouncing and queuing for notifications:

```typescript
queueNotification(notification: PhoneNotification): void {
  // Add to queue with expiration time
  const expiration = Date.now() + 4 * NOTIFICATION_DISPLAY_DURATION;
  this.notificationQueue.push({ notification, expiration });
  
  // Start displaying if not already active
  if (!this.isDisplayingNotification) {
    this.displayNextNotification();
  }
}
```

**Recommendation:** Implement similar queue management in the `DisplaySystem` with the `DebouncedDisplay` class.

## Specific Dashboard Manager Issues

The dashboard-manager TPA exhibits several specific issues that should inform our SDK improvements:

1. **Improper Session Management**:
   The global interval calls `updateDashboard()` without checking if sessions exist, causing errors during reconnection.

2. **Race Condition in Display Updates**:
   Dashboard updates can start before session is fully initialized.

3. **Global Timer Without Cleanup**:
   Using `setInterval` without tracking or cleaning up.

4. **No WebSocket Error Recovery**:
   Minimal error handling with no automatic recovery.

5. **Missing Resource Cleanup**:
   No cleanup for transcription processors or other resources.

## Recommendations for Improved SDK

Based on this audit, the following recommendations align with and extend the improved SDK design:

### 1. Session Context Improvements

Add safety measures to the session context:

```typescript
// In the improved SDK
app.onSession((context) => {
  // All operations on context are automatically checked for session validity
  context.display.showTextWall("Welcome!");
  
  // Automatic cleanup when session ends - no need for manual tracking
  context.events.transcription.listen((data) => {
    // This listener is automatically removed when session ends
  });
  
  // Safe timers that are automatically cleaned up
  context.setTimeout(() => {
    // Timer is automatically cleared if session ends
  }, 5000);
});
```

### 2. Safe Display Methods

Add validation to ensure displays only happen for valid sessions:

```typescript
// In DisplaySystem implementation
showTextWall(text: string, options: DisplayOptions = {}): void {
  // Check session validity before sending
  if (!this.isSessionValid()) {
    console.warn("Attempted to show display on invalid session");
    return;
  }
  
  // Proceed with display...
}
```

### 3. Enhanced Error Recovery

Implement automatic reconnection with exponential backoff:

```typescript
// In ConnectionManager
private attemptReconnect(): void {
  if (this.reconnectAttempts >= this.maxReconnectAttempts) {
    this.onError(new Error("Maximum reconnection attempts reached"));
    return;
  }
  
  const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts);
  this.reconnectTimer = setTimeout(() => {
    this.connect();
  }, delay);
  
  this.reconnectAttempts++;
}
```

### 4. Dashboard-Specific Improvements

For the dashboard TPA specifically, the new SDK should facilitate:

1. **Session-Scoped Updates**: All timers tied to session lifecycle
2. **Safe State Management**: State isolated per user/session
3. **Automatic Error Recovery**: Reconnection with state preservation

## Implementation Prioritization

Based on the audit findings, these implementation priorities are recommended:

1. **ResourceTracker Implementation**: Critical to prevent resource leaks
2. **Session Context Safety**: Preventing operations on invalid sessions
3. **Automatic WebSocket URL Configuration**: Resolving environment-specific issues
4. **State Management**: Providing consistent patterns for state
5. **Event System Simplification**: Making subscriptions easier and safer

## Conclusion

The TPA audit reveals several common patterns and issues that the improved SDK design can address. By implementing the proposed design with the additional recommendations from this audit, we can create a more robust, developer-friendly SDK that prevents common errors and simplifies TPA development.

The dashboard-manager TPA, in particular, highlights the need for automatic resource management and session state preservation, which are core features of the proposed improved SDK design. Moving forward, these findings should inform the implementation priorities and specific features of the new SDK.