# TPA Registration System Implementation Plan

**Author:** Isaiah Ballah (github: isaiahb)  
**Date:** March 25, 2025  
**Version:** 1.0  

## 1. Overview

This document outlines the implementation plan for a TPA (Third-Party Application) Registration System that will solve the critical issue of TPA server restarts requiring manual user intervention. When implemented, TPAs will be able to register with the AugmentOS Cloud when they start up, and the cloud will automatically recover affected user sessions.

## 2. Current Problem

When a TPA server restarts:
1. All active WebSocket connections to that TPA are lost
2. The cloud has no mechanism to detect the TPA has restarted
3. Users must manually restart the app from their glasses
4. Session state and context are lost between restarts

## 3. Solution Components

### 3.1 Server-Side Components

#### 3.1.1 TPA Registry Service

A new service to track TPA server registrations:

```typescript
// packages/cloud/src/services/core/tpa-registry.service.ts
import { logger } from '@augmentos/utils';
import { App } from '../../models/app.model';

export interface TpaRegistration {
  packageName: string;
  serverUrl: string;
  version: string;
  apiKey: string;
  capabilities?: string[];
  registrationTime: Date;
  lastHeartbeat: Date;
}

export class TpaRegistryService {
  private tpaRegistry: Map<string, TpaRegistration> = new Map();
  
  /**
   * Register a TPA server
   */
  async registerTpa(registration: Omit<TpaRegistration, 'registrationTime' | 'lastHeartbeat'>): Promise<boolean> {
    try {
      // Validate the TPA exists and the API key is correct
      const app = await App.findByPackageName(registration.packageName);
      if (!app) {
        logger.warn(`[tpa-registry] Registration failed: Package ${registration.packageName} not found`);
        return false;
      }
      
      // TODO: Implement proper API key validation
      // if (!app.validateApiKey(registration.apiKey)) {
      //   logger.warn(`[tpa-registry] Registration failed: Invalid API key for ${registration.packageName}`);
      //   return false;
      // }
      
      // Store the registration
      this.tpaRegistry.set(registration.packageName, {
        ...registration,
        registrationTime: new Date(),
        lastHeartbeat: new Date()
      });
      
      logger.info(`[tpa-registry] TPA ${registration.packageName} registered successfully`);
      
      // Trigger recovery of affected sessions
      this.recoverAffectedSessions(registration.packageName);
      
      return true;
    } catch (error) {
      logger.error(`[tpa-registry] Error registering TPA ${registration.packageName}:`, error);
      return false;
    }
  }
  
  /**
   * Update heartbeat for a registered TPA
   */
  updateHeartbeat(packageName: string): boolean {
    const registration = this.tpaRegistry.get(packageName);
    if (!registration) {
      return false;
    }
    
    registration.lastHeartbeat = new Date();
    return true;
  }
  
  /**
   * Get TPA registration information
   */
  getTpaRegistration(packageName: string): TpaRegistration | undefined {
    return this.tpaRegistry.get(packageName);
  }
  
  /**
   * Check if a TPA is registered and active
   */
  isTpaRegistered(packageName: string): boolean {
    const registration = this.tpaRegistry.get(packageName);
    if (!registration) {
      return false;
    }
    
    // Check if the last heartbeat is recent (within 30 seconds)
    const now = new Date();
    const heartbeatAge = now.getTime() - registration.lastHeartbeat.getTime();
    return heartbeatAge < 30000; // 30 seconds
  }
  
  /**
   * Recover affected sessions after a TPA server restart
   */
  private async recoverAffectedSessions(packageName: string): Promise<void> {
    // This will be implemented in a later step
  }
}

export const tpaRegistryService = new TpaRegistryService();
export default tpaRegistryService;
```

#### 3.1.2 TPA Registration API Endpoints

New REST endpoints for TPA registration:

```typescript
// packages/cloud/src/routes/tpa-registration.routes.ts
import express from 'express';
import tpaRegistryService from '../services/core/tpa-registry.service';
import { logger } from '@augmentos/utils';

const router = express.Router();

/**
 * Register a TPA server
 * POST /api/tpa/register
 */
router.post('/register', async (req, res) => {
  try {
    const { packageName, serverUrl, version, apiKey, capabilities } = req.body;
    
    // Validate required fields
    if (!packageName || !serverUrl || !version || !apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    // Register the TPA
    const success = await tpaRegistryService.registerTpa({
      packageName,
      serverUrl,
      version,
      apiKey,
      capabilities
    });
    
    if (success) {
      return res.status(200).json({ 
        success: true,
        message: 'TPA registered successfully'
      });
    } else {
      return res.status(400).json({ 
        success: false,
        error: 'Registration failed'
      });
    }
  } catch (error) {
    logger.error('[tpa-registration] Error in register endpoint:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * TPA heartbeat
 * POST /api/tpa/heartbeat
 */
router.post('/heartbeat', (req, res) => {
  try {
    const { packageName, apiKey } = req.body;
    
    // Validate required fields
    if (!packageName || !apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    // Update heartbeat
    const success = tpaRegistryService.updateHeartbeat(packageName);
    
    if (success) {
      return res.status(200).json({ 
        success: true 
      });
    } else {
      return res.status(404).json({ 
        success: false,
        error: 'TPA not registered'
      });
    }
  } catch (error) {
    logger.error('[tpa-registration] Error in heartbeat endpoint:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get TPA registration status
 * GET /api/tpa/status/:packageName
 */
router.get('/status/:packageName', (req, res) => {
  try {
    const { packageName } = req.params;
    const registration = tpaRegistryService.getTpaRegistration(packageName);
    
    if (registration) {
      // Don't send the API key back to clients
      const { apiKey, ...safeRegistration } = registration;
      
      return res.status(200).json({
        success: true,
        registered: true,
        active: tpaRegistryService.isTpaRegistered(packageName),
        registration: safeRegistration
      });
    } else {
      return res.status(200).json({
        success: true,
        registered: false
      });
    }
  } catch (error) {
    logger.error('[tpa-registration] Error in status endpoint:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;
```

#### 3.1.3 Session Recovery Integration

Extend the TPA Registry Service to recover affected sessions:

```typescript
/**
 * Recover affected sessions after a TPA server restart
 */
private async recoverAffectedSessions(packageName: string): Promise<void> {
  try {
    logger.info(`[tpa-registry] Recovering sessions for ${packageName}`);
    
    // Get all active sessions that had this TPA running
    const affectedSessions = sessionService.getSessionsWithTpa(packageName);
    
    if (affectedSessions.length === 0) {
      logger.info(`[tpa-registry] No affected sessions for ${packageName}`);
      return;
    }
    
    logger.info(`[tpa-registry] Found ${affectedSessions.length} affected sessions for ${packageName}`);
    
    // For each affected session, re-trigger the webhook to restart the TPA
    for (const session of affectedSessions) {
      try {
        // Check if the user still has an active session
        if (session.disconnectedAt && !sessionService.isItTimeToKillTheSession(session.sessionId)) {
          logger.info(`[tpa-registry] Session ${session.sessionId} is disconnected but still valid`);
          continue; // Skip disconnected sessions
        }
        
        // Restart the TPA for this session
        const tpaSessionId = await webSocketService.startAppSession(session, packageName);
        logger.info(`[tpa-registry] Restarted TPA ${packageName} for session ${session.sessionId}, new TPA session: ${tpaSessionId}`);
      } catch (error) {
        logger.error(`[tpa-registry] Error recovering session ${session.sessionId} for TPA ${packageName}:`, error);
      }
    }
    
    logger.info(`[tpa-registry] Recovery complete for ${packageName}`);
  } catch (error) {
    logger.error(`[tpa-registry] Error recovering sessions for ${packageName}:`, error);
  }
}
```

#### 3.1.4 Session Service Extension

Add a method to get sessions that had a specific TPA running:

