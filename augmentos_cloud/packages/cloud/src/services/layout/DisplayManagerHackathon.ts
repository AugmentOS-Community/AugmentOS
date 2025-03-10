import { systemApps } from '@augmentos/config';
import { ActiveDisplay, Layout, DisplayRequest, DisplayManagerI, UserSession, TpaToCloudMessageType, ViewType, LayoutType } from '@augmentos/sdk';
import { WebSocket } from 'ws';

interface DisplayState {
  currentDisplay: ActiveDisplay | null;
  coreAppDisplay: ActiveDisplay | null;
  backgroundLock: {
    packageName: string;
    expiresAt: Date;
    lastActiveTime: number;  // Track when lock holder last displayed something
  } | null;
}

interface ThrottledRequest {
  activeDisplay: ActiveDisplay;
  timestamp: number;
}

class DisplayManager implements DisplayManagerI {
  private displayState: DisplayState = {
    currentDisplay: null,
    coreAppDisplay: null,
    backgroundLock: null
  };
  private bootingApps: Set<string> = new Set();
  private readonly LOCK_TIMEOUT = 10000;
  private readonly LOCK_INACTIVE_TIMEOUT = 2000; // Release lock if no display for 2s

  private readonly THROTTLE_DELAY = 300;
  private readonly BOOT_DURATION = 3000;
  
  // Constants for persistent display refresh
  private readonly AUTO_CLEAR_TIME = 15000; // Glasses auto-clear after 15 seconds
  private readonly REFRESH_BUFFER = 1000; // Buffer time to refresh before auto-clear
  private readonly REFRESH_INTERVAL = this.AUTO_CLEAR_TIME - this.REFRESH_BUFFER; // ~14 seconds
  
  private lastDisplayTime = 0;
  private userSession: UserSession | null = null;
  private mainApp: string = systemApps.captions.packageName; // Hardcode captions as core app
  private throttledRequest: ThrottledRequest | null = null;
  
  // Timer for refreshing persistent displays
  private persistentDisplayTimer: NodeJS.Timeout | null = null;

  public handleAppStart(packageName: string, userSession: UserSession): void {
    this.userSession = userSession;

    // Don't show boot screen for dashboard
    if (packageName === systemApps.dashboard.packageName) {
      console.log(`[DisplayManager] - [${userSession.userId}] 🚀 Dashboard starting`);
      return;
    }

    console.log(`[DisplayManager] - [${userSession.userId}] 🚀 Starting app: ${packageName}`);
    this.bootingApps.add(packageName);
    this.updateBootScreen();

    setTimeout(() => {
      console.log(`[DisplayManager] - [${userSession.userId}] ✅ Boot complete for: ${packageName}`);
      this.bootingApps.delete(packageName);
      if (this.bootingApps.size === 0) {
        this.showNextDisplay('app_stop');
      } else {
        this.updateBootScreen();
      }
    }, this.BOOT_DURATION);
  }

  public handleAppStop(packageName: string, userSession: UserSession): void {
    this.userSession = userSession;
    console.log(`[DisplayManager] - [${userSession.userId}] 🛑 Stopping app: ${packageName}`);

    // Get current booting state before removal
    const wasBooting = this.bootingApps.has(packageName);

    // Remove from booting apps if present
    this.bootingApps.delete(packageName);

    // Handle boot screen update if app was booting
    if (wasBooting) {
      if (this.bootingApps.size > 0) {
        console.log(`[DisplayManager] - [${userSession.userId}] 🚀 Updating boot screen after app stop`);
        this.updateBootScreen();
      } else {
        console.log(`[DisplayManager] - [${userSession.userId}] 🔄 Boot screen complete, clearing state`);
        // Make sure we clear current display if it was boot screen
        if (this.displayState.currentDisplay?.displayRequest.packageName === systemApps.dashboard.packageName) {
          this.clearDisplay('main');
        }
      }
    }

    // Clear any background lock held by this app
    if (this.displayState.backgroundLock?.packageName === packageName) {
      console.log(`[DisplayManager] - [${userSession.userId}] 🔓 Clearing background lock for: ${packageName}`);
      this.displayState.backgroundLock = null;
    }

    // If this was the core app, clear its saved display
    if (packageName === this.mainApp) {
      console.log(`[DisplayManager] - [${userSession.userId}] 🔄 Clearing core app display: ${packageName}`);
      this.displayState.coreAppDisplay = null;

      // If core app was currently displaying, clear the display
      if (this.displayState.currentDisplay?.displayRequest.packageName === packageName) {
        console.log(`[DisplayManager] - [${userSession.userId}] 🔄 Core app was displaying, clearing display`);
        this.clearDisplay('main');
      }
    }

    // Clear persistent timer if this app was using it
    if (this.displayState.currentDisplay?.displayRequest.packageName === packageName) {
      this.cancelPersistentDisplayTimer();
      this.showNextDisplay('app_stop');
    }
  }

