# TPA Server Registration and Connection Management

## Overview

The TPA Server Registration System is a mechanism that allows Third-Party Applications (TPAs) to register their servers with AugmentOS Cloud. This system solves the critical issue of maintaining TPA connections when TPA servers restart, providing a seamless experience for users.

The system also manages WebSocket connections between AugmentOS Cloud and TPAs, handling server registration, WebSocket URL configuration, and session recovery across different deployment environments.

## Problems Solved

1. **Service Restart Recovery**: Without a registration system, when a TPA server restarts (due to deployment, crash, or maintenance), all active TPA sessions would disconnect and require manual user intervention to restart. This creates a poor user experience, especially for Smart Glasses users who may not have an easy way to restart TPAs.

2. **WebSocket URL Configuration**: TPAs need to connect to the cloud service using the correct WebSocket URL. This URL varies depending on the deployment environment (local development, Docker, Kubernetes, production), leading to connection issues and complexity.

3. **Double Protocol Issues**: WebSocket URLs with incorrect formats (e.g., `ws://http://localhost:8002/tpa-ws`) cause connection failures that are difficult to diagnose.

4. **Docker Service Name Resolution**: In containerized environments, services need to use internal service names instead of localhost, requiring environment-specific configuration.

## Solution

The TPA Server Registration and Connection Management System provides:

1. **Server Registration**: TPAs register their servers with the cloud, including webhook URLs
2. **Session Tracking**: Cloud tracks which servers are handling which user sessions
3. **Server Heartbeats**: TPAs send periodic heartbeats to confirm they're running
4. **Automatic Recovery**: When a TPA server restarts, it notifies the cloud, which triggers session recovery
5. **Environment-Aware URL Configuration**: Automatically selects the correct WebSocket URL based on the deployment environment
6. **URL Validation and Correction**: Detects and fixes malformed WebSocket URLs
7. **Container Environment Detection**: Automatically detects Docker/Kubernetes environments and uses appropriate internal service names

## Components

### 1. TPA Server Registry

A server-side registry that maintains information about registered TPA servers:

- Registration ID
- Package name
- API key
- Webhook URL
- Server URLs
- Active sessions
- Last seen timestamp

### 2. Registration Service

Handles the business logic of registering and managing TPA servers:

- Processing registration requests
- Handling heartbeats
- Managing session associations
- Triggering recovery when a server restarts

### 3. API Endpoints

RESTful endpoints for TPAs to interact with the registration system:

- `POST /api/tpa-server/register` - Register a TPA server
- `POST /api/tpa-server/heartbeat` - Send a heartbeat
- `POST /api/tpa-server/restart` - Notify of a server restart

### 4. WebSocket Integration

Integration with the WebSocket service to track session connections:

- Associate TPA sessions with registered servers
- Track when sessions disconnect
- Validate new TPA connections against registered servers

## Workflow

### Server Registration

1. TPA server starts up and calls `POST /api/tpa-server/register`
2. Cloud validates the request and creates a registration
3. Cloud returns a registration ID to the TPA

### Session Association

1. When a user starts a TPA, Cloud sends a session request webhook
2. TPA connects to Cloud via WebSocket with connection details
3. Cloud associates the session with the registered server
4. If the session exists in the registry, Cloud validates the connection

### Server Restart Recovery

1. When a TPA server restarts, it calls `POST /api/tpa-server/restart` with its registration ID
2. Cloud looks up all active sessions for that registration
3. For each session, Cloud sends a recovery webhook to the TPA server
4. TPA server reconnects to the existing sessions
5. Users experience minimal disruption

## Implementation Details

### TPA Server Model

The core data structure for tracking TPA servers:

```typescript
interface TpaServerRegistration {
  registrationId: string;
  packageName: string;
  apiKey: string;
  webhookUrl: string;
  serverUrls: string[];
  registeredAt: Date;
  lastSeen: Date;
  isActive: boolean;
  activeSessions: string[];
}
```

### Registration Request

```typescript
interface TpaServerRegistrationRequest {
  packageName: string;
  apiKey: string;
  webhookUrl: string;
  serverUrls: string;
}
```

### Registration Response

```typescript
interface TpaServerRegistrationResponse {
  success: boolean;
  registrationId?: string;
  error?: string;
}
```

### Heartbeat Request

```typescript
interface TpaServerHeartbeatRequest {
  registrationId: string;
}
```

## How to Implement in TPAs

### Server Registration

When your TPA server starts:

