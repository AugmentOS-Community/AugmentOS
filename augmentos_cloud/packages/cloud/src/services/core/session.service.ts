// augmentos_cloud/packages/cloud/src/services/core/session.service.ts

import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { AppStateChange, CloudToGlassesMessageType, ExtendedStreamType, StreamType, UserSession } from '@augmentos/sdk';
import { TranscriptSegment } from '@augmentos/sdk';
import { DisplayRequest } from '@augmentos/sdk';
import appService, { SYSTEM_TPAS } from './app.service';
import transcriptionService from '../processing/transcription.service';
import DisplayManager from '../layout/DisplayManager6.1';
import { createLC3Service, LC3Service, createLoggerForUserSession, logger } from '@augmentos/utils';
import { ASRStreamInstance } from '../processing/transcription.service';
import { subscriptionService } from './subscription.service';
import { AudioWriter } from "../debug/audio-writer";
import { systemApps } from './system-apps';

const RECONNECT_GRACE_PERIOD_MS = 30000; // 30 seconds
const LOG_AUDIO = false;
const PROCESS_AUDIO = true;
const DEBUG_AUDIO = false;
const IS_LC3 = true; // Set to true if using LC3 codec. false if using PCM.

/**
 * Audio chunk with sequence number for ordered processing
 */
export interface SequencedAudioChunk {
  sequenceNumber: number;        // Monotonically increasing sequence identifier
  timestamp: number;             // Capture timestamp (ms since epoch)
  data: ArrayBufferLike;         // Raw audio data
  isLC3: boolean;                // Whether this is LC3-encoded data
  receivedAt: number;            // When the server received this chunk
}

/**
 * Audio buffer for managing ordered chunk processing
 */
export interface OrderedAudioBuffer {
  chunks: SequencedAudioChunk[];       // Ordered buffer of audio chunks
  lastProcessedSequence: number;       // Last sequence number that was processed
  processingInProgress: boolean;       // Flag to prevent concurrent processing
  expectedNextSequence: number;        // Expected next sequence number
  bufferSizeLimit: number;             // Maximum number of chunks to buffer
  bufferTimeWindowMs: number;          // Time window to wait for chunks
  bufferProcessingInterval: NodeJS.Timeout;  // Interval timer for processing buffer
}

export interface ExtendedUserSession extends UserSession {
  lc3Service?: LC3Service;
  audioWriter?: AudioWriter; // for debugging audio streams.
  audioBuffer?: OrderedAudioBuffer; // Ordered buffer for audio chunks
}

export class SessionService {
  private activeSessions = new Map<string, ExtendedUserSession>();
  private sessionsByUser = new Map<string, ExtendedUserSession>();

  async createSession(ws: WebSocket, userId = 'anonymous'): Promise<ExtendedUserSession> {
    // Check for existing sessions for this user that might need to be preserved
    const existingSession = this.sessionsByUser.get(userId);
    
    const sessionId = uuidv4();
    const userSession: ExtendedUserSession = {
      logger: createLoggerForUserSession(userId),
      sessionId,
      userId,
      startTime: new Date(),
      activeAppSessions: existingSession?.activeAppSessions || [],
      installedApps: await appService.getAllApps(),
      whatToStream: existingSession?.whatToStream || new Array<StreamType>(),
      appSubscriptions: new Map<string, StreamType[]>(),
      transcriptionStreams: new Map<string, ASRStreamInstance>(),
      loadingApps: new Set<string>(),
      appConnections: new Map<string, WebSocket | any>(),
      OSSettings: { brightness: 50, volume: 50 },
      displayManager: new DisplayManager(),
      transcript: { segments: [] },
      websocket: ws as any,
      bufferedAudio: [],
      disconnectedAt: null,
      isTranscribing: false
    } as UserSession & { disconnectedAt: Date | null };
    userSession.logger.info(`Session ${sessionId} created for user ${userId}`);

    // Create and initialize a new LC3Service instance for this session
    // Use the new factory function to create a session-specific instance
    const lc3ServiceInstance = createLC3Service(sessionId);
    try {
      await lc3ServiceInstance.initialize();
      userSession.logger.info(`✅ LC3 Service initialized for session ${sessionId}`);
    } catch (error) {
      userSession.logger.error(`❌ Failed to initialize LC3 service for session ${sessionId}:`, error);
    }
    userSession.lc3Service = lc3ServiceInstance;

    // Initialize the ordered audio buffer
    userSession.audioBuffer = {
      chunks: [],
      lastProcessedSequence: -1,
      processingInProgress: false,
      expectedNextSequence: 0,
      bufferSizeLimit: 100,      // Store up to 100 chunks (configurable)
      bufferTimeWindowMs: 500,   // 500ms window for reordering (configurable)
      bufferProcessingInterval: null as any // Will be properly initialized by the websocket service
    };
    userSession.logger.info(`✅ Ordered audio buffer initialized for session ${sessionId}`);

    this.activeSessions.set(sessionId, userSession);
    userSession.logger.info(`[session.service] Created new session ${sessionId} for user ${userId}`);
    
    // Always keep the latest session for each user in the user lookup map
    if (userId !== 'anonymous') {
      this.sessionsByUser.set(userId, userSession);
    }
    
    return userSession;
  }

