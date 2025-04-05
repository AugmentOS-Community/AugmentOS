/**
 * DisplayManager
 * 
 * Handles display coordination for AugmentOS Cloud.
 * This service manages:
 * - Display request throttling
 * - Display priority between apps
 * - Boot screens
 * - Background app display locks
 */

import { systemApps } from '../core/system-apps';
import { ActiveDisplay, Layout, DisplayRequest, DisplayManagerI, UserSession, TpaToCloudMessageType, ViewType, LayoutType } from '@augmentos/sdk';
import { WebSocket } from 'ws';
import { logger } from '@augmentos/utils';

/**
 * DisplayManager configuration options
 */
export interface DisplayManagerConfig {
  // Core timing values
  throttleDelayMs: number;        // Delay between display updates
  bootDurationMs: number;         // How long to show boot screen per app
  lockTimeoutMs: number;          // Background lock timeout
  lockInactiveTimeoutMs: number;  // Inactivity timeout for background locks
  
  // App configuration
  mainAppPackageName: string;     // Package name of the main/core app
  dashboardPackageName: string;   // Package name of the dashboard app
  
  // Display behavior
  allowDashboardThrottling: boolean; // Whether to throttle dashboard displays
  queueDisplaysInBoot: boolean;      // Queue displays during boot or reject
  
  // Debugging
  debugMode: boolean;             // Enable additional debug logging
}

/**
 * Default configuration for DisplayManager
 */
const defaultConfig: DisplayManagerConfig = {
  throttleDelayMs: 200,
  bootDurationMs: 3000,
  lockTimeoutMs: 10000,
  lockInactiveTimeoutMs: 2000,
  mainAppPackageName: systemApps.captions.packageName,
  dashboardPackageName: systemApps.dashboard.packageName,
  allowDashboardThrottling: false,
  queueDisplaysInBoot: false,
  debugMode: false
};

/**
 * Display state interface
 */
interface DisplayState {
  // Current active display
  currentDisplay: ActiveDisplay | null;
  
  // Core app's current display
  coreAppDisplay: ActiveDisplay | null;
  
  // Background lock information
  backgroundLock: {
    packageName: string;
    expiresAt: Date;
    lastActiveTime: number;
  } | null;
}

/**
 * Throttled display request
 */
interface ThrottledRequest {
  id: string;                   // Unique ID for this request
  activeDisplay: ActiveDisplay; // The display to show
  timestamp: number;            // When it was queued
  packageName: string;          // Package name for priority
  expiresAt?: number;           // When it expires from queue
}

/**
 * DisplayManager implementation
 */
class DisplayManager implements DisplayManagerI {
  /**
   * Current display state
   */
  private displayState: DisplayState = {
    currentDisplay: null,
    coreAppDisplay: null,
    backgroundLock: null
  };
  
  /**
   * Set of apps currently in the boot phase
   */
  private bootingApps: Set<string> = new Set();
  
  /**
   * Timestamp of last display update
   */
  private lastDisplayTime = 0;
  
  /**
   * Current user session
   */
  private userSession: UserSession | null = null;
  
  /**
   * Queue of throttled display requests
   */
  private throttleQueue: ThrottledRequest[] = [];
  
  /**
   * Timer for processing throttled requests
   */
  private throttleTimer: NodeJS.Timeout | null = null;
  
  /**
   * Performance metrics for the display manager
   */
  private metrics = {
    requestsTotal: 0,
    requestsSucceeded: 0,
    requestsFailed: 0,
    requestsThrottled: 0,
    averageLatencyMs: 0,
    lastLatencyMs: 0,
    bootScreensShown: 0,
    displaysByApp: {} as Record<string, number>
  };
  
  /**
   * Configuration object
   */
  private config: DisplayManagerConfig;
  
  /**
   * Creates a new DisplayManager instance
   * 
   * @param configOverride - Optional configuration to override defaults
   */
  constructor(configOverride?: Partial<DisplayManagerConfig>) {
    // Merge default config with any overrides
    this.config = {
      ...defaultConfig,
      ...configOverride
    };
    
    this.log('info', 'DisplayManager initialized', { config: this.config });
  }
  
