import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  AppStateChange,
  CloudToGlassesMessageType,
  ExtendedStreamType,
  StreamType,
  UserSession,
  TranscriptSegment,
  DisplayRequest,
  AppI, // Import if needed for installedApps type
} from '@augmentos/sdk';
import appService from './app.service';
import transcriptionService, { ASRStreamInstance } from '../processing/transcription.service';
import DisplayManager from '../layout/DisplayManager6.1';
import { createLC3Service, LC3Service, createLoggerForUserSession, logger } from '@augmentos/utils';
import { AudioWriter } from "../debug/audio-writer";
import { systemApps } from './system-apps';
import { SubscriptionManager } from './subscription.manager'; // Import the new manager
import { Logger } from 'winston';

const RECONNECT_GRACE_PERIOD_MS = 1000 * 30; // 30 seconds
const LOG_AUDIO = false;
const PROCESS_AUDIO = true;
const DEBUG_AUDIO = false;
const IS_LC3 = true;

// --- Interfaces ---
export interface SequencedAudioChunk {
  sequenceNumber: number;
  timestamp: number;
  data: ArrayBufferLike;
  isLC3: boolean;
  receivedAt: number;
}

export interface OrderedAudioBuffer {
  chunks: SequencedAudioChunk[];
  lastProcessedSequence: number;
  processingInProgress: boolean;
  expectedNextSequence: number;
  bufferSizeLimit: number;
  bufferTimeWindowMs: number;
  bufferProcessingInterval: NodeJS.Timeout | null; // Allow null initially
}

export interface ExtendedUserSession extends UserSession {
  logger: Logger;
  lc3Service?: LC3Service;
  audioWriter?: AudioWriter;
  audioBuffer?: OrderedAudioBuffer;
  disconnectedAt: Date | null;
  cleanupTimerId?: NodeJS.Timeout;
  websocket: WebSocket;
  displayManager: DisplayManager;
  transcript: { segments: TranscriptSegment[] };
  bufferedAudio: ArrayBufferLike[]; // More specific type
  lastAudioTimestamp?: number;
  recognizer?: any; // Define type from MS SDK if possible
  transcriptionStreams: Map<string, ASRStreamInstance>;
  isTranscribing: boolean;
  loadingApps: Set<string>;
  OSSettings: { brightness: number, volume: number };
  appConnections: Map<string, WebSocket | any>; // Consider stricter type if possible
  installedApps: AppI[]; // Add type from SDK

  // Add the subscription manager instance
  subscriptionManager: SubscriptionManager;
}

export class SessionService {
  private activeSessions = new Map<string, ExtendedUserSession>();
  private sessionsByUser = new Map<string, ExtendedUserSession>();