  getSession(sessionId: string): ExtendedUserSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  async transformUserSessionForClient(userSession: ExtendedUserSession): Promise<Partial<UserSession>> {
    // Get the list of active apps and update app state
    const activeAppPackageNames = Array.from(new Set(userSession.activeAppSessions));

    userSession.logger.info("🎤 Active app package names: ", activeAppPackageNames);
    // Create a map of active apps and what stream types they are subscribed to
    const appSubscriptions = new Map<string, ExtendedStreamType[]>(); // packageName -> streamTypes
    const whatToStream: Set<ExtendedStreamType> = new Set(); // streamTypes to enable

    for (const packageName of activeAppPackageNames) {
      const subscriptions = subscriptionService.getAppSubscriptions(userSession.sessionId, packageName);
      appSubscriptions.set(packageName, subscriptions);
      for (const subscription of subscriptions) {
        whatToStream.add(subscription);
      }
    }

    userSession.logger.info("🎤 App subscriptions: ", appSubscriptions);
    userSession.logger.info("🎤 What to stream: ", whatToStream);

    // Dashboard subscriptions
    const dashboardSubscriptions = subscriptionService.getAppSubscriptions(
      userSession.sessionId,
      systemApps.dashboard.packageName
    );
    appSubscriptions.set(systemApps.dashboard.packageName, dashboardSubscriptions);
    for (const subscription of dashboardSubscriptions) {
      whatToStream.add(subscription);
    }

    const partialUserSession = {
      sessionId: userSession.sessionId,
      userId: userSession.userId,
      startTime: userSession.startTime,
      installedApps: await appService.getAllApps(userSession.userId),
      appSubscriptions: Object.fromEntries(appSubscriptions),
      activeAppPackageNames,
      whatToStream: Array.from(new Set(whatToStream)),
    };

    return partialUserSession;
  }

  async triggerAppStateChange(userId: string): Promise<void> {
    const userSession = this.getSession(userId);
    if (!userSession) {
      logger.error(`❌[${userId}]: No userSession found for client app state change`);
      return;
    }

    // check if websocket is still open.
    if (userSession.websocket.readyState !== 1) {
      logger.error(`❌[${userId}]: Websocket is not open for client app state change`);
      return;
    }

    const clientResponse: AppStateChange = {
      type: CloudToGlassesMessageType.APP_STATE_CHANGE,
      sessionId: userSession.sessionId,
      userSession: await sessionService.transformUserSessionForClient(userSession),
      timestamp: new Date()
    };
    userSession.websocket.send(JSON.stringify(clientResponse));
  }