  /**
   * Handles an app starting
   * 
   * @param packageName - App package name
   * @param userSession - User session
   */
  public handleAppStart(packageName: string, userSession: UserSession): void {
    this.userSession = userSession;

    // Dashboard doesn't show boot screen
    if (packageName === this.config.dashboardPackageName) {
      this.log('info', 'Dashboard app starting, no boot screen needed');
      return;
    }

    this.log('info', `Starting app: ${packageName}`);
    this.bootingApps.add(packageName);
    this.updateBootScreen();
    
    // Track metrics
    this.metrics.bootScreensShown++;

    // Set timeout to move app from booting to running state
    setTimeout(() => {
      this.log('info', `Boot complete for: ${packageName}`);
      this.bootingApps.delete(packageName);
      
      if (this.bootingApps.size === 0) {
        this.showNextDisplay('app_boot_complete');
      } else {
        // If more apps still booting, update boot screen
        this.updateBootScreen();
      }
    }, this.config.bootDurationMs);
  }

  /**
   * Handles an app stopping
   * 
   * @param packageName - App package name
   * @param userSession - User session
   */
  public handleAppStop(packageName: string, userSession: UserSession): void {
    this.userSession = userSession;
    this.log('info', `Stopping app: ${packageName}`);

    const wasBooting = this.bootingApps.has(packageName);
    this.bootingApps.delete(packageName);

    // Handle boot screen updates if app was booting
    if (wasBooting) {
      if (this.bootingApps.size > 0) {
        this.log('info', 'Updating boot screen after app stop');
        this.updateBootScreen();
      } else {
        this.log('info', 'Boot screen complete, clearing state');
        if (this.displayState.currentDisplay?.displayRequest.packageName === this.config.dashboardPackageName) {
          this.clearDisplay(ViewType.MAIN);
        }
      }
    }

    // Clean up throttled requests from this app
    this.throttleQueue = this.throttleQueue.filter(req => {
      if (req.packageName === packageName) {
        this.log('info', 'Removing throttled request from stopped app', { request: req });
        return false;
      }
      return true;
    });

    // Release background lock if held by this app
    if (this.displayState.backgroundLock?.packageName === packageName) {
      this.log('info', `Clearing background lock for: ${packageName}`);
      this.displayState.backgroundLock = null;
    }

    // Clear core app display if this is the main app
    if (packageName === this.config.mainAppPackageName) {
      this.log('info', `Clearing core app display: ${packageName}`);
      this.displayState.coreAppDisplay = null;

      if (this.displayState.currentDisplay?.displayRequest.packageName === packageName) {
        this.log('info', 'Core app was displaying, clearing display');
        this.clearDisplay(ViewType.MAIN);
      }
    }

    // If this app was currently displaying, find next app to display
    if (this.displayState.currentDisplay?.displayRequest.packageName === packageName) {
      this.showNextDisplay('app_stop');
    }
  }

  /**
   * Handles a display request
   * 
   * @param displayRequest - The display request
   * @param userSession - User session
   * @returns Success flag
   */
  public handleDisplayRequest(displayRequest: DisplayRequest, userSession: UserSession): boolean {
    return this.handleDisplayEvent(displayRequest, userSession);
  }

