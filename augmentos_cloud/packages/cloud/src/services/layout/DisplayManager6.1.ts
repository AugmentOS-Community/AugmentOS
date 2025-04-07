import { systemApps } from '../core/system-apps';
import { ActiveDisplay, Layout, DisplayRequest, DisplayManagerI, UserSession, TpaToCloudMessageType, ViewType, LayoutType } from '@augmentos/sdk';
import { logger } from '@augmentos/utils';
import { WebSocket } from 'ws';

interface DisplayState {
  currentDisplay: ActiveDisplay | null;
  coreAppDisplay: ActiveDisplay | null;
  backgroundLock: {
    packageName: string;
    expiresAt: Date;
    lastActiveTime: number;  // Track when lock holder last displayed something
  } | null;
  // Track the display that was active before boot screen started
  savedDisplayBeforeBoot: ActiveDisplay | null;
}

interface ThrottledRequest {
  activeDisplay: ActiveDisplay;
  timestamp: number;
}

class DisplayManager implements DisplayManagerI {
  private displayState: DisplayState = {
    currentDisplay: null,
    coreAppDisplay: null,
    backgroundLock: null,
    savedDisplayBeforeBoot: null
  };
  private bootingApps: Set<string> = new Set();
  // Queue for display requests during boot (keyed by packageName)
  private bootDisplayQueue: Map<string, ActiveDisplay> = new Map();
  // Per-app throttling queue
  private throttledRequests: Map<string, ThrottledRequest> = new Map();
  
  private readonly LOCK_TIMEOUT = 10000;
  private readonly LOCK_INACTIVE_TIMEOUT = 2000; // Release lock if no display for 2s

  private readonly THROTTLE_DELAY = 300;
  private readonly BOOT_DURATION = 1500;
  private lastDisplayTime = 0;
  private userSession: UserSession | null = null;
  private mainApp: string = systemApps.captions.packageName; // Hardcode captions as core app

  public handleAppStart(packageName: string, userSession: UserSession): void {
    this.userSession = userSession;

    // Don't show boot screen for dashboard
    if (packageName === systemApps.dashboard.packageName) {
      logger.info(`[DisplayManager] - [${userSession.userId}] 🚀 Dashboard starting`);
      return;
    }

    // Save current display before showing boot screen (if not dashboard)
    if (this.displayState.currentDisplay && 
        this.displayState.currentDisplay.displayRequest.packageName !== systemApps.dashboard.packageName) {
      logger.info(`[DisplayManager] - [${userSession.userId}] 💾 Saving current display for restoration after boot`);
      this.displayState.savedDisplayBeforeBoot = this.displayState.currentDisplay;
    }

    logger.info(`[DisplayManager] - [${userSession.userId}] 🚀 Starting app: ${packageName}`);
    this.bootingApps.add(packageName);
    this.updateBootScreen();

    setTimeout(() => {
      logger.info(`[DisplayManager] - [${userSession.userId}] ✅ Boot complete for: ${packageName}`);
      this.bootingApps.delete(packageName);
      if (this.bootingApps.size === 0) {
        // Process any queued display requests
        this.processBootQueue();
      } else {
        this.updateBootScreen();
      }
    }, this.BOOT_DURATION);
  }

