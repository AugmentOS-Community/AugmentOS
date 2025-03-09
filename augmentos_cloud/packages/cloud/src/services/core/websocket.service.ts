// augmentos_cloud/packages/cloud/core/websocket.service.ts.

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


// import { WebSocketServer, WebSocket } from 'ws';
import WebSocket from 'ws';
import { Server } from 'http';
import sessionService, { SessionService } from './session.service';
import subscriptionService, { SubscriptionService } from './subscription.service';
import transcriptionService, { TranscriptionService } from '../processing/transcription.service';
import appService, { AppService } from './app.service';
import { AppStateChange, AuthError, CalendarEvent, CloudToGlassesMessage, CloudToGlassesMessageType, CloudToTpaMessage, CloudToTpaMessageType, ConnectionAck, ConnectionError, ConnectionInit, DataStream, DisplayRequest, ExtendedStreamType, GlassesConnectionState, GlassesToCloudMessage, GlassesToCloudMessageType, HeadPosition, LocationUpdate, MicrophoneStateChange, StartApp, StopApp, StreamType, TpaConnectionAck, TpaConnectionError, TpaConnectionInit, TpaSubscriptionUpdate, TpaToCloudMessage, UserSession, Vad } from '@augmentos/sdk';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { PosthogService } from '../logging/posthog.service';
import { systemApps } from '@augmentos/config';
import { User } from '../../models/user.model';
import { logger } from '@augmentos/utils';

export const AUGMENTOS_AUTH_JWT_SECRET = process.env.AUGMENTOS_AUTH_JWT_SECRET || "";

const WebSocketServer = WebSocket.Server || WebSocket.WebSocketServer;

// Constants
const TPA_SESSION_TIMEOUT_MS = 5000;  // 30 seconds


/**
 * ⚡️🕸️🚀 Implementation of the WebSocket service.
 */