  async handleReconnectUserSession(newSession: ExtendedUserSession, userId: string): Promise<void> {
  const oldUserSession = this.getSession(userId);
    if (oldUserSession) {
      newSession.activeAppSessions = oldUserSession.activeAppSessions;
      newSession.transcript = oldUserSession.transcript;
      newSession.OSSettings = oldUserSession.OSSettings;
      newSession.appSubscriptions = oldUserSession.appSubscriptions;
      newSession.appConnections = oldUserSession.appConnections;
      newSession.whatToStream = oldUserSession.whatToStream;
      newSession.isTranscribing = false; // Reset transcription state

      // Transfer LC3Service instance to new session
      if (oldUserSession.lc3Service) {
        // Use the existing LC3 service instance
        newSession.lc3Service = oldUserSession.lc3Service;
        newSession.logger.info(`✅ Transferred existing LC3 Service from session ${oldUserSession.sessionId} to ${newSession.sessionId}`);
      } else {
        // Create a new one with the session ID if needed
        newSession.logger.warn(`⚠️ No LC3 service found for reconnected session, creating a new one`);
        const lc3ServiceInstance = createLC3Service(newSession.sessionId);
        try {
          await lc3ServiceInstance.initialize();
          newSession.logger.info(`✅ New LC3 Service initialized for reconnected session ${newSession.sessionId}`);
        }
        catch (error) {
          newSession.logger.error(`❌ Failed to initialize LC3 service for reconnected session ${newSession.sessionId}:`, error);
        }
        newSession.lc3Service = lc3ServiceInstance;
      }

      // Transfer audio buffer with proper state management
      if (oldUserSession.audioBuffer) {
        // Clear the old interval before creating a new one
        clearInterval(oldUserSession.audioBuffer.bufferProcessingInterval);
        
        // Create a new buffer with the existing state
        newSession.audioBuffer = {
          chunks: [...oldUserSession.audioBuffer.chunks],
          lastProcessedSequence: oldUserSession.audioBuffer.lastProcessedSequence,
          processingInProgress: false, // Reset processing flag for safety
          expectedNextSequence: oldUserSession.audioBuffer.expectedNextSequence,
          bufferSizeLimit: oldUserSession.audioBuffer.bufferSizeLimit,
          bufferTimeWindowMs: oldUserSession.audioBuffer.bufferTimeWindowMs,
          bufferProcessingInterval: setInterval(() => {
            // Will be properly set up by websocket service
          }, 100)
        };
        
        newSession.logger.info(`✅ Transferred audio buffer from session ${oldUserSession.sessionId} to ${newSession.sessionId}`);
        newSession.logger.debug(`Audio buffer state: ${newSession.audioBuffer.chunks.length} chunks, last processed: ${newSession.audioBuffer.lastProcessedSequence}`);
      }

      // Clean up old session resources
      if (oldUserSession.recognizer) {
        transcriptionService.stopTranscription(oldUserSession);
      }

      // Close old websocket
      if (oldUserSession.websocket.readyState === 1) {
        oldUserSession.websocket?.close();
      }

      // Note: we don't clean up the LC3 service since we're transferring it

      this.activeSessions.delete(oldUserSession.sessionId);
      newSession.logger.info(`Transferred data from session ${oldUserSession.sessionId} to ${newSession.sessionId}`);
    }

    newSession.userId = userId;
    newSession.sessionId = userId;
    newSession.logger = createLoggerForUserSession(userId);

    this.activeSessions.set(newSession.sessionId, newSession);
    newSession.logger.info(`Reconnected session ${newSession.sessionId} for user ${userId}`);

    if (newSession.websocket.readyState === 1) {
      newSession.websocket.send(JSON.stringify({ type: 'reconnect' }));
    }
  }

  updateDisplay(userSessionId: string, displayRequest: DisplayRequest): void {
    const userSession = this.getSession(userSessionId);
    if (!userSession) {
      logger.error(`❌[${userSessionId}]: No userSession found for display update`);
      return;
    }
    try {
      userSession.displayManager.handleDisplayEvent(displayRequest, userSession);
    } catch (error) {
      userSession.logger.error(`❌[${userSessionId}]: Error updating display history:`, error);
    }
  }

