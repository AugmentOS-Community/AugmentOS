/**
 * @fileoverview WebSocket service that handles both glasses client and TPA connections.
 * This service is responsible for:
 * - Managing WebSocket connection lifecycles
 * - Handling real-time message routing
 * - Managing TPA session states
 * - Coordinating audio streaming and transcription
 * 
 * Typical usage:
 * const wsService = createWebSocketService(sessionService, subscriptionService, 
 *                                        transcriptionService, appService);
 * wsService.setupWebSocketServers(httpServer);
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import {
  // Client Messages
  GlassesToCloudMessage,
  GlassesConnectionInitMessage,
  CloudConnectionAckMessage,
  CloudConnectionErrorMessage,

  // TPA Messages
  TpaConnectionInitMessage,
  CloudTpaConnectionAckMessage,
  TpaToCloudMessage,
  TpaSubscriptionUpdateMessage,
  CloudDataStreamMessage,

  // Common
  WebSocketError,
  StreamType,
  GlassesStartAppMessage,
  GlassesStopAppMessage,
  HeadPositionEvent,
  CloudToTpaMessage,
  CloudAppStateChangeMessage,
  UserSession,
} from '@augmentos/types';

import sessionService, { ISessionService } from './session.service';
import subscriptionService, { ISubscriptionService } from './subscription.service';
import transcriptionService, { ITranscriptionService } from '../processing/transcription.service';
import appService, { IAppService } from './app.service';
import { DisplayRequest } from '@augmentos/types/events/display';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { AUGMENTOS_AUTH_JWT_SECRET } from '../../env';

// Constants
const TPA_SESSION_TIMEOUT_MS = 5000;  // 30 seconds

/**
 * Interface for pending TPA sessions awaiting WebSocket connection.
 */
interface PendingTpaSession {
  userSessionId: string;  // ID of the user's glasses session
  userId: string;         // User identifier
  packageName: string;         // TPA identifier
  timestamp: Date;       // When the session was initiated
}

/**
 * Interface for active TPA WebSocket connections.
 */
interface TpaConnection {
  packageName: string;
  userSessionId: string;
  websocket: WebSocket;
  lastPing?: Date;
}

/**
 * Interface defining the public API of the WebSocket service.
 */
export interface IWebSocketService {
  setupWebSocketServers(server: Server): void;
  broadcastToTpa(userSessionId: string, streamType: StreamType, data: any): void; // TODO: Specify data type.
  initiateTpaSession(userSessionId: string, userId: string, packageName: string): Promise<string>;
}

/**
 * ⚡️🕸️🚀 Implementation of the WebSocket service.
 */
