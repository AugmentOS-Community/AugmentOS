# Connection Health Monitoring System

## Overview

The Connection Health Monitoring system is a robust solution for maintaining healthy WebSocket connections between AugmentOS Cloud, smart glasses clients, and Third-Party Applications (TPAs). This system ensures that connections remain active, prevents stale connections, and provides visibility into the system's health.

## Problem

WebSocket connections can become stale or hang without proper supervision, leading to several issues:

1. **Ghost Connections**: Connections that appear active on the server but have actually disconnected on the client side
2. **Resource Wastage**: Stale connections consuming server resources unnecessarily
3. **Undetected Failures**: Connection issues that are not properly identified and logged
4. **Reliability Issues**: Users experiencing connectivity problems without clear indications or recovery paths

## Solution

The Connection Health Monitoring system implements the following features:

1. **WebSocket Ping/Pong**: Regular heartbeats to verify connection liveness
2. **Activity Tracking**: Monitoring of connection activity timestamps
3. **Timeout Detection**: Automatic identification and closure of stale connections
4. **Health Statistics**: Regular logging of system health metrics
5. **Graceful Recovery**: Clean handling of connection failures and reconnections

## Components

### 1. Health Monitor Service

A centralized service that coordinates connection health monitoring:

- Maintains connection registries for glasses and TPAs
- Sends periodic pings to verify connection health
- Closes stale connections after timeout periods
- Tracks and logs system health statistics

### 2. WebSocket Service Integration

The health monitor is integrated with the WebSocket service:

- Registers new connections for monitoring
- Updates activity timestamps on any connection activity
- Handles ping/pong events for connection verification
- Coordinates clean disconnection and reconnection

## Implementation Details

### Heartbeat Mechanism

The system sends periodic WebSocket ping frames to verify connection health:

```typescript
private sendHeartbeats(): void {
  // Send ping to all connections
  for (const ws of this.connections.keys()) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.ping();
      } catch (error) {
        logger.error('Error sending ping:', error);
      }
    }
  }
}
```

### Activity Tracking

Each connection's activity is tracked to detect stale connections:

```typescript
// Update activity timestamp when data is received
ws.on('message', () => {
  healthMonitorService.updateActivity(ws);
});

// Update activity when pong is received
ws.on('pong', () => {
  healthMonitorService.updateActivity(ws);
});
```

### Connection Timeout Detection

Stale connections are identified and closed automatically:

```typescript
private checkConnectionTimeouts(): void {
  const now = Date.now();
  const timeoutThreshold = now - CONNECTION_TIMEOUT_MS;
  
  for (const [ws, lastSeen] of this.connections.entries()) {
    if (lastSeen < timeoutThreshold) {
      logger.warn('Connection timed out, closing');
      ws.terminate();
      this.connections.delete(ws);
    }
  }
}
```

### System Health Statistics

Regular logging of system health metrics:

```typescript
private logSystemStats(): void {
  const activeSessions = sessionService.getSessionCount();
  const activeConnections = this.connections.size;
  
  logger.info(`System Stats: 
    - Active Sessions: ${activeSessions}
    - Active Connections: ${activeConnections}
  `);
}
```

## Configuration Settings

The health monitoring system is configurable through environment variables:

- `HEARTBEAT_INTERVAL_MS`: How often to send ping frames (default: 15000 ms)
- `CONNECTION_TIMEOUT_MS`: Time without activity before considering a connection stale (default: 45000 ms)
- `STATS_INTERVAL_MS`: How often to log system statistics (default: 60000 ms)

## Benefits

The Connection Health Monitoring system provides several key benefits:

1. **Improved Reliability**: Quicker detection of connection issues
2. **Resource Optimization**: Automatic cleanup of stale connections
3. **Better Visibility**: Regular health statistics for monitoring
4. **Proactive Management**: Early detection of potential issues
5. **Enhanced User Experience**: Faster connection recovery

## Future Improvements

Planned enhancements for the health monitoring system:

1. **Detailed Metrics**: More granular statistics on connection health
2. **Alert System**: Automatic alerts for persistent connection issues
3. **Client-Side Monitoring**: Enhanced client-side connection health reporting
4. **Predictive Analysis**: Identifying patterns that may lead to connection issues
5. **Graduated Reconnection Strategy**: More sophisticated reconnection approaches based on failure patterns