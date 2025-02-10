/**
 * 🎮 AR Display Manager for Third Party Apps (TPAs)
 * 
 * Why this exists:
 * - TPAs need to show content in AR but shouldn't conflict with each other
 * - Some displays are more important than others (system alerts vs background info)
 * - We need to know what each TPA has shown (for debugging/support)
 */

import { Layout } from '../../types';
import { ISessionService } from '../core/session.service';
import sessionService from '../core/session.service';

/**
 * 🎚️ How important is this display?
 * Used to decide if a new display can interrupt current one
 */
export enum DisplayPriority {
  LOW = 0,      // Background info, can be interrupted
  MEDIUM = 1,   // Standard app displays
  HIGH = 2,     // Important notifications
  CRITICAL = 3  // System alerts, errors - will interrupt others
}

/** What we track for each display (for history/debugging) */
interface DisplayRecord {
  layout: Layout;
  timestamp: Date;
  durationMs?: number;
  packageName: string;
  sessionId: string;
  priority: DisplayPriority;
}

/** Required interface - don't change or things will break */
export interface IDisplayService {
  handleDisplayEvent(
    sessionId: string,
    packageName: string,
    layout: Layout,
    priority?: DisplayPriority,
    durationMs?: number
  ): Promise<boolean>;
  getDisplayHistory(sessionId: string, packageName: string): DisplayRecord[];
  // These exist for compatibility but aren't used
  getRecentDisplays(sessionId: string, limit?: number): DisplayRecord[];
  clearHistory(sessionId: string, packageName: string): void;
  getDisplayStats(sessionId: string, packageName: string): any;
}

/** What's showing right now in a session */
interface ActiveDisplay {
  record: DisplayRecord;
  endsAt?: Date;  // When to auto-clear this display
}

export class DisplayService implements IDisplayService {
  // Track what's currently showing in each session
  private activeDisplays = new Map<string, ActiveDisplay>();
  // Keep history for debugging/support
  private displayHistory = new Map<string, DisplayRecord[]>();

  constructor(private readonly sessionService: ISessionService) {}

  /**
   * Main entry point for TPAs to show something in AR
   * Returns true if shown, false if blocked by higher priority display
   */
  async handleDisplayEvent(
    sessionId: string,
    packageName: string,
    layout: Layout,
    priority: DisplayPriority = DisplayPriority.MEDIUM,
    durationMs?: number
  ): Promise<boolean> {
    try {
      const record: DisplayRecord = {
        layout,
        timestamp: new Date(),
        durationMs,
        packageName: packageName,
        sessionId,
        priority
      };

      
      await this.showDisplay(record, durationMs);

      // Still track attempts that weren't shown
      this.addToHistory(record);
      return false;

    } catch (error) {
      console.error('🔥 Display error:', error);
      return false;
    }
  }

  /** Updates AR display and sets auto-cleanup if needed */
  private async showDisplay(record: DisplayRecord, durationMs?: number): Promise<void> {
    const activeDisplay: ActiveDisplay = {
      record,
      endsAt: durationMs ? new Date(Date.now() + durationMs) : undefined
    };

    this.activeDisplays.set(record.sessionId, activeDisplay);
    this.addToHistory(record);
    
    await this.sessionService.updateDisplay(
      record.sessionId,
      record.layout,
      durationMs
    );

    // Auto-cleanup after duration
    if (durationMs) {
      setTimeout(() => {
        this.activeDisplays.delete(record.sessionId);
      }, durationMs);
    }
  }

  /** Keep track of all attempts (shown or not) for debugging */
  private addToHistory(record: DisplayRecord): void {
    const key = `${record.sessionId}:${record.packageName}`;
    const history = this.displayHistory.get(key) || [];
    history.push(record);
    this.displayHistory.set(key, history);
  }

  /** Get what a TPA has tried to show (for debugging) */
  getDisplayHistory(sessionId: string, packageName: string): DisplayRecord[] {
    const key = `${sessionId}:${packageName}`;
    return this.displayHistory.get(key) || [];
  }

  // Interface compatibility methods - not actually used
  getRecentDisplays(): DisplayRecord[] {
    return [];
  }

  clearHistory(sessionId: string, packageName: string): void {
    const key = `${sessionId}:${packageName}`;
    this.displayHistory.delete(key);
  }

  getDisplayStats(): any {
    return {
      totalDisplays: 0,
      averageDuration: 0,
      interruptionRate: 0,
      byPriority: {
        [DisplayPriority.LOW]: 0,
        [DisplayPriority.MEDIUM]: 0,
        [DisplayPriority.HIGH]: 0,
        [DisplayPriority.CRITICAL]: 0
      }
    };
  }
}

// Create the one instance everyone should use
export const displayService = new DisplayService(sessionService);
console.log('✅ Display Service Ready!');

export default displayService;