  async createSession(ws: WebSocket, userId: string): Promise<ExtendedUserSession> {
    const existingSession = this.sessionsByUser.get(userId);

    if (existingSession) {
      existingSession.logger.info(`Reusing existing UserSession for user ${userId}`);

      if (existingSession.cleanupTimerId) {
        clearTimeout(existingSession.cleanupTimerId);
        existingSession.logger.info(`[session.service]: Cleared pending cleanup timer for reused session ${existingSession.sessionId}`);
        existingSession.cleanupTimerId = undefined;
      }

      existingSession.websocket = ws; // Update WebSocket reference
      existingSession.disconnectedAt = null;
      existingSession.isTranscribing = false;

      this.activeSessions.set(existingSession.sessionId, existingSession);
      existingSession.logger.info(`Re-activated session ${existingSession.sessionId} in activeSessions map.`);

      // Ensure installedApps are fresh if reusing
      existingSession.installedApps = await appService.getAllApps(userId);

      return existingSession;
    }

    // Create new session
    const sessionId = userId;
    const sessionLogger = createLoggerForUserSession(sessionId);
    const installedApps = await appService.getAllApps(userId); // Fetch apps first

    // Create partial session first to pass to manager constructor
    const partialSession: Partial<ExtendedUserSession> = {
      logger: sessionLogger,
      sessionId,
      userId,
      startTime: new Date(),
      activeAppSessions: [],
      installedApps: installedApps, // Assign fetched apps
      transcriptionStreams: new Map<string, ASRStreamInstance>(),
      loadingApps: new Set<string>(),
      appConnections: new Map<string, WebSocket | any>(),
      OSSettings: { brightness: 50, volume: 50 },
      displayManager: new DisplayManager(),
      transcript: { segments: [] },
      websocket: ws,
      bufferedAudio: [],
      disconnectedAt: null,
      isTranscribing: false,

      audioBuffer: {
        chunks: [],
        lastProcessedSequence: -1,
        processingInProgress: false,
        expectedNextSequence: 0,
        bufferSizeLimit: 100,
        bufferTimeWindowMs: 500,
        bufferProcessingInterval: null // Interval set by WebSocketService on connection
      }
    };

    // Instantiate the Subscription Manager for this session
    // Cast to ExtendedUserSession here is safe as we're building it
    partialSession.subscriptionManager = new SubscriptionManager(partialSession as ExtendedUserSession);
    sessionLogger.info(`[session.service] SubscriptionManager created for session ${sessionId}`);

    // Initialize LC3 and Audio Buffer
    const lc3ServiceInstance = createLC3Service(sessionId);
    try {
      await lc3ServiceInstance.initialize();
      partialSession.lc3Service = lc3ServiceInstance;
      sessionLogger.info(`✅ LC3 Service initialized for session ${sessionId}`);
    } catch (error) {
      sessionLogger.error(`❌ Failed to initialize LC3 service for session ${sessionId}:`, error);
    }

    // Finalize and Store Session
    const userSession = partialSession as ExtendedUserSession;

    this.activeSessions.set(sessionId, userSession);
    this.sessionsByUser.set(userId, userSession);
    sessionLogger.info(`[session.service] Created and stored new session ${sessionId} for user ${userId}`);

    return userSession;
  }


  getSession(sessionId: string): ExtendedUserSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  async transformUserSessionForClient(userSession: ExtendedUserSession): Promise<Partial<UserSession>> {
    const activeAppPackageNames = Array.from(new Set(userSession.activeAppSessions));
    const appSubscriptionsMap = new Map<string, ExtendedStreamType[]>();
    const whatToStreamSet = new Set<ExtendedStreamType>();

    const allSubs = userSession.subscriptionManager.getAllSubscriptions();

    for (const packageName of activeAppPackageNames) {
      const subs = allSubs.get(packageName) || [];
      appSubscriptionsMap.set(packageName, subs);
      subs.forEach(sub => whatToStreamSet.add(sub));
    }

    const dashboardPackageName = systemApps.dashboard.packageName;
    const dashboardSubs = allSubs.get(dashboardPackageName) || [];
    if (dashboardSubs.length > 0 || userSession.appConnections.has(dashboardPackageName)) {
      appSubscriptionsMap.set(dashboardPackageName, dashboardSubs);
      dashboardSubs.forEach(sub => whatToStreamSet.add(sub));
      if (!activeAppPackageNames.includes(dashboardPackageName)) {
        activeAppPackageNames.push(dashboardPackageName);
      }
    }


    const partialUserSession = {
      sessionId: userSession.sessionId,
      userId: userSession.userId,
      startTime: userSession.startTime,
      installedApps: userSession.installedApps, // Use already fetched apps
      appSubscriptions: Object.fromEntries(appSubscriptionsMap),
      activeAppPackageNames: Array.from(new Set(activeAppPackageNames)),
      whatToStream: Array.from(whatToStreamSet),
    };

    return partialUserSession;
  }

