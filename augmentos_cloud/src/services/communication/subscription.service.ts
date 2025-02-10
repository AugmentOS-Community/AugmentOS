/**
 * @fileoverview Service for managing TPA subscriptions to data streams.
 * Handles subscription lifecycle, history tracking, and access control.
 * 
 * Primary responsibilities:
 * - Managing TPA data subscriptions
 * - Tracking subscription history
 * - Validating subscription access
 * - Providing subscription queries for broadcasting
 */

import { 
    Subscription,
    WebSocketError
  } from '../../types';
  
  /**
   * Record of a subscription change
   */
  interface SubscriptionHistory {
    timestamp: Date;
    subscriptions: Subscription[];
    action: 'add' | 'remove' | 'update';
  }
  
  /**
   * Interface defining the public API of the subscription service
   */
  export interface ISubscriptionService {
    updateSubscriptions(sessionId: string, packageName: string, userId: string, subscriptions: Subscription[]): void;
    getSubscribedApps(sessionId: string, subscription: Subscription): string[];
    getAppSubscriptions(sessionId: string, packageName: string): Subscription[];
    getSubscriptionHistory(sessionId: string, packageName: string): SubscriptionHistory[];
    removeSubscriptions(sessionId: string, packageName: string): void;
    hasSubscription(sessionId: string, packageName: string, subscription: Subscription): boolean;
  }
  
  /**
   * Implementation of the subscription management service.
   * Design decisions:
   * 1. In-memory storage for fast access
   * 2. History tracking for debugging
   * 3. Wildcard subscription support ('*' or 'all')
   * 4. Session-scoped subscriptions
   */
  export class SubscriptionService implements ISubscriptionService {
    /**
     * Map of active subscriptions keyed by session:app
     * @private
     */
    private subscriptions = new Map<string, Set<Subscription>>();
  
    /**
     * Map of subscription history keyed by session:app
     * @private
     */
    private history = new Map<string, SubscriptionHistory[]>();
  
    /**
     * Generates a unique key for subscription storage
     * @param sessionId - User session identifier
     * @param packageName - TPA identifier
     * @returns Unique key for the session-app pair
     * @private
     */
    private getKey(sessionId: string, packageName: string): string {
      return `${sessionId}:${packageName}`;
    }
  
    /**
     * Updates subscriptions for a TPA.
     * @param sessionId - User session identifier
     * @param packageName - TPA identifier
     * @param userId - User identifier for validation
     * @param subscriptions - New set of subscriptions
     * @throws If invalid subscription types are requested
     */
    updateSubscriptions(
      sessionId: string,
      packageName: string,
      userId: string,
      subscriptions: Subscription[]
    ): void {
      const key = this.getKey(sessionId, packageName);
      const currentSubs = this.subscriptions.get(key) || new Set();
      const action: SubscriptionHistory['action'] = 
        currentSubs.size === 0 ? 'add' : 'update';
  
      // Validate subscriptions
      for (const sub of subscriptions) {
        if (!this.isValidSubscription(sub)) {
          throw new Error(`Invalid subscription type: ${sub}`);
        }
      }
  
      // Update subscriptions
      this.subscriptions.set(key, new Set(subscriptions));
  
      // Record history
      this.addToHistory(key, {
        timestamp: new Date(),
        subscriptions: [...subscriptions],
        action
      });
  
      console.log(`Updated subscriptions for ${packageName} in session ${sessionId}:`, subscriptions);
    }
  
    /**
     * Gets all TPAs subscribed to a specific stream type
     * @param sessionId - User session identifier
     * @param subscription - Subscription type to check
     * @returns Array of app IDs subscribed to the stream
     */
    getSubscribedApps(sessionId: string, subscription: Subscription): string[] {
      const subscribedApps: string[] = [];
  
      for (const [key, subs] of this.subscriptions.entries()) {
        if (!key.startsWith(sessionId)) continue;
  
        const [, packageName] = key.split(':');
        if (subs.has(subscription) || subs.has('*') || subs.has('all')) {
          subscribedApps.push(packageName);
        }
      }
  
      return subscribedApps;
    }
  
    /**
     * Gets all active subscriptions for a TPA
     * @param sessionId - User session identifier
     * @param packageName - TPA identifier
     * @returns Array of active subscriptions
     */
    getAppSubscriptions(sessionId: string, packageName: string): Subscription[] {
      const key = this.getKey(sessionId, packageName);
      const subs = this.subscriptions.get(key);
      return subs ? Array.from(subs) : [];
    }
  
    /**
     * Gets subscription history for a TPA
     * @param sessionId - User session identifier
     * @param packageName - TPA identifier
     * @returns Array of historical subscription changes
     */
    getSubscriptionHistory(sessionId: string, packageName: string): SubscriptionHistory[] {
      const key = this.getKey(sessionId, packageName);
      return this.history.get(key) || [];
    }
  
    /**
     * Removes all subscriptions for a TPA
     * @param sessionId - User session identifier
     * @param packageName - TPA identifier
     */
    removeSubscriptions(sessionId: string, packageName: string): void {
      const key = this.getKey(sessionId, packageName);
      
      if (this.subscriptions.has(key)) {
        const currentSubs = Array.from(this.subscriptions.get(key) || []);
        
        this.subscriptions.delete(key);
        this.addToHistory(key, {
          timestamp: new Date(),
          subscriptions: currentSubs,
          action: 'remove'
        });
  
        console.log(`Removed all subscriptions for ${packageName} in session ${sessionId}`);
      }
    }
  
    /**
     * Checks if a TPA has a specific subscription
     * @param sessionId - User session identifier
     * @param packageName - TPA identifier
     * @param subscription - Subscription type to check
     * @returns Boolean indicating if the subscription exists
     */
    hasSubscription(
      sessionId: string, 
      packageName: string, 
      subscription: Subscription
    ): boolean {
      const key = this.getKey(sessionId, packageName);
      const subs = this.subscriptions.get(key);
      
      if (!subs) return false;
      return subs.has(subscription) || subs.has('*') || subs.has('all');
    }
  
    /**
     * Adds an entry to the subscription history
     * @param key - Session:app key
     * @param entry - History entry to add
     * @private
     */
    private addToHistory(key: string, entry: SubscriptionHistory): void {
      const history = this.history.get(key) || [];
      history.push(entry);
      this.history.set(key, history);
    }
  
    /**
     * Validates a subscription type
     * @param subscription - Subscription to validate
     * @returns Boolean indicating if the subscription is valid
     * @private
     */
    private isValidSubscription(subscription: Subscription): boolean {
      const validTypes = new Set([
        'button_press',
        'phone_notifications',
        'open_dashboard',
        'audio_chunk',
        'video',
        'transcription',
        'translation',
        'all',
        '*'
      ]);
  
      return validTypes.has(subscription);
    }
  }
  
  // Create singleton instance
  export const subscriptionService = new SubscriptionService();
  console.log('✅ Subscription Service');
  
  export default subscriptionService;