```typescript
// In session.service.ts

/**
 * Get all sessions that had a specific TPA running
 */
getSessionsWithTpa(packageName: string): UserSession[] {
  const sessions: UserSession[] = [];
  
  for (const [, session] of this.activeSessions) {
    // Check if this session had the TPA in its active apps
    if (session.activeAppSessions.includes(packageName) || 
        session.loadingApps.has(packageName)) {
      sessions.push(session);
    }
  }
  
  return sessions;
}
```

### 3.2 SDK-Side Components

#### 3.2.1 TPA SDK Extensions

Update the SDK to support automatic registration:

```typescript
// packages/sdk/src/tpa/server/registration.ts
import axios from 'axios';
import { logger } from '@augmentos/utils';

export interface RegistrationOptions {
  packageName: string;
  apiKey: string;
  serverUrl?: string;
  version?: string;
  capabilities?: string[];
  cloudApiUrl?: string;
  heartbeatInterval?: number;
}

export class TpaRegistration {
  private options: Required<RegistrationOptions>;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isRegistered: boolean = false;
  
  constructor(options: RegistrationOptions) {
    // Set defaults for optional parameters
    this.options = {
      ...options,
      serverUrl: options.serverUrl || `http://localhost:3000`,
      version: options.version || '1.0.0',
      capabilities: options.capabilities || [],
      cloudApiUrl: options.cloudApiUrl || 'https://dev.augmentos.cloud/api',
      heartbeatInterval: options.heartbeatInterval || 15000 // 15 seconds
    };
  }
  
  /**
   * Register the TPA with AugmentOS Cloud
   */
  async register(): Promise<boolean> {
    try {
      const response = await axios.post(`${this.options.cloudApiUrl}/tpa/register`, {
        packageName: this.options.packageName,
        serverUrl: this.options.serverUrl,
        version: this.options.version,
        apiKey: this.options.apiKey,
        capabilities: this.options.capabilities
      });
      
      if (response.data.success) {
        logger.info(`[tpa-registration] Registered ${this.options.packageName} successfully`);
        this.isRegistered = true;
        this.startHeartbeat();
        return true;
      } else {
        logger.error(`[tpa-registration] Registration failed:`, response.data.error);
        return false;
      }
    } catch (error) {
      logger.error(`[tpa-registration] Error registering TPA:`, error);
      return false;
    }
  }
  
  /**
   * Start sending heartbeat signals
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    this.heartbeatTimer = setInterval(async () => {
      try {
        await axios.post(`${this.options.cloudApiUrl}/tpa/heartbeat`, {
          packageName: this.options.packageName,
          apiKey: this.options.apiKey
        });
      } catch (error) {
        logger.error(`[tpa-registration] Heartbeat failed:`, error);
        // Re-register if heartbeat fails
        if (this.isRegistered) {
          this.isRegistered = false;
          this.register().catch(err => {
            logger.error(`[tpa-registration] Re-registration failed:`, err);
          });
        }
      }
    }, this.options.heartbeatInterval);
  }
  
  /**
   * Stop heartbeat and deregister
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.isRegistered = false;
  }
}
```

#### 3.2.2 TPA Server Integration

Integrate the registration with the TPA server:

```typescript
// packages/sdk/src/tpa/server/index.ts
import { TpaRegistration } from './registration';

export class TpaServer {
  private registration: TpaRegistration | null = null;
  
  // ... existing TPA server code ...
  
  /**
   * Initialize the TPA server
   */
  async initialize(options: TpaServerOptions): Promise<void> {
    // ... existing initialization code ...
    
    // Set up TPA registration
    this.registration = new TpaRegistration({
      packageName: options.packageName,
      apiKey: options.apiKey,
      serverUrl: options.publicUrl || `http://localhost:${options.port}`,
      version: options.version,
      capabilities: options.capabilities,
      cloudApiUrl: options.cloudApiUrl
    });
    
    // Register with AugmentOS Cloud
    await this.registration.register();
    
    // ... rest of initialization ...
  }
  
  /**
   * Stop the TPA server
   */
  async stop(): Promise<void> {
    // Stop the registration heartbeat
    if (this.registration) {
      this.registration.stop();
    }
    
    // ... existing stop code ...
  }
}
```

## 4. Implementation Steps

### 4.1 Phase 1: Core Infrastructure (Week 1)

1. Create the TPA Registry Service
   - Implement basic registration tracking
   - Add API endpoints for registration and heartbeat

2. Update Session Service
   - Add method to find sessions by TPA
   - Ensure proper state tracking for TPAs

### 4.2 Phase 2: Session Recovery (Week 1-2)

1. Implement recovery logic
   - Add recoverAffectedSessions method
   - Test recovery flow with manual restarts

2. Update WebSocket Service
   - Ensure proper handling of reconnected TPAs
   - Add reconnection status tracking

### 4.3 Phase 3: SDK Integration (Week 2)

1. Implement SDK Registration components
   - Create registration client
   - Add heartbeat mechanism

2. Update TPA Server
   - Integrate registration on startup
   - Add proper cleanup on shutdown

### 4.4 Phase 4: Testing and Refinement (Week 3)

1. Comprehensive testing
   - Test with various TPA types
   - Test different failure scenarios
   - Validate recovery behavior

2. Performance optimization
   - Optimize recovery parallelism
   - Add rate limiting for registration
   - Improve error handling and retry logic

## 5. Integration Points

### 5.1 Express App Integration

In `app.ts`, add the new routes:

```typescript
import tpaRegistrationRoutes from './routes/tpa-registration.routes';

