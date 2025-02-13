import express from 'express';
import WebSocket from 'ws';
import path from 'path';
import {
  TpaConnectionInitMessage,
  TpaDisplayEventMessage,
  TpaSubscriptionUpdateMessage,
} from '@augmentos/types'; // shared types for cloud TPA messages

const app = express();
const PORT = 7011;
const PACKAGE_NAME = 'com.augmentos.shownotifications';
const API_KEY = 'test_key'; // In production, store securely

// Parse JSON bodies (for the webhook endpoint only)
app.use(express.json());

/**
 * Represents a notification similar to the legacy PhoneNotification.
 */
interface PhoneNotification {
  title: string;
  text: string;
  appName: string;
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
const NOTIFICATION_DISPLAY_DURATION = 8500;

// Blacklisted app names: notifications from these apps will be ignored.
const notificationAppBlackList = ['youtube', 'augment', 'maps'];

/**
 * Webhook endpoint to start a new session.
 * This creates a WebSocket connection to AugmentOS Cloud and initializes the session.
 */
app.post('/webhook', (req, res) => {
  try {
    const { sessionId, userId } = req.body;
    console.log(`\n\n🗣️ Received notification session request for user ${userId}, session ${sessionId}\n\n`);

    // Establish WebSocket connection to AugmentOS Cloud.
    const ws = new WebSocket('ws://localhost:7002/tpa-ws');

    ws.on('open', () => {
      console.log(`Session ${sessionId} connected to augmentos-cloud for notifications`);
      // Send connection init message.
      const initMessage: TpaConnectionInitMessage = {
        type: 'tpa_connection_init',
        sessionId,
        packageName: PACKAGE_NAME,
        apiKey: API_KEY,
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

    // Save the new session.
    const sessionData: SessionData = {
      sessionId,
      ws,
      notificationQueue: [],
      isDisplayingNotification: false,
    };
    activeSessions.set(sessionId, sessionData);
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
  switch (message.type) {
    case 'tpa_connection_ack': {
      // Once acknowledged, subscribe to notifications.
      const subMessage: TpaSubscriptionUpdateMessage = {
        type: 'subscription_update',
        packageName: PACKAGE_NAME,
        sessionId,
        subscriptions: ['notifications'],
      };
      ws.send(JSON.stringify(subMessage));
      console.log(`Session ${sessionId} connected and subscribed for notifications`);
      break;
    }
    // Optionally, you might still support transcription data, etc.
    case 'data_stream': {
      // Example: handle other data streams if needed.
      break;
    }
    // Handle incoming notification events.
    case 'notification_event': {
      const notif = message as PhoneNotification;
      console.log(`Received notification for session ${sessionId}: ${notif.title} – ${notif.text}`);
      const sessionData = activeSessions.get(sessionId);
      if (sessionData) {
        queueNotification(sessionData, notif);
      } else {
        console.error(`Session ${sessionId} not found for notification.`);
      }
      break;
    }
    default:
      console.log(`Unknown message type: ${message.type}`);
  }
}

/**
 * Checks the notification against the blacklist and queues it if allowed.
 * If no notification is currently being displayed, starts the display process.
 */
function queueNotification(sessionData: SessionData, notif: PhoneNotification) {
  for (const blacklisted of notificationAppBlackList) {
    if (notif.appName.toLowerCase().includes(blacklisted)) {
      console.log(`Notification from ${notif.appName} is blacklisted.`);
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
  const displayEvent: TpaDisplayEventMessage = {
    type: 'display_event',
    packageName: PACKAGE_NAME,
    sessionId: sessionData.sessionId,
    layout: {
      layoutType: 'reference_card',
      title: 'Notifications',
      text: notificationString,
    },
    durationMs: NOTIFICATION_DISPLAY_DURATION,
  };

  console.log(`[Session ${sessionData.sessionId}]: Displaying notification: ${notificationString}`);
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
  const appName = notification.appName;
  const title = notification.title;
  // Replace newlines with periods.
  let text = notification.text.replace(/\n/g, '. ');
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
  console.log(`Notifications TPA server running at http://localhost:${PORT}`);
  console.log(`Logo available at http://localhost:${PORT}/logo.png`);
});
