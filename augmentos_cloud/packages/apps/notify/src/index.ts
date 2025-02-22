import express from 'express';
import WebSocket from 'ws';
import path from 'path';
import {
  TpaConnectionInitMessage,
  TpaSubscriptionUpdateMessage,
  CloudDataStreamMessage,
  DisplayRequest,
} from '@augmentos/types'; // shared types for cloud TPA messages
import { CLOUD_PORT, systemApps } from '@augmentos/config';
import { wrapText } from '@augmentos/utils';

const app = express();
const PORT = systemApps.notify.port; // Use a different port from your captions app
const PACKAGE_NAME = systemApps.notify.packageName;
const API_KEY = 'test_key'; // In production, store securely

// Parse JSON bodies (for the webhook endpoint only)
app.use(express.json());

/**
 * Represents a notification similar to the legacy PhoneNotification.
 */
interface PhoneNotification {
  title: string;
  content: string;
  app: string;
  timestamp: number;
  uuid: string;
}

/**
 * SessionData holds the state for each connection:
 * - sessionId (for sending display events)
 * - ws: the WebSocket connection to AugmentOS Cloud
 * - notificationQueue: FIFO queue of notifications
 * - isDisplayingNotification: whether we're actively displaying one
 * - timeoutId: a reference to the scheduled timeout for the next display
 */
interface SessionData {
  sessionId: string;
  ws: WebSocket;
  notificationQueue: PhoneNotification[];
  isDisplayingNotification: boolean;
  timeoutId?: NodeJS.Timeout;
}

const activeSessions = new Map<string, SessionData>();

// Duration (in ms) that each notification is displayed.
const NOTIFICATION_DISPLAY_DURATION = 10000; // 10 seconds

// Blacklisted app names: notifications from these apps will be ignored.
const notificationAppBlackList = ['youtube', 'augment', 'maps'];

/**
 * Webhook endpoint to start a new session.
 * This creates a WebSocket connection to AugmentOS Cloud and initializes the session.
 */
app.post('/webhook', async (req, res) => {
  try {
    const { sessionId, userId } = req.body;
    console.log(`\n\n🗣️🗣️🗣️Received session request for user ${userId}, session ${sessionId}\n\n`);

    // Establish WebSocket connection to AugmentOS Cloud.
    const ws = new WebSocket(`ws://localhost:${CLOUD_PORT}/tpa-ws`);

    ws.on('open', () => {
      console.log(`\n[Session ${sessionId}]\n connected to augmentos-cloud\n`);
      // Send connection init with session ID
      const initMessage: TpaConnectionInitMessage = {
        type: 'tpa_connection_init',
        sessionId,
        packageName: PACKAGE_NAME,
        apiKey: API_KEY
      };
      ws.send(JSON.stringify(initMessage));
    });

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(sessionId, ws, message);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    ws.on('close', () => {
      console.log(`Session ${sessionId} disconnected`);
      activeSessions.delete(sessionId);
    });

    activeSessions.set(sessionId, {
      sessionId,
      ws,
      notificationQueue: [],
      isDisplayingNotification: false,
    });
    res.status(200).json({ status: 'connecting' });

  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Handles messages arriving from the cloud via WebSocket.
 * In addition to the connection ack and transcription cases,
 * we now handle incoming notification events.
 */
function handleMessage(sessionId: string, ws: WebSocket, message: any) {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo) {
    console.warn(`Session ${sessionId} not found in activeSessions`);
    return;
  }

  switch (message.type) {
    case 'tpa_connection_ack': {
      // Connection acknowledged, subscribe to transcription
      const subMessage: TpaSubscriptionUpdateMessage = {
        type: 'subscription_update',
        packageName: PACKAGE_NAME,
        sessionId,
        subscriptions: ['phone_notification']
      };
      ws.send(JSON.stringify(subMessage));
      console.log(`Session ${sessionId} connected and subscribed`);
      break;
    }

    case 'data_stream': {
      const streamMessage = message as CloudDataStreamMessage;
      switch (streamMessage.streamType) {
        case 'phone_notification':
          console.log(`[Session ${sessionId}] Received phone notification:`, JSON.stringify(streamMessage.data, null, 2));
          queueNotification(sessionInfo, streamMessage.data);
          break;

        // add more streams here if needed
        default:
          console.log(`[Session ${sessionId}] Unknown data stream: ${streamMessage.streamType}`);
      }
      break;
    }

    default:
      console.log(`[Session ${sessionId}] Unhandled message type: ${message.type}`);
  }
}

/**
 * Checks the notification against the blacklist and queues it if allowed.
 * If no notification is currently being displayed, starts the display process.
 */
function queueNotification(sessionData: SessionData, notif: PhoneNotification) {
  console.log(`Queueing notification: ${notif}`);
  for (const blacklisted of notificationAppBlackList) {
    if (notif.app.toLowerCase().includes(blacklisted)) {
      console.log(`Notification from ${notif.app} is blacklisted.`);
      return;
    }
  }
  // Add the notification to the session's queue.
  sessionData.notificationQueue.push(notif);
  if (!sessionData.isDisplayingNotification) {
    displayNextNotification(sessionData);
  }
}

/**
 * Displays the next notification in the queue.
 * Sends a display event message over the WebSocket.
 * Then schedules the next notification after a fixed duration.
 */
function displayNextNotification(sessionData: SessionData) {
  if (sessionData.notificationQueue.length === 0) {
    sessionData.isDisplayingNotification = false;
    // Optionally, send a command to clear the display.
    return;
  }

  sessionData.isDisplayingNotification = true;
  const notification = sessionData.notificationQueue.shift() as PhoneNotification;
  const notificationString = constructNotificationString(notification);

  // Build the display event message.
  const displayEvent: DisplayRequest = {
    type: 'display_event',
    view: 'main',
    packageName: PACKAGE_NAME,
    sessionId: sessionData.sessionId,
    layout: {
      layoutType: 'text_wall',
      text: notificationString,
    },
    durationMs: NOTIFICATION_DISPLAY_DURATION,
    timestamp: new Date(),
  };

  // console.log(`[Session ${sessionData.sessionId}]: Displaying notification: ${notificationString}`);
  sessionData.ws.send(JSON.stringify(displayEvent));

  // Schedule the next notification display.
  sessionData.timeoutId = setTimeout(() => {
    displayNextNotification(sessionData);
  }, NOTIFICATION_DISPLAY_DURATION);
}

/**
 * Constructs a single-line notification string from the notification details.
 */
function constructNotificationString(notification: PhoneNotification): string {
  const appName = notification.app;
  const title = notification.title;
  // Replace newlines with periods.
  let text = notification.content.replace(/\n/g, '. ');
  const maxLength = 125;
  const prefix = title && title.trim().length > 0 ? `${appName} - ${title}: ` : `${appName}: `;
  let combinedString = prefix + text;

  if (combinedString.length > maxLength) {
    const lengthAvailableForText = maxLength - prefix.length - 4;
    if (lengthAvailableForText > 0 && text.length > lengthAvailableForText) {
      text = text.substring(0, lengthAvailableForText) + '...';
    }
    combinedString = prefix + text;
  }

  combinedString = wrapText(combinedString, 35);

  return combinedString;
}

// (Optional) Serve static files for UI assets.
app.use(express.static(path.join(__dirname, './public')));

// Health-check endpoint.
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', app: PACKAGE_NAME });
});

// Start the Express server.
app.listen(PORT, () => {
  console.log(`${PACKAGE_NAME} server running at http://localhost:${PORT}`);
});