export class WebSocketService {
  private glassesWss: WebSocket.Server;
  private tpaWss: WebSocket.Server;
  // private tpaConnections = new Map<string, TpaConnection>();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly sessionService: SessionService,
    private readonly subscriptionService: SubscriptionService,
    private readonly transcriptionService: TranscriptionService,
    private readonly appService: AppService,
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
  }

  private microphoneStateChangeDebouncers = new Map<
    string,
    { timer: ReturnType<typeof setTimeout> | null; lastState: boolean; lastSentState: boolean }
  >();

  /**
   * Sends a debounced microphone state change message.
   * The first call sends the message immediately.
   * Subsequent calls are debounced and only the final state is sent if it differs
   * from the last sent state. After the delay, the debouncer is removed.
   *
   * @param ws - WebSocket connection to send the update on
   * @param userSession - The current user session
   * @param isEnabled - Desired microphone enabled state
   * @param delay - Debounce delay in milliseconds (default: 1000ms)
   */
  private sendDebouncedMicrophoneStateChange(
    ws: WebSocket,
    userSession: UserSession,
    isEnabled: boolean,
    delay = 1000
  ): void {
    const sessionId = userSession.sessionId;
    let debouncer = this.microphoneStateChangeDebouncers.get(sessionId);

    if (!debouncer) {
      // First call: send immediately.
      const message: MicrophoneStateChange = {
        type: CloudToGlassesMessageType.MICROPHONE_STATE_CHANGE,
        sessionId: userSession.sessionId,
        userSession: {
          sessionId: userSession.sessionId,
          userId: userSession.userId,
          startTime: userSession.startTime,
          activeAppSessions: userSession.activeAppSessions,
          loadingApps: userSession.loadingApps,
          isTranscribing: userSession.isTranscribing,
        },
        isMicrophoneEnabled: isEnabled,
        timestamp: new Date(),
      };
      ws.send(JSON.stringify(message));

      // Create a debouncer inline to track subsequent calls.
      debouncer = {
        timer: null,
        lastState: isEnabled,
        lastSentState: isEnabled,
      };
      this.microphoneStateChangeDebouncers.set(sessionId, debouncer);
    } else {
      // For subsequent calls, update the desired state.
      debouncer.lastState = isEnabled;
      if (debouncer.timer) {
        clearTimeout(debouncer.timer);
      }
    }

    // Set or reset the debounce timer.
    debouncer.timer = setTimeout(() => {
      // Only send if the final state differs from the last sent state.
      if (debouncer!.lastState !== debouncer!.lastSentState) {
        userSession.logger.info('Sending microphone state change message');
        const message: MicrophoneStateChange = {
          type: CloudToGlassesMessageType.MICROPHONE_STATE_CHANGE,
          sessionId: userSession.sessionId,
          userSession: {
            sessionId: userSession.sessionId,
            userId: userSession.userId,
            startTime: userSession.startTime,
            activeAppSessions: userSession.activeAppSessions,
            loadingApps: userSession.loadingApps,
            isTranscribing: userSession.isTranscribing,
          },
          isMicrophoneEnabled: debouncer!.lastState,
          timestamp: new Date(),
        };
        ws.send(JSON.stringify(message));
        debouncer!.lastSentState = debouncer!.lastState;
      }

      if (debouncer!.lastSentState) {
        transcriptionService.startTranscription(userSession);
      } else {
        transcriptionService.stopTranscription(userSession);
      }

      // Cleanup: remove the debouncer after processing.
      this.microphoneStateChangeDebouncers.delete(sessionId);
    }, delay);
  }

  /**
   * 🚀🪝 Initiates a new TPA session and triggers the TPA's webhook.
   * @param userSession - userSession object for the user initiating the TPA session
   * @param packageName - TPA identifier
   * @returns Promise resolving to the TPA session ID
   * @throws Error if app not found or webhook fails
   */
  async startAppSession(userSession: UserSession, packageName: string): Promise<string> {
    // check if it's already loading or running, if so return the session id.
    if (userSession.loadingApps.has(packageName) || userSession.activeAppSessions.includes(packageName)) {
      userSession.logger.info(`\n[websocket.service]\n🚀🚀🚀 App ${packageName} already loading or running\n `);

      return userSession.sessionId + '-' + packageName;
    }
    const app = await this.appService.getApp(packageName);
    if (!app) {
      userSession.logger.error(`\n[websocket.service]\n🚀🚀🚀 App ${packageName} not found\n `);
      throw new Error(`App ${packageName} not found`);
    }

    userSession.logger.info(`\n[websocket.service]\n⚡️ Loading app ${packageName} for user ${userSession.userId}\n`);

    // Store pending session.
    userSession.loadingApps.add(packageName);
    userSession.logger.debug(`\nCurrent Loading Apps:`, userSession.loadingApps);

    try {
      // Trigger TPA webhook
      userSession.logger.info("\n\n\n⚡️Triggering webhook for app⚡️: ", app.webhookURL);
      await this.appService.triggerWebhook(app.webhookURL, {
        type: 'session_request',
        sessionId: userSession.sessionId + '-' + packageName,
        userId: userSession.userId,
        timestamp: new Date().toISOString()
      });

      // Trigger boot screen.
      userSession.displayManager.handleAppStart(app.packageName, userSession);

      // Set timeout to clean up pending session
      setTimeout(() => {
        if (userSession.loadingApps.has(packageName)) {
          userSession.loadingApps.delete(packageName);
          userSession.logger.info(`👴🏻 TPA ${packageName} expired without connection`);

          // Clean up boot screen.
          userSession.displayManager.handleAppStop(app.packageName, userSession);
        }
      }, TPA_SESSION_TIMEOUT_MS);

      userSession.loadingApps.delete(packageName);
      userSession.logger.info(`Successfully started app ${packageName}`);
      return userSession.sessionId + '-' + packageName;
    } catch (error) {
      // this.pendingTpaSessions.delete(tpaSessionId);
      userSession.logger.error(`\n[GG]\nError starting app ${packageName}:`, error);
      userSession.loadingApps.delete(packageName);
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
    const userSession = this.sessionService.getSession(userSessionId);
    if (!userSession) {
      logger.error(`\n\n[websocket.service] User session not found for ${userSessionId}\n\n`);
      return;
    }
    
    // If the stream is transcription or translation and data has language info,
    // construct an effective subscription string.
    let effectiveSubscription: ExtendedStreamType = streamType;
    // For translation, you might also include target language if available.
    if (streamType === StreamType.TRANSLATION) {
      effectiveSubscription = `${streamType}:${(data as any).transcribeLanguage}-to-${(data as any).translateLanguage}`;
    } else if (streamType === StreamType.TRANSCRIPTION && !(data as any).transcribeLanguage) {
      effectiveSubscription = `${streamType}:en-US`;
    } else if (streamType === StreamType.TRANSCRIPTION) {
      effectiveSubscription = `${streamType}:${(data as any).transcribeLanguage}`;
    }

    const subscribedApps = this.subscriptionService.getSubscribedApps(userSessionId, effectiveSubscription);
    
    subscribedApps.forEach(packageName => {
      const tpaSessionId = `${userSession.sessionId}-${packageName}`;
      const websocket = userSession.appConnections.get(packageName);
      if (websocket && websocket.readyState === WebSocket.OPEN) {
        // CloudDataStreamMessage
        const dataStream: DataStream = {
          type: CloudToTpaMessageType.DATA_STREAM,
          sessionId: tpaSessionId,
          streamType, // Base type remains the same in the message.
          data,      // The data now may contain language info.
          timestamp: new Date()
        };

        websocket.send(JSON.stringify(dataStream));
      } else {
        userSession.logger.error(`\n\n[websocket.service] TPA ${packageName} not connected\n\n`);
      }
    });
  }

  broadcastToTpaAudio(userSession: UserSession, arrayBuffer: ArrayBufferLike): void {
    const subscribedApps = this.subscriptionService.getSubscribedApps(userSession.sessionId, StreamType.AUDIO_CHUNK);

    for (const packageName of subscribedApps) {
      const tpaSessionId = `${userSession.sessionId}-${packageName}`;
      const websocket = userSession.appConnections.get(packageName);

      if (websocket && websocket.readyState === WebSocket.OPEN) {
        // CloudDataStreamMessage
        // const streamMessage: DataStream = {
        //   type: CloudToTpaMessageType.DATA_STREAM,
        //   sessionId: tpaSessionId,
        //   streamType
        //   data,
        //   timestamp: new Date()
        // };

        websocket.send(arrayBuffer);
      } else {
        userSession.logger.error(`\n\n[websocket.service] TPA ${packageName} not connected\n\n`);
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
        this.glassesWss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          this.glassesWss.emit('connection', ws, request);
        });
      } else if (url === '/tpa-ws') {
        this.tpaWss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
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
  private async handleGlassesConnection(ws: WebSocket): Promise<void> {
    logger.info('[websocket.service] New glasses client attempting to connect...');
    const startTimestamp = new Date();

    const userSession = await this.sessionService.createSession(ws);
    ws.on('message', async (message: Buffer | string, isBinary: boolean) => {
      try {
        // console.log('####### message', message);
        // console.log('####### isBinary', isBinary);

        if (Buffer.isBuffer(message)) {

          // Convert Node.js Buffer to ArrayBuffer
          const arrayBuf: ArrayBufferLike = message.buffer.slice(
            message.byteOffset,
            message.byteOffset + message.byteLength
          );
          // Pass the ArrayBuffer to Azure Speech or wherever you need it
          const _arrayBuffer = await this.sessionService.handleAudioData(userSession, arrayBuf);
          // send audio chunk to TPA's subscribed to audio_chunk.
          if (_arrayBuffer) {
            this.broadcastToTpaAudio(userSession, _arrayBuffer);
          }
          
          return;
        }

        // console.log('####### message', message);

        const parsedMessage = JSON.parse(message.toString()) as GlassesToCloudMessage;
        await this.handleGlassesMessage(userSession, ws, parsedMessage);
      } catch (error) {
        userSession.logger.error(`Error handling glasses message:`, error);
        this.sendError(ws, {
          // code: 'MESSAGE_HANDLING_ERROR',
          type: CloudToGlassesMessageType.CONNECTION_ERROR,
          message: 'Error processing message'
        });
      }
    });

    const RECONNECT_GRACE_PERIOD_MS = 1000 * 60 * 5; // 5 minutes
    ws.on('close', () => {
      userSession.logger.info(`Glasses WebSocket disconnected: ${userSession.sessionId}`);
      // Mark the session as disconnected but do not remove it immediately.
      this.sessionService.markSessionDisconnected(userSession);

      // Optionally, set a timeout to eventually clean up the session if not reconnected.
      setTimeout(() => {
        if (this.sessionService.isItTimeToKillTheSession(userSession.sessionId)) {
          this.sessionService.endSession(userSession.sessionId);
        }
      }, RECONNECT_GRACE_PERIOD_MS);

      // Track disconnection event posthog.
      const endTimestamp = new Date();
      const connectionDuration = endTimestamp.getTime() - startTimestamp.getTime();
      PosthogService.trackEvent('disconnected', userSession.userId, {
        userId: userSession.userId,
        sessionId: userSession.sessionId,
        timestamp: new Date().toISOString(),
        duration: connectionDuration
      });
    });

    ws.on('error', (error) => {
      userSession.logger.error(`Glasses WebSocket error:`, error);
      this.sessionService.endSession(userSession.sessionId);
      ws.close();
    });
  }

  /**
   * 🤓 Handles messages from glasses clients.
   * @param userSession - User Session identifier
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
      // Track the incoming message event
      PosthogService.trackEvent(message.type, userSession.userId, {
        sessionId: userSession.sessionId,
        eventType: message.type,
        timestamp: new Date().toISOString()
      });

      switch (message.type) {
        // 'connection_init'
        case GlassesToCloudMessageType.CONNECTION_INIT: {
          const initMessage = message as ConnectionInit;
          const coreToken = initMessage.coreToken || "";
          let userId = '';

          // Verify the core token, and extract the user ID.
          try {
            const userData = jwt.verify(coreToken, AUGMENTOS_AUTH_JWT_SECRET);
            userId = (userData as JwtPayload).email;
            if (!userId) {
              throw new Error('User ID is required');
            }
          }
          catch (error) {
            userSession.logger.error(`[websocket.service] Error verifying core token:`, error);
            const errorMessage: AuthError = {
              type: CloudToGlassesMessageType.AUTH_ERROR,
              message: 'User not authenticated',
              timestamp: new Date()
            };
            ws.send(JSON.stringify(errorMessage));
            return;
          }

          // let userId = 'loriamistadi75@gmail.com';
          userSession.logger.info(`[websocket.service] Glasses client connected: ${userId}`);

          // See if this user has an existing session and reconnect if so.
          try {
            this.sessionService.handleReconnectUserSession(userSession, userId);
          }
          catch (error) {
            userSession.logger.error(`\n\n\n\n[websocket.service] Error reconnecting user session starting new session:`, error);
          }

          // Start all the apps that the user has running.
          try {
            const user = await User.findOrCreateUser(userSession.userId);
            userSession.logger.debug(`\n\n[websocket.service] Trying to start ${user.runningApps.length} apps\n[${userSession.userId}]: [${user.runningApps.join(", ")}]\n`);
            for (const packageName of user.runningApps) {
              try {
                await this.startAppSession(userSession, packageName);
                userSession.activeAppSessions.push(packageName);
                userSession.logger.info(`\n\n[websocket.service]\n[${userId}]\n🚀✅ Starting app ${packageName}\n`);
              }
              catch (error) {
                userSession.logger.error(`\n\n[websocket.service] Error starting user apps:`, error, `\n\n`);
              }
            }

            // Start the dashboard app, but let's not add to the user's running apps since it's a system app.
            // honestly there should be no annyomous users so if it's an anonymous user we should just not start the dashboard
            if (userSession.userId !== 'anonymous') {
              await this.startAppSession(userSession, systemApps.dashboard.packageName);
              userSession.logger.info(`\n\n[websocket.service]\n[${userId}]\n🗿🗿✅🗿🗿 Starting app ${systemApps.dashboard.packageName}\n`);
            }

          }
          catch (error) {
            userSession.logger.error(`\n\n[websocket.service] Error starting user apps:`, error, `\n\n`);
          }

          // Start transcription
          this.transcriptionService.startTranscription(userSession);

          // this.sessionService.setAudioHandlers(userSession, pushStream, recognizer);
          const activeAppPackageNames = Array.from(new Set(userSession.activeAppSessions));

          // create a map of active apps and what steam types they are subscribed to.
          const appSubscriptions = new Map<string, ExtendedStreamType[]>(); // packageName -> streamTypes
          const whatToStream: Set<ExtendedStreamType> = new Set(); // packageName -> streamTypes

          for (const packageName of activeAppPackageNames) {
            const subscriptions = this.subscriptionService.getAppSubscriptions(userSession.sessionId, packageName);
            appSubscriptions.set(packageName, subscriptions);
            for (const subscription of subscriptions) {
              whatToStream.add(subscription);
            }
          }

          // Dashboard subscriptions
          const dashboardSubscriptions = this.subscriptionService.getAppSubscriptions(userSession.sessionId, systemApps.dashboard.packageName);
          appSubscriptions.set(systemApps.dashboard.packageName, dashboardSubscriptions);
          for (const subscription of dashboardSubscriptions) {
            whatToStream.add(subscription);
          }

          const userSessionData = {
            sessionId: userSession.sessionId,
            userId: userSession.userId,
            startTime: userSession.startTime,
            installedApps: await this.appService.getAllApps(),
            appSubscriptions: Object.fromEntries(appSubscriptions),
            activeAppPackageNames,
            whatToStream: Array.from(new Set(whatToStream)),
          };

          // const ackMessage: CloudConnectionAckMessage = {
          const ackMessage: ConnectionAck = {
            type: CloudToGlassesMessageType.CONNECTION_ACK,
            sessionId: userSession.sessionId,
            userSession: userSessionData,
            timestamp: new Date()
          };
          ws.send(JSON.stringify(ackMessage));
          userSession.logger.info(`\n\n[websocket.service]\nSENDING connection_ack to ${userId}\n\n`);

          // Track connection event.
          PosthogService.trackEvent('connected', userSession.userId, {
            sessionId: userSession.sessionId,
            timestamp: new Date().toISOString()
          });
          break;
        }

        case 'start_app': {
          const startMessage = message as StartApp;
          userSession.logger.info(`\n\n\n\n🚀🚀🚀[START_APP]: Starting app ${startMessage.packageName}`);
          userSession.logger.info(`🚀🚀🚀[START_APP]: ${JSON.stringify(message)}\n\n\n\n`);

          await this.startAppSession(userSession, startMessage.packageName);

          userSession.activeAppSessions.push(startMessage.packageName);

          // Get the list of active apps.
          const activeAppPackageNames = Array.from(new Set(userSession.activeAppSessions));

          // create a map of active apps and what steam types they are subscribed to.
          const appSubscriptions = new Map<string, ExtendedStreamType[]>(); // packageName -> streamTypes
          const whatToStream: Set<ExtendedStreamType> = new Set(); // packageName -> streamTypes

          for (const packageName of activeAppPackageNames) {
            const subscriptions = this.subscriptionService.getAppSubscriptions(userSession.sessionId, packageName);
            appSubscriptions.set(packageName, subscriptions);
            for (const subscription of subscriptions) {
              whatToStream.add(subscription);
            }
          }

          // Dashboard subscriptions
          const dashboardSubscriptions = this.subscriptionService.getAppSubscriptions(userSession.sessionId, systemApps.dashboard.packageName);
          appSubscriptions.set(systemApps.dashboard.packageName, dashboardSubscriptions);
          for (const subscription of dashboardSubscriptions) {
            whatToStream.add(subscription);
          }

          const userSessionData = {
            sessionId: userSession.sessionId,
            userId: userSession.userId,
            startTime: userSession.startTime,
            installedApps: await this.appService.getAllApps(),
            appSubscriptions: Object.fromEntries(appSubscriptions),
            activeAppPackageNames,
            whatToStream: Array.from(new Set(whatToStream)),
          };

          const clientResponse: AppStateChange = {
            // type: 'app_state_change',
            type: CloudToGlassesMessageType.APP_STATE_CHANGE,
            sessionId: userSession.sessionId, // TODO: Remove this field and check all references.
            userSession: userSessionData,
            timestamp: new Date()
          };
          ws.send(JSON.stringify(clientResponse));

          PosthogService.trackEvent(`start_app:${startMessage.packageName}`, userSession.userId, {
            sessionId: userSession.sessionId,
            eventType: message.type,
            timestamp: new Date().toISOString()
            // message: message, // May contain sensitive data so let's not log it. just the event name cause i'm ethical like that 😇
          });

          // Update users running apps in the database.
          try {
            const user = await User.findByEmail(userSession.userId);
            if (user) {
              await user.addRunningApp(startMessage.packageName);
            }
          }
          catch (error) {
            userSession.logger.error(`\n\n[websocket.service] Error updating user running apps:`, error, `\n\n`);
          }

          const mediaSubscriptions = this.subscriptionService.hasMediaSubscriptions(userSession.sessionId);
          userSession?.logger.info('Media subscriptions:', mediaSubscriptions);

          if (mediaSubscriptions) {
            userSession.logger.info('Media subscriptions, sending microphone state change message');
            this.sendDebouncedMicrophoneStateChange(ws, userSession, true);
          }
          break;
        }

        // In handleGlassesMessage method, update the 'stop_app' case:
        case 'stop_app': {
          const stopMessage = message as StopApp;
          PosthogService.trackEvent(`stop_app:${stopMessage.packageName}`, userSession.userId, {
            sessionId: userSession.sessionId,
            eventType: message.type,
            timestamp: new Date().toISOString()
            // message: message, // May contain sensitive data so let's not log it. just the event name cause i'm ethical like that 😇
          });
          userSession.logger.info(`Stopping app ${stopMessage.packageName}`);

          try {
            const app = await this.appService.getApp(stopMessage.packageName);
            if (!app) throw new Error(`App ${stopMessage.packageName} not found`);

            // Call stop webhook 
            // TODO(isaiah): Implement stop webhook in TPA typescript client lib.
            // const tpaSessionId = `${userSession.sessionId}-${stopMessage.packageName}`;

            // try {
            //   await this.appService.triggerStopWebhook(
            //     app.webhookURL,
            //     {
            //       type: 'stop_request',
            //       sessionId: tpaSessionId,
            //       userId: userSession.userId,
            //       reason: 'user_disabled',
            //       timestamp: new Date().toISOString()
            //     }
            //   );
            // }
            // catch (error: AxiosError | unknown) {
            //   // console.error(`\n\n[stop_app]:\nError stopping app ${stopMessage.packageName}:\n${(error as any)?.message}\n\n`);
            //   // Update state even if webhook fails
            //   // TODO(isaiah): This is a temporary fix. We should handle this better. Also implement stop webhook in TPA typescript client lib.
            //   userSession.activeAppSessions = userSession.activeAppSessions.filter(
            //     (packageName) => packageName !== stopMessage.packageName
            //   );
            // }

            // Remove subscriptions and update state
            this.subscriptionService.removeSubscriptions(userSession, stopMessage.packageName);

            const mediaSubscriptions = this.subscriptionService.hasMediaSubscriptions(userSession.sessionId);
            userSession.logger.info('Media subscriptions:', mediaSubscriptions);

            if (!mediaSubscriptions) {
              userSession.logger.info('No media subscriptions, sending microphone state change message');
              this.sendDebouncedMicrophoneStateChange(ws, userSession, false);
            }

            // Remove app from active list
            userSession.activeAppSessions = userSession.activeAppSessions.filter(
              (packageName) => packageName !== stopMessage.packageName
            );

            // Get the list of active apps.
            const activeAppPackageNames = Array.from(new Set(userSession.activeAppSessions));

            // create a map of active apps and what steam types they are subscribed to.
            const appSubscriptions = new Map<string, ExtendedStreamType[]>(); // packageName -> streamTypes
            const whatToStream: Set<ExtendedStreamType> = new Set(); // packageName -> streamTypes

            for (const packageName of activeAppPackageNames) {
              const subscriptions = this.subscriptionService.getAppSubscriptions(userSession.sessionId, packageName);
              appSubscriptions.set(packageName, subscriptions);
              for (const subscription of subscriptions) {
                whatToStream.add(subscription);
              }
            }

            // Dashboard subscriptions
            const dashboardSubscriptions = this.subscriptionService.getAppSubscriptions(userSession.sessionId, systemApps.dashboard.packageName);
            appSubscriptions.set(systemApps.dashboard.packageName, dashboardSubscriptions);
            for (const subscription of dashboardSubscriptions) {
              whatToStream.add(subscription);
            }

            const userSessionData = {
              sessionId: userSession.sessionId,
              userId: userSession.userId,
              startTime: userSession.startTime,
              installedApps: await this.appService.getAllApps(),
              appSubscriptions: Object.fromEntries(appSubscriptions),
              activeAppPackageNames,
              whatToStream: Array.from(new Set(whatToStream)),
            };

            const clientResponse: AppStateChange = {
              // type: 'app_state_change',
              type: CloudToGlassesMessageType.APP_STATE_CHANGE,
              sessionId: userSession.sessionId, // TODO: Remove this field and check all references.
              userSession: userSessionData,
              timestamp: new Date()
            };
            ws.send(JSON.stringify(clientResponse));

            // Update users running apps in the database.
            try {
              const user = await User.findByEmail(userSession.userId);
              if (user) {
                await user.removeRunningApp(stopMessage.packageName);
              }
            }
            catch (error) {
              userSession.logger.error(`\n\n[websocket.service] Error updating user running apps:`, error, `\n\n`);
            }

            // Update the display
            userSession.displayManager.handleAppStop(stopMessage.packageName, userSession);
          } catch (error) {
            userSession.logger.error(`Error stopping app ${stopMessage.packageName}:`, error);
            // Update state even if webhook fails
            userSession.activeAppSessions = userSession.activeAppSessions.filter(
              (packageName) => packageName !== stopMessage.packageName
            );
          }
          break;
        }

        // // head_position
        // case GlassesToCloudMessageType.HEAD_POSITION: {
        //   const headMessage = message as HeadPosition;
        //   this.broadcastToTpa(userSession.sessionId, StreamType.HEAD_POSITION, headMessage);
        //   break;
        // }

        // case 'glasses_connection_state': {
        case GlassesToCloudMessageType.GLASSES_CONNECTION_STATE: {
          const glassesConnectionStateMessage = message as GlassesConnectionState;

          userSession.logger.info('Glasses connection state:', glassesConnectionStateMessage);

          if (glassesConnectionStateMessage.status === 'CONNECTED') {
            const mediaSubscriptions = this.subscriptionService.hasMediaSubscriptions(userSession.sessionId);
            userSession.logger.info('Init Media subscriptions:', mediaSubscriptions);
            this.sendDebouncedMicrophoneStateChange(ws, userSession, mediaSubscriptions);
          }

          // Track the connection state event
          PosthogService.trackEvent(GlassesToCloudMessageType.GLASSES_CONNECTION_STATE, userSession.userId, {
            sessionId: userSession.sessionId,
            eventType: message.type,
            timestamp: new Date().toISOString(),
            connectionState: glassesConnectionStateMessage,
          });

          // Track modelName. if status is connected.
          if (glassesConnectionStateMessage.status === 'CONNECTED') {
            PosthogService.trackEvent("modelName", userSession.userId, {
              sessionId: userSession.sessionId,
              eventType: message.type,
              timestamp: new Date().toISOString(),
              modelName: glassesConnectionStateMessage.modelName,
            });
          }
          break;
        }

        case GlassesToCloudMessageType.VAD: {
          // const vadMessage = message as VADStateMessage;
          const vadMessage = message as Vad;
          userSession.logger.info(`\n🎤 VAD State Change: status ${vadMessage.status}`);

          const isSpeaking = vadMessage.status === true || vadMessage.status === 'true';
          userSession.logger.info(`VAD speaking state: ${isSpeaking}`);

          try {
            if (isSpeaking) {
              userSession.logger.info('🎙️ VAD detected speech - starting transcription');
              userSession.isTranscribing = true;
              transcriptionService.startTranscription(userSession);
            } else {
              userSession.logger.info('🤫 VAD detected silence - stopping transcription');
              userSession.isTranscribing = false;
              transcriptionService.stopTranscription(userSession);
            }
          } catch (error) {
            userSession.logger.error('❌ Error handling VAD state change:', error);
            userSession.isTranscribing = false;
            transcriptionService.stopTranscription(userSession);
          }
          this.broadcastToTpa(userSession.sessionId, message.type as any, message as any);
          break;
        }

        // Cache location for dashboard.
        case GlassesToCloudMessageType.LOCATION_UPDATE: {
          const locationUpdate = message as LocationUpdate;
          try {
            const user = await User.findByEmail(userSession.userId);
            if (user) {
              await user.setLocation(locationUpdate);
            }
          }
          catch (error) {
            userSession.logger.error(`\n\n[websocket.service] Error updating user location:`, error, `\n\n`);
          }
          this.broadcastToTpa(userSession.sessionId, message.type as any, message as any);
          console.warn(`[Session ${userSession.sessionId}] Catching and Sending message type:`, message.type);
          // userSession.location = locationUpdate.location;
          break;
        }

        case GlassesToCloudMessageType.CALENDAR_EVENT: {
          const calendarEvent = message as CalendarEvent;
          console.log('Calendar event:', calendarEvent);

          this.broadcastToTpa(userSession.sessionId, message.type as any, message as any);
          break;
        }

        // All other message types are broadcast to TPAs.
        default: {
          userSession.logger.info(`[Session ${userSession.sessionId}] Catching and Sending message type:`, message.type);
          // check if it's a type of Client to TPA message.
          this.broadcastToTpa(userSession.sessionId, message.type as any, message as any);
        }
      }
    } catch (error) {
      userSession.logger.error(`[Session ${userSession.sessionId}] Error handling message:`, error);
      // Optionally send error to client
      // const errorMessage: CloudConnectionErrorMessage = {
      const errorMessage: ConnectionError = {
        type: CloudToGlassesMessageType.CONNECTION_ERROR,
        message: error instanceof Error ? error.message : 'Error processing message',
        timestamp: new Date()
      };

      PosthogService.trackEvent("error-handleGlassesMessage", userSession.userId, {
        sessionId: userSession.sessionId,
        eventType: message.type,
        timestamp: new Date().toISOString(),
        error: error,
        // message: message, // May contain sensitive data so let's not log it. just the event name cause i'm ethical like that 😇
      });

      ws.send(JSON.stringify(errorMessage));
    }
  }
  /**
   * 🥳 Handles new TPA connections.
   * @param ws - WebSocket connection
   * @private
   */
  private handleTpaConnection(ws: WebSocket): void {
    logger.info('New TPA attempting to connect...');
    let currentAppSession: string | null = null;
    const setCurrentSessionId = (appSessionId: string) => {
      currentAppSession = appSessionId;
    }
    let userSessionId = '';
    let userSession: UserSession | null = null;

    ws.on('message', async (data: Buffer | string, isBinary: boolean) => {
      if (isBinary) {
        userSession?.logger.warn('Received unexpected binary message from TPA');
        return;
      }

      try {
        const message = JSON.parse(data.toString()) as TpaToCloudMessage;
        if (message.sessionId) {
          userSessionId = message.sessionId.split('-')[0];
          userSession = this.sessionService.getSession(userSessionId);
        }

        // Handle TPA messages here.
        try {
          switch (message.type) {
            case 'tpa_connection_init': {
              const initMessage = message as TpaConnectionInit;
              await this.handleTpaInit(ws, initMessage, setCurrentSessionId);
              break;
            }

            case 'subscription_update': {
              if (!userSession || !userSessionId) {
                logger.error(`\n\n[websocket.service] User session not found for ${userSessionId}\n\n`);
                ws.close(1008, 'No active session');
                return;
              }
            
              const subMessage = message as TpaSubscriptionUpdate;
              
              // Get the minimal language subscriptions before update
              const previousLanguageSubscriptions = this.subscriptionService.getMinimalLanguageSubscriptions(userSessionId);
              
              // Update subscriptions
              this.subscriptionService.updateSubscriptions(
                userSessionId,
                message.packageName,
                userSession.userId,
                subMessage.subscriptions
              );
            
              // Get the new minimal language subscriptions after update
              const newLanguageSubscriptions = this.subscriptionService.getMinimalLanguageSubscriptions(userSessionId);
              
              // Check if language subscriptions have changed
              const languageSubscriptionsChanged = 
                previousLanguageSubscriptions.length !== newLanguageSubscriptions.length ||
                !previousLanguageSubscriptions.every(sub => newLanguageSubscriptions.includes(sub));
              
              if (languageSubscriptionsChanged) {
                userSession.logger.info(`🎤 Language subscriptions changed. Updating transcription streams.`);
                userSession.logger.info(`🎤 Previous: `, previousLanguageSubscriptions);
                userSession.logger.info(`🎤 New: `, newLanguageSubscriptions);
                
                // Update transcription streams with new language subscriptions
                this.transcriptionService.updateTranscriptionStreams(
                  userSession as any, // Cast to ExtendedUserSession
                  newLanguageSubscriptions
                );
                
                // Check if we need to update microphone state based on media subscriptions
                const mediaSubscriptions = this.subscriptionService.hasMediaSubscriptions(userSessionId);
                userSession.logger.info('Media subscriptions after update:', mediaSubscriptions);
                
                if (mediaSubscriptions) {
                  userSession.logger.info('Media subscriptions exist, ensuring microphone is enabled');
                  this.sendDebouncedMicrophoneStateChange(userSession.websocket, userSession, true);
                } else {
                  userSession.logger.info('No media subscriptions, ensuring microphone is disabled');
                  this.sendDebouncedMicrophoneStateChange(userSession.websocket, userSession, false);
                }
              }
            
              // Get the list of active apps and update app state
              const activeAppPackageNames = Array.from(new Set(userSession.activeAppSessions));
            
              userSession.logger.info("🎤 Active app package names: ", activeAppPackageNames);
              // Create a map of active apps and what stream types they are subscribed to
              const appSubscriptions = new Map<string, ExtendedStreamType[]>(); // packageName -> streamTypes
              const whatToStream: Set<ExtendedStreamType> = new Set(); // streamTypes to enable
            
              for (const packageName of activeAppPackageNames) {
                const subscriptions = this.subscriptionService.getAppSubscriptions(userSession.sessionId, packageName);
                appSubscriptions.set(packageName, subscriptions);
                for (const subscription of subscriptions) {
                  whatToStream.add(subscription);
                }
              }
            
              userSession.logger.info("🎤 App subscriptions: ", appSubscriptions);
              userSession.logger.info("🎤 What to stream: ", whatToStream);
            
              // Dashboard subscriptions
              const dashboardSubscriptions = this.subscriptionService.getAppSubscriptions(
                userSession.sessionId, 
                systemApps.dashboard.packageName
              );
              appSubscriptions.set(systemApps.dashboard.packageName, dashboardSubscriptions);
              for (const subscription of dashboardSubscriptions) {
                whatToStream.add(subscription);
              }
            
              const userSessionData = {
                sessionId: userSession.sessionId,
                userId: userSession.userId,
                startTime: userSession.startTime,
                installedApps: await this.appService.getAllApps(),
                appSubscriptions: Object.fromEntries(appSubscriptions),
                activeAppPackageNames,
                whatToStream: Array.from(new Set(whatToStream)),
              };
            
              const clientResponse: AppStateChange = {
                type: CloudToGlassesMessageType.APP_STATE_CHANGE,
                sessionId: userSession.sessionId,
                userSession: userSessionData,
                timestamp: new Date()
              };
              userSession?.websocket.send(JSON.stringify(clientResponse));
              break;
            }

            case 'display_event': {
              if (!userSession) {
                ws.close(1008, 'No active session');
                return;
              }

              const displayMessage = message as DisplayRequest;
              this.sessionService.updateDisplay(userSession.sessionId, displayMessage);
              break;
            }
          }
        }
        catch (error) {
          userSession?.logger.error('Error handling TPA message:', message, error);
          this.sendError(ws, {
            // code: 'MESSAGE_HANDLING_ERROR',
            type: CloudToTpaMessageType.CONNECTION_ERROR,
            message: 'Error processing message'
          });
          PosthogService.trackEvent("error-handleTpaMessage", "anonymous", {
            eventType: message.type,
            timestamp: new Date().toISOString(),
            error: error,
          });
        }

      } catch (error) {
        userSession?.logger.error('Error handling TPA message:', error);
        this.sendError(ws, {
          type: CloudToTpaMessageType.CONNECTION_ERROR,
          message: 'Error processing message'
        });
      }
    });

    ws.on('close', () => {
      if (currentAppSession) {
        // const connection = this.tpaConnections.get(currentAppSession);
        const userSessionId = currentAppSession.split('-')[0];
        const packageName = currentAppSession.split('-')[1];
        const userSession = this.sessionService.getSession(userSessionId);
        if (!userSession) {
          logger.error(`\n\n[websocket.service] User session not found for ${currentAppSession}\n\n`);
          return;
        }
        if (userSession.appConnections.has(currentAppSession)) {
          userSession.appConnections.delete(currentAppSession);
          this.subscriptionService.removeSubscriptions(userSession, packageName);
        }
        // this.tpaConnections.delete(currentAppSession);
        userSession?.logger.info(`TPA session ${currentAppSession} disconnected`);
      }
    });

    ws.on('error', (error) => {
      logger.error('TPA WebSocket error:', error);
      if (currentAppSession) {
        // const connection = this.tpaConnections.get(currentAppSession);
        const userSessionId = currentAppSession.split('-')[0];
        const packageName = currentAppSession.split('-')[1];
        const userSession = this.sessionService.getSession(userSessionId);
        if (!userSession) {
          logger.error(`\n\n[websocket.service] User session not found for ${currentAppSession}\n\n`);
          return;
        }
        if (userSession.appConnections.has(currentAppSession)) {
          userSession.appConnections.delete(currentAppSession);
          this.subscriptionService.removeSubscriptions(userSession, packageName);
        }
        // this.tpaConnections.delete(currentAppSession);
        userSession?.logger.info(`TPA session ${currentAppSession} disconnected`);
      }
      ws.close();
    });
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
    initMessage: TpaConnectionInit,
    setCurrentSessionId: (sessionId: string) => void
  ): Promise<void> {
    // const pendingSession = this.pendingTpaSessions.get(initMessage.appSessionId);
    const userSessionId = initMessage.sessionId.split('-')[0];
    const userSession = this.sessionService.getSession(userSessionId);

    if (!userSession) {
      logger.error(`\n\n[websocket.service] User session not found for ${userSessionId}\n\n`);
      ws.close(1008, 'No active session');
      return;
    }

    // TODO: Why doers this not work?
    // if (!userSession?.loadingApps.includes(initMessage.packageName) || initMessage.packageName !== systemApps.dashboard.packageName) {
    //   console.error('\n\n[websocket.service.ts]🙅‍♀️TPA session not found\nYou shall not pass! 🧙‍♂️\n:', initMessage.sessionId,
    //     '\n\nLoading apps:', userSession?.loadingApps, '\n\n'
    //   );
    //   // TODO(isaiah): 🔐 Close the connection if the session ID is invalid. important for real TPAs.
    //   ws.close(1008, 'Invalid session ID');
    //   return;
    // }

    // TODO(isaiah): 🔐 Authenticate TPA with API key !important 😳.
    // We should insure that the TPA is who they say they are. the session id is legit and they own the package name.
    // For now because all the TPAs are internal we can just trust them.
    // This is a good place to add a check for the TPA's API key for when we have external TPAs.

    // this.pendingTpaSessions.delete(initMessage.appSessionId);
    // userSession.loadingApps = userSession.loadingApps.filter(
    //   (packageName) => packageName !== initMessage.packageName
    // );

    // this.tpaConnections.set(initMessage.sessionId, { packageName: initMessage.packageName, userSessionId, websocket: ws });
    userSession.appConnections.set(initMessage.packageName, ws as WebSocket);
    setCurrentSessionId(initMessage.sessionId);

    const ackMessage: TpaConnectionAck = {
      // type: 'tpa_connection_ack',
      type: CloudToTpaMessageType.CONNECTION_ACK,
      sessionId: initMessage.sessionId,
      timestamp: new Date()
    };
    ws.send(JSON.stringify(ackMessage));
    userSession.logger.info(`TPA ${initMessage.packageName} connected for session ${initMessage.sessionId}`);

    // If this is the dashboard app, send the current location if it's cached. so it can update the timezone.
    try {
      const user = await User.findByEmail(userSession.userId);
      if (user && initMessage.packageName === systemApps.dashboard.packageName) {
        const location = user.location;
        if (location) {
          const locationUpdate: LocationUpdate = {
            type: GlassesToCloudMessageType.LOCATION_UPDATE,
            sessionId: userSessionId,
            lat: location.lat,
            lng: location.lng,
            timestamp: new Date()
          };
          // ws.send(JSON.stringify(locationUpdate));
          this.broadcastToTpa(userSessionId, StreamType.LOCATION_UPDATE, locationUpdate);
        }
      }
    }
    catch (error) {
      userSession.logger.error(`\n\n[websocket.service] Error sending location to dashboard:`, error, `\n\n`);
    }
  }

  /**
   * 😬 Sends an error message to a WebSocket client.
   * @param ws - WebSocket connection
   * @param error - Error details
   * @private
   */
  private sendError(ws: WebSocket, error: ConnectionError | AuthError | TpaConnectionError): void {
    const errorMessage: CloudToGlassesMessage | CloudToTpaMessage = {
      type: CloudToGlassesMessageType.CONNECTION_ERROR,
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
  sessionService: SessionService,
  subscriptionService: SubscriptionService,
  transcriptionService: TranscriptionService,
  appService: AppService,
): WebSocketService {
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
logger.info('✅ WebSocket Service');

export default webSocketService;