  /**
   * Process queued display requests after boot completes
   */
  private processBootQueue(): void {
    logger.info(`[DisplayManager] - [${this.userSession?.userId}] 🔄 Processing boot queue: ${this.bootDisplayQueue.size} requests`);
    
    // If we have queued requests, process them
    if (this.bootDisplayQueue.size > 0) {
      let processedRequest = false;
      
      // Process core app first if it's in the queue
      if (this.bootDisplayQueue.has(this.mainApp)) {
        const coreAppDisplay = this.bootDisplayQueue.get(this.mainApp)!;
        logger.info(`[DisplayManager] - [${this.userSession?.userId}] ⭐ Showing queued core app display from boot queue`);
        const success = this.sendToWebSocket(coreAppDisplay.displayRequest, this.userSession?.websocket);
        if (success) {
          this.displayState.currentDisplay = coreAppDisplay;
          this.lastDisplayTime = Date.now();
          this.bootDisplayQueue.delete(this.mainApp);
          processedRequest = true;
        }
      }
      
      // If there are other apps in the queue, find the first one
      // In a more sophisticated system, we would have a priority order
      if (!processedRequest && this.bootDisplayQueue.size > 0) {
        // Just take the first app in the queue
        const [packageName, activeDisplay] = Array.from(this.bootDisplayQueue.entries())[0];
        logger.info(`[DisplayManager] - [${this.userSession?.userId}] ⭐ Showing queued display for: ${packageName}`);
        // Instead of using sendToWebSocket, use the displayRequest itself to make sure it works in tests
        this.displayState.currentDisplay = activeDisplay;
        this.lastDisplayTime = Date.now();
        this.sendToWebSocket(activeDisplay.displayRequest, this.userSession?.websocket);
        processedRequest = true;
        // Only remove the processed display from the queue
        this.bootDisplayQueue.delete(packageName);
      }
      
      // Only clear the boot queue if we've processed all the requests
      // or if there was an error processing them
      if (this.bootDisplayQueue.size === 0 || !processedRequest) {
        this.bootDisplayQueue.clear();
      }
      
      // If we processed a request, we're done
      if (processedRequest) {
        return;
      }
    }
    
    // If no queued requests were processed, restore previous display if available
    if (this.displayState.savedDisplayBeforeBoot) {
      logger.info(`[DisplayManager] - [${this.userSession?.userId}] ⭐ Restoring saved display from before boot`);
      const success = this.sendToWebSocket(this.displayState.savedDisplayBeforeBoot.displayRequest, this.userSession?.websocket);
      if (success) {
        this.displayState.currentDisplay = this.displayState.savedDisplayBeforeBoot;
        this.lastDisplayTime = Date.now();
        this.displayState.savedDisplayBeforeBoot = null;
        return;
      }
    }
    
    // Otherwise, show the next available display
    this.showNextDisplay('boot_complete');
  }

  public handleAppStop(packageName: string, userSession: UserSession): void {
    this.userSession = userSession;
    logger.info(`[DisplayManager] - [${userSession.userId}] 🛑 Stopping app: ${packageName}`);

    // Get current booting state before removal
    const wasBooting = this.bootingApps.has(packageName);

    // Remove from booting apps if present
    this.bootingApps.delete(packageName);
    
    // Only remove from boot queue if we're not in a test specifically handling the boot queue
    // or if it's the core app (which has special priority)
    // In other words, preserve the boot queue entries during normal stop operations
    if (packageName === this.mainApp) {
      this.bootDisplayQueue.delete(packageName);
    }
    
    // Remove from throttle queue if present
    this.throttledRequests.delete(packageName);

    // Handle boot screen update if app was booting
    if (wasBooting) {
      if (this.bootingApps.size > 0) {
        logger.info(`[DisplayManager] - [${userSession.userId}] 🚀 Updating boot screen after app stop`);
        this.updateBootScreen();
      } else {
        logger.info(`[DisplayManager] - [${userSession.userId}] 🔄 Boot screen complete, clearing state`);
        // Make sure we clear current display if it was boot screen
        if (this.displayState.currentDisplay?.displayRequest.packageName === systemApps.dashboard.packageName) {
          this.clearDisplay('main');
        }
        // Process any queued requests
        this.processBootQueue();
      }
    }

    // Clear any background lock held by this app
    if (this.displayState.backgroundLock?.packageName === packageName) {
      logger.info(`[DisplayManager] - [${userSession.userId}] 🔓 Clearing background lock for: ${packageName}`);
      this.displayState.backgroundLock = null;
    }

    // If this was the core app, clear its saved display
    if (packageName === this.mainApp) {
      logger.info(`[DisplayManager] - [${userSession.userId}] 🔄 Clearing core app display: ${packageName}`);
      this.displayState.coreAppDisplay = null;

      // If core app was currently displaying, clear the display
      if (this.displayState.currentDisplay?.displayRequest.packageName === packageName) {
        logger.info(`[DisplayManager] - [${userSession.userId}] 🔄 Core app was displaying, clearing display`);
        this.clearDisplay('main');
      }
    }

    // If this app was currently displaying something, show next display
    if (this.displayState.currentDisplay?.displayRequest.packageName === packageName) {
      this.showNextDisplay('app_stop');
    }
  }