  /**
   * Handles a display event request (internal implementation)
   * 
   * @param displayRequest - The display request
   * @param userSession - User session
   * @returns Success flag
   */
  public handleDisplayEvent(displayRequest: DisplayRequest, userSession: UserSession): boolean {
    const requestTime = Date.now();
    this.userSession = userSession;
    
    // Track total requests
    this.metrics.requestsTotal++;
    
    // Update app-specific metrics
    if (!this.metrics.displaysByApp[displayRequest.packageName]) {
      this.metrics.displaysByApp[displayRequest.packageName] = 0;
    }
    this.metrics.displaysByApp[displayRequest.packageName]++;

    // Validate request
    if (!this.validateDisplayRequest(displayRequest)) {
      this.metrics.requestsFailed++;
      return false;
    }

    // Special handling for dashboard requests
    if (displayRequest.packageName === this.config.dashboardPackageName) {
      this.log('info', 'Dashboard display request');
      const success = this.sendDisplay(displayRequest);
      
      if (success) {
        this.metrics.requestsSucceeded++;
        this.metrics.lastLatencyMs = Date.now() - requestTime;
        // Update average latency
        this.metrics.averageLatencyMs = 
          (this.metrics.averageLatencyMs * (this.metrics.requestsSucceeded - 1) + this.metrics.lastLatencyMs) / 
          this.metrics.requestsSucceeded;
      } else {
        this.metrics.requestsFailed++;
      }
      
      return success;
    }

    // Block display requests during boot phase (or queue if configured)
    if (this.bootingApps.size > 0) {
      if (this.config.queueDisplaysInBoot) {
        this.log('info', `Queueing display during boot: ${displayRequest.packageName}`);
        // TODO: Implement boot phase queuing
        this.metrics.requestsThrottled++;
        return false;
      } else {
        this.log('info', `Blocking display during boot: ${displayRequest.packageName}`);
        this.metrics.requestsFailed++;
        return false;
      }
    }

    // Handle main app displays
    if (displayRequest.packageName === this.config.mainAppPackageName) {
      this.log('info', `Core app display request: ${displayRequest.packageName}`);
      const activeDisplay = this.createActiveDisplay(displayRequest);
      this.displayState.coreAppDisplay = activeDisplay;

      // Check if a background app is displaying
      if (!this.displayState.backgroundLock ||
          this.displayState.backgroundLock.packageName !== this.displayState.currentDisplay?.displayRequest.packageName) {
        this.log('info', 'Background not displaying, showing core app');
        
        const success = this.showDisplay(activeDisplay);
        if (success) {
          this.metrics.requestsSucceeded++;
          this.metrics.lastLatencyMs = Date.now() - requestTime;
          this.metrics.averageLatencyMs = 
            (this.metrics.averageLatencyMs * (this.metrics.requestsSucceeded - 1) + this.metrics.lastLatencyMs) / 
            this.metrics.requestsSucceeded;
        } else {
          this.metrics.requestsFailed++;
        }
        
        return success;
      }
      
      this.log('info', `Background app is displaying, core app blocked by ${this.displayState.backgroundLock.packageName}`);
      this.metrics.requestsFailed++;
      return false;
    }

    // Handle background app display requests
    const canDisplay = this.acquireBackgroundLock(displayRequest.packageName);
    if (canDisplay) {
      this.log('info', `Background app can display: ${displayRequest.packageName}`);
      const activeDisplay = this.createActiveDisplay(displayRequest);
      
      const success = this.showDisplay(activeDisplay);
      if (success) {
        this.metrics.requestsSucceeded++;
        this.metrics.lastLatencyMs = Date.now() - requestTime;
        this.metrics.averageLatencyMs = 
          (this.metrics.averageLatencyMs * (this.metrics.requestsSucceeded - 1) + this.metrics.lastLatencyMs) / 
          this.metrics.requestsSucceeded;
      } else {
        this.metrics.requestsFailed++;
      }
      
      return success;
    }

    this.log('info', `Background app display blocked - no lock: ${displayRequest.packageName}`);
    this.metrics.requestsFailed++;
    return false;
  }
  
  /**
   * Gets display metrics
   * 
   * @returns Current display metrics
   */
  public getMetrics() {
    return { ...this.metrics };
  }
  
  /**
   * Resets the display manager state
   * 
   * @returns Success flag
   */
  public resetState(): boolean {
    this.log('warn', 'Resetting display manager state');
    
    // Clear all state
    this.displayState = {
      currentDisplay: null,
      coreAppDisplay: null,
      backgroundLock: null
    };
    
    this.bootingApps.clear();
    this.throttleQueue = [];
    
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    
    // Clear display
    if (this.userSession) {
      this.clearDisplay(ViewType.MAIN);
      return true;
    }
    
    return false;
  }

  /**
   * Shows a display and handles throttling if needed
   * 
   * @param activeDisplay - Display to show
   * @returns Success flag
   */
  private showDisplay(activeDisplay: ActiveDisplay): boolean {
    // Check if we need to throttle
    if (Date.now() - this.lastDisplayTime < this.config.throttleDelayMs) {
      this.log('info', 'Throttling display request, will show after delay', { 
        packageName: activeDisplay.displayRequest.packageName 
      });
      
      // Queue the request
      const request: ThrottledRequest = {
        id: Math.random().toString(36).substring(2, 9),
        activeDisplay,
        timestamp: Date.now(),
        packageName: activeDisplay.displayRequest.packageName,
        expiresAt: Date.now() + 5000 // 5 second expiry
      };
      
      // Remove existing requests from same package
      this.throttleQueue = this.throttleQueue.filter(req => {
        if (req.packageName === request.packageName) {
          this.log('info', 'Replacing existing throttled request', { oldRequest: req, newRequest: request });
          return false;
        }
        return true;
      });
      
      // Add to queue
      this.throttleQueue.push(request);
      
      // Start the throttle processor
      this.startThrottleProcessor();
      return false;
    }

    // Send the display directly
    return this.sendDisplayDirectly(activeDisplay);
  }
  
