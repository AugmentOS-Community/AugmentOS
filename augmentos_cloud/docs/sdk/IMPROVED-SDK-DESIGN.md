# Improved AugmentOS SDK Design

**Author:** Isaiah Ballah (github: isaiahb)  
**Date:** March 25, 2025  
**Version:** 1.1  

## 1. Introduction

Based on our analysis of the AugmentOS platform and its limitations, this document proposes a comprehensive redesign of the AugmentOS SDK. Our goal is to create a more reliable, intuitive, and developer-friendly SDK that works within the platform's constraints while minimizing common errors and simplifying development.

## 2. Key Design Principles

1. **Automatic Resource Management**: Eliminate manual cleanup through automatic tracking and disposal
2. **Fail-Safe Design**: Make it difficult or impossible to introduce common bugs
3. **Declarative API**: Emphasize intent over implementation details
4. **Progressive Disclosure**: Simple defaults with optional advanced customization
5. **Error Resilience**: Built-in handling for common failure cases

## 3. Core Architecture

### 3.1 Simplified Component Structure

```
AugmentOS SDK
│
├── TpaApp               # Main application container
│   ├── EventSystem      # Handles all event subscriptions
│   ├── DisplaySystem    # Manages all display operations
│   ├── StateManager     # Handles session state
│   └── ResourceTracker  # Automatic resource management
│
└── Utilities
    ├── TextFormatter   # Text wrapping, truncation
    ├── AudioProcessor  # Audio handling simplified
    ├── Diagnostics     # Debug helpers
    └── TypeGuards      # Runtime type safety
```

### 3.2 TpaApp - The Application Container

Instead of separate TpaServer and TpaSession classes, we unify the interface with a single TpaApp class:

```typescript
// Creating a TPA becomes as simple as:
const app = new TpaApp({
  packageName: "com.example.myapp",
  apiKey: "your_api_key"
});

app.onSession((context) => {
  // Configure app for this session
  context.display.showTextWall("Hello, world!");
  
  // Listen for events with automatic cleanup
  context.events.transcription.listen((transcript) => {
    context.display.showTextWall(`You said: ${transcript.text}`);
  });
});

// Start listening for sessions
app.start();
```

## 4. Automatic Resource Management

The core improvement is automatic resource management through JavaScript's garbage collection and explicit resource tracking:

```typescript
// Internal ResourceTracker class
class ResourceTracker {
  private timers = new Set<NodeJS.Timeout>();
  private cleanupFns = new Set<() => void>();
  
  // Automatically track timers
  setTimeout(callback: Function, ms: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, ms);
    this.timers.add(timer);
    return timer;
  }
  
  setInterval(callback: Function, ms: number): NodeJS.Timeout {
    const timer = setInterval(callback, ms);
    this.timers.add(timer);
    return timer;
  }
  
  clearTimeout(timer: NodeJS.Timeout): void {
    clearTimeout(timer);
    this.timers.delete(timer);
  }
  
  clearInterval(timer: NodeJS.Timeout): void {
    clearInterval(timer);
    this.timers.delete(timer);
  }
  
  // Register any cleanup function
  registerCleanup(cleanup: () => void): void {
    this.cleanupFns.add(cleanup);
  }
  
  // Clean up all resources
  dispose(): void {
    // Clear all timers
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    
    // Run all cleanup functions
    for (const cleanup of this.cleanupFns) {
      try {
        cleanup();
      } catch (error) {
        console.error("Error during cleanup:", error);
      }
    }
    this.cleanupFns.clear();
  }
}
```

## 5. Simplified Event System

Replace the current callback-based event system with a simpler subscription model:

```typescript
class EventListener<T> {
  private listeners = new Set<(data: T) => void>();
  private subscribed = false;
  
  constructor(
    private eventType: string,
    private subscribe: (type: string) => void,
    private resourceTracker: ResourceTracker
  ) {}
  
  listen(callback: (data: T) => void): void {
    // Subscribe to event type if this is the first listener
    if (this.listeners.size === 0 && !this.subscribed) {
      this.subscribe(this.eventType);
      this.subscribed = true;
    }
    
    this.listeners.add(callback);
  }
  
  emit(data: T): void {
    for (const listener of this.listeners) {
      try {
        listener(data);
      } catch (error) {
        console.error(`Error in ${this.eventType} listener:`, error);
      }
    }
  }
  
  // Automatically called during cleanup
  dispose(): void {
    this.listeners.clear();
    this.subscribed = false;
  }
}

// Usage in EventSystem
class EventSystem {
  readonly transcription = new EventListener<TranscriptionData>(
    StreamType.TRANSCRIPTION,
    this.subscribe.bind(this),
    this.resourceTracker
  );
  
  readonly buttonPress = new EventListener<ButtonPress>(
    StreamType.BUTTON_PRESS,
    this.subscribe.bind(this),
    this.resourceTracker
  );
  
  readonly phoneNotification = new EventListener<PhoneNotification>(
    StreamType.PHONE_NOTIFICATION,
    this.subscribe.bind(this),
    this.resourceTracker
  );
  
  // More event types...
}
```