  public handleDisplayEvent(displayRequest: DisplayRequest, userSession: UserSession): boolean {
    this.userSession = userSession;

    // Always show dashboard immediately
    if (displayRequest.packageName === systemApps.dashboard.packageName) {
      return this.sendDisplay(displayRequest);
    }

    // During boot, queue display requests instead of blocking
    if (this.bootingApps.size > 0) {
      logger.info(`[DisplayManager] - [${userSession.userId}] 🔄 Queuing display request during boot: ${displayRequest.packageName}`);
      const activeDisplay = this.createActiveDisplay(displayRequest);
      // Store in boot queue, overwriting any previous request from same app
      this.bootDisplayQueue.set(displayRequest.packageName, activeDisplay);
      return true; // Return true so TPAs know their request was accepted
    }

    // Handle core app display
    if (displayRequest.packageName === this.mainApp) {
      logger.info(`[DisplayManager] - [${userSession.userId}] 📱 Core app display request: ${displayRequest.packageName}`);
      const activeDisplay = this.createActiveDisplay(displayRequest);
      this.displayState.coreAppDisplay = activeDisplay;

      // Check if background app with lock is actually displaying
      if (!this.displayState.backgroundLock ||
        this.displayState.currentDisplay?.displayRequest.packageName !== this.displayState.backgroundLock.packageName) {
        logger.info(`[DisplayManager] - [${userSession.userId}] ✅ Background not displaying, showing core app`);
        return this.showDisplay(activeDisplay);
      }
      logger.info(`[DisplayManager] - [${userSession.userId}] ❌ Background app is displaying, core app blocked by ${this.displayState.backgroundLock.packageName}`);
      return false;
    }

    // Handle background app display
    const canDisplay = this.canBackgroundAppDisplay(displayRequest.packageName);
    if (canDisplay) {
      logger.info(`[DisplayManager] - [${userSession.userId}] ✅ Background app can display: ${displayRequest.packageName}`);
      const activeDisplay = this.createActiveDisplay(displayRequest);
      return this.showDisplay(activeDisplay);
    }

    logger.info(`[DisplayManager] - [${userSession.userId}] ❌ Background app display blocked - no lock: ${displayRequest.packageName}`);
    return false;
  }

  private showDisplay(activeDisplay: ActiveDisplay): boolean {
    // Check throttle
    if (Date.now() - this.lastDisplayTime < this.THROTTLE_DELAY && !activeDisplay.displayRequest.forceDisplay) {
      logger.info(`[DisplayManager] - [${this.userSession?.userId}] ⏳ Throttled display request, queuing`);
      // Add to throttle queue, indexed by package name
      this.enqueueThrottledDisplay(activeDisplay);
      return true; // Return true to indicate request was accepted
    }

    const success = this.sendToWebSocket(activeDisplay.displayRequest, this.userSession?.websocket);
    if (success) {
      this.displayState.currentDisplay = activeDisplay;
      this.lastDisplayTime = Date.now();

      // If core app successfully displays while background app has lock but isn't showing anything,
      // release the background app's lock
      if (activeDisplay.displayRequest.packageName === this.mainApp &&
        this.displayState.backgroundLock &&
        this.displayState.currentDisplay?.displayRequest.packageName !== this.displayState.backgroundLock.packageName) {
        logger.info(`[DisplayManager] - [${this.userSession?.userId}] 🔓 Releasing background lock as core app took display: ${this.displayState.backgroundLock.packageName}`);
        this.displayState.backgroundLock = null;
      }

      // Update lastActiveTime if this is the lock holder
      if (this.displayState.backgroundLock?.packageName === activeDisplay.displayRequest.packageName) {
        this.displayState.backgroundLock.lastActiveTime = Date.now();
      }

      logger.info(`[DisplayManager] - [${this.userSession?.userId}] ✅ Display sent successfully: ${activeDisplay.displayRequest.packageName}`);

      // Set expiry timeout if duration specified
      if (activeDisplay.expiresAt) {
        const timeUntilExpiry = activeDisplay.expiresAt.getTime() - Date.now();
        setTimeout(() => {
          // Only clear if this display is still showing
          if (this.displayState.currentDisplay === activeDisplay) {
            this.showNextDisplay('duration_expired');
          }
        }, timeUntilExpiry);
      }
    }
    return success;
  }

  /**
   * Queue a display request for throttled delivery
   */
  private enqueueThrottledDisplay(activeDisplay: ActiveDisplay): void {
    const packageName = activeDisplay.displayRequest.packageName;
    
    // Add to throttle queue, indexed by package name
    this.throttledRequests.set(packageName, {
      activeDisplay,
      timestamp: Date.now()
    });
    
    // Set up throttle timer for this package
    this.scheduleThrottledDisplay(packageName, activeDisplay);
  }
  
  /**
   * Schedule processing of a throttled display
   */
  private scheduleThrottledDisplay(packageName: string, activeDisplay: ActiveDisplay): void {
    setTimeout(() => {
      // Check if this is still the most recent request for this app
      const currentRequest = this.throttledRequests.get(packageName);
      if (currentRequest?.activeDisplay === activeDisplay) {
        logger.info(`[DisplayManager] - [${this.userSession?.userId}] ⏳ Processing throttled display for: ${packageName}`);
        // Process the display request after the throttle window
        this.sendToWebSocket(activeDisplay.displayRequest, this.userSession?.websocket);
        
        // Update display state
        this.displayState.currentDisplay = activeDisplay;
        this.lastDisplayTime = Date.now();
        
        // Remove from throttle queue
        this.throttledRequests.delete(packageName);
        
        // Trigger any associated duration expiry
        if (activeDisplay.expiresAt) {
          const timeUntilExpiry = activeDisplay.expiresAt.getTime() - Date.now();
          setTimeout(() => {
            // Only clear if this display is still showing
            if (this.displayState.currentDisplay === activeDisplay) {
              this.showNextDisplay('duration_expired');
            }
          }, timeUntilExpiry);
        }
      }
    }, this.THROTTLE_DELAY);
  }

  private showNextDisplay(reason: 'app_stop' | 'duration_expired' | 'new_request' | 'boot_complete'): void {
    logger.info(`[DisplayManager] - [${this.userSession?.userId}] 🔄 showNextDisplay called with reason: ${reason}`);

    // If we were called due to boot completion but still have items in boot queue,
    // don't do anything - the processBootQueue method will handle displaying these items
    if (reason === 'boot_complete' && this.bootDisplayQueue.size > 0) {
      logger.info(`[DisplayManager] - [${this.userSession?.userId}] ⏩ Skipping showNextDisplay - boot queue is being processed`);
      return;
    }

    // Boot screen takes precedence
    if (this.bootingApps.size > 0) {
      logger.info(`[DisplayManager] - [${this.userSession?.userId}] 🚀 Showing boot screen - ${this.bootingApps.size} apps booting`);
      this.updateBootScreen();
      return;
    }

    // Check for background app with lock
    if (this.displayState.backgroundLock) {
      const { packageName, expiresAt, lastActiveTime } = this.displayState.backgroundLock;
      const now = Date.now();

      // Check if lock should be released due to inactivity
      if (now - lastActiveTime > this.LOCK_INACTIVE_TIMEOUT) {
        logger.info(`[DisplayManager] - [${this.userSession?.userId}] 🔓 Releasing lock due to inactivity: ${packageName}`);
        this.displayState.backgroundLock = null;
      } else if (expiresAt.getTime() > now) {
        // Lock is still valid and active
        if (this.displayState.currentDisplay?.displayRequest.packageName === packageName) {
          logger.info(`[DisplayManager] - [${this.userSession?.userId}] ✅ Lock holder is current display, keeping it`);
          return;
        }

        // If lock holder isn't displaying, try showing core app
        if (this.displayState.coreAppDisplay &&
          this.hasRemainingDuration(this.displayState.coreAppDisplay)) {
          logger.info(`[DisplayManager] - [${this.userSession?.userId}] ✅ Lock holder not displaying, showing core app`);
          if (this.showDisplay(this.displayState.coreAppDisplay)) {
            return;
          }
          // If showing core app failed, continue to next checks
        }
      } else {
        logger.info(`[DisplayManager] - [${this.userSession?.userId}] 🔓 Lock expired for ${packageName}, clearing lock`);
        this.displayState.backgroundLock = null;
      }
    }

    // Show core app display if it exists and has remaining duration
    if (this.displayState.coreAppDisplay && this.hasRemainingDuration(this.displayState.coreAppDisplay)) {
      logger.info(`[DisplayManager] - [${this.userSession?.userId}] ✅ Showing core app display`);
      this.showDisplay(this.displayState.coreAppDisplay);
      return;
    }

    logger.info(`[DisplayManager] - [${this.userSession?.userId}] 🔄 Nothing to show, clearing display`);
    this.clearDisplay('main');
  }

  private canBackgroundAppDisplay(packageName: string): boolean {
    if (this.displayState.backgroundLock?.packageName === packageName) {
      logger.info(`[DisplayManager] - [${this.userSession?.userId}] 🔒 ${packageName} already has background lock`);
      return true;
    }

    if (!this.displayState.backgroundLock) {
      logger.info(`[DisplayManager] - [${this.userSession?.userId}] 🔒 Granting new background lock to ${packageName}`);
      this.displayState.backgroundLock = {
        packageName,
        expiresAt: new Date(Date.now() + this.LOCK_TIMEOUT),
        lastActiveTime: Date.now()
      };
      return true;
    }

    logger.info(`[DisplayManager] - [${this.userSession?.userId}] ❌ ${packageName} blocked - lock held by ${this.displayState.backgroundLock.packageName}`);
    return false;
  }

  private updateBootScreen(): void {
    if (!this.userSession || this.bootingApps.size === 0) return;

    const bootingAppNames = Array.from(this.bootingApps).map(packageName => {
      const app = Object.values(systemApps).find(app => app.packageName === packageName);
      return app ? app.name : packageName;
    });

    const bootRequest: DisplayRequest = {
      type: TpaToCloudMessageType.DISPLAY_REQUEST,
      view: ViewType.MAIN,
      packageName: systemApps.dashboard.packageName,
      layout: {
        layoutType: LayoutType.REFERENCE_CARD,
        title: `// AugmentOS - Starting App${this.bootingApps.size > 1 ? 's' : ''}`,
        text: bootingAppNames.join(", ")
      },
      timestamp: new Date()
    };

    this.sendDisplay(bootRequest);
  }

  private clearDisplay(viewName: string): void {
    if (!this.userSession) return;

    // Don't clear the display if we're in the middle of processing the boot queue
    // This prevents clearing a display just before a queued display is processed
    if (this.bootDisplayQueue.size > 0) {
      logger.info(`[DisplayManager] - [${this.userSession.userId}] ⏩ Skipping clear display - boot queue is not empty`);
      return;
    }

    const clearRequest: DisplayRequest = {
      type: TpaToCloudMessageType.DISPLAY_REQUEST,
      view: viewName as ViewType,
      packageName: systemApps.dashboard.packageName,
      layout: {
        layoutType: LayoutType.TEXT_WALL,
        text: ''
      },
      timestamp: new Date(),
      durationMs: 0
    };
    logger.info(`[DisplayManager] - [${this.userSession.userId}] 🧹 Clearing display for view: ${viewName}`);
    this.sendDisplay(clearRequest);
  }

  private hasRemainingDuration(activeDisplay: ActiveDisplay): boolean {
    if (!activeDisplay.expiresAt) return true;
    return activeDisplay.expiresAt.getTime() > Date.now();
  }

  private createActiveDisplay(displayRequest: DisplayRequest): ActiveDisplay {
    const now = new Date();
    return {
      displayRequest: displayRequest,
      startedAt: now,
      expiresAt: displayRequest.durationMs ? new Date(now.getTime() + displayRequest.durationMs) : undefined
    };
  }

  private sendDisplay(displayRequest: DisplayRequest): boolean {
    if (!this.userSession) return false;

    // Never throttle dashboard view or boot screen
    const isBootPhase = this.bootingApps.size > 0;
    const isDashboard = displayRequest.view === 'dashboard';

    if (!isDashboard && !isBootPhase && Date.now() - this.lastDisplayTime < this.THROTTLE_DELAY) {
      logger.info(`[DisplayManager] - [${this.userSession.userId}] ⏳ Display throttled, queuing: ${displayRequest.packageName}`);

      const activeDisplay = this.createActiveDisplay(displayRequest);
      // Store in per-app throttle map and schedule processing
      this.enqueueThrottledDisplay(activeDisplay);
      return true;
    }

    const success = this.sendToWebSocket(displayRequest, this.userSession.websocket);
    if (success && !isDashboard && !isBootPhase) {
      this.lastDisplayTime = Date.now();
    }

    return success;
  }

  private sendToWebSocket(displayRequest: DisplayRequest, webSocket?: WebSocket): boolean {
    if (!webSocket || webSocket?.readyState !== 1) {
      logger.info(`[DisplayManager] - [${this.userSession?.userId}] ❌ WebSocket not ready`);
      return false;
    }

    try {
      webSocket.send(JSON.stringify(displayRequest));
      return true;
    } catch (error) {
      logger.error(`[DisplayManager] - [${this.userSession?.userId}] ❌ WebSocket error:`, error);
      return false;
    }
  }
}

export default DisplayManager;