  /**
   * Processes throttled requests
   */
  private startThrottleProcessor(): void {
    if (this.throttleTimer) return;
    
    const processQueue = () => {
      // Clear the reference to the timer
      this.throttleTimer = null;
      
      if (this.throttleQueue.length === 0) return;
      
      // Remove expired requests
      const now = Date.now();
      this.throttleQueue = this.throttleQueue.filter(req => {
        if (req.expiresAt && req.expiresAt < now) {
          this.log('info', 'Request expired in queue', { request: req });
          return false;
        }
        return true;
      });
      
      if (this.throttleQueue.length === 0) return;
      
      // Sort by priority if needed
      // this.sortQueueByPriority();
      
      // Process the next request
      const nextRequest = this.throttleQueue.shift();
      if (nextRequest) {
        this.log('info', 'Processing queued display request', { request: nextRequest });
        this.sendDisplayDirectly(nextRequest.activeDisplay);
      }
      
      // If there are more requests, schedule the next processing
      if (this.throttleQueue.length > 0) {
        this.throttleTimer = setTimeout(
          processQueue, 
          this.config.throttleDelayMs
        );
      }
    };
    
    // Calculate delay until next processing (account for time elapsed since last display)
    const timeElapsed = Date.now() - this.lastDisplayTime;
    const remainingDelay = Math.max(0, this.config.throttleDelayMs - timeElapsed);
    
    // Start the first timer
    this.throttleTimer = setTimeout(processQueue, remainingDelay);
  }
  
  /**
   * Send a display directly without throttling
   * 
   * @param activeDisplay - Display to send
   * @returns Success flag
   */
  private sendDisplayDirectly(activeDisplay: ActiveDisplay): boolean {
    const success = this.sendToWebSocket(activeDisplay.displayRequest, this.userSession?.websocket);
    if (success) {
      this.displayState.currentDisplay = activeDisplay;
      this.lastDisplayTime = Date.now();

      // Core app took display, maybe release background lock
      if (activeDisplay.displayRequest.packageName === this.config.mainAppPackageName &&
          this.displayState.backgroundLock &&
          this.displayState.currentDisplay?.displayRequest.packageName !== this.displayState.backgroundLock.packageName) {
        this.log('info', `Releasing background lock as core app took display: ${this.displayState.backgroundLock.packageName}`);
        this.displayState.backgroundLock = null;
      }

      // Update activity time if this is a display from the background lock holder
      if (this.displayState.backgroundLock?.packageName === activeDisplay.displayRequest.packageName) {
        this.displayState.backgroundLock.lastActiveTime = Date.now();
      }

      this.log('info', `Display sent successfully: ${activeDisplay.displayRequest.packageName}`);

      // Set expiry timer if the display has a duration
      if (activeDisplay.expiresAt) {
        const timeUntilExpiry = activeDisplay.expiresAt.getTime() - Date.now();
        setTimeout(() => {
          if (this.displayState.currentDisplay === activeDisplay) {
            this.showNextDisplay('duration_expired');
          }
        }, timeUntilExpiry);
      }
    }
    return success;
  }

  /**
   * Find and show the next display after current one is no longer valid
   * 
   * @param reason - Why a new display is needed
   */
  private showNextDisplay(reason: 'app_stop' | 'duration_expired' | 'new_request' | 'app_boot_complete'): void {
    this.log('info', `Finding next display, reason: ${reason}`);

    // Boot screen takes precedence
    if (this.bootingApps.size > 0) {
      this.log('info', `Showing boot screen - ${this.bootingApps.size} apps booting`);
      this.updateBootScreen();
      return;
    }

    // Check for background app with lock
    if (this.displayState.backgroundLock) {
      const { packageName, expiresAt, lastActiveTime } = this.displayState.backgroundLock;
      const now = Date.now();

      // Check if lock should be released due to inactivity
      if (now - lastActiveTime > this.config.lockInactiveTimeoutMs) {
        this.log('info', `Releasing lock due to inactivity: ${packageName}`);
        this.displayState.backgroundLock = null;
      } else if (expiresAt.getTime() > now) {
        // Lock is still valid and active
        if (this.displayState.currentDisplay?.displayRequest.packageName === packageName) {
          this.log('info', 'Lock holder is current display, keeping it');
          return;
        }

        // If lock holder isn't displaying, try showing core app
        if (this.displayState.coreAppDisplay &&
          this.hasRemainingDuration(this.displayState.coreAppDisplay)) {
          this.log('info', 'Lock holder not displaying, showing core app');
          if (this.showDisplay(this.displayState.coreAppDisplay)) {
            return;
          }
          // If showing core app failed, continue to next checks
        }
      } else {
        this.log('info', `Lock expired for ${packageName}, clearing lock`);
        this.displayState.backgroundLock = null;
      }
    }

    // Show core app display if it exists and has remaining duration
    if (this.displayState.coreAppDisplay && this.hasRemainingDuration(this.displayState.coreAppDisplay)) {
      this.log('info', 'Showing core app display');
      this.showDisplay(this.displayState.coreAppDisplay);
      return;
    }

    this.log('info', 'Nothing to show, clearing display');
    this.clearDisplay(ViewType.MAIN);
  }

