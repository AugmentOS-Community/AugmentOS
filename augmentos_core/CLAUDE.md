# AugmentOS Core Development Guide

## Build Commands
- `./gradlew build` - Full project build
- `./gradlew assembleDebug` - Build debug APK
- `./gradlew test` - Run unit tests
- `./gradlew androidTest` - Run instrumentation tests

## Environment Setup
- Java SDK 17 required
- AugmentOS_Core depends on "SmartGlassesManager" repo being adjacent

## Code Style Guidelines
- Classes: PascalCase (e.g., `WebSocketManager`)
- Methods: camelCase (e.g., `isConnected()`)
- Constants: UPPER_SNAKE_CASE (e.g., `MAX_RETRY_ATTEMPTS`)
- Member variables: camelCase with m prefix (e.g., `mService`)
- Indentation: 2 spaces
- Javadoc comments for public methods and classes

## Error Handling
- Log errors with `Log.e(TAG, "Error message", e)`
- Use callbacks for asynchronous error propagation
- Handle all checked exceptions
- Provide user feedback for permissions issues

## Architecture
- Service-based design with `AugmentosService` as main component
- Fragment-based UI with Navigation Component
- EventBus for component communication
- WebSocket for server communication