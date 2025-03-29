import path from 'path';
import {
  PhoneNotification,
  TpaSession,
  TpaServer,
} from '@augmentos/sdk'; // shared types for cloud TPA messages
import { wrapText } from '@augmentos/utils';
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80; // Default http port.
// In Docker environment, use the service name as hostname
// Use Docker service name "cloud" inside containers
// Important: The Docker-based URL must be used because the TPA server and cloud are in Docker containers
const CLOUD_HOST_NAME = process.env.CLOUD_HOST_NAME || "cloud:80";
const PACKAGE_NAME = "com.augmentos.notify";
const API_KEY = 'test_key'; // In production, this would be securely stored

// Duration (in ms) that each notification is displayed
const NOTIFICATION_DISPLAY_DURATION = 10000; // 10 seconds

// Blacklisted app names: notifications from these apps will be ignored
const notificationAppBlackList = ['youtube', 'augment', 'maps'];

/**
 * Represents a notification with an expiration timestamp.
 */
interface QueuedNotification {
  notification: PhoneNotification;
  expiration: number;
}

/**
 * Stores notification queue and display state for each session
 */
class NotificationManager {
  private notificationQueue: QueuedNotification[] = [];
  private isDisplayingNotification: boolean = false;
  private timeoutId?: NodeJS.Timeout;
  private session: TpaSession;
  private userId: string;

  constructor(session: TpaSession, userId: string) {
    this.session = session;
    this.userId = userId;
  }

  /**
   * Checks the notification against the blacklist and queues it if allowed.
   */
  queueNotification(notification: PhoneNotification): void {
    console.log(`Queueing notification from ${notification.app}`);
    
    // Check blacklist
    for (const blacklisted of notificationAppBlackList) {
      if (notification.app.toLowerCase().includes(blacklisted)) {
        console.log(`Notification from ${notification.app} is blacklisted.`);
        return;
      }
    }

    // Add to queue with expiration time
    const expiration = Date.now() + 4 * NOTIFICATION_DISPLAY_DURATION;
    this.notificationQueue.push({ notification, expiration });
    
    // Start displaying if not already active
    if (!this.isDisplayingNotification) {
      this.displayNextNotification();
    }
  }

  /**
   * Displays the next notification in the queue.
   */
  private displayNextNotification(): void {
    // Clear any existing timeout to prevent conflicts
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
    
    // If queue is empty, reset display state
    if (this.notificationQueue.length === 0) {
      this.isDisplayingNotification = false;
      return;
    }
    
    // Process and remove expired notifications from the start of the queue
    while (
      this.notificationQueue.length > 0 && 
      Date.now() > this.notificationQueue[0].expiration
    ) {
      const expired = this.notificationQueue.shift();
      console.log(
        `[User ${this.userId}]: Skipping expired notification from ${expired?.notification.app}`
      );
    }

    // If all notifications were expired and removed, reset state
    if (this.notificationQueue.length === 0) {
      this.isDisplayingNotification = false;
      return;
    }

    // Get the next valid notification and remove it from the queue
    const queuedNotification = this.notificationQueue.shift();
    if (!queuedNotification) return;
    
    // Mark that we're displaying a notification
    this.isDisplayingNotification = true;
    
    const notification = queuedNotification.notification;
    const notificationString = this.constructNotificationString(notification);

    // Display notification using the SDK's layout interface
    this.session.layouts.showTextWall(
      notificationString,
      { durationMs: NOTIFICATION_DISPLAY_DURATION }
    );

    // Schedule the next notification after this one finishes displaying
    this.timeoutId = setTimeout(() => {
      this.displayNextNotification();
    }, NOTIFICATION_DISPLAY_DURATION);
  }

  /**
   * Constructs a formatted notification string from the notification details.
   */
  private constructNotificationString(notification: PhoneNotification): string {
    const appName = notification.app;
    const title = notification.title;
    
    // Replace newlines with periods
    let text = notification.content
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, '. ')
      .replace(/(\.\s*)+/g, '. ');
      
    const maxLength = 125;
    const prefix =
      title && title.trim().length > 0 ? `${appName} - ${title}: ` : `${appName}: `;
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

  getQueuedNotifications(): QueuedNotification[] {
    return this.notificationQueue;
  }

  /**
   * Cleanup any resources when the session ends
   */
  cleanup(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }
}

class NotifyServer extends TpaServer {
  // Map to store notification managers for each session
  private notificationManagers = new Map<string, NotificationManager>();

  /**
   * Handles a new session connection
   */
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`Setting up notification service for session ${sessionId}, user ${userId}`);

    
    // Create notification manager for this session
    const notificationManager = new NotificationManager(session, userId);
    this.notificationManagers.set(sessionId, notificationManager);
    
    // Welcome message
    session.layouts.showReferenceCard(
      "Notify", 
      "Notification service connected", 
      { durationMs: 3000 }
    );

    // Subscribe to phone notifications
    // const cleanup = [
      // Handle phone notifications
    session.events.onPhoneNotifications((notification) => {
      console.log(
        `[Session ${sessionId}] Received phone notification:`,
        JSON.stringify(notification, null, 2)
      );

      console.log("@@@@@@@@@@@@@@@@@@@@")
      console.log(notification)

      // Check if this notification is already in the queue
      const existingNotifications = notificationManager.getQueuedNotifications();
      const isDuplicate = existingNotifications.some(existing => 
        existing.notification.title === notification.title && 
        existing.notification.content === notification.content &&
        existing.notification.app === notification.app
      );

      if (isDuplicate) {
        console.log(`[Session ${sessionId}] Duplicate notification detected, skipping`);
        return;
      }

      notificationManager.queueNotification(notification);
    })

    // Handle connection events
    session.events.onConnected((settings) => {
      console.log(`\n[User ${userId}] connected to augmentos-cloud\n`);
    })

    // Handle errors
    session.events.onError((error) => {
      console.error(`[User ${userId}] Error:`, error);
    })

      // // Cleanup function for when session ends
      // () => {
      //   const manager = this.notificationManagers.get(sessionId);
      //   if (manager) {
      //     manager.cleanup();
      //     this.notificationManagers.delete(sessionId);
      //   }
      // }
    // ];

    // // Register cleanup handlers
    // cleanup.forEach(handler => this.addCleanupHandler(handler));
  }
}

// Create and start the server
// Force the WebSocket URL to use our container service name, not the staging URL default
const wsUrl = `ws://${CLOUD_HOST_NAME}/tpa-ws`;
console.log(`🔌🔌🔌 Using WebSocket URL: ${wsUrl}`);

const server = new NotifyServer({
  packageName: PACKAGE_NAME,
  apiKey: API_KEY,
  port: PORT,
  augmentOSWebsocketUrl: wsUrl,
  webhookPath: '/webhook',
  publicDir: path.join(__dirname, './public')
});

server.start()
  .then(() => {
    console.log(`${PACKAGE_NAME} server running`);
  })
  .catch(error => {
    console.error('Failed to start server:', error);
  });