  /**
   * Try to acquire a background display lock
   * 
   * @param packageName - App requesting the lock
   * @returns Whether the lock was acquired
   */
  private acquireBackgroundLock(packageName: string): boolean {
    const now = Date.now();
    
    // Check if this package already has a lock
    if (this.displayState.backgroundLock?.packageName === packageName) {
      // Update the existing lock
      const expiresAt = new Date(now + this.config.lockTimeoutMs);
      this.displayState.backgroundLock = {
        ...this.displayState.backgroundLock,
        lastActiveTime: now,
        expiresAt
      };
      this.log('info', 'Extended existing background lock', { 
        packageName,
        expiresAt
      });
      return true;
    }
    
    // Check if existing lock should be released
    if (this.displayState.backgroundLock) {
      const { expiresAt, lastActiveTime } = this.displayState.backgroundLock;
      if (expiresAt.getTime() < now || 
          now - lastActiveTime > this.config.lockInactiveTimeoutMs) {
        this.log('info', 'Releasing expired/inactive lock', {
          previousLock: this.displayState.backgroundLock
        });
        this.displayState.backgroundLock = null;
      }
    }
    
    // Check if we can acquire a new lock
    if (!this.displayState.backgroundLock) {
      // Create new lock
      const expiresAt = new Date(now + this.config.lockTimeoutMs);
      this.displayState.backgroundLock = {
        packageName,
        expiresAt,
        lastActiveTime: now
      };
      
      this.log('info', 'Acquired new background lock', { 
        packageName,
        expiresAt
      });
      return true;
    }
    
    // Can't acquire lock
    this.log('info', 'Failed to acquire background lock', { 
      requester: packageName,
      currentLock: this.displayState.backgroundLock
    });
    return false;
  }

  /**
   * Update the boot screen display
   */
  private updateBootScreen(): void {
    if (!this.userSession || this.bootingApps.size === 0) return;

    const bootingAppNames = Array.from(this.bootingApps).map(packageName => {
      const app = Object.values(systemApps).find(app => app.packageName === packageName);
      return app ? app.name : packageName;
    });

    const bootRequest: DisplayRequest = {
      type: TpaToCloudMessageType.DISPLAY_REQUEST,
      view: ViewType.MAIN,
      packageName: this.config.dashboardPackageName,
      layout: {
        layoutType: LayoutType.REFERENCE_CARD,
        title: `// AugmentOS - Starting App${this.bootingApps.size > 1 ? 's' : ''}`,
        text: bootingAppNames.join(", ")
      },
      timestamp: new Date()
    };

    this.sendDisplay(bootRequest);
  }

  /**
   * Clear the display for a specific view
   * 
   * @param viewType - View to clear
   */
  private clearDisplay(viewType: ViewType): void {
    if (!this.userSession) return;

    const clearRequest: DisplayRequest = {
      type: TpaToCloudMessageType.DISPLAY_REQUEST,
      view: viewType,
      packageName: this.config.dashboardPackageName,
      layout: { 
        layoutType: LayoutType.TEXT_WALL,
        text: '' 
      },
      timestamp: new Date()
    };
    this.sendDisplay(clearRequest);
  }

  /**
   * Check if a display still has remaining duration
   * 
   * @param activeDisplay - Display to check
   * @returns Whether the display is still valid
   */
  private hasRemainingDuration(activeDisplay: ActiveDisplay): boolean {
    if (!activeDisplay.expiresAt) return true;
    return activeDisplay.expiresAt.getTime() > Date.now();
  }