  public handleDisplayEvent(displayRequest: DisplayRequest, userSession: UserSession): boolean {
    this.userSession = userSession;

    // Always show dashboard immediately
    if (displayRequest.packageName === systemApps.dashboard.packageName) {
      console.log(`[DisplayManager] - [${userSession.userId}] 📱 Dashboard display request: ${displayRequest.packageName}`);
      return this.sendDisplay(displayRequest);
    }

    // Block ALL display requests if ANY app is booting (except dashboard)
    if (this.bootingApps.size > 0) {
      console.log(`[DisplayManager] - [${userSession.userId}] ❌ Blocking display during boot: ${displayRequest.packageName}`);
      return false;
    }

    // Handle core app display
    if (displayRequest.packageName === this.mainApp) {
      console.log(`[DisplayManager] - [${userSession.userId}] 📱 Core app display request: ${displayRequest.packageName}`);
      const activeDisplay = this.createActiveDisplay(displayRequest);
      this.displayState.coreAppDisplay = activeDisplay;

      // Check if background app with lock is actually displaying
      if (!this.displayState.backgroundLock ||
        this.displayState.currentDisplay?.displayRequest.packageName !== this.displayState.backgroundLock.packageName) {
        console.log(`[DisplayManager] - [${userSession.userId}] ✅ Background not displaying, showing core app`);
        return this.showDisplay(activeDisplay);
      }
      console.log(`[DisplayManager] - [${userSession.userId}] ❌ Background app is displaying, core app blocked by ${this.displayState.backgroundLock.packageName}`);
      return false;
    }

    // Handle background app display
    const canDisplay = this.canBackgroundAppDisplay(displayRequest.packageName);
    if (canDisplay) {
      console.log(`[DisplayManager] - [${userSession.userId}] ✅ Background app can display: ${displayRequest.packageName}`);
      const activeDisplay = this.createActiveDisplay(displayRequest);
      return this.showDisplay(activeDisplay);
    }

    console.log(`[DisplayManager] - [${userSession.userId}] ❌ Background app display blocked - no lock: ${displayRequest.packageName}`);
    return false;
  }

  private showDisplay(activeDisplay: ActiveDisplay): boolean {
    // Check throttle
    if (Date.now() - this.lastDisplayTime < this.THROTTLE_DELAY) {
      console.log(`[DisplayManager] - [${this.userSession?.userId}] ⏳ Throttled display request`);
      return false;
    }

    // Cancel any existing persistent display timer
    this.cancelPersistentDisplayTimer();

    const success = this.sendToWebSocket(activeDisplay.displayRequest, this.userSession?.websocket);
    if (success) {
      this.displayState.currentDisplay = activeDisplay;
      this.lastDisplayTime = Date.now();

      // If core app successfully displays while background app has lock but isn't showing anything,
      // release the background app's lock
      if (activeDisplay.displayRequest.packageName === this.mainApp &&
        this.displayState.backgroundLock &&
        this.displayState.currentDisplay?.displayRequest.packageName !== this.displayState.backgroundLock.packageName) {
        console.log(`[DisplayManager] - [${this.userSession?.userId}] 🔓 Releasing background lock as core app took display: ${this.displayState.backgroundLock.packageName}`);
        this.displayState.backgroundLock = null;
      }

      // Update lastActiveTime if this is the lock holder
      if (this.displayState.backgroundLock?.packageName === activeDisplay.displayRequest.packageName) {
        this.displayState.backgroundLock.lastActiveTime = Date.now();
      }

      console.log(`[DisplayManager] - [${this.userSession?.userId}] ✅ Display sent successfully: ${activeDisplay.displayRequest.packageName}`);

      // Handle expiration and persistence based on durationMs
      if (activeDisplay.expiresAt) {
        // Normal timed display - set timeout to clear after duration
        const timeUntilExpiry = activeDisplay.expiresAt.getTime() - Date.now();
        setTimeout(() => {
          // Only clear if this display is still showing
          if (this.displayState.currentDisplay === activeDisplay) {
            this.showNextDisplay('duration_expired');
          }
        }, timeUntilExpiry);
      } else {
        // Persistent display (undefined or -1 duration)
        // Set up refresh timer for persistent displays
        this.setupPersistentDisplayTimer(activeDisplay);
      }
    }
    return success;
  }

