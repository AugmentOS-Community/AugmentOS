import { systemApps } from '@augmentos/config';
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
  private readonly BOOT_DURATION = 1500;
  private lastDisplayTime = 0;
  private userSession: UserSession | null = null;
  private mainApp: string = systemApps.captions.packageName; // Hardcode captions as core app
  private throttledRequest: ThrottledRequest | null = null;

  public handleAppStart(packageName: string, userSession: UserSession): void {
    this.userSession = userSession;

    // Don't show boot screen for dashboard
    if (packageName === systemApps.dashboard.packageName) {
      logger.info(`[DisplayManager] - [${userSession.userId}] 🚀 Dashboard starting`);
      return;
    }

    logger.info(`[DisplayManager] - [${userSession.userId}] 🚀 Starting app: ${packageName}`);
    this.bootingApps.add(packageName);
    this.updateBootScreen();

    setTimeout(() => {
      logger.info(`[DisplayManager] - [${userSession.userId}] ✅ Boot complete for: ${packageName}`);
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
    logger.info(`[DisplayManager] - [${userSession.userId}] 🛑 Stopping app: ${packageName}`);

    // Get current booting state before removal
    const wasBooting = this.bootingApps.has(packageName);

    // Remove from booting apps if present
    this.bootingApps.delete(packageName);

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
      // console.log(`[DisplayManager] - [${userSession.userId}] 📱 Dashboard display request: ${displayRequest.packageName}`);
      return this.sendDisplay(displayRequest);
    }

    // Block ALL display requests if ANY app is booting (except dashboard)
    if (this.bootingApps.size > 0) {
      logger.info(`[DisplayManager] - [${userSession.userId}] ❌ Blocking display during boot: ${displayRequest.packageName}`);
      return false;
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
      logger.info(`[DisplayManager] - [${this.userSession?.userId}] ⏳ Throttled display request`);
      return false;
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

  private showNextDisplay(reason: 'app_stop' | 'duration_expired' | 'new_request'): void {
    logger.info(`[DisplayManager] - [${this.userSession?.userId}] 🔄 showNextDisplay called with reason: ${reason}`);

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
      // type: 'display_event',
      // view: 'main',
      type: TpaToCloudMessageType.DISPLAY_REQUEST,
      view: ViewType.MAIN,
      packageName: systemApps.dashboard.packageName,
      layout: {
        // layoutType: "reference_card",
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

    const clearRequest: DisplayRequest = {
      // type: 'display_event',
      // view: viewName,
      type: TpaToCloudMessageType.DISPLAY_REQUEST,
      view: viewName as ViewType,
      packageName: systemApps.dashboard.packageName,
      layout: {
        // layoutType: 'text_wall', 
        layoutType: LayoutType.TEXT_WALL,
        text: ''
      },
      timestamp: new Date(),
      durationMs: 0
    };
//     console.log('####### clearDisplay', clearRequest);
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
      this.throttledRequest = {
        activeDisplay,
        timestamp: Date.now()
      };

      // Schedule this display to happen after throttle delay
      setTimeout(() => {
        // Only process if this is still the most recent throttled request AND nothing else has displayed
        if (this.throttledRequest?.activeDisplay === activeDisplay &&
          this.displayState.currentDisplay?.displayRequest.packageName !== displayRequest.packageName) {
          logger.info(`[DisplayManager] - [${this.userSession?.userId}] ⏳ Processing throttled display: ${displayRequest.packageName}`);
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
        logger.info(`[DisplayManager] - [${this.userSession.userId}] 🔄 Canceling throttled request as new content displayed`);
        this.throttledRequest = null;
      }
    }

    return success;
  }

  private sendToWebSocket(displayRequest: DisplayRequest, webSocket?: WebSocket): boolean {
    // console.log('####### webSocket', WebSocket?.OPEN);
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