  async triggerAppStateChange(userId: string): Promise<void> {
    const userSession = this.getSessionByUserId(userId);
    if (!userSession) {
      logger.error(`❌[${userId}]: No userSession found for client app state change`);
      return;
    }

    if (!userSession.websocket || userSession.websocket.readyState !== WebSocket.OPEN) {
      userSession.logger.error(`❌[${userId}]: Websocket is not open for client app state change`);
      return;
    }

    try {
      const clientResponse: AppStateChange = {
        type: CloudToGlassesMessageType.APP_STATE_CHANGE,
        sessionId: userSession.sessionId,
        userSession: await this.transformUserSessionForClient(userSession),
        timestamp: new Date()
      };
      userSession.websocket.send(JSON.stringify(clientResponse));
      userSession.logger.info(`[session.service] Sent APP_STATE_CHANGE to ${userId}`);
    } catch (error) {
      userSession.logger.error(`[session.service] Error sending APP_STATE_CHANGE:`, error);
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
      userSession.logger.error(`❌[${userSessionId}]: Error updating display:`, error);
    }
  }

  addTranscriptSegment(userSession: ExtendedUserSession, segment: TranscriptSegment): void {
    if (userSession && userSession.transcript) { // Check transcript exists
      userSession.transcript.segments.push(segment);
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      userSession.transcript.segments = userSession.transcript.segments.filter(
        seg => seg.timestamp && new Date(seg.timestamp) >= thirtyMinutesAgo
      );
    }
  }

  async handleAudioData(
    userSession: ExtendedUserSession,
    audioData: ArrayBufferLike | any,
    isLC3 = IS_LC3,
    sequenceNumber?: number
  ): Promise<ArrayBuffer | void> {
    userSession.lastAudioTimestamp = Date.now();

    if (LOG_AUDIO && sequenceNumber !== undefined) {
      userSession.logger.debug(`Processing audio chunk ${sequenceNumber}`);
    }

    if (DEBUG_AUDIO && !userSession.audioWriter) {
      userSession.audioWriter = new AudioWriter(userSession.userId);
    }
    if (DEBUG_AUDIO && isLC3 && audioData) {
      await userSession.audioWriter?.writeLC3(audioData);
    }

    let processedAudioData = audioData;
    if (isLC3 && userSession.lc3Service) {
      try {
        processedAudioData = await userSession.lc3Service.decodeAudioChunk(audioData, sequenceNumber);
        if (!processedAudioData) {
          if (LOG_AUDIO) userSession.logger.warn(`⚠️ LC3 decode returned null, sequence ${sequenceNumber}`);
          return; // Return void if null
        }
        if (DEBUG_AUDIO && processedAudioData) await userSession.audioWriter?.writePCM(processedAudioData);
      } catch (error) {
        userSession.logger.error(`❌ Error decoding LC3 audio, sequence ${sequenceNumber}:`, error);
        // LC3 reinitialization logic could go here
        return; // Return void on error
      }
    } else if (processedAudioData && DEBUG_AUDIO) {
      await userSession.audioWriter?.writePCM(processedAudioData);
    }

    if (processedAudioData) {
      transcriptionService.feedAudioToTranscriptionStreams(userSession, processedAudioData);
      // Ensure we return ArrayBuffer, not ArrayBufferLike
      if (processedAudioData instanceof ArrayBuffer) {
        return processedAudioData;
      } else if (processedAudioData.buffer instanceof ArrayBuffer) {
        // Handle cases like Node.js Buffer or TypedArrays
        return processedAudioData.buffer.slice(processedAudioData.byteOffset, processedAudioData.byteOffset + processedAudioData.byteLength);
      } else {
        userSession.logger.error('Processed audio data is not an ArrayBuffer or convertible.');
        return; // Return void if conversion fails
      }
    }
    return; // Return void if no processed data
  }