  /**
   * Create an ActiveDisplay from a DisplayRequest
   * 
   * @param displayRequest - The request to create a display from
   * @returns The active display
   */
  private createActiveDisplay(displayRequest: DisplayRequest): ActiveDisplay {
    const now = new Date();
    return {
      displayRequest: displayRequest,
      startedAt: now,
      expiresAt: displayRequest.durationMs ? new Date(now.getTime() + displayRequest.durationMs) : undefined
    };
  }
  
  /**
   * Validate a display request
   * 
   * @param request - Request to validate
   * @returns Whether the request is valid
   */
  private validateDisplayRequest(request: DisplayRequest): boolean {
    // Check for required fields
    if (!request || !request.packageName || !request.layout || !request.view) {
      this.log('error', 'Invalid display request: missing required fields', { request });
      return false;
    }
    
    // Check layout type
    if (!Object.values(LayoutType).includes(request.layout.layoutType)) {
      this.log('error', 'Invalid layout type', { 
        layout: request.layout, 
        allowedTypes: Object.values(LayoutType) 
      });
      return false;
    }
    
    // Validate specific layout types
    switch (request.layout.layoutType) {
      case LayoutType.TEXT_WALL:
        if (typeof (request.layout as any).text !== 'string') {
          this.log('error', 'Invalid TEXT_WALL layout: missing text field', { layout: request.layout });
          return false;
        }
        break;
      case LayoutType.REFERENCE_CARD:
        const card = request.layout as any;
        if (typeof card.title !== 'string' || typeof card.text !== 'string') {
          this.log('error', 'Invalid REFERENCE_CARD layout: missing title or text', { layout: card });
          return false;
        }
        break;
      // Validate other layout types as needed
    }
    
    // Check duration value if provided
    if (request.durationMs !== undefined && 
        (typeof request.durationMs !== 'number' || request.durationMs < 0)) {
      this.log('error', 'Invalid duration', { duration: request.durationMs });
      return false;
    }
    
    return true;
  }

  /**
   * Send a display request directly
   * 
   * @param displayRequest - Display request to send
   * @returns Success flag
   */
  private sendDisplay(displayRequest: DisplayRequest): boolean {
    if (!this.userSession) return false;
  
    // Apply throttling based on config and request type
    const isDashboard = displayRequest.view === ViewType.DASHBOARD;
    const isBootPhase = this.bootingApps.size > 0;
    const shouldThrottle = !isBootPhase && (!isDashboard || this.config.allowDashboardThrottling);
  
    if (shouldThrottle && Date.now() - this.lastDisplayTime < this.config.throttleDelayMs) {
      this.log('info', `Display throttled: ${displayRequest.packageName}`);
      return false;
    }
  
    const success = this.sendToWebSocket(displayRequest, this.userSession.websocket);
    if (success && shouldThrottle) {
      this.lastDisplayTime = Date.now();
    }
  
    return success;
  }

  /**
   * Send a display request to a WebSocket
   * 
   * @param displayRequest - Request to send
   * @param webSocket - WebSocket to send to
   * @returns Success flag
   */
  private sendToWebSocket(displayRequest: DisplayRequest, webSocket?: WebSocket): boolean {
    if (!webSocket || webSocket.readyState !== 1) {
      this.log('error', 'WebSocket not ready');
      return false;
    }

    try {
      webSocket.send(JSON.stringify(displayRequest));
      return true;
    } catch (error) {
      this.log('error', 'WebSocket error sending display', { error });
      return false;
    }
  }
  
  /**
   * Log a message with context
   * 
   * @param level - Log level
   * @param message - Message to log
   * @param data - Additional data
   */
  private log(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
    const userId = this.userSession?.userId || 'no-user';
    const displayState = {
      currentApp: this.displayState.currentDisplay?.displayRequest.packageName,
      bootingApps: Array.from(this.bootingApps),
      hasBackgroundLock: !!this.displayState.backgroundLock,
      lockHolder: this.displayState.backgroundLock?.packageName
    };
    
    const logEntry = {
      userId,
      displayState,
      ...(data || {})
    };
    
    // Use logger from @augmentos/utils
    switch (level) {
      case 'info':
        if (this.config.debugMode) {
          logger.info(`[DisplayManager] ${message}`, logEntry);
        }
        break;
      case 'warn':
        logger.warn(`[DisplayManager] ${message}`, logEntry);
        break;
      case 'error':
        logger.error(`[DisplayManager] ${message}`, logEntry);
        break;
    }
  }
}

export default DisplayManager;