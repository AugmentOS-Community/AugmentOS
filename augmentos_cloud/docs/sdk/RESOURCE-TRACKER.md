# SDK Resource Tracker

## Overview

The ResourceTracker is an automatic resource management system for the AugmentOS SDK. It prevents memory leaks and resource exhaustion by ensuring that all resources (timers, event listeners, WebSocket connections, etc.) are properly cleaned up when no longer needed.

## Problem

Without automatic resource management, TPAs can easily leak resources, leading to:

1. **Memory Leaks**: Resources not being released, causing memory usage to grow over time
2. **Performance Degradation**: Too many active timers and event listeners slowing down the system
3. **Developer Burden**: Having to manually track and clean up all resources
4. **Inconsistent Cleanup**: Easy to forget cleanup in some code paths, especially in error cases

## Solution

The ResourceTracker provides:

1. **Automatic Tracking**: Resources are automatically tracked and managed
2. **Centralized Cleanup**: One place to dispose of all resources
3. **Safe Cleanup**: Ensures cleanup happens in all code paths, including error cases
4. **Resource Types**: Support for various resource types (timers, event listeners, custom disposables)

## Usage Examples

### Basic Usage

```typescript
import { createResourceTracker } from '@augmentos/sdk';

// Create a resource tracker
const resources = createResourceTracker();

// Create a tracked timeout
resources.setTimeout(() => {
  console.log('This will be automatically cleaned up');
}, 1000);

// Create a tracked interval
resources.setInterval(() => {
  console.log('This interval is tracked');
}, 2000);

// Later, when you want to clean up everything:
resources.dispose();
// All tracked timeouts and intervals are now cleared
```

### Tracking Custom Cleanup Functions

```typescript
// Track any function that should be called during cleanup
const untrackFn = resources.track(() => {
  console.log('Custom cleanup logic here');
  // Close database connections, release files, etc.
});

// If you want to remove this specific cleanup function:
untrackFn();
```

### Tracking Disposable Objects

```typescript
// Any object with a .dispose() or .close() method
const myDisposable = {
  dispose: () => console.log('Disposed!')
};

// Track it
resources.trackDisposable(myDisposable);
```

### Integration with Event Emitters

```typescript
const emitter = new EventEmitter();

// When adding an event listener, track its removal
emitter.on('event', listener);
resources.track(() => {
  emitter.off('event', listener);
});
```

## Enhanced TPA Session

The TpaSession class now uses ResourceTracker internally to automatically manage all resources:

```typescript
export class TpaSession {
  private resources = createResourceTracker();
  
  // ... other code ...
  
  async connect(sessionId: string): Promise<void> {
    // ... connection logic ...
    
    // Track WebSocket cleanup
    this.resources.track(() => {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
    });
    
    // Create a tracked timeout for connection timeout
    this.resources.setTimeout(() => {
      // Handle timeout
    }, 5000);
  }
  
  disconnect(): void {
    // One call cleans up everything!
    this.resources.dispose();
  }
}
```

## API Reference

### ResourceTracker

#### Methods

- **track(cleanup: () => void): () => void**  
  Registers a cleanup function to be called when dispose() is called.  
  Returns a function that unregisters this specific cleanup function.

- **trackDisposable(disposable: Disposable): () => void**  
  Tracks an object with a dispose() or close() method.  
  Returns a function that unregisters this disposable.

- **trackTimer(timerId: NodeJS.Timeout, isInterval?: boolean): () => void**  
  Tracks a timer ID to ensure it gets cleared.  
  Returns a function that unregisters this timer.

- **trackTimeout(timerId: NodeJS.Timeout): () => void**  
  Specialized method for tracking timeouts.  
  Returns a function that unregisters this timeout.

- **trackInterval(timerId: NodeJS.Timeout): () => void**  
  Specialized method for tracking intervals.  
  Returns a function that unregisters this interval.

- **setTimeout(callback: Function, ms: number): NodeJS.Timeout**  
  Creates and tracks a timeout. Returns the timeout ID.

- **setInterval(callback: Function, ms: number): NodeJS.Timeout**  
  Creates and tracks an interval. Returns the interval ID.

- **dispose(): void**  
  Disposes of all tracked resources by calling their cleanup functions.

#### Properties

- **disposed: boolean**  
  Returns whether this ResourceTracker has been disposed.

## Benefits

- **Prevents Memory Leaks**: All resources are properly cleaned up
- **Simplifies Code**: No need to manually track resources
- **Error Resilience**: Resources are cleaned up even in error paths
- **Developer Experience**: Reduces boilerplate cleanup code

## Implementation

The ResourceTracker is implemented as a simple class that keeps an array of cleanup functions. When the tracker is disposed, it calls all of these functions to clean up the resources.

```typescript
class ResourceTracker {
  private cleanupFunctions: Array<() => void> = [];
  private isDisposed = false;
  
  track(cleanup: () => void): () => void {
    this.cleanupFunctions.push(cleanup);
    return () => {
      const index = this.cleanupFunctions.indexOf(cleanup);
      if (index !== -1) {
        this.cleanupFunctions.splice(index, 1);
      }
    };
  }
  
  dispose(): void {
    if (this.isDisposed) return;
    
    for (const cleanup of this.cleanupFunctions) {
      try {
        cleanup();
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    }
    
    this.cleanupFunctions = [];
    this.isDisposed = true;
  }
}
```