  endSession(userSession: ExtendedUserSession): void {
    if (!userSession) return;

    userSession.logger.info(`[Ending session] Starting cleanup for ${userSession.sessionId}`);

    if (userSession.cleanupTimerId) {
      clearTimeout(userSession.cleanupTimerId);
      userSession.logger.info(`[session.service]: Cleared cleanup timer during endSession for ${userSession.sessionId}`);
      userSession.cleanupTimerId = undefined;
    }

    if (userSession.isTranscribing) { // Use flag
      transcriptionService.stopTranscription(userSession);
    }

    if (userSession.lc3Service) {
      userSession.logger.info(`🧹 Cleaning up LC3 service for session ${userSession.sessionId}`);
      userSession.lc3Service.cleanup();
      userSession.lc3Service = undefined;
    }

    if (userSession.audioBuffer) {
      userSession.logger.info(`🧹 Cleaning up audio buffer for session ${userSession.sessionId}`);
      if (userSession.audioBuffer.bufferProcessingInterval) {
        clearInterval(userSession.audioBuffer.bufferProcessingInterval);
        userSession.audioBuffer.bufferProcessingInterval = null; // Set to null
      }
      userSession.audioBuffer.chunks = [];
    }

    // SubscriptionManager is part of userSession, no specific cleanup needed here

    if (userSession.transcript) userSession.transcript.segments = []; // Check exists
    userSession.bufferedAudio = [];

    userSession.appConnections.forEach((ws, appName) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        userSession.logger.info(`[session.service] Closing TPA connection for ${appName} during session end.`);
        try { ws.close(1001, 'User session ended'); } catch (e) { /* ignore */ }
      }
    });
    userSession.appConnections.clear();

    this.activeSessions.delete(userSession.sessionId);

    // Decide whether to remove from sessionsByUser map
    // Keeping it allows faster reuse on next connect
    // Removing it ensures no stale references if user doesn't reconnect soon
    // Let's remove it for cleaner state, user will create new if they reconnect
    if (this.sessionsByUser.get(userSession.userId) === userSession) {
      this.sessionsByUser.delete(userSession.userId);
      userSession.logger.info(`Removed user ${userSession.userId} from sessionsByUser map.`);
    }


    userSession.logger.info(`[Ended session] Completed cleanup for ${userSession.sessionId}`);

    if (global.gc) {
      userSession.logger.info('🧹 Suggesting garbage collection after ending session');
      global.gc();
    }
  }

  getAllSessions(): ExtendedUserSession[] {
    return Array.from(this.activeSessions.values());
  }

  getSessionByUserId(userId: string): ExtendedUserSession | null {
    // Check active sessions first
    for (const session of this.activeSessions.values()) {
      if (session.userId === userId) {
        // Update the user map to point to this active session
        this.sessionsByUser.set(userId, session);
        return session;
      }
    }
    // If not found in active, check the user map (might be disconnected)
    // const disconnectedSession = this.sessionsByUser.get(userId);
    // return disconnectedSession || null; // Return potentially disconnected session? Or null? Let's return null if not active.
    return null;
  }

  getSessionsForUser(userId: string): ExtendedUserSession[] {
    const userSessions: ExtendedUserSession[] = [];
    for (const session of this.activeSessions.values()) {
      if (session.userId === userId) {
        userSessions.push(session);
      }
    }
    return userSessions;
  }

  markSessionDisconnected(userSession: ExtendedUserSession): void {
    if (userSession) {
      if (userSession.cleanupTimerId) {
        clearTimeout(userSession.cleanupTimerId);
        userSession.logger.info(`[session.service]: Cleared cleanup timer during markSessionDisconnected for ${userSession.sessionId}`);
        userSession.cleanupTimerId = undefined;
      }

      if (userSession.isTranscribing) {
        transcriptionService.stopTranscription(userSession);
      }
      userSession.disconnectedAt = new Date();
      userSession.isTranscribing = false;
      userSession.logger.info(
        `Session ${userSession.sessionId} marked as disconnected at ${userSession.disconnectedAt.toISOString()}`
      );
      // Keep in activeSessions until grace period timeout in websocket service
    }
  }

  getAudioServiceInfo(sessionId: string): object | null {
    const session = this.getSession(sessionId);
    if (session && session.lc3Service) {
      return session.lc3Service.getInfo();
    }
    return null;
  }
}

export const sessionService = new SessionService();
logger.info('✅ Session Service Initialized');
export default sessionService;