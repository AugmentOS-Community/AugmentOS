# AugHog - PostHog Analytics for AugmentOS

AugHog is a Third-Party Application (TPA) for AugmentOS smart glasses that displays PostHog analytics data in real-time. It's also a demonstration of the enhanced AugmentOS SDK features including automatic resource tracking, improved error handling, environment-aware connection management, and the new DisplayManager.

## Features

- Displays real-time PostHog analytics on smart glasses
- Shows active user counts and trends
- Tracks daily event totals
- Lists top events by frequency
- Provides dashboard metrics for quick reference
- Refreshes data automatically at regular intervals
- Supports manual refresh via button press

## Setup

1. Clone the AugmentOS repository
2. Copy `.env.example` to `.env` and add your PostHog API credentials
3. Install dependencies:
   ```bash
   bun install
   ```
4. Start the TPA:
   ```bash
   bun run dev
   ```

## Configuration

Edit the `.env` file to configure AugHog. A more comprehensive example is provided in `.env.example`:

```
# PostHog API Configuration
POSTHOG_API_KEY=your_api_key_here
POSTHOG_API_HOST=https://app.posthog.com
POSTHOG_PROJECT_ID=your_project_id_here

# AugmentOS TPA Configuration
TPA_API_KEY=your_tpa_api_key_here
TPA_PACKAGE_NAME=org.augmentos.aughog
SERVER_PORT=3456

# Environment Configuration
NODE_ENV=development

# Connection Configuration
CLOUD_HOST_NAME=localhost:8002
# For Docker: CLOUD_HOST_NAME=cloud and CONTAINER_ENVIRONMENT=true
```

## Usage

1. Start the AugHog TPA
2. The TPA will register with AugmentOS Cloud
3. Start the AugHog app on your smart glasses
4. View real-time analytics in your glasses display
5. Press the Menu button to manually refresh data

## Display Modes

AugHog uses two display modes:

1. **Main View**: Shows detailed analytics including:
   - Active user count with trend percentage
   - Today's total events
   - Top 5 events with counts
   - Last update timestamp

2. **Dashboard View**: Shows quick reference metrics:
   - Active user count
   - Today's event count

## Implementation Highlights

AugHog demonstrates several key features of the enhanced AugmentOS SDK:

### 1. Automatic Resource Tracking

The TPA uses automatic resource tracking for clean management of:
- Timers for data refresh
- Event handler subscriptions
- WebSocket connections

### 2. Environment-Aware Connection Management

AugHog automatically detects and configures the correct WebSocket URL based on the environment:

```typescript
// Determine the WebSocket URL based on environment
const CLOUD_HOST_NAME = process.env.CLOUD_HOST_NAME || 'localhost:8002';
let wsUrl: string;

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

// Create TPA server with environment-aware configuration
const tpaServer = new TpaServer({
  packageName: PACKAGE_NAME,
  apiKey: API_KEY,
  augmentOSWebsocketUrl: wsUrl,
  // Register with multiple environments for automatic recovery
  serverUrls: 'wss://dev.augmentos.org/tpa-ws,wss://cloud.augmentos.org/tpa-ws'
});
```

### 3. Error Handling

All display updates use the enhanced error handling:

```typescript
function updateSessionDisplay(session: TpaSession): void {
  try {
    // Display update code...
  } catch (error) {
    logger.error(`Error updating display for session:`, error);
    // Error won't crash the TPA
  }
}
```

### 4. URL Validation and Correction

The SDK automatically validates and corrects WebSocket URLs, preventing common connection errors:

```typescript
// Make sure the URL is correctly formatted to prevent double protocol issues
if (this.config.augmentOSWebsocketUrl) {
  try {
    const url = new URL(this.config.augmentOSWebsocketUrl);
    if (!['ws:', 'wss:'].includes(url.protocol)) {
      // Fix URLs with incorrect protocol (e.g., 'ws://http://host')
      const fixedUrl = this.config.augmentOSWebsocketUrl.replace(/^ws:\/\/http:\/\//, 'ws://');
      this.config.augmentOSWebsocketUrl = fixedUrl;
      console.warn(`⚠️ Fixed malformed WebSocket URL: ${fixedUrl}`);
    }
  } catch (error) {
    console.error(`⚠️ Invalid WebSocket URL format: ${this.config.augmentOSWebsocketUrl}`);
  }
}
```

### 5. Display Guidelines

AugHog follows best practices for smart glasses display:
- Concise, formatted text for readability
- Appropriate update frequency (respecting throttling)
- Proper use of dashboard vs. main views
- Simple text-only layouts optimized for glasses

## API Endpoints

- `GET /health`: Returns server status including:
  - Active sessions count
  - Last data update time
  - PostHog configuration status

## License

AugHog is a proprietary example application for AugmentOS.