  addTranscriptSegment(userSession: ExtendedUserSession, segment: TranscriptSegment): void {
    if (userSession) {
      // Add new segment
      userSession.transcript.segments.push(segment);

      // Prune old segments (older than 30 minutes)
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      userSession.transcript.segments = userSession.transcript.segments.filter(
        seg => seg.timestamp && new Date(seg.timestamp) >= thirtyMinutesAgo
      );
    }
  }

  // Updated handleAudioData method with improved LC3 handling and sequence tracking
  async handleAudioData(
    userSession: ExtendedUserSession, 
    audioData: ArrayBufferLike | any, 
    isLC3 = IS_LC3, 
    sequenceNumber?: number
  ): Promise<ArrayBuffer | void> {
    // Update the last audio timestamp
    userSession.lastAudioTimestamp = Date.now();

    if (LOG_AUDIO && sequenceNumber !== undefined) {
      userSession.logger.debug(`Processing audio chunk ${sequenceNumber} for session ${userSession.sessionId}`);
    }

    // If not transcribing, just ignore the audio
    // if (!userSession.isTranscribing) {
    //   if (LOG_AUDIO) console.log('🔇 Skipping audio while transcription is paused');
    //   return;
    // }

    // Lazy initialize the audio writer if it doesn't exist
    if (DEBUG_AUDIO && !userSession.audioWriter) {
      userSession.audioWriter = new AudioWriter(userSession.userId);
    }

    // Write the raw LC3 audio if applicable
    if (DEBUG_AUDIO && isLC3 && audioData) {
      await userSession.audioWriter?.writeLC3(audioData);
    }

    // Process LC3 first if needed
    let processedAudioData = audioData;
    if (isLC3 && userSession.lc3Service) {
      try {
        // The improved LC3Service handles null checks internally
        // Pass the sequence number to track continuity
        processedAudioData = await userSession.lc3Service.decodeAudioChunk(audioData, sequenceNumber);
        
        if (!processedAudioData) {
          if (LOG_AUDIO) userSession.logger.warn(`⚠️ LC3 decode returned null for session ${userSession.sessionId}, sequence ${sequenceNumber}`);
          return; // Skip this chunk
        }

        if (DEBUG_AUDIO) {
          // Write the decoded PCM audio
          await userSession.audioWriter?.writePCM(processedAudioData);
        }
      } catch (error) {
        userSession.logger.error(`❌ Error decoding LC3 audio for session ${userSession.sessionId}, sequence ${sequenceNumber}:`, error);
        
        // If there was an error with the LC3 service, try to reinitialize it
        if (userSession.lc3Service) {
          userSession.logger.warn(`⚠️ Attempting to reinitialize LC3 service for session ${userSession.sessionId}`);
          try {
            // Clean up existing service
            userSession.lc3Service.cleanup();
            
            // Create a new service
            const newLc3Service = createLC3Service(userSession.sessionId);
            await newLc3Service.initialize();
            userSession.lc3Service = newLc3Service;
            userSession.logger.info(`✅ Successfully reinitialized LC3 service for session ${userSession.sessionId}`);
          } catch (reinitError) {
            userSession.logger.error(`❌ Failed to reinitialize LC3 service:`, reinitError);
          }
        }
        
        return; // Skip this chunk after an error
      }
    } else if (processedAudioData) {
      if (DEBUG_AUDIO) {
        // If it's not LC3 or doesn't need decoding, still write it as PCM
        await userSession.audioWriter?.writePCM(processedAudioData);
      }
    }

    transcriptionService.feedAudioToTranscriptionStreams(userSession, processedAudioData);
    return processedAudioData;
  }