export class WebSocketService implements IWebSocketService {
  private glassesWss: WebSocketServer;
  private tpaWss: WebSocketServer;
  private pendingTpaSessions = new Map<string, PendingTpaSession>();
  private tpaConnections = new Map<string, TpaConnection>();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly sessionService: ISessionService,
    private readonly subscriptionService: ISubscriptionService,
    private readonly transcriptionService: ITranscriptionService,
    private readonly appService: IAppService,
    // private readonly displayService: IDisplayService
  ) {
    this.glassesWss = new WebSocketServer({ noServer: true });
    this.tpaWss = new WebSocketServer({ noServer: true });
  }

  /**
   * 🚀⚡️ Initializes WebSocket servers and sets up connection handling.
   * @param server - HTTP/HTTPS server instance to attach WebSocket servers to
   */
  setupWebSocketServers(server: Server): void {
    this.initializeWebSocketServers();
    this.setupUpgradeHandler(server);
    this.startPingInterval();
  }

  /**
   * 🚀🪝 Initiates a new TPA session and triggers the TPA's webhook.
   * @param userSessionId - ID of the user's glasses session
   * @param userId - User identifier
   * @param packageName - TPA identifier
   * @returns Promise resolving to the TPA session ID
   * @throws Error if app not found or webhook fails
   */
  async initiateTpaSession(
    userSessionId: string,
    userId: string,
    packageName: string
  ): Promise<string> {
    const app = await this.appService.getApp(packageName);
    if (!app) {
      throw new Error(`App ${packageName} not found`);
    }

    const tpaSessionId = `${userSessionId}-${packageName}`;

    // Store pending session
    this.pendingTpaSessions.set(tpaSessionId, {
      userSessionId,
      userId,
      packageName,
      timestamp: new Date()
    });

    try {
      // Trigger TPA webhook
      await this.appService.triggerWebhook(app.webhookURL, {
        type: 'session_request',
        sessionId: tpaSessionId,
        userId,
        timestamp: new Date().toISOString()
      });

      // Set timeout to clean up pending session
      setTimeout(() => {
        if (this.pendingTpaSessions.has(tpaSessionId)) {
          this.pendingTpaSessions.delete(tpaSessionId);
          console.log(`TPA session ${tpaSessionId} expired without connection`);
        }
      }, TPA_SESSION_TIMEOUT_MS);

      return tpaSessionId;
    } catch (error) {
      this.pendingTpaSessions.delete(tpaSessionId);
      throw error;
    }
  }

  /**
   * 🗣️📣 Broadcasts data to all TPAs subscribed to a specific stream type.
   * @param userSessionId - ID of the user's glasses session
   * @param streamType - Type of data stream
   * @param data - Data to broadcast
   */
  broadcastToTpa(userSessionId: string, streamType: StreamType, data: CloudToTpaMessage): void {
    const subscribedApps = this.subscriptionService.getSubscribedApps(userSessionId, streamType);

    for (const packageName of subscribedApps) {
      const tpaSessionId = `${userSessionId}-${packageName}`;
      const connection = this.tpaConnections.get(tpaSessionId);

      if (connection?.websocket.readyState === WebSocket.OPEN) {
        const streamMessage: CloudDataStreamMessage = {
          type: 'data_stream',
          sessionId: tpaSessionId,
          streamType,
          data,
          timestamp: new Date()
        };

        connection.websocket.send(JSON.stringify(streamMessage));
      }
    }
  }

  /**
   * ⚡️⚡️ Initializes the WebSocket servers for both glasses and TPAs.
   * @private
   */
  private initializeWebSocketServers(): void {
    this.glassesWss.on('connection', this.handleGlassesConnection.bind(this));
    this.tpaWss.on('connection', this.handleTpaConnection.bind(this));
  }

  /**
   * 🗿 Sets up the upgrade handler for WebSocket connections.
   * @param server - HTTP/HTTPS server instance
   * @private
   */
  private setupUpgradeHandler(server: Server): void {
    server.on('upgrade', (request, socket, head) => {
      const { url } = request;

      if (url === '/glasses-ws') {
        this.glassesWss.handleUpgrade(request, socket, head, (ws) => {
          this.glassesWss.emit('connection', ws, request);
        });
      } else if (url === '/tpa-ws') {
        this.tpaWss.handleUpgrade(request, socket, head, (ws) => {
          this.tpaWss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });
  }

  /**
   * 🥳🤓 Handles new glasses client connections.
   * @param ws - WebSocket connection
   * @private
   */
  private handleGlassesConnection(ws: WebSocket): void {
    console.log('[websocket.service] New glasses client attempting to connect...');

    const session = this.sessionService.createSession(ws);
    ws.on('message', async (message: Buffer | string, isBinary: boolean) => {
      try {
        if (isBinary && Buffer.isBuffer(message)) {
          // Convert Node.js Buffer to ArrayBuffer
          const arrayBuf: ArrayBufferLike = message.buffer.slice(
            message.byteOffset,
            message.byteOffset + message.byteLength
          );

          // Pass the ArrayBuffer to Azure Speech or wherever you need it
          this.sessionService.handleAudioData(session.sessionId, arrayBuf);
          return;
        }

        const parsedMessage = JSON.parse(message.toString()) as GlassesToCloudMessage;
        await this.handleGlassesMessage(session, ws, parsedMessage);
      } catch (error) {
        console.error(`Error handling glasses message:`, error);
        this.sendError(ws, {
          code: 'MESSAGE_HANDLING_ERROR',
          message: 'Error processing message'
        });
      }
    });

    const RECONNECT_GRACE_PERIOD_MS = 1000 * 60 * 5; // 5 minutes
    ws.on('close', () => {
      console.log(`Glasses WebSocket disconnected: ${session.sessionId}`);
      // Mark the session as disconnected but do not remove it immediately.
      this.sessionService.markSessionDisconnected(session.sessionId);

      // Optionally, set a timeout to eventually clean up the session if not reconnected.
      setTimeout(() => {
        if (this.sessionService.isItTimeToKillTheSession(session.sessionId)) {
          this.sessionService.endSession(session.sessionId);
        }
      }, RECONNECT_GRACE_PERIOD_MS);
    });

    ws.on('error', (error) => {
      console.error(`Glasses WebSocket error:`, error);
      this.sessionService.endSession(session.sessionId);
      ws.close();
    });
  }

  /**
   * 🤓 Handles messages from glasses clients.
   * @param userSessionId - User Session identifier
   * @param ws - WebSocket connection
   * @param message - Parsed message from client
   * @private
   */
  private async handleGlassesMessage(
    userSession: UserSession,
    ws: WebSocket,
    message: GlassesToCloudMessage
  ): Promise<void> {
    try {
      switch (message.type) {
        case 'connection_init': {
          const initMessage = message as GlassesConnectionInitMessage;
          // const userId = initMessage.userId;
          const coreToken = initMessage.coreToken || "";
          console.log(`[websocket.service] Glasses client attempting to connect: ${coreToken}`);
          const userData = jwt.verify(coreToken, AUGMENTOS_AUTH_JWT_SECRET);
          const userId = (userData as JwtPayload).email;
          if (!userId) {
            throw new Error('User ID is required');
          }

          console.log(`[websocket.service] Glasses client connected: ${userId}`);
          try {
            this.sessionService.handleReconnectUserSession(userSession, userId);
          }
          catch (error) {
            console.error(`\n\n\n\n[websocket.service] Error reconnecting user session starting new session:`, error);
          }

          // Start transcription
          const { recognizer, pushStream } = this.transcriptionService.startTranscription(
            userSession.sessionId,
            (result) => {
              console.log(`[Session ${userSession.sessionId}] Recognizing:`, result.text);
              this.broadcastToTpa(userSession.sessionId, "transcription", result as any);
            },
            (result) => {
              console.log(`[Session ${userSession.sessionId}] Final result ${result?.speakerId}:`, result.text);
              this.broadcastToTpa(userSession.sessionId, "transcription", result as any);
            }
          );

          this.sessionService.setAudioHandlers(userSession.sessionId, pushStream, recognizer);

          const activeAppPackageNames = Array.from(new Set(userSession.activeAppSessions));
          const userSessionData = {
            sessionId: userSession.sessionId,
            userId: userSession.userId,
            startTime: userSession.startTime,
            installedApps: await this.appService.getAllApps(),
            activeAppPackageNames,
            whatToStream: userSession.whatToStream,
          };

          const ackMessage: CloudConnectionAckMessage = {
            type: 'connection_ack',
            sessionId: userSession.sessionId,
            userSession: userSessionData,
            timestamp: new Date()
          };
          ws.send(JSON.stringify(ackMessage));
          console.log(`\n\n[websocket.service]\nSENDING connection_ack to ${userId}\n\n`);
          break;
        }

        case 'start_app': {
          const startMessage = message as GlassesStartAppMessage;
          console.log(`Starting app ${startMessage.packageName}`);
          await this.initiateTpaSession(
            userSession.sessionId,
            userSession?.userId || 'anonymous',
            startMessage.packageName
          );

          userSession.activeAppSessions.push(startMessage.packageName);

          const activeAppPackageNames = Array.from(new Set(userSession.activeAppSessions));
          const userSessionData = {
            sessionId: userSession.sessionId,
            userId: userSession.userId,
            startTime: userSession.startTime,
            installedApps: await this.appService.getAllApps(),
            activeAppPackageNames,
            whatToStream: userSession.whatToStream,
          };
          console.log('User session data:', userSessionData);
          const clientResponse: CloudAppStateChangeMessage = {
            type: 'app_state_change',
            sessionId: userSession.sessionId, // TODO: Remove this field and check all references.
            userSession: userSessionData,
            timestamp: new Date()
          };
          ws.send(JSON.stringify(clientResponse));
          break;
        }

        case 'stop_app': {
          const stopMessage = message as GlassesStopAppMessage;
          console.log(`Stopping app ${stopMessage.packageName}`);
          // Remove subscriptions for the app.
          this.subscriptionService.removeSubscriptions(userSession.sessionId, stopMessage.packageName);

          // Close TPA connection.
          const tpaSessionId = `${userSession.sessionId}-${stopMessage.packageName}`;
          const connection = this.tpaConnections.get(tpaSessionId);
          if (connection) {
            connection.websocket.close();
          }

          // Remove TPA connection.
          this.tpaConnections.delete(tpaSessionId);

          // Remove app from active list.
          userSession.activeAppSessions = userSession.activeAppSessions.filter(
            (packageName) => packageName !== stopMessage.packageName
          );

          const activeAppPackageNames = Array.from(new Set(userSession.activeAppSessions));
          const userSessionData = {
            sessionId: userSession.sessionId,
            userId: userSession.userId,
            startTime: userSession.startTime,
            installedApps: await this.appService.getAllApps(),
            activeAppPackageNames: activeAppPackageNames,
            whatToStream: userSession.whatToStream,
          };
          console.log('User session data:', userSessionData);
          const clientResponse: CloudAppStateChangeMessage = {
            type: 'app_state_change',
            sessionId: userSession.sessionId, // TODO: Remove this field and check all references.
            userSession: userSessionData,
            timestamp: new Date()
          };
          ws.send(JSON.stringify(clientResponse));
          break;
        }

        case 'head_position': {
          const headMessage = message as HeadPositionEvent;
          this.broadcastToTpa(userSession.sessionId, 'head_position', headMessage);
          break;
        }

        // All other message types are broadcast to TPAs.
        default: {
          console.warn(`[Session ${userSession.sessionId}] Catching and Sending message type:`, message.type);
          // check if it's a type of Client to TPA message.
          this.broadcastToTpa(userSession.sessionId, message.type as any, message as any);
        }
      }
    } catch (error) {
      console.error(`[Session ${userSession.sessionId}] Error handling message:`, error);
      // Optionally send error to client
      const errorMessage: CloudConnectionErrorMessage = {
        type: 'connection_error',
        message: error instanceof Error ? error.message : 'Error processing message',
        timestamp: new Date()
      };
      ws.send(JSON.stringify(errorMessage));
    }
  }
  /**
   * 🥳 Handles new TPA connections.
   * @param ws - WebSocket connection
   * @private
   */
  private handleTpaConnection(ws: WebSocket): void {
    console.log('New TPA attempting to connect...');
    let currentAppSession: string | null = null;
    const setCurrentSessionId = (appSessionId: string) => {
      currentAppSession = appSessionId;
    }

    ws.on('message', async (data: Buffer | string, isBinary: boolean) => {
      if (isBinary) {
        console.warn('Received unexpected binary message from TPA');
        return;
      }

      try {
        const message = JSON.parse(data.toString()) as TpaToCloudMessage;
        await this.handleTpaMessage(ws, message, currentAppSession, setCurrentSessionId);
      } catch (error) {
        console.error('Error handling TPA message:', error);
        this.sendError(ws, {
          code: 'MESSAGE_HANDLING_ERROR',
          message: 'Error processing message'
        });
      }
    });

    ws.on('close', () => {
      if (currentAppSession) {
        const connection = this.tpaConnections.get(currentAppSession);
        if (connection) {
          this.subscriptionService.removeSubscriptions(
            connection.userSessionId,
            connection.packageName
          );
        }
        this.tpaConnections.delete(currentAppSession);
        console.log(`TPA session ${currentAppSession} disconnected`);
      }
    });

    ws.on('error', (error) => {
      console.error('TPA WebSocket error:', error);
      if (currentAppSession) {
        this.tpaConnections.delete(currentAppSession);
      }
      ws.close();
    });

    ws.on('pong', () => {
      if (currentAppSession) {
        const connection = this.tpaConnections.get(currentAppSession);
        if (connection) {
          connection.lastPing = new Date();
        }
      }
    });
  }

  /**
   * 💬 Handles messages from TPAs.
   * @param ws - WebSocket connection
   * @param message - Parsed message from TPA
   * @param currentSession - Current TPA session ID
   * @private
   */
  private async handleTpaMessage(
    ws: WebSocket,
    message: TpaToCloudMessage,
    currentSession: string | null,
    setCurrentSessionId: (sessionId: string) => void
  ): Promise<void> {
    switch (message.type) {
      case 'tpa_connection_init': {
        const initMessage = message as TpaConnectionInitMessage;
        await this.handleTpaInit(ws, initMessage, setCurrentSessionId);
        break;
      }

      case 'subscription_update': {
        if (!currentSession) {
          ws.close(1008, 'No active session');
          return;
        }

        const subMessage = message as TpaSubscriptionUpdateMessage;
        const connection = this.tpaConnections.get(currentSession);
        if (!connection) return;

        const userSession = this.sessionService.getSession(connection.userSessionId);
        if (!userSession) {
          ws.close(1008, 'No active session');
          return;
        }

        this.subscriptionService.updateSubscriptions(
          connection.userSessionId,
          connection.packageName,
          userSession.userId,
          subMessage.subscriptions
        );
        break;
      }

      case 'display_event': {
        if (!currentSession) {
          ws.close(1008, 'No active session');
          return;
        }

        const displayMessage = message as DisplayRequest;
        const connection = this.tpaConnections.get(currentSession);
        if (!connection) return;

        this.sessionService.updateDisplay(
          connection.userSessionId,
          displayMessage
        );

        break;
      }

    }
  }

  /**
   * 🤝 Handles TPA connection initialization.
   * @param ws - WebSocket connection
   * @param initMessage - Connection initialization message
   * @param setCurrentSessionId - Function to set the current TPA session ID
   * @private
   */
  private async handleTpaInit(
    ws: WebSocket,
    initMessage: TpaConnectionInitMessage,
    setCurrentSessionId: (sessionId: string) => void
  ): Promise<void> {
    const pendingSession = this.pendingTpaSessions.get(initMessage.sessionId);
    if (!pendingSession) {
      ws.close(1008, 'Invalid session ID');
      return;
    }

    const { userSessionId, packageName } = pendingSession;
    const connectionId = `${userSessionId}-${packageName}`;

    // TODO: 🔐 Authenticate TPA with API key !important 😳.
    this.pendingTpaSessions.delete(initMessage.sessionId);
    this.tpaConnections.set(connectionId, { packageName, userSessionId, websocket: ws });
    setCurrentSessionId(connectionId);

    const ackMessage: CloudTpaConnectionAckMessage = {
      type: 'tpa_connection_ack',
      sessionId: connectionId,
      timestamp: new Date()
    };
    ws.send(JSON.stringify(ackMessage));
    console.log(`TPA ${packageName} connected for session ${initMessage.sessionId}`);
  }

  /**
   * 🏓 Starts the ping interval for connection health checks.
   * @private
   */
  private startPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    // this.pingInterval = setInterval(() => {
    //   const now = new Date();

    //   for (const [sessionId, connection] of this.tpaConnections) {
    //     if (connection.lastPing &&
    //       now.getTime() - connection.lastPing.getTime() > PING_TIMEOUT_MS) {
    //       console.log(`TPA session ${sessionId} ping timeout`);
    //       connection.websocket.close(1008, 'Ping timeout');
    //       this.tpaConnections.delete(sessionId);
    //     } else {
    //       connection.websocket.ping();
    //     }
    //   }
    // }, PING_INTERVAL_MS);
  }

  /**
   * 😬 Sends an error message to a WebSocket client.
   * @param ws - WebSocket connection
   * @param error - Error details
   * @private
   */
  private sendError(ws: WebSocket, error: WebSocketError): void {
    const errorMessage: CloudConnectionErrorMessage = {
      type: 'connection_error',
      message: error.message,
      timestamp: new Date()
    };
    ws.send(JSON.stringify(errorMessage));
  }
}

/**
 * ⚡️ Creates and returns a WebSocket service instance with the provided dependencies.
 * @param sessionService - Service for managing user sessions
 * @param subscriptionService - Service for managing TPA subscriptions
 * @param transcriptionService - Service for handling audio transcription
 * @param appService - Service for managing TPAs
 * @returns An initialized WebSocket service instance
 */
export function createWebSocketService(
  sessionService: ISessionService,
  subscriptionService: ISubscriptionService,
  transcriptionService: ITranscriptionService,
  appService: IAppService,
): IWebSocketService {
  return new WebSocketService(
    sessionService,
    subscriptionService,
    transcriptionService,
    appService,
  );
}

/**
 * ☝️ Singleton instance with actual service implementations.
 * Design decision: While we use DI for testing, in the actual application
 * we provide a convenient singleton instance with all dependencies configured.
 */
export const webSocketService = createWebSocketService(
  sessionService,
  subscriptionService,
  transcriptionService,
  appService,
);
console.log('✅ WebSocket Service');

export default webSocketService;