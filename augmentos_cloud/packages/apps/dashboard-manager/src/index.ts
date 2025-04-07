import express from 'express';
import WebSocket from 'ws';
import path from 'path';
import { v4 as uuidv4 } from 'uuid'; // if you need unique IDs
import {
  TpaConnectionInit,
  TpaSubscriptionUpdate,
  DataStream,
  DisplayRequest,
  DoubleTextWall,
  LayoutType,
  TpaType,
  TpaToCloudMessageType,
  ViewType,
  StreamType,
  CalendarEvent,
} from '@augmentos/sdk';
import tzlookup from 'tz-lookup';
import { NewsAgent } from '@augmentos/agents';
import { NotificationFilterAgent } from '@augmentos/agents'; // <-- added import
import { WeatherModule } from './dashboard-modules/WeatherModule';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80; // Default http port.
const CLOUD_HOST_NAME = process.env.CLOUD_LOCAL_HOST_NAME || "cloud"; 
const PACKAGE_NAME = "com.augmentos.dashboard";
const API_KEY = 'test_key'; // In production, store securely

console.log(`\n\n[Dashboard Manager] Starting TPA on port ${PORT}...`);
console.log(`[Dashboard Manager] Connecting to cloud at ${CLOUD_HOST_NAME}...`);

// For demonstration, we'll keep session-based info in-memory.
// In real usage, you might store persistent data in a DB.
interface SessionInfo {
  userId: string;
  ws: WebSocket;
  // track last agent calls
  lastNewsUpdate?: number;
  // cache for phone notifications as raw objects
  phoneNotificationCache?: { title: string; content: string; timestamp: number; uuid: string }[];
  // store the ranked notifications from the NotificationFilterAgent
  phoneNotificationRanking?: any[];
  transcriptionCache: any[];
  // embed the dashboard card into session info
  dashboard: DoubleTextWall;
  // cache latest location update, e.g., { latitude, longitude, timezone }
  latestLocation?: { latitude: number; longitude: number; timezone?: string };
  // weather cache per user
  weatherCache?: { timestamp: number; data: string };
  // NEW: Cache for calendar events.
  calendarEvent?: CalendarEvent;
  // NEW: Cache for news summaries and an index pointer.
  newsCache?: string[];
  newsIndex?: number;
  // NEW: Cached battery level from glasses
  batteryLevel?: number;
  [key: string]: any;
}

const activeSessions = new Map<string, SessionInfo>();

const notificationAppBlackList = ['youtube', 'augment', 'maps'];

// Parse JSON bodies
app.use(express.json());

