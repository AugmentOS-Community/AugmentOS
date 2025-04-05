# TPA Server Registration System

**Author:** Isaiah Ballah (github: isaiahb)  
**Date:** March 25, 2025  
**Version:** 1.1  

## 1. Overview

This document outlines the design for the TPA Server Registration System, a critical component of the improved AugmentOS SDK. This system enables TPAs to register with multiple AugmentOS Cloud instances when they start up, allowing for automatic recovery of user sessions when TPA servers restart.

## 2. Core Requirements

1. **Multi-Environment Support**: Register with multiple cloud environments simultaneously (dev, staging, prod)
2. **Automatic Session Recovery**: Enable cloud to reconnect active user sessions after TPA restart
3. **Health Monitoring**: Provide regular heartbeats to indicate TPA server health
4. **Configurable**: Support different registration settings for different environments
5. **Resilient**: Handle registration failures gracefully

## 3. Design

### 3.1 Registration Configuration

```typescript
interface RegistrationConfig {
  // TPA information
  packageName: string;
  apiKey: string;
  version: string;
  
  // Registration targets - comma-separated list of server URLs
  // Example: "localhost:8002,dev.augmentos.org,prod.augmentos.cloud"
  serverUrls: string;
  
  // Registration settings
  heartbeatIntervalMs?: number; // Heartbeat interval (default: 30000ms)
  maxRetries?: number;         // Max registration retry attempts (default: 5)
  retryDelayMs?: number;       // Delay between retries (default: 5000ms)
}
```

### 3.2 TpaRegistrationManager

