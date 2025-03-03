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

import { StreamType, ExtendedStreamType, isLanguageStream, UserSession, parseLanguageStream } from '@augmentos/types';

  /**
   * Record of a subscription change
   */
  interface SubscriptionHistory {
    timestamp: Date;
    subscriptions: ExtendedStreamType[];
    action: 'add' | 'remove' | 'update';
  }
  
  /**
   * Implementation of the subscription management service.
   * Design decisions:
   * 1. In-memory storage for fast access
   * 2. History tracking for debugging
   * 3. Wildcard subscription support ('*' or 'all')
   * 4. Session-scoped subscriptions
   */
  export class SubscriptionService {
    /**
     * Map of active subscriptions keyed by session:app
     * @private
     */
    private subscriptions = new Map<string, Set<StreamType>>();
  
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
      subscriptions: ExtendedStreamType[]
    ): void {
      const key = this.getKey(sessionId, packageName);
      const currentSubs = this.subscriptions.get(key) || new Set();
      const action: SubscriptionHistory['action'] = currentSubs.size === 0 ? 'add' : 'update';

      // Validate subscriptions
      for (const sub of subscriptions) {
        if (!this.isValidSubscription(sub)) {
          throw new Error(`Invalid subscription type: ${sub}`);
        }
      }

      // Update subscriptions
      this.subscriptions.set(key, new Set(subscriptions as StreamType[]));

      // Record history
      this.addToHistory(key, {
        timestamp: new Date(),
        subscriptions: [...subscriptions],
        action
      });

      console.log(`Updated subscriptions for ${packageName} in session ${sessionId}:`, subscriptions);
    }

    /**
     * Returns an object listing which TPAs (by package name) for a specific user (session)
     * are subscribed to "audio_chunk", "translation", and "transcription".
     */
    hasMediaSubscriptions(sessionId: string): boolean {
      for (const [key, subs] of this.subscriptions.entries()) {
        // Only consider subscriptions for the given user session.
        if (!key.startsWith(sessionId + ':')) continue;
    
        for (const sub of subs) {
          // Check plain stream types.
          if (
            sub === StreamType.AUDIO_CHUNK ||
            sub === StreamType.TRANSLATION ||
            sub === StreamType.TRANSCRIPTION
          ) {
            return true;
          }
          // Check if it's a language-specific subscription.
          const langInfo = parseLanguageStream(sub as string);
          if (langInfo && (langInfo.type === StreamType.TRANSLATION || langInfo.type === StreamType.TRANSCRIPTION)) {
            return true;
          }
        }
      }
      return false;
    }
    

    /**
     * Gets all TPAs subscribed to a specific stream type
     * @param sessionId - User session identifier
     * @param subscription - Subscription type to check
     * @returns Array of app IDs subscribed to the stream
     */
    getSubscribedApps(sessionId: string, subscription: ExtendedStreamType): string[] {
      const subscribedApps: string[] = [];
      for (const [key, subs] of this.subscriptions.entries()) {
        if (!key.startsWith(`${sessionId}:`)) continue;
        const [, packageName] = key.split(':');
        for (const sub of subs) {
          // If it's a plain subscription or wildcard
          if (
            sub === subscription ||
            sub === StreamType.ALL ||
            sub === StreamType.WILDCARD
          ) {
            subscribedApps.push(packageName);
            break;
          }
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
    getAppSubscriptions(sessionId: string, packageName: string): StreamType[] {
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
    removeSubscriptions(userSession: UserSession, packageName: string): void {
      const key = this.getKey(userSession.sessionId, packageName);
      if (userSession.appConnections.has(packageName)) {
        // TODO send message to user that we are destroying the connection.
        userSession.appConnections.delete(packageName);
      }

      if (this.subscriptions.has(key)) {
        const currentSubs = Array.from(this.subscriptions.get(key) || []);
        
        this.subscriptions.delete(key);
        this.addToHistory(key, {
          timestamp: new Date(),
          subscriptions: currentSubs,
          action: 'remove'
        });
  
        console.log(`Removed all subscriptions for ${packageName} in session ${userSession.sessionId}`);
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
      subscription: StreamType
    ): boolean {
      const key = this.getKey(sessionId, packageName);
      const subs = this.subscriptions.get(key);
      
      if (!subs) return false;
      return subs.has(subscription) || subs.has(StreamType.WILDCARD) || subs.has(StreamType.ALL);
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
     * Returns the minimal set of language-specific subscriptions for a given user session.
     * For example, if a user’s apps request:
     *  - transcription:en-US
     *  - translation:es-ES-to-en-US
     *  - transcription:en-US
     *
     * This function returns:
     * [ "transcription:en-US", "translation:es-ES-to-en-US" ]
     */
    getMinimalLanguageSubscriptions(sessionId: string): ExtendedStreamType[] {
      const languageSet = new Set<ExtendedStreamType>();
      for (const [key, subs] of this.subscriptions.entries()) {
        if (!key.startsWith(`${sessionId}:`)) continue;
        for (const sub of subs) {
          if (isLanguageStream(sub)) {
            languageSet.add(sub);
          }
        }
      }
      return Array.from(languageSet);
    }
  
    /**
     * Validates a subscription type
     * @param subscription - Subscription to validate
     * @returns Boolean indicating if the subscription is valid
     * @private
     */
    private isValidSubscription(subscription: ExtendedStreamType): boolean {
      const validTypes = new Set(Object.values(StreamType));
      return validTypes.has(subscription as StreamType) || isLanguageStream(subscription);
    }    
  }
  
  // Create singleton instance
  export const subscriptionService = new SubscriptionService();
  console.log('✅ Subscription Service');
  
  export default subscriptionService;