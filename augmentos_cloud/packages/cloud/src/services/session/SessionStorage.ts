/**
 * @fileoverview Singleton session storage class to manage UserSession instances
 * across the application. This isolates session storage from the UserSession class
 * to prevent potential module loading or state issues.
 */

import { UserSession } from './UserSession';
import { logger as rootLogger } from '../logging/pino-logger';

class SessionStorage {
  private static instance: SessionStorage;
  private sessions = new Map<string, UserSession>();
  
  private constructor() {
    // Private constructor prevents direct instantiation
    rootLogger.info({ service: 'SessionStorage' }, 'SessionStorage singleton instance created');
  }
  
  static getInstance(): SessionStorage {
    if (!SessionStorage.instance) {
      SessionStorage.instance = new SessionStorage();
    }
    return SessionStorage.instance;
  }
  
  set(userId: string, session: UserSession): void {
    const existing = this.sessions.get(userId);
    if (existing) {
      rootLogger.warn({
        service: 'SessionStorage',
        userId,
        existingSessionStartTime: existing.startTime,
        existingSessionDisconnectedAt: existing.disconnectedAt,
        newSessionStartTime: session.startTime
      }, `⚠️ RACE CONDITION: Overwriting existing session for ${userId}`);
    }
    
    this.sessions.set(userId, session);
    rootLogger.debug({
      service: 'SessionStorage',
      userId,
      totalSessions: this.sessions.size,
      allUserIds: Array.from(this.sessions.keys())
    }, `✅ Session stored for ${userId}`);
  }
  
  get(userId: string): UserSession | undefined {
    const session = this.sessions.get(userId);
    const allUserIds = Array.from(this.sessions.keys());

    // Debug logging to track session lookups
    rootLogger.debug({
      service: 'SessionStorage.get',
      lookupUserId: userId,
      sessionFound: !!session,
      totalSessions: this.sessions.size,
      allSessionUserIds: allUserIds,
      userIdType: typeof userId,
      userIdLength: userId?.length || 0,
      exactMatches: allUserIds.filter(id => id === userId),
      similarMatches: allUserIds.filter(id => id.toLowerCase() === userId.toLowerCase()),
      containsMatches: allUserIds.filter(id => id.includes(userId) || userId.includes(id))
    }, `Session lookup: ${userId} -> ${session ? 'FOUND' : 'NOT FOUND'}`);
    
    return session;
  }
  
  delete(userId: string): boolean {
    const wasInMap = this.sessions.has(userId);
    const result = this.sessions.delete(userId);
    
    rootLogger.debug({
      service: 'SessionStorage',
      userId,
      wasInMap,
      totalSessionsAfter: this.sessions.size,
      remainingUserIds: Array.from(this.sessions.keys())
    }, `🗑️ Session removed from storage for ${userId}`);
    
    return result;
  }
  
  values(): IterableIterator<UserSession> {
    return this.sessions.values();
  }
  
  keys(): IterableIterator<string> {
    return this.sessions.keys();
  }
  
  get size(): number {
    return this.sessions.size;
  }
  
  has(userId: string): boolean {
    return this.sessions.has(userId);
  }
  
  clear(): void {
    const count = this.sessions.size;
    this.sessions.clear();
    rootLogger.debug({
      service: 'SessionStorage',
      clearedSessions: count
    }, 'All sessions cleared from storage');
  }
  
  /**
   * Get all active sessions as an array
   */
  getAllSessions(): UserSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Debug method to log current storage state
   */
  debugStorage(): void {
    rootLogger.debug({
      service: 'SessionStorage',
      totalSessions: this.sessions.size,
      allUserIds: Array.from(this.sessions.keys()),
      sessionDetails: Array.from(this.sessions.entries()).map(([userId, session]) => ({
        userId,
        startTime: session.startTime,
        disconnectedAt: session.disconnectedAt,
        hasWebSocket: !!session.websocket
      }))
    }, 'Current session storage state');
  }
}

export default SessionStorage;