## 6. Improved Display System

Simplify layout management while respecting platform constraints:

```typescript
class DisplaySystem {
  constructor(
    private sessionId: string,
    private packageName: string,
    private sendMessage: (message: any) => void,
    private resourceTracker: ResourceTracker
  ) {}
  
  // Simple display methods
  showTextWall(text: string, options: DisplayOptions = {}): void {
    // Format text appropriately
    const formattedText = this.formatText(text, options);
    
    this.showLayout({
      layoutType: LayoutType.TEXT_WALL,
      text: formattedText
    }, options);
  }
  
  showReferenceCard(title: string, text: string, options: DisplayOptions = {}): void {
    // Format text appropriately
    const formattedText = this.formatText(text, options);
    
    this.showLayout({
      layoutType: LayoutType.REFERENCE_CARD,
      title: title,
      text: formattedText
    }, options);
  }
  
  // More display methods for other layout types...
  
  // Internal formatting helper
  private formatText(text: string, options: DisplayOptions): string {
    // Get appropriate line width (default = 30)
    const lineWidth = options.lineWidth || 
      (options.isChineseOrJapanese ? 10 : 30);
    
    // Apply wrapping and truncation
    return wrapText(text, lineWidth, options.maxLines);
  }
  
  // Core display method
  private showLayout(layout: Layout, options: DisplayOptions = {}): void {
    const displayRequest: DisplayRequest = {
      type: TpaToCloudMessageType.DISPLAY_REQUEST,
      sessionId: this.sessionId,
      packageName: this.packageName,
      layout,
      view: options.view || ViewType.MAIN,
      durationMs: options.durationMs || 10000,  // Default 10 seconds
      timestamp: new Date()
    };
    
    this.sendMessage(displayRequest);
  }
  
  // Debounced display for rapidly changing content
  createDebouncedDisplay(defaultOptions: DisplayOptions = {}): DebouncedDisplay {
    return new DebouncedDisplay(this, this.resourceTracker, defaultOptions);
  }
}

// Helper for frequent updates (like transcription)
class DebouncedDisplay {
  private timer: NodeJS.Timeout | null = null;
  private lastSentTime = 0;
  
  constructor(
    private display: DisplaySystem,
    private resourceTracker: ResourceTracker,
    private defaultOptions: DisplayOptions = {}
  ) {}
  
  showTextWall(text: string, options: DisplayOptions = {}): void {
    const debounceDelay = options.debounceMs || 300;
    const now = Date.now();
    const mergedOptions = { ...this.defaultOptions, ...options };
    
    // Clear any existing timer
    if (this.timer) {
      this.resourceTracker.clearTimeout(this.timer);
      this.timer = null;
    }
    
    // Send immediately if enough time has passed
    if (now - this.lastSentTime >= debounceDelay) {
      this.display.showTextWall(text, mergedOptions);
      this.lastSentTime = now;
    } else {
      // Otherwise, debounce
      this.timer = this.resourceTracker.setTimeout(() => {
        this.display.showTextWall(text, mergedOptions);
        this.lastSentTime = Date.now();
      }, debounceDelay);
    }
  }
}
```

## 7. Session State Management

Create a simple state management system:

```typescript
class StateManager<T extends object> {
  private state: T;
  
  constructor(initialState: T) {
    this.state = { ...initialState };
  }
  
  // Get the current state
  getState(): Readonly<T> {
    return Object.freeze({ ...this.state });
  }
  
  // Update the state
  updateState(partialState: Partial<T>): void {
    this.state = { ...this.state, ...partialState };
  }
}

// Usage example
const state = new StateManager({
  counter: 0,
  isListening: false,
  lastTranscript: ""
});

// Update state
state.updateState({ counter: state.getState().counter + 1 });
```

## 8. Utility Functions

Provide useful utility functions for common tasks:

```typescript
// Text formatter for notifications
export function formatNotificationText(notification: PhoneNotification): string {
  const prefix = notification.title ? `${notification.title}: ` : "";
  let content = notification.content
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ');
    
  if (content.length > 100) {
    content = content.substring(0, 97) + '...';
  }
  
  return prefix + content;
}

// Debounce function for general use
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  resourceTracker: ResourceTracker
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function(...args: Parameters<T>) {
    if (timeout) {
      resourceTracker.clearTimeout(timeout);
    }
    
    timeout = resourceTracker.setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };
}

// Audio chunk converter for easier audio processing
export function convertAudioChunk(chunk: AudioChunk): Float32Array {
  // Convert binary audio data to Float32Array for easier processing
  // Implementation details depend on audio format
}
```

## 9. Simplified Connection Handling

Manage WebSocket connections with better error handling:

```typescript
class ConnectionManager {
  private ws: WebSocket | null = null;
  private isConnecting = false;
  private hasConnected = false;
  
  constructor(
    private url: string,
    private onOpen: () => void,
    private onMessage: (data: any) => void,
    private onClose: () => void,
    private onError: (error: Error) => void
  ) {}
  
  connect(): void {
    if (this.ws || this.isConnecting) return;
    
    this.isConnecting = true;
    
    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        this.isConnecting = false;
        this.hasConnected = true;
        this.onOpen();
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString());
          this.onMessage(data);
        } catch (error) {
          this.onError(new Error("Failed to parse message"));
        }
      };
      
      this.ws.onclose = () => {
        this.isConnecting = false;
        this.ws = null;
        this.onClose();
      };
      
      this.ws.onerror = (event) => {
        this.isConnecting = false;
        this.onError(new Error("WebSocket error"));
      };
    } catch (error) {
      this.isConnecting = false;
      this.onError(error instanceof Error ? error : new Error("Failed to connect"));
    }
  }
  
  send(data: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }
    
    if (typeof data === 'object') {
      this.ws.send(JSON.stringify(data));
    } else {
      this.ws.send(data);
    }
  }
  
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
```

## 10. Example Usage Patterns

### 10.1 Basic TPA Example

```typescript
// Create a simple TPA
const myApp = new TpaApp({
  packageName: "com.example.simpleapp",
  apiKey: "your_api_key"
});

// Handle sessions
myApp.onSession((context) => {
  // Show welcome message
  context.display.showReferenceCard(
    "Simple App", 
    "Welcome! I'll repeat what you say.",
    { durationMs: 5000 }
  );
  
  // Create app state
  const state = new StateManager({
    messageCount: 0
  });
  
  // Listen for transcriptions
  context.events.transcription.listen((data) => {
    if (data.isFinal) {
      // Increment message counter
      const newCount = state.getState().messageCount + 1;
      state.updateState({ messageCount: newCount });
      
      // Display the transcription
      context.display.showReferenceCard(
        `Message #${newCount}`, 
        data.text,
        { durationMs: 8000 }
      );
    }
  });
  
  // Listen for button presses
  context.events.buttonPress.listen((data) => {
    context.display.showTextWall(
      `Button ${data.button} pressed!`,
      { durationMs: 3000 }
    );
  });
});

// Start the app
myApp.start();
```

### 10.2 Transcription Handling Example

```typescript
// Example: Transcription handling with debouncing
context.events.transcription.listen((data) => {
  // Create debounced display for transcriptions
  const debouncedDisplay = context.display.createDebouncedDisplay({
    durationMs: data.isFinal ? 10000 : 3000  // Longer display for final transcripts
  });
  
  // Show transcription with appropriate formatting
  debouncedDisplay.showTextWall(data.text, {
    lineWidth: 30,
    maxLines: 3,
    debounceMs: 400  // Only update every 400ms for partial transcripts
  });
  
  // For final transcripts, maybe log or process the text
  if (data.isFinal) {
    console.log(`Final transcript: ${data.text}`);
  }
});
```

### 10.3 Notification Handling Example

```typescript
// Example: Notification handling with filtering
// Create a list of apps to ignore
const appBlacklist = ['youtube', 'maps', 'settings'];

context.events.phoneNotification.listen((notification) => {
  // Skip blacklisted apps
  if (appBlacklist.includes(notification.app.toLowerCase())) {
    return;
  }
  
  // Format notification for display
  const title = notification.app;
  const text = formatNotificationText(notification);
  
  // Show notification
  context.display.showReferenceCard(title, text, {
    durationMs: 8000
  });
});
```

## 11. Implementation Strategy

### 11.1 Phase 1: Core Infrastructure (2-3 weeks)

1. Implement ResourceTracker
2. Create ConnectionManager
3. Develop TpaApp container

### 11.2 Phase 2: Event and Display Systems (2-3 weeks)

1. Implement EventSystem with EventListeners
2. Create DisplaySystem with formatting helpers
3. Add DebouncedDisplay implementation

### 11.3 Phase 3: Utilities and State (1-2 weeks)

1. Implement utility functions
2. Create StateManager
3. Add type definitions and guards

### 11.4 Phase 4: Testing and Documentation (1-2 weeks)

1. Create comprehensive test suite
2. Write developer documentation
3. Develop example TPAs

## 12. Migration Strategy

To ensure a smooth transition for existing TPAs:

1. **Provide compatibility layer**: Allow existing TPAs to continue working
2. **Create migration guide**: Document how to update TPAs to the new SDK
3. **Provide automated migration tools**: Help convert common patterns
4. **Version strategy**: Release as major version bump

## 13. Conclusion

This SDK redesign addresses the key pain points in the current implementation while working within the platform constraints. By focusing on automatic resource management, simplified APIs, and helpful utilities, we can dramatically improve the developer experience and reduce common bugs.

The new design emphasizes developer productivity and application reliability, making it easier to build robust TPAs while significantly reducing the amount of boilerplate code required. By hiding implementation details behind intuitive interfaces, developers can focus on creating great experiences rather than managing technical complexity.