// -----------------------------------
// 1) Webhook Endpoint
// -----------------------------------
app.post('/webhook', async (req: express.Request, res: express.Response) => {
  try {
    const { sessionId, userId } = req.body;
    console.log(`\n[Webhook] Session start for user ${userId}, session ${sessionId}\n`);

    // 1) Create a new WebSocket connection to the cloud
    const ws = new WebSocket(`ws://${CLOUD_HOST_NAME}/tpa-ws`);

    // Create a new dashboard card
    const dashboardCard: DoubleTextWall = {
      // layoutType: 'double_text_wall',
      layoutType: LayoutType.DOUBLE_TEXT_WALL,
      topText: 'Loading contextual dashboard...',
      bottomText: '',
    };

    // Store session info, including the dashboard card.
    activeSessions.set(sessionId, {
      userId,
      ws,
      lastNewsUpdate: Date.now(), // start time for e.g. news
      transcriptionCache: [],
      dashboard: dashboardCard,
    });

    // 2) On open, send tpa_connection_init and initial dashboard display event
    ws.on('open', async () => {
      console.log(`[Session ${sessionId}] Connected to augmentos-cloud`);

      const initMessage: TpaConnectionInit = {
        // type: 'tpa_connection_init',
        type: TpaToCloudMessageType.CONNECTION_INIT,
        sessionId: sessionId,
        packageName: PACKAGE_NAME,
        apiKey: API_KEY,
      };
      ws.send(JSON.stringify(initMessage));

      const displayRequest: DisplayRequest = {
        // type: 'display_event',
        // view: 'dashboard',
        type: TpaToCloudMessageType.DISPLAY_REQUEST,
        view: ViewType.DASHBOARD,
        packageName: PACKAGE_NAME,
        sessionId: sessionId,
        layout: dashboardCard,
        durationMs: 4000,
        timestamp: new Date(),
      };
      ws.send(JSON.stringify(displayRequest));

      // Fetch news once the connection is open.
      const newsAgent = new NewsAgent();
      // const newsResult = await newsAgent.handleContext({});
      const newsResult = {
        news_summaries: [
          "News summary 1",
          "News summary 2",
          "News summary 3"
        ]
      };
      const sessionInfo = activeSessions.get(sessionId);
      if (sessionInfo && newsResult && newsResult.news_summaries && newsResult.news_summaries.length > 0) {
        sessionInfo.newsCache = newsResult.news_summaries;
        sessionInfo.newsIndex = 0;
        // Update dashboard so that news is visible.
        updateDashboard(sessionId);
      }
    });

    // 3) On message, handle incoming data
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(sessionId, ws, message);
      } catch (err) {
        console.error(`[Session ${sessionId}] Error parsing message:`, err);
      }
    });

    // 4) On close, clean up session
    ws.on('close', (message) => {

      console.log(`\n\n[Session ${sessionId}] 🛑TPA Disconnected`, message, "\n");
      activeSessions.delete(sessionId);
    });

    // Respond to the cloud
    res.status(200).json({ status: 'connecting' });
  } catch (err) {
    console.error('Error handling /webhook:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// -----------------------------------
// 2) Handle Incoming Messages
// -----------------------------------
function handleMessage(sessionId: string, ws: WebSocket, message: any) {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo) {
    console.warn(`Session ${sessionId} not found in activeSessions`);
    return;
  }

  // console.log("MESSAGE TYPE: " + message);

  switch (message.type) {
    case 'tpa_connection_ack': {
      // Connection acknowledged, subscribe to transcription
      const subMessage: TpaSubscriptionUpdate = {
        // type: 'subscription_update',
        type: TpaToCloudMessageType.SUBSCRIPTION_UPDATE,
        packageName: PACKAGE_NAME,
        sessionId: sessionId,
        // subscriptions: ['phone_notification', 'location_update', 'head_position', 'glasses_battery_update']
        subscriptions: [StreamType.PHONE_NOTIFICATION, StreamType.LOCATION_UPDATE, StreamType.HEAD_POSITION, StreamType.GLASSES_BATTERY_UPDATE, StreamType.CALENDAR_EVENT]
      };
      ws.send(JSON.stringify(subMessage));
      console.log(`Session ${sessionId} connected and subscribed`);
      break;
    }

    case 'data_stream': {
      const streamMessage = message as DataStream;
      console.log(`[Session ${sessionId}] Received data stream:`, streamMessage);

      switch (streamMessage.streamType) {
        // case 'phone_notification':
        case StreamType.PHONE_NOTIFICATION:
          // Instead of immediately handling the notification,
          // cache it and send the entire list to the NotificationFilterAgent.
          handlePhoneNotification(sessionId, streamMessage.data);
          break;

        case StreamType.CALENDAR_EVENT:
          handleCalendarEvent(sessionId, streamMessage.data);
          break;

        // case 'location_update':
        case StreamType.LOCATION_UPDATE:
          handleLocationUpdate(sessionId, streamMessage.data);
          break;
        
        // case 'head_position':
        case StreamType.HEAD_POSITION:
          handleHeadPosition(sessionId, streamMessage.data);
          break;

        // case 'glasses_battery_update':
        case StreamType.GLASSES_BATTERY_UPDATE:
          // NEW: Update battery only if the level has changed.
          handleGlassesBatteryUpdate(sessionId, streamMessage.data);
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

function handleLocationUpdate(sessionId: string, locationData: any) {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo) return;

  // Extract lat, lng, and timestamp from the locationData.
  const { lat, lng, timestamp } = locationData;

  // Validate that lat and lng are numbers.
  if (typeof lat !== "number" || typeof lng !== "number") {
    console.error(`[Session ${sessionId}] Invalid location data:`, locationData);
    return;
  }

  // Try to determine the timezone for the coordinates
  let timezone: string | undefined;
  try {
    timezone = tzlookup(lat, lng);
  } catch (error) {
    console.error(`[Session ${sessionId}] Error looking up timezone for lat=${lat}, lng=${lng}:`, error);
    // No default timezone - just keep the previous one if it exists
  }

  // Cache the location update in the session
  // If we couldn't determine a timezone, preserve the previous one if it exists
  sessionInfo.latestLocation = { 
    latitude: lat, 
    longitude: lng,
    // Only update timezone if we found one, otherwise keep previous
    timezone: timezone || (sessionInfo.latestLocation?.timezone)
  };

  console.log(
    `[Session ${sessionId}] Cached location update: lat=${lat}, lng=${lng}, timezone=${timezone || 'not determined'}`
  );

  // Call updateDashboard if this was the first location update
  updateDashboard(sessionId);
}

function handleCalendarEvent(sessionId: string, calendarEvent: any) {
  console.log(`[Session ${sessionId}] Received calendar event:`, calendarEvent);
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo) return;

  // Add the calendar event to the session's cache.
  sessionInfo.calendarEvent = calendarEvent;
  
  updateDashboard(sessionId);
}

function handleHeadPosition(sessionId: string, headPositionData: any) {
  const sessionInfo = activeSessions.get(sessionId);

  // console.log(sessionInfo);

  if (!sessionInfo) return;
  // console.log(`[Session ${sessionId}] Received head position:`, headPositionData);

  // When head is up, update the news index.
  if (headPositionData.position === 'up') {
    if (sessionInfo.newsCache && sessionInfo.newsCache.length > 0) {
      // Determine the next index.
      const currentIndex = sessionInfo.newsIndex || 0;
      const nextIndex = currentIndex + 1;
      
      if (nextIndex >= sessionInfo.newsCache.length) {
        // We've gone through the entire list.
        // Fetch new news and reset index.
        // const newsAgent = new NewsAgent();
        // newsAgent.handleContext({}).then(newsResult => {
        //   if (newsResult && newsResult.news_summaries && newsResult.news_summaries.length > 0) {
        //     sessionInfo.newsCache = newsResult.news_summaries;
        //     sessionInfo.newsIndex = 0;
        //   } else {
        //     // If no new news are fetched, wrap around.
        //     sessionInfo.newsIndex = 0;
        //   }
        // }).catch(err => {
        //   console.error(`[Session ${sessionId}] Error fetching new news:`, err);
        //   // Fallback: wrap around if error occurs.
        //   sessionInfo.newsIndex = 0;
        // });
        sessionInfo.newsCache = ["News summary 1", "News summary 2", "News summary 3"];
      } else {
        // Otherwise, simply update the index.
        sessionInfo.newsIndex = nextIndex;
      }
    }

    updateDashboard(sessionId);
  }
}

// NEW: Handle glasses battery update only if battery level changes.
function handleGlassesBatteryUpdate(sessionId: string, glassesBatteryData: any) {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo) return;

  // Assume glassesBatteryData.level holds the new battery level.
  const newLevel = glassesBatteryData.level;
  if (typeof newLevel !== 'number') {
    console.error(`[Session ${sessionId}] Invalid battery data:`, glassesBatteryData);
    return;
  }

  // Only update if the new battery level is different from the cached one.
  if (sessionInfo.batteryLevel === newLevel) {
    // No change; do not update dashboard.
    return;
  }

  // Update the cached battery level.
  sessionInfo.batteryLevel = newLevel;
  console.log(`[Session ${sessionId}] Battery level updated to ${newLevel}`);

  // Update the dashboard to reflect the new battery level.
  updateDashboard(sessionId);
}

function handleSettings(sessionId: string, settingsData: any) {
  // console.log(`[Session ${sessionId}] Received context_settings:`, settingsData);
  const sessionInfo = activeSessions.get(sessionId);
  if (sessionInfo) {
    sessionInfo['currentSettings'] = settingsData;
  }
}

// -----------------------------------
// 7) Internal Dashboard Updater
// -----------------------------------
async function updateDashboard(sessionId?: string) {
  // Skip updates if no session ID is provided
  if (!sessionId) {
    console.log(`[Dashboard Manager] Called updateDashboard without a session ID`);
    return;
  }

  console.log(`[Session ${sessionId}] Updating dashboard...`);

  // Utility function to wrap text to a maximum line length without breaking words.
  function wrapText(text: string, maxLength = 25): string {
    return text
      .split('\n')
      .map(line => {
        const words = line.split(' ');
        let currentLine = '';
        const wrappedLines: string[] = [];

        words.forEach(word => {
          if ((currentLine.length + (currentLine ? 1 : 0) + word.length) <= maxLength) {
            currentLine += (currentLine ? ' ' : '') + word;
          } else {
            if (currentLine) {
              wrappedLines.push(currentLine);
            }
            currentLine = word;

            // If a single word is too long, hardcut it.
            while (currentLine.length > maxLength) {
              wrappedLines.push(currentLine.slice(0, maxLength));
              currentLine = currentLine.slice(maxLength);
            }
          }
        });

        if (currentLine) {
          wrappedLines.push(currentLine.trim());
        }

        return wrappedLines.join('\n');
      })
      .join('\n');
  }

  // Define left modules in group 1 (same-line modules).
  const leftModulesGroup1 = [
    {
      name: "time",
      async run(sessionInfo: SessionInfo) {
        // Check if we have a valid timezone from location
        if (!sessionInfo.latestLocation?.timezone) {
          return "◌ $DATE$, $TIME12$"
        }

        const timezone = sessionInfo.latestLocation.timezone;
        console.log(`[Session ${sessionInfo.userId}] Using timezone: ${timezone}`);

        try {
          const options = {
            timeZone: timezone,
            hour: "2-digit" as const,
            minute: "2-digit" as const,
            month: "numeric" as const,
            day: "numeric" as const,
            hour12: true
          };
          let formatted = new Date().toLocaleString("en-US", options);
          formatted = formatted.replace(/ [AP]M/, "");
          return `◌ ${formatted}`;
        } catch (error) {
          console.error(`[Session ${sessionInfo.userId}] Error formatting time with timezone ${timezone}:`, error);
          return "◌ $DATE$, $TIME12$"
        }
      }
    },
    { 
      name: "status", 
      async run(sessionInfo: SessionInfo) {
        // Only show the cached battery level if it exists; otherwise, show "-%".
        return (typeof sessionInfo.batteryLevel === 'number')
          ? `${sessionInfo.batteryLevel}%`
          : "$GBATT$";
      } 
    },
  ];

  // Define right modules.
  const rightModules = [
    {
      name: "calendar",
      async run(context: any) {
        const session: SessionInfo = context.session;
        if (!session.calendarEvent || !session.latestLocation) return '';
        
        const event = session.calendarEvent;
        // Get timezone from the session's location data, fall back to system timezone
        const currTimezone = session.latestLocation.timezone;
        // Create dates with the user's timezone
        const eventDate = new Date(new Date(event.dtStart).toLocaleString("en-US", { timeZone: currTimezone }));
        const today = new Date(new Date().toLocaleString("en-US", { timeZone: currTimezone }));
        const tomorrow = new Date(new Date().toLocaleString("en-US", { timeZone: currTimezone }));
        tomorrow.setDate(today.getDate() + 1);
        
        // Format the time portion
        const timeOptions = { hour: "2-digit" as const, minute: "2-digit" as const, hour12: true };
        const formattedTime = eventDate.toLocaleTimeString('en-US', { ...timeOptions }).replace(" ", "");

        // console.log(`[Session ${session.userId}] Event date: ${eventDate}`);
        // console.log(`[Session ${session.userId}] Today: ${today}`);
        // console.log(`[Session ${session.userId}] Tomorrow: ${tomorrow}`);
        // console.log(`[Session ${session.userId}] Formatted time: ${formattedTime}`);
        
        // Check if event is today or tomorrow
        if (eventDate.toDateString() === today.toDateString()) {
          const title = event.title.length > 10 ? event.title.substring(0, 10).trim() + '...' : event.title;
          return `${title} @ ${formattedTime}`;
        } else if (eventDate.toDateString() === tomorrow.toDateString()) {
          const title = event.title.length > 6 ? event.title.substring(0, 6).trim() + '...' : event.title;
          return `${title} tmr @ ${formattedTime}`;
        } else {
          return "";
        }
      }
    },
    // {
    //   name: "news",
    //   async run(context: any) {
    //     // Instead of fetching news here, use the cached news from the session.
    //     const session: SessionInfo = context.session;
    //     console.log(session.newsCache);
    //     console.log(session.newsIndex);
    //     if (session.newsCache && session.newsCache.length > 0 && typeof session.newsIndex === 'number') {
    //       return session.newsCache[session.newsIndex] || '-';
    //     }
    //     return '-';
    //   },
    // },
    {
      name: "weather",
      async run(context: any) {
        // Check that we have location data.
        if (!context.latestLocation) {
          return '';
        }
        const { latitude, longitude } = context.latestLocation;
        // Use per-session weather cache.
        const session: SessionInfo = context.session;
        if (
          session.weatherCache &&
          (Date.now() - session.weatherCache.timestamp) < 1 * 60 * 60 * 1000 // 1 hour
        ) {
          console.log(`[Session ${session.userId}][Weather] Returning cached weather data.`);
          return session.weatherCache.data;
        }
        // Otherwise, fetch new weather data.
        const weatherAgent = new WeatherModule();
        const weather = await weatherAgent.fetchWeatherForecast(latitude, longitude);
        const result = weather ? `${weather.condition}, ${weather.temp_f}°F` : '-';
        // Cache the result on the session.
        session.weatherCache = { timestamp: Date.now(), data: result };
        return result;
      },
    },
  ];

  // Helper: update a single session dashboard.
  async function updateSessionDashboard(sessionId: string, sessionInfo: SessionInfo) {
    // Prepare a context for modules that need it.
    // Include the session itself so that per-user caches (like weatherCache and newsCache) can be accessed.
    const context = {
      transcriptions: sessionInfo.transcriptionCache,
      latestLocation: sessionInfo.latestLocation,
      session: sessionInfo,
    };
    // Clear the transcription cache.
    sessionInfo.transcriptionCache = [];

    // Run left group 1 modules concurrently.
    const leftGroup1Promises = leftModulesGroup1.map(module => module.run(sessionInfo));
    const leftGroup1Results = await Promise.all(leftGroup1Promises);
    const leftGroup1Text = leftGroup1Results.filter(text => text.trim()).join(', ');

    // Left group 2: notifications.
    const leftModulesGroup2 = [
      {
        name: "notifications",
        async run() {
          // Use the ranked notifications from the NotificationFilterAgent if available.
          const rankedNotifications = sessionInfo.phoneNotificationRanking || [];
          // The NotificationFilterAgent returns notifications sorted by importance (rank=1 first).
          const topTwoNotifications = rankedNotifications.slice(0, 2);
          console.log(`[Session ${sessionId}] Ranked Notifications:`, topTwoNotifications);
          return topTwoNotifications
            .map(notification => wrapText(notification.summary, 25))
            .join('\n');
        }
      }
    ];
    const leftGroup2Promises = leftModulesGroup2.map(module => module.run());
    const leftGroup2Results = await Promise.all(leftGroup2Promises);
    const leftGroup2Text = leftGroup2Results.filter(text => text.trim()).join('\n');

    // Combine left texts.
    let leftText = leftGroup1Text;
    if (leftGroup2Text) {
      leftText += `\n${leftGroup2Text}`;
    }
    leftText = wrapText(leftText, 40);

    // Run right modules concurrently.
    const rightPromises = rightModules.map(module => module.run(context));
    const rightResults = await Promise.all(rightPromises);
    let rightText = rightResults.filter(text => text.trim() !== '').join('\n');
    rightText = wrapText(rightText, 30);

    // Create display event.
    const displayRequest: DisplayRequest = {
      // type: 'display_event',
      // view: 'dashboard',
      type: TpaToCloudMessageType.DISPLAY_REQUEST,
      view: ViewType.DASHBOARD,
      packageName: PACKAGE_NAME,
      sessionId: sessionId,
      layout: {
        // layoutType: 'double_text_wall',
        layoutType: LayoutType.DOUBLE_TEXT_WALL,
        topText: leftText,
        bottomText: rightText,
      },
      durationMs: 4000,
      timestamp: new Date(),
    };

    // console.log(`[Session ${sessionId}] Sending updated dashboard:`, displayRequest);
    sessionInfo.ws.send(JSON.stringify(displayRequest));
  }

  // If a sessionId is provided, update that session only.
  if (sessionId) {
    const sessionInfo = activeSessions.get(sessionId);
    if (sessionInfo) {
      await updateSessionDashboard(sessionId, sessionInfo);
    } else {
      console.warn(`Session ${sessionId} not found`);
    }
  } else {
    // Otherwise, update dashboard for all sessions.
    for (const [sessId, sessionInfo] of activeSessions.entries()) {
      await updateSessionDashboard(sessId, sessionInfo);
    }
  }
}

function handlePhoneNotification(sessionId: string, notificationData: any) {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo) return;

  // Initialize the notification cache if needed.
  if (!sessionInfo.phoneNotificationCache) {
    sessionInfo.phoneNotificationCache = [];
  }

  // Check if the app name is blacklisted.
  for (const blacklisted of notificationAppBlackList) {
    if (notificationData.app.toLowerCase().includes(blacklisted)) {
      console.log(`Notification from ${notificationData.app} is blacklisted.`);
      return;
    }
  }

  // Prepare the new notification.
  const newNotification = {
    title: notificationData.title || 'No Title',
    content: notificationData.content || '',
    timestamp: Date.now(),
    uuid: uuidv4(),  // Generate a unique id if not provided.
  };

  // Prevent duplicate notifications: don't add if the new notification's title and content
  // are identical to the most recent notification in the cache.
  const cache = sessionInfo.phoneNotificationCache;
  if (cache.length > 0) {
    const lastNotification = cache[cache.length - 1];
    if (lastNotification.title === newNotification.title &&
        lastNotification.content === newNotification.content) {
      console.log(`[Session ${sessionId}] Duplicate notification detected. Not adding to cache.`);
      return;
    }
  }

  // Add the new notification to the cache.
  sessionInfo.phoneNotificationCache.push(newNotification);
  console.log(`[Session ${sessionId}] Received phone notification:`, notificationData);

  // Instantiate the NotificationFilterAgent.
  const notificationFilterAgent = new NotificationFilterAgent();

  // Pass the entire list of notifications to the filter agent.
  notificationFilterAgent.handleContext({ notifications: sessionInfo.phoneNotificationCache })
    .then((filteredNotifications: any) => {
      // console.log(`[Session ${sessionId}] Filtered Notifications:`, filteredNotifications);
      // Save the ranked notifications for later use in the dashboard.
      sessionInfo.phoneNotificationRanking = filteredNotifications;
      // Update the dashboard after the notifications have been filtered.
      // console.log(`[Session ${sessionId}] Updating dashboard after notification filtering.` + filteredNotifications);
      updateDashboard(sessionId);
    })
    .catch(err => {
      console.error(`[Session ${sessionId}] Notification filtering failed:`, err);
      // Fallback: update dashboard with the raw notifications.
      updateDashboard(sessionId);
    });
}

// -----------------------------------
// 6) Health Check & Static
// -----------------------------------
app.get('/health', (req: express.Request, res: express.Response) => {
  res.json({ status: 'healthy', app: PACKAGE_NAME });
});

app.use(express.static(path.join(__dirname, './public')));

// -----------------------------------
// Listen
// -----------------------------------
app.listen(PORT, () => {
  console.log(`Dashboard Manager TPA running`);
});

// -----------------------------------
// Schedule Dashboard Updates
// -----------------------------------
setTimeout(() => {
  // Run updateDashboard 5 seconds after the file runs.
  updateDashboard();
  // Then, schedule it to run every 5 seconds.
  setInterval(() => updateDashboard(), 60000);
}, 5000);