// ... existing imports and setup ...

// TPA Registration Routes
app.use('/api/tpa', tpaRegistrationRoutes);
```

### 5.2 WebSocket Service Integration

Add TPA registry service to the WebSocket service:

```typescript
// In websocket.service.ts

import tpaRegistryService from './tpa-registry.service';

// In startAppSession method
async startAppSession(userSession: UserSession, packageName: string): Promise<string> {
  // ... existing code ...
  
  // Check if the TPA is registered
  if (!tpaRegistryService.isTpaRegistered(packageName) && !app.isSystemApp) {
    userSession.logger.warn(`[websocket.service] TPA ${packageName} is not registered, continuing anyway`);
    // We still continue, as the webhook might succeed
  }
  
  // ... rest of method ...
}
```

### 5.3 SDK Package Dependencies

Update the SDK package.json:

```json
{
  "dependencies": {
    "axios": "^0.27.2",
    "@augmentos/utils": "^1.0.0"
  }
}
```

## 6. Testing Plan

### 6.1 Unit Tests

1. TPA Registry Service tests
   - Test registration flow
   - Test heartbeat mechanism
   - Test session recovery logic

2. API endpoint tests
   - Test registration endpoint
   - Test heartbeat endpoint
   - Test status endpoint

### 6.2 Integration Tests

1. SDK Registration integration
   - Test automatic registration
   - Test heartbeat mechanism
   - Test reconnection behavior

2. Recovery flow tests
   - Test recovery after server restart
   - Test recovery with multiple active sessions
   - Test recovery with edge cases (disconnected sessions)

### 6.3 End-to-End Tests

1. Real-world scenario tests
   - Start TPA, connect users, restart TPA
   - Verify automatic recovery
   - Verify session state preservation

## 7. Rollout Plan

### 7.1 Development Environment

1. Implement and test in development
2. Verify with system TPAs
3. Test with multiple user sessions

### 7.2 Staging Environment

1. Deploy to staging
2. Monitor for issues
3. Test with production-like load

### 7.3 Production Environment

1. Roll out to production
2. Monitor closely for 24-48 hours
3. Be prepared to rollback if issues occur

## 8. Success Metrics

The implementation will be considered successful if:

1. TPAs automatically reconnect after server restarts without user intervention
2. Recovery is completed within 5 seconds of TPA registration
3. No data loss occurs during the recovery process
4. System TPAs and user TPAs both benefit from the recovery mechanism
5. Registration adds less than 100ms of overhead to TPA startup

## 9. Future Enhancements

1. Persistent registration store (database backed)
2. More sophisticated API key validation
3. Registration dashboard for administrators
4. Proactive health checks for registered TPAs
5. Advanced capabilities negotiation