  endSession(sessionId: string): void {
    const userSession = this.getSession(sessionId);
    if (!userSession) return;

    if (userSession.recognizer) {
      transcriptionService.stopTranscription(userSession);
    }

    // Clean up the LC3 instance for this session if it exists
    if (userSession.lc3Service) {
      userSession.logger.info(`🧹 Cleaning up LC3 service for session ${sessionId}`);
      userSession.lc3Service.cleanup();
      userSession.lc3Service = undefined;
    }

    // Clean up audio buffer resources
    if (userSession.audioBuffer) {
      userSession.logger.info(`🧹 Cleaning up audio buffer for session ${sessionId}`);
      clearInterval(userSession.audioBuffer.bufferProcessingInterval);
      userSession.audioBuffer.chunks = [];
      userSession.audioBuffer.processingInProgress = false;
    }

    // Clean up subscription history for this session
    subscriptionService.removeSessionSubscriptionHistory(sessionId);

    // Clear transcript history
    if (userSession.transcript && userSession.transcript.segments) {
      userSession.transcript.segments = [];
    }

    // Clean other data structures
    if (userSession.bufferedAudio) {
      userSession.bufferedAudio = [];
    }

    this.activeSessions.delete(sessionId);
    userSession.logger.info(`[Ended session] ${sessionId}`);

    // Suggest garbage collection if available
    if (global.gc) {
      console.log('🧹 Running garbage collection after ending session');
      global.gc();
    }
  }

  getAllSessions(): ExtendedUserSession[] {
    return Array.from(this.activeSessions.values());
  }


  /**
   * Gets an active session for a user by their userId (email)
   * Useful for retrieving session from a coreToken after JWT validation
   * 
   * @param userId - The user email/ID from the JWT token
   * @returns The user's active session, or null if none found
   */
  getSessionByUserId(userId: string): ExtendedUserSession | null {
    // First try the direct mapping where sessionId == userId (from reconnection logic)
    const directSession = this.activeSessions.get(userId);
    if (directSession) {
      return directSession;
    }

    // Otherwise, search all sessions for this userId
    for (const session of this.activeSessions.values()) {
      if (session.userId === userId) {
        return session;
      }
    }

    return null;
  }

  /**
   * Gets all active sessions for a user by their userId (email)
   * 
   * @param userId - The user email/ID from the JWT token
   * @returns Array of user's active sessions, empty array if none found
   */
  getSessionsForUser(userId: string): ExtendedUserSession[] {
    const sessions: ExtendedUserSession[] = [];

    // First try the direct mapping where sessionId == userId (from reconnection logic)
    const directSession = this.activeSessions.get(userId);
    if (directSession) {
      sessions.push(directSession);
    }

    // Also include any other sessions with this userId
    for (const session of this.activeSessions.values()) {
      if (session.userId === userId && session.sessionId !== userId) {
        sessions.push(session);
      }
    }

    // Sort by most recent session first (if disconnectedAt is null, it's active)
    sessions.sort((a, b) => {
      if (!a.disconnectedAt && b.disconnectedAt) return -1;
      if (a.disconnectedAt && !b.disconnectedAt) return 1;

      const timeA = a.disconnectedAt ? a.disconnectedAt.getTime() : Date.now();
      const timeB = b.disconnectedAt ? b.disconnectedAt.getTime() : Date.now();
      return timeB - timeA;
    });

    return sessions;
  }

  markSessionDisconnected(userSession: ExtendedUserSession): void {
    if (userSession) {
      if (userSession.recognizer) {
        transcriptionService.stopTranscription(userSession);
      }
      userSession.disconnectedAt = new Date();
      userSession.isTranscribing = false;
      userSession.logger.info(
        `Session ${userSession.sessionId} marked as disconnected at ${userSession.disconnectedAt.toISOString()}`
      );
    }
  }

  isItTimeToKillTheSession(sessionId: string): boolean {
    const session = this.getSession(sessionId);
    if (session && session.disconnectedAt) {
      const elapsed = Date.now() - session.disconnectedAt.getTime();
      return elapsed > RECONNECT_GRACE_PERIOD_MS;
    }
    return false;
  }
  
  // Method to get audio service info for debugging
  getAudioServiceInfo(sessionId: string): object | null {
    const session = this.getSession(sessionId);
    if (session && session.lc3Service) {
      return session.lc3Service.getInfo();
    }
    return null;
  }
}

export const sessionService = new SessionService();
logger.info('✅ Session Service');
export default sessionService;
