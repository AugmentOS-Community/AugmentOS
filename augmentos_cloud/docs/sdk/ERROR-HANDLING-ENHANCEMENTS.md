# SDK Error Handling Enhancements

## Overview

This document outlines the improvements made to the AugmentOS SDK to prevent TPAs from crashing when receiving invalid data. The enhancements focus on robust validation, error isolation, and graceful recovery to ensure TPAs remain operational even when unexpected data is received.

## Key Improvements

### 1. Message Validation

We've added comprehensive message validation throughout the SDK:

- **Pre-Processing Validation**: All incoming messages are validated before processing
- **Type Checking**: Messages are verified to have the correct structure and type properties
- **Required Field Validation**: Essential fields are checked for existence and proper types
- **Schema Validation**: Different message types have specific validations for their expected structures

```typescript
private validateMessage(message: CloudToTpaMessage): boolean {
  // Handle ArrayBuffer case separately
  if (message instanceof ArrayBuffer) {
    return true;
  }
  
  // Check if message is null or undefined
  if (!message) {
    return false;
  }
  
  // Check if message has a type property
  if (!('type' in message)) {
    return false;
  }
  
  return true;
}
```

### 2. Error Isolation

To prevent errors in one component from crashing the entire TPA:

- **Nested Try/Catch Blocks**: Multiple layers of error handling to catch different types of failures
- **Handler Isolation**: Each event handler is executed in its own try/catch block
- **Logging**: Detailed error logs for debugging without allowing errors to propagate

```typescript
// Execute each handler in isolated try/catch
handlersArray.forEach(handler => {
  try {
    (handler as Handler<EventData<T>>)(data);
  } catch (handlerError) {
    console.error(`Error in handler for event '${String(event)}':`, handlerError);
    
    // Report the error but don't let it crash the app
    if (event !== 'error') {
      this.emitter.emit('error', new Error(
        `Handler error for event '${String(event)}': ${handlerError.message}`
      ));
    }
  }
});
```

### 3. Data Sanitization

Automatic sanitization of data to prevent invalid data from reaching TPA code:

- **Type Coercion**: Converting values to expected types when possible
- **Default Values**: Providing safe defaults for missing properties
- **Size Limits**: Enforcing reasonable limits on data sizes (e.g., bitmap data, text length)

```typescript
private sanitizeEventData(streamType: StreamType, data: unknown): unknown {
  try {
    // If data is null or undefined, return an empty object
    if (data === null || data === undefined) {
      return {};
    }
    
    // Type-specific validations and sanitization
    switch (streamType) {
      case StreamType.TRANSCRIPTION:
        if (typeof (data as TranscriptionData).text !== 'string') {
          return { 
            text: '', 
            isFinal: true, 
            startTime: Date.now(), 
            endTime: Date.now() 
          };
        }
        break;
      // Other cases...
    }
    
    return data;
  } catch (error) {
    console.error(`Error sanitizing ${streamType} data:`, error);
    return {}; // Safe fallback
  }
}
```

### 4. Binary Data Handling

Improved handling of binary data with safety checks:

- **Buffer Validation**: Ensuring binary buffers are non-empty and correctly structured
- **Memory Safety**: Preventing invalid buffer access that could crash the application
- **Type Checking**: Better discrimination between different binary message types

```typescript
private handleBinaryMessage(buffer: ArrayBuffer): void {
  try {
    // Safety check - only process if subscribed
    if (!this.subscriptions.has(StreamType.AUDIO_CHUNK)) {
      return;
    }
    
    // Validate buffer before processing
    if (!buffer || buffer.byteLength === 0) {
      this.events.emit('error', new Error('Received empty binary message'));
      return;
    }

    // Create a safety wrapped audio chunk
    const audioChunk: AudioChunk = {
      type: StreamType.AUDIO_CHUNK,
      timestamp: new Date(),
      arrayBuffer: buffer,
      sampleRate: 16000
    };

    this.events.emit(StreamType.AUDIO_CHUNK, audioChunk);
  } catch (error) {
    console.error('Error processing binary message:', error);
    this.events.emit('error', new Error(`Error processing binary message: ${error.message}`));
  }
}
```

### 5. WebSocket Connection Safety

Improved WebSocket connection management:

- **State Validation**: Checking WebSocket state before sending messages
- **Connection Timeout Handling**: Proper cleanup of connection timeouts
- **Reconnection Logic**: Better handling of reconnection attempts with error recovery
- **Error Reporting**: Clear error messages for connection issues

```typescript
// Connection error handler with descriptive messages
this.ws.on('close', (code: number, reason: string) => {
  const reasonStr = reason ? `: ${reason}` : '';
  this.events.emit('disconnected', `Connection closed (code: ${code})${reasonStr}`);
  this.handleReconnection();
});
```

### 6. Layout Display Safety

Enhanced error handling for display layouts:

- **Input Validation**: Validating all inputs to layout methods
- **Type Coercion**: Converting values to expected types when reasonable
- **Length Limits**: Warning or rejecting excessively large values that could cause performance issues
- **Error Recovery**: Graceful failures that don't crash the entire TPA

```typescript
// Validate layout data before sending
if (!layout) {
  throw new Error("Layout cannot be null or undefined");
}

if (!layout.layoutType) {
  throw new Error("Layout must have a layoutType property");
}

// Layout-specific validations
switch (layout.layoutType) {
  case LayoutType.TEXT_WALL:
    if (typeof (layout as TextWall).text !== 'string') {
      throw new Error("TextWall layout must have a text property");
    }
    // Ensure text is not too long
    if ((layout as TextWall).text.length > 1000) {
      console.warn("TextWall text is very long, this may cause performance issues");
    }
    break;
  // Other cases...
}
```

## Benefits

These improvements provide the following benefits:

1. **Improved Reliability**: TPAs remain operational even when receiving unexpected data
2. **Better Developer Experience**: More clear error messages help developers diagnose issues
3. **Reduced Support Burden**: Fewer crashes mean fewer support tickets and user complaints
4. **Enhanced Security**: Proper validation helps prevent potential security issues
5. **Performance Protection**: Size limits and validation prevent performance degradation

## Implementation

These error handling enhancements have been implemented in the following files:

1. `/packages/sdk/src/tpa/session/index.ts` - Core session handling
2. `/packages/sdk/src/tpa/session/events.ts` - Event handling and propagation
3. `/packages/sdk/src/tpa/session/layouts.ts` - Display layout management

## Future Improvements

While these changes significantly improve the SDK's error handling, additional enhancements could include:

1. **Schema Validation Library**: Integration with a validation library for more rigorous schema checking
2. **Telemetry**: Add telemetry to track error rates and common issues
3. **Circuit Breakers**: Implement circuit breakers to prevent repeated failures
4. **Recovery Strategies**: More sophisticated recovery strategies for different failure types
5. **Version-Specific Handling**: Better support for different message versions as the SDK evolves