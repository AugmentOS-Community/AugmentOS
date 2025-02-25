import { systemApps } from '@augmentos/config';
import { ActiveDisplay, Layout, DisplayRequest, DisplayManagerI, UserSession } from '@augmentos/types';
import { WebSocket } from 'ws';

interface DisplayState {
  currentDisplay: ActiveDisplay | null;
  coreAppDisplay: ActiveDisplay | null;
  backgroundLock: {
    packageName: string;
    expiresAt: Date;
    lastActiveTime: number;
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
  private readonly LOCK_INACTIVE_TIMEOUT = 2000;
  private readonly THROTTLE_DELAY = 200;
  private readonly BOOT_DURATION = 3000;
  private lastDisplayTime = 0;
  private userSession: UserSession | null = null;
  private mainApp: string = systemApps.captions.packageName;
  private throttleQueue: ThrottledRequest | null = null;

  public handleAppStart(packageName: string, userSession: UserSession): void {
    this.userSession = userSession;

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

    const wasBooting = this.bootingApps.has(packageName);
    this.bootingApps.delete(packageName);

    if (wasBooting) {
      if (this.bootingApps.size > 0) {
        console.log(`[DisplayManager] - [${userSession.userId}] 🚀 Updating boot screen after app stop`);
        this.updateBootScreen();
      } else {
        console.log(`[DisplayManager] - [${userSession.userId}] 🔄 Boot screen complete, clearing state`);
        if (this.displayState.currentDisplay?.displayRequest.packageName === systemApps.dashboard.packageName) {
          this.clearDisplay('main');
        }
      }
    }

    // Clear throttle queue if it was from this app
    if (this.throttleQueue?.activeDisplay.displayRequest.packageName === packageName) {
      console.log(`[DisplayManager] - [${userSession.userId}] 🔄 Clearing throttled request from stopped app`);
      this.throttleQueue = null;
    }

    if (this.displayState.backgroundLock?.packageName === packageName) {
      console.log(`[DisplayManager] - [${userSession.userId}] 🔓 Clearing background lock for: ${packageName}`);
      this.displayState.backgroundLock = null;
    }

    if (packageName === this.mainApp) {
      console.log(`[DisplayManager] - [${userSession.userId}] 🔄 Clearing core app display: ${packageName}`);
      this.displayState.coreAppDisplay = null;

      if (this.displayState.currentDisplay?.displayRequest.packageName === packageName) {
        console.log(`[DisplayManager] - [${userSession.userId}] 🔄 Core app was displaying, clearing display`);
        this.clearDisplay('main');
      }
    }

    if (this.displayState.currentDisplay?.displayRequest.packageName === packageName) {
      this.showNextDisplay('app_stop');
    }
  }

  public handleDisplayEvent(displayRequest: DisplayRequest, userSession: UserSession): boolean {
    this.userSession = userSession;

    if (displayRequest.packageName === systemApps.dashboard.packageName) {
      console.log(`[DisplayManager] - [${userSession.userId}] 📱 Dashboard display request: ${displayRequest.packageName}`);
      return this.sendDisplay(displayRequest);
    }

    if (this.bootingApps.size > 0) {
      console.log(`[DisplayManager] - [${userSession.userId}] ❌ Blocking display during boot: ${displayRequest.packageName}`);
      return false;
    }

    if (displayRequest.packageName === this.mainApp) {
      console.log(`[DisplayManager] - [${userSession.userId}] 📱 Core app display request: ${displayRequest.packageName}`);
      const activeDisplay = this.createActiveDisplay(displayRequest);
      this.displayState.coreAppDisplay = activeDisplay;

      if (!this.displayState.backgroundLock ||
          this.displayState.currentDisplay?.displayRequest.packageName !== this.displayState.backgroundLock.packageName) {
        console.log(`[DisplayManager] - [${userSession.userId}] ✅ Background not displaying, showing core app`);
        return this.showDisplay(activeDisplay);
      }
      console.log(`[DisplayManager] - [${userSession.userId}] ❌ Background app is displaying, core app blocked by ${this.displayState.backgroundLock.packageName}`);
      return false;
    }

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
    if (Date.now() - this.lastDisplayTime < this.THROTTLE_DELAY) {
      console.log(`[DisplayManager] - [${this.userSession?.userId}] ⏳ Throttling display request, will show after delay`);
      
      // Cancel any existing throttled request
      if (this.throttleQueue) {
        console.log(`[DisplayManager] - [${this.userSession?.userId}] 🔄 Replacing existing throttled request`);
      }
      
      this.throttleQueue = {
        activeDisplay,
        timestamp: Date.now()
      };

      setTimeout(() => {
        if (this.throttleQueue?.activeDisplay === activeDisplay) {
          console.log(`[DisplayManager] - [${this.userSession?.userId}] ⏳ Processing throttled display request`);
          this.showDisplay(activeDisplay);
          this.throttleQueue = null;
        }
      }, this.THROTTLE_DELAY);

      return false;
    }

    const success = this.sendToWebSocket(activeDisplay.displayRequest, this.userSession?.websocket);
    if (success) {
      this.displayState.currentDisplay = activeDisplay;
      this.lastDisplayTime = Date.now();

      if (activeDisplay.displayRequest.packageName === this.mainApp &&
          this.displayState.backgroundLock &&
          this.displayState.currentDisplay?.displayRequest.packageName !== this.displayState.backgroundLock.packageName) {
        console.log(`[DisplayManager] - [${this.userSession?.userId}] 🔓 Releasing background lock as core app took display: ${this.displayState.backgroundLock.packageName}`);
        this.displayState.backgroundLock = null;
      }

      if (this.displayState.backgroundLock?.packageName === activeDisplay.displayRequest.packageName) {
        this.displayState.backgroundLock.lastActiveTime = Date.now();
      }

      console.log(`[DisplayManager] - [${this.userSession?.userId}] ✅ Display sent successfully: ${activeDisplay.displayRequest.packageName}`);

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

  private showNextDisplay(reason: 'app_stop' | 'duration_expired' | 'new_request'): void {
    console.log(`[DisplayManager] - [${this.userSession?.userId}] 🔄 showNextDisplay called with reason: ${reason}`);

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
      type: 'display_event',
      view: 'main',
      packageName: systemApps.dashboard.packageName,
      layout: {
        layoutType: "reference_card",
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
      type: 'display_event',
      view: viewName,
      packageName: systemApps.dashboard.packageName,
      layout: { layoutType: 'text_wall', text: '' },
      timestamp: new Date()
    };
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
  
    // Bypass throttle for dashboard views or during boot phase
    const isBootPhase = this.bootingApps.size > 0;
    const isDashboard = displayRequest.view === 'dashboard';
  
    if (!isDashboard && !isBootPhase && Date.now() - this.lastDisplayTime < this.THROTTLE_DELAY) {
      console.log(`[DisplayManager] - [${this.userSession.userId}] ⏳ Display throttled: ${displayRequest.packageName}`);
      return false;
    }
  
    const success = this.sendToWebSocket(displayRequest, this.userSession.websocket);
    if (success && !isDashboard && !isBootPhase) {
      this.lastDisplayTime = Date.now();
    }
  
    return success;
  }

  private sendToWebSocket(displayRequest: DisplayRequest, webSocket?: WebSocket): boolean {
    if (!webSocket || webSocket.readyState !== WebSocket.OPEN) {
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
}

export default DisplayManager;