```typescript
// On server startup
async function registerTpaServer() {
  try {
    const response = await fetch('https://cloud.augmentos.org/api/tpa-server/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        packageName: 'org.example.myapp',
        apiKey: 'your-api-key',
        webhookUrl: 'https://your-tpa-server.com/webhook',
        serverUrls: 'wss://cloud.augmentos.org/tpa-ws,wss://dev.augmentos.org/tpa-ws'
      }),
    });
    
    const result = await response.json();
    if (result.success) {
      // Store the registration ID
      const registrationId = result.registrationId;
      console.log(`Server registered with ID: ${registrationId}`);
      
      // Start sending heartbeats
      startHeartbeats(registrationId);
      
      // Notify of restart if this is a restart
      notifyRestart(registrationId);
    }
  } catch (error) {
    console.error('Failed to register server:', error);
  }
}
```

### Heartbeats

Periodically send heartbeats to keep the registration active:

```typescript
function startHeartbeats(registrationId) {
  setInterval(async () => {
    try {
      await fetch('https://cloud.augmentos.org/api/tpa-server/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registrationId
        }),
      });
    } catch (error) {
      console.error('Failed to send heartbeat:', error);
    }
  }, 60000); // Every minute
}
```

### Notify of Restart

After a server restart, notify Cloud to recover sessions:

```typescript
async function notifyRestart(registrationId) {
  try {
    const response = await fetch('https://cloud.augmentos.org/api/tpa-server/restart', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        registrationId
      }),
    });
    
    const result = await response.json();
    console.log(`Recovered ${result.recoveredSessions} sessions`);
  } catch (error) {
    console.error('Failed to notify of restart:', error);
  }
}
```

### Handle Recovery Webhook

Implement a webhook handler for session recovery:

```typescript
app.post('/webhook', async (req, res) => {
  const webhook = req.body;
  
  if (webhook.type === 'session_recovery') {
    // Reconnect to the session
    connectToSession(webhook.sessionId, webhook.userId, webhook.augmentOSWebsocketUrl);
    
    res.json({ status: 'success' });
  } else {
    // Handle other webhook types...
  }
});
```

## WebSocket URL Configuration

The system uses environment-specific logic to determine the correct WebSocket URL for different deployment scenarios:

### For System Apps (internal services)

```typescript
// In a container environment (Docker, Kubernetes)
if (process.env.CONTAINER_ENVIRONMENT === 'true' || 
    process.env.CLOUD_HOST_NAME === 'cloud' ||
    process.env.PORTER_APP_NAME) {
    
    // Porter/Kubernetes environment
    if (process.env.PORTER_APP_NAME) {
        return `ws://${process.env.PORTER_APP_NAME}-cloud.default.svc.cluster.local:80/tpa-ws`;
    }
    
    // Docker Compose environment
    return 'ws://cloud/tpa-ws';
}

// Local development
return 'ws://localhost:8002/tpa-ws';
```

### For External TPAs

```typescript
// Production/staging
if (environment === 'production' || environment === 'staging') {
    return `wss://${PUBLIC_HOST_NAME}/tpa-ws`;
}

// Development fallback
return `wss://${PUBLIC_HOST_NAME || 'dev.augmentos.org'}/tpa-ws`;
```

### URL Validation and Correction

The SDK includes validation to prevent URL formatting errors:

```typescript
// Make sure the URL is correctly formatted to prevent double protocol issues
if (this.config.augmentOSWebsocketUrl) {
  try {
    const url = new URL(this.config.augmentOSWebsocketUrl);
    if (!['ws:', 'wss:'].includes(url.protocol)) {
      // Fix URLs with incorrect protocol (e.g., 'ws://http://host')
      const fixedUrl = this.config.augmentOSWebsocketUrl
        .replace(/^ws:\/\/http:\/\//, 'ws://');
      this.config.augmentOSWebsocketUrl = fixedUrl;
      console.warn(`⚠️ Fixed malformed WebSocket URL: ${fixedUrl}`);
    }
  } catch (error) {
    console.error(`⚠️ Invalid WebSocket URL format: ${this.config.augmentOSWebsocketUrl}`);
  }
}
```

## Benefits

- **Improved User Experience**: Users don't need to manually restart TPAs
- **Enhanced Reliability**: Sessions automatically recover after deployments
- **Simpler Development**: TPAs don't need to implement complex recovery logic
- **Better Monitoring**: Cloud can track the health of TPA servers
- **Multi-Environment Support**: TPAs can register with multiple cloud environments
- **Automatic URL Configuration**: WebSocket URLs are automatically determined based on environment
- **Error Prevention**: URL validation prevents common connection errors