```typescript
class TpaRegistrationManager {
  private serverRegistrations = new Map<string, ServerRegistration>();
  private heartbeatIntervals = new Map<string, NodeJS.Timeout>();
  
  constructor(
    private config: RegistrationConfig,
    private resourceTracker: ResourceTracker
  ) {
    // Parse server URLs
    const servers = config.serverUrls.split(',').map(url => url.trim());
    
    // Initialize server registrations
    for (const serverUrl of servers) {
      this.serverRegistrations.set(serverUrl, {
        serverUrl,
        registered: false,
        lastHeartbeat: null,
        registrationId: null,
        activeSessions: 0,
        retryCount: 0,
        lastError: null
      });
    }
  }
  
  /**
   * Register with all configured cloud servers
   */
  async registerWithAll(): Promise<Map<string, RegistrationResult>> {
    const results = new Map<string, RegistrationResult>();
    
    // Register with each server in parallel
    const registrationPromises = Array.from(this.serverRegistrations.entries())
      .map(async ([serverUrl, registration]) => {
        try {
          const result = await this.registerWithServer(serverUrl);
          results.set(serverUrl, result);
        } catch (error) {
          console.error(`Failed to register with ${serverUrl}:`, error);
          results.set(serverUrl, { 
            success: false, 
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });
    
    await Promise.all(registrationPromises);
    return results;
  }
  
  /**
   * Register with a specific cloud server
   */
  private async registerWithServer(serverUrl: string): Promise<RegistrationResult> {
    const registration = this.serverRegistrations.get(serverUrl);
    if (!registration) {
      throw new Error(`Unknown server URL: ${serverUrl}`);
    }
    
    // Prepare registration payload
    const payload = {
      packageName: this.config.packageName,
      apiKey: this.config.apiKey,
      version: this.config.version
    };
    
    try {
      // Send registration request
      const response = await fetch(`http://${serverUrl}/api/tpa/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Registration failed (${response.status}): ${errorText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(`Registration failed: ${data.error || 'Unknown error'}`);
      }
      
      // Update registration status
      registration.registered = true;
      registration.registrationId = data.registrationId;
      registration.activeSessions = data.activeSessions || 0;
      registration.lastHeartbeat = new Date();
      registration.retryCount = 0;
      registration.lastError = null;
      
      // Set up heartbeat
      this.startHeartbeat(serverUrl);
      
      return {
        success: true,
        registrationId: data.registrationId,
        activeSessions: data.activeSessions || 0
      };
    } catch (error) {
      // Update failure status
      registration.registered = false;
      registration.lastError = error instanceof Error ? error.message : String(error);
      registration.retryCount++;
      
      // Schedule retry if under max retries
      if (registration.retryCount < (this.config.maxRetries || 5)) {
        this.scheduleRetry(serverUrl);
      }
      
      throw error;
    }
  }
  
  /**
   * Start heartbeat for a server registration
   */
  private startHeartbeat(serverUrl: string): void {
    // Clear any existing heartbeat
    if (this.heartbeatIntervals.has(serverUrl)) {
      clearInterval(this.heartbeatIntervals.get(serverUrl));
    }
    
    // Set new heartbeat interval
    const interval = this.resourceTracker.setInterval(async () => {
      try {
        await this.sendHeartbeat(serverUrl);
      } catch (error) {
        console.error(`Heartbeat failed for ${serverUrl}:`, error);
        
        // If heartbeat fails, try to re-register
        const registration = this.serverRegistrations.get(serverUrl);
        if (registration) {
          registration.registered = false;
          this.registerWithServer(serverUrl).catch(err => {
            console.error(`Re-registration failed for ${serverUrl}:`, err);
          });
        }
      }
    }, this.config.heartbeatIntervalMs || 30000);
    
    this.heartbeatIntervals.set(serverUrl, interval);
  }
  
  /**
   * Send heartbeat to a server
   */
  private async sendHeartbeat(serverUrl: string): Promise<void> {
    const registration = this.serverRegistrations.get(serverUrl);
    if (!registration || !registration.registered) {
      return;
    }
    
    const response = await fetch(`http://${serverUrl}/api/tpa/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        packageName: this.config.packageName,
        apiKey: this.config.apiKey,
        registrationId: registration.registrationId
      })
    });
    
    if (!response.ok) {
      throw new Error(`Heartbeat failed: ${response.status}`);
    }
    
    registration.lastHeartbeat = new Date();
  }
  
  /**
   * Schedule retry for failed registration
   */
  private scheduleRetry(serverUrl: string): void {
    const registration = this.serverRegistrations.get(serverUrl);
    if (!registration) return;
    
    // Exponential backoff with jitter
    const baseDelay = this.config.retryDelayMs || 5000;
    const jitter = Math.floor(Math.random() * 1000);
    const delay = Math.min(
      baseDelay * Math.pow(1.5, registration.retryCount) + jitter,
      60000 // Cap at 1 minute
    );
    
    setTimeout(() => {
      this.registerWithServer(serverUrl).catch(error => {
        console.error(`Retry registration failed for ${serverUrl}:`, error);
      });
    }, delay);
  }
  
  /**
   * Get registration status for all servers
   */
  getRegistrationStatus(): Map<string, ServerRegistrationStatus> {
    const status = new Map<string, ServerRegistrationStatus>();
    
    for (const [serverUrl, registration] of this.serverRegistrations.entries()) {
      status.set(serverUrl, {
        serverUrl,
        registered: registration.registered,
        lastHeartbeat: registration.lastHeartbeat,
        activeSessions: registration.activeSessions,
        retryCount: registration.retryCount,
        lastError: registration.lastError
      });
    }
    
    return status;
  }
  
  /**
   * Stop all heartbeats and clean up
   */
  shutdown(): void {
    for (const interval of this.heartbeatIntervals.values()) {
      clearInterval(interval);
    }
    this.heartbeatIntervals.clear();
    this.serverRegistrations.clear();
  }
}

// Types
interface ServerRegistration {
  serverUrl: string;
  registered: boolean;
  lastHeartbeat: Date | null;
  registrationId: string | null;
  activeSessions: number;
  retryCount: number;
  lastError: string | null;
}

interface ServerRegistrationStatus {
  serverUrl: string;
  registered: boolean;
  lastHeartbeat: Date | null;
  activeSessions: number;
  retryCount: number;
  lastError: string | null;
}

interface RegistrationResult {
  success: boolean;
  registrationId?: string;
  activeSessions?: number;
  error?: string;
}
```

### 3.3 Integration with TpaApp

```typescript
class TpaApp {
  private registrationManager: TpaRegistrationManager;
  
  constructor(config: TpaAppConfig) {
    // Create resource tracker
    this.resourceTracker = new ResourceTracker();
    
    // Create registration manager
    this.registrationManager = new TpaRegistrationManager({
      packageName: config.packageName,
      apiKey: config.apiKey,
      version: config.version || '1.0.0',
      serverUrls: config.serverUrls || 'localhost:8002', // Default to localhost
      heartbeatIntervalMs: config.heartbeatIntervalMs,
      maxRetries: config.maxRetries,
      retryDelayMs: config.retryDelayMs
    }, this.resourceTracker);
  }
  
  /**
   * Start the TPA server and register with cloud instances
   */
  async start(): Promise<void> {
    // Start express server
    await this.startServer();
    
    // Register with all configured cloud servers
    try {
      const results = await this.registrationManager.registerWithAll();
      
      // Log registration results
      for (const [serverUrl, result] of results.entries()) {
        if (result.success) {
          console.log(`Registered with ${serverUrl}: ${result.activeSessions} active sessions`);
        } else {
          console.error(`Failed to register with ${serverUrl}: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('Error during registration:', error);
      // Continue running even if registration fails
    }
  }
  
  /**
   * Stop the TPA server and clean up
   */
  async stop(): Promise<void> {
    // Shutdown registration manager
    this.registrationManager.shutdown();
    
    // Clean up resources
    this.resourceTracker.dispose();
    
    // Stop express server
    await this.stopServer();
  }
  
  /**
   * Get current registration status
   */
  getRegistrationStatus(): Map<string, ServerRegistrationStatus> {
    return this.registrationManager.getRegistrationStatus();
  }
  
  // Rest of TpaApp implementation...
}
```

## 4. Cloud-Side Implementation

The cloud side needs to implement several endpoints to support this registration system:

### 4.1 Registration Endpoint

```typescript
// POST /api/tpa/register
router.post('/register', async (req, res) => {
  try {
    const { packageName, version, apiKey } = req.body;
    
    // Validate required fields
    if (!packageName || !version || !apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    // Validate API key
    const isValid = await appService.validateApiKey(packageName, apiKey);
    if (!isValid) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid API key' 
      });
    }
    
    // Register TPA server
    const registrationId = await tpaRegistryService.registerTpa({
      packageName,
      version
    });
    
    // Get count of active sessions
    const activeSessions = sessionService.getSessionsWithTpa(packageName).length;
    
    // Trigger session recovery for affected sessions
    await tpaRegistryService.recoverAffectedSessions(packageName);
    
    return res.status(200).json({ 
      success: true,
      registrationId,
      activeSessions
    });
  } catch (error) {
    logger.error('[tpa-registration] Error in register endpoint:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error'
    });
  }
});
```

### 4.2 Heartbeat Endpoint

```typescript
// POST /api/tpa/heartbeat
router.post('/heartbeat', async (req, res) => {
  try {
    const { packageName, apiKey, registrationId } = req.body;
    
    // Validate required fields
    if (!packageName || !apiKey || !registrationId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    // Validate API key
    const isValid = await appService.validateApiKey(packageName, apiKey);
    if (!isValid) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid API key' 
      });
    }
    
    // Update heartbeat
    const success = await tpaRegistryService.updateHeartbeat(packageName, registrationId);
    
    if (success) {
      return res.status(200).json({ 
        success: true 
      });
    } else {
      return res.status(404).json({ 
        success: false,
        error: 'Registration not found'
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
```

## 5. Usage Example

```typescript
// Create TPA with multi-environment registration
const myApp = new TpaApp({
  packageName: "com.example.myapp",
  apiKey: "your_api_key",
  version: "1.2.3",
  
  // Register with multiple environments
  serverUrls: "localhost:8002,dev.augmentos.cloud,staging.augmentos.cloud,prod.augmentos.cloud"
});

// Start the app and register with all servers
myApp.start()
  .then(() => {
    console.log("App started and registered with cloud servers");
    
    // Check registration status
    const status = myApp.getRegistrationStatus();
    for (const [server, info] of status.entries()) {
      console.log(`${server}: ${info.registered ? 'Connected' : 'Disconnected'}`);
    }
  })
  .catch(error => {
    console.error("Failed to start app:", error);
  });
```

## 6. Benefits

1. **Multi-Environment Support**: Seamlessly work with multiple cloud environments (dev/staging/prod)
2. **Automatic Recovery**: Users don't need to manually restart TPAs after server restarts
3. **Development Flexibility**: Developers can register with their personal dev environment
4. **Health Monitoring**: Cloud instances know when TPAs are healthy via heartbeats
5. **Resilience**: Retry logic ensures registration eventually succeeds

## 7. Implementation Considerations

1. **Security**: API keys must be properly validated to prevent unauthorized registrations
2. **Performance**: Registration with multiple servers happens in parallel
3. **Scalability**: Design supports registration with many cloud instances
4. **Backwards Compatibility**: Can coexist with current webhook-based system
5. **Configurability**: All timeouts and retry settings are configurable