  private showNextDisplay(reason: 'app_stop' | 'duration_expired' | 'new_request'): void {
    console.log(`[DisplayManager] - [${this.userSession?.userId}] 🔄 showNextDisplay called with reason: ${reason}`);

    // Cancel any existing persistent display timer when switching displays
    this.cancelPersistentDisplayTimer();

    // Boot screen takes precedence
    if (this.bootingApps.size > 0) {
      console.log(`[DisplayManager] - [${this.userSession?.userId}] 🚀 Showing boot screen - ${this.bootingApps.size} apps booting`);
      this.updateBootScreen();
      return;
    }

    // Check for background app with lock
    if (this.displayState.backgroundLock) {
      const { packageName, expiresAt, lastActiveTime } = this.displayState.backgroundLock;
      const now = Date.now();

      // Check if lock should be released due to inactivity
      if (now - lastActiveTime > this.LOCK_INACTIVE_TIMEOUT) {
        console.log(`[DisplayManager] - [${this.userSession?.userId}] 🔓 Releasing lock due to inactivity: ${packageName}`);
        this.displayState.backgroundLock = null;
      } else if (expiresAt.getTime() > now) {
        // Lock is still valid and active
        if (this.displayState.currentDisplay?.displayRequest.packageName === packageName) {
          console.log(`[DisplayManager] - [${this.userSession?.userId}] ✅ Lock holder is current display, keeping it`);
          // Restore persistent timer if needed
          this.setupPersistentDisplayTimer(this.displayState.currentDisplay);
          return;
        }

        // If lock holder isn't displaying, try showing core app
        if (this.displayState.coreAppDisplay &&
          this.hasRemainingDuration(this.displayState.coreAppDisplay)) {
          console.log(`[DisplayManager] - [${this.userSession?.userId}] ✅ Lock holder not displaying, showing core app`);
          if (this.showDisplay(this.displayState.coreAppDisplay)) {
            return;
          }
          // If showing core app failed, continue to next checks
        }
      } else {
        console.log(`[DisplayManager] - [${this.userSession?.userId}] 🔓 Lock expired for ${packageName}, clearing lock`);
        this.displayState.backgroundLock = null;
      }
    }

    // Show core app display if it exists and has remaining duration
    if (this.displayState.coreAppDisplay && this.hasRemainingDuration(this.displayState.coreAppDisplay)) {
      console.log(`[DisplayManager] - [${this.userSession?.userId}] ✅ Showing core app display`);
      this.showDisplay(this.displayState.coreAppDisplay);
      return;
    }

    console.log(`[DisplayManager] - [${this.userSession?.userId}] 🔄 Nothing to show, clearing display`);
    this.clearDisplay('main');
  }

  private canBackgroundAppDisplay(packageName: string): boolean {
    if (this.displayState.backgroundLock?.packageName === packageName) {
      console.log(`[DisplayManager] - [${this.userSession?.userId}] 🔒 ${packageName} already has background lock`);
      return true;
    }

    if (!this.displayState.backgroundLock) {
      console.log(`[DisplayManager] - [${this.userSession?.userId}] 🔒 Granting new background lock to ${packageName}`);
      this.displayState.backgroundLock = {
        packageName,
        expiresAt: new Date(Date.now() + this.LOCK_TIMEOUT),
        lastActiveTime: Date.now()
      };
      return true;
    }

    console.log(`[DisplayManager] - [${this.userSession?.userId}] ❌ ${packageName} blocked - lock held by ${this.displayState.backgroundLock.packageName}`);
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

    // Cancel any persistent display timer when clearing
    this.cancelPersistentDisplayTimer();

    const clearRequest: DisplayRequest = {
      type: TpaToCloudMessageType.DISPLAY_REQUEST,
      view: viewName as ViewType,
      packageName: systemApps.dashboard.packageName,
      layout: { 
        layoutType: LayoutType.TEXT_WALL,
        text: '' 
      },
      timestamp: new Date()
    };
    this.sendDisplay(clearRequest);
  }

  private hasRemainingDuration(activeDisplay: ActiveDisplay): boolean {
    // If no expiresAt, it's a persistent display (return true)
    if (!activeDisplay.expiresAt) return true;
    
    // If durationMs is -1, it's persistent
    if (activeDisplay.displayRequest.durationMs === -1) return true;

    // Otherwise check time remaining
    return activeDisplay.expiresAt.getTime() > Date.now();
  }

  private createActiveDisplay(displayRequest: DisplayRequest): ActiveDisplay {
    const now = new Date();
    
    // Special handling for persistent displays
    // If durationMs is undefined or -1, treat as persistent (no expiry)
    if (displayRequest.durationMs === undefined || displayRequest.durationMs === -1) {
      return {
        displayRequest: displayRequest,
        startedAt: now,
        // No expiresAt for persistent displays
      };
    }

    // Regular timed display
    return {
      displayRequest: displayRequest,
      startedAt: now,
      expiresAt: new Date(now.getTime() + displayRequest.durationMs)
    };
  }

  private sendDisplay(displayRequest: DisplayRequest): boolean {
    if (!this.userSession) return false;
  
    // Never throttle dashboard view or boot screen
    const isBootPhase = this.bootingApps.size > 0;
    const isDashboard = displayRequest.view === 'dashboard';
  
    if (!isDashboard && !isBootPhase && Date.now() - this.lastDisplayTime < this.THROTTLE_DELAY) {
      console.log(`[DisplayManager] - [${this.userSession.userId}] ⏳ Display throttled, queuing: ${displayRequest.packageName}`);
      
      const activeDisplay = this.createActiveDisplay(displayRequest);
      this.throttledRequest = {
        activeDisplay,
        timestamp: Date.now()
      };
  
      // Schedule this display to happen after throttle delay
      setTimeout(() => {
        // Only process if this is still the most recent throttled request AND nothing else has displayed
        if (this.throttledRequest?.activeDisplay === activeDisplay && 
            this.displayState.currentDisplay?.displayRequest.packageName !== displayRequest.packageName) {
          console.log(`[DisplayManager] - [${this.userSession?.userId}] ⏳ Processing throttled display: ${displayRequest.packageName}`);
          this.sendDisplay(displayRequest);
        }
        this.throttledRequest = null;
      }, this.THROTTLE_DELAY);
  
      return false;
    }
  
    const success = this.sendToWebSocket(displayRequest, this.userSession.websocket);
    if (success && !isDashboard && !isBootPhase) {
      this.lastDisplayTime = Date.now();
      // Clear any throttled request since something new just displayed
      if (this.throttledRequest) {
        console.log(`[DisplayManager] - [${this.userSession.userId}] 🔄 Canceling throttled request as new content displayed`);
        this.throttledRequest = null;
      }
    }
  
    return success;
  }

  private sendToWebSocket(displayRequest: DisplayRequest, webSocket?: WebSocket): boolean {
    if (!webSocket || webSocket.readyState !== 1) {
      console.log(`[DisplayManager] - [${this.userSession?.userId}] ❌ WebSocket not ready`);
      return false;
    }

    try {
      webSocket.send(JSON.stringify(displayRequest));
      return true;
    } catch (error) {
      console.error(`[DisplayManager] - [${this.userSession?.userId}] ❌ WebSocket error:`, error);
      return false;
    }
  }

  /**
   * Sets up a timer to refresh persistent displays before they auto-clear
   */
  private setupPersistentDisplayTimer(activeDisplay: ActiveDisplay): void {
    // Only set up timer for displays without expiry
    if (activeDisplay.expiresAt) return;

    // Cancel any existing timer
    this.cancelPersistentDisplayTimer();
    
    console.log(`[DisplayManager] - [${this.userSession?.userId}] 🔄 Setting up persistent display timer for ${activeDisplay.displayRequest.packageName}`);
    
    // Set new timer to refresh just before auto-clear
    this.persistentDisplayTimer = setTimeout(() => {
      // Only refresh if the display is still the current one
      if (this.displayState.currentDisplay === activeDisplay) {
        console.log(`[DisplayManager] - [${this.userSession?.userId}] 🔄 Refreshing persistent display for ${activeDisplay.displayRequest.packageName}`);
        
        // Re-send the same display request to refresh it
        this.sendToWebSocket(activeDisplay.displayRequest, this.userSession?.websocket);
        
        // Set up the next refresh cycle
        this.setupPersistentDisplayTimer(activeDisplay);
      }
    }, this.REFRESH_INTERVAL);
  }

  /**
   * Cancels the persistent display timer if active
   */
  private cancelPersistentDisplayTimer(): void {
    if (this.persistentDisplayTimer) {
      clearTimeout(this.persistentDisplayTimer);
      this.persistentDisplayTimer = null;
    }
  }
}

export default DisplayManager;