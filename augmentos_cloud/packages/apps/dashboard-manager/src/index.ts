import express from 'express';
import WebSocket from 'ws';
import path from 'path';
import { v4 as uuidv4 } from 'uuid'; // if you need unique IDs
import {
  TpaConnectionInitMessage,
  TpaDisplayEventMessage,
  TpaSubscriptionUpdateMessage,
  CloudDataStreamMessage,
  DashboardDisplayEventMessage,
  DashboardCard,
} from '@augmentos/types';

import { NewsAgent } from '../../../agents/NewsAgent';  // lowercase 'n'
import { WeatherModule } from './dashboard-modules/WeatherModule';
// e.g. { languageLearning: LanguageLearningAgent, news: NewsAgent, ... }

const app = express();
const PORT = 7012; // your Dashboard Manager port

const PACKAGE_NAME = 'org.mentra.dashboard';
const API_KEY = 'test_key'; // In production, store securely
const LOCATION = 'New York'; // Hardcoded for now

// For demonstration, we'll keep session-based info in-memory.
// In real usage, you might store persistent data in a DB.
interface SessionInfo {
  userId: string;
  ws: WebSocket;
  // track last agent calls
  lastNewsUpdate?: number;
  // cache for transcription data (could be an array to accumulate multiple transcriptions)
  transcriptionCache?: any[];
  // embed the dashboard card into session info
  dashboard: DashboardCard;
  [key: string]: any;
}

const activeSessions = new Map<string, SessionInfo>();

/**
 * Creates the dashboard layout from the provided card.
 */
function createDashboardLayout(card: DashboardCard) {
  return {
    layoutType: card.layoutType,
    leftText: card.leftText,
    rightText: card.rightText,
  };
}

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
    const ws = new WebSocket('ws://localhost:7002/tpa-ws');

    // Create a new dashboard card
    const dashboardCard: DashboardCard = {
      layoutType: 'dashboard_card',
      leftText: '02/12/2025 12:00 100%',
      rightText: 'Meeting with John',
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
    ws.on('open', () => {
      console.log(`[Session ${sessionId}] Connected to augmentos-cloud`);

      const initMessage: TpaConnectionInitMessage = {
        type: 'tpa_connection_init',
        sessionId,
        packageName: PACKAGE_NAME,
        apiKey: API_KEY,
      };
      ws.send(JSON.stringify(initMessage));

      const dashboardLayout = createDashboardLayout(dashboardCard);

      const displayEvent: DashboardDisplayEventMessage = {
        type: 'dashboard_display_event',
        packageName: PACKAGE_NAME,
        sessionId,
        layout: dashboardLayout,
        durationMs: 4000,
      };

      ws.send(JSON.stringify(displayEvent));
    });

    // 3) On message, handle incoming data
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(sessionId, message);
      } catch (err) {
        console.error(`[Session ${sessionId}] Error parsing message:`, err);
      }
    });

    // 4) On close, clean up session
    ws.on('close', () => {
      console.log(`[Session ${sessionId}] Disconnected`);
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
function handleMessage(sessionId: string, message: any) {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo) {
    console.warn(`Session ${sessionId} not found in activeSessions`);
    return;
  }

  switch (message.type) {
    case 'data_stream': {
      const streamMessage = message as CloudDataStreamMessage;
      switch (streamMessage.streamType) {
        case 'transcription':
          // Instead of immediately calling the NewsAgent, cache the transcription.
          handleTranscription(sessionId, streamMessage.data);
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


function handleTranscription(sessionId: string, transcriptionData: any) {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo) return;
  if (!sessionInfo.transcriptionCache) {
    sessionInfo.transcriptionCache = [];
  }
  sessionInfo.transcriptionCache.push(transcriptionData);
  console.log(
    `[Session ${sessionId}] Cached transcription. Total cached items: ${sessionInfo.transcriptionCache.length}`
  );
}

// -----------------------------------
// 4) Handle Settings
// -----------------------------------
function handleSettings(sessionId: string, settingsData: any) {
  console.log(`[Session ${sessionId}] Received context_settings:`, settingsData);
  const sessionInfo = activeSessions.get(sessionId);
  if (sessionInfo) {
    sessionInfo['currentSettings'] = settingsData;
  }
}

// -----------------------------------
// 7) Internal Dashboard Updater
// -----------------------------------
setInterval(async () => {
  // Use the hardcoded location to get the current time and date.
  // Here we assume "New York" uses the "America/New_York" timezone.
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York", 
    hour: '2-digit',
    minute: '2-digit',
    month: 'numeric',
    day: 'numeric',
  });
  console.log(`\n[Dashboard Updater] Updating dashboard time to ${currentDateTime}\n`);

  // Iterate through each active session.
  for (const [sessionId, sessionInfo] of activeSessions.entries()) {
    // Create dashboard card data
    const dashboardData = {
      layoutType: 'dashboard_card' as const,
      leftText: '',
      rightText: ''
    };

    // Update time and date
    dashboardData.leftText = `${currentDateTime} 100%\n`;

    // Update news
    const newsAgent = new NewsAgent();
    const context = { transcriptions: sessionInfo.transcriptionCache };
    const newsResult = await newsAgent.handleContext(context);
    sessionInfo.transcriptionCache = [];

    if (newsResult && newsResult.news_summaries && newsResult.news_summaries.length > 0) {
      dashboardData.rightText += newsResult.news_summaries.join(', ');
    }

    // Add Weather Forecast Update
    const newYorkLatitude = 40.7128;
    const newYorkLongitude = -74.0060;
    const weatherAgent = new WeatherModule();
    const weather = await weatherAgent.fetchWeatherForecast(newYorkLatitude, newYorkLongitude);
    if (weather) {
      dashboardData.leftText += `Weather: ${weather.condition}, ${weather.avg_temp_f}°F`;
    } else {
      dashboardData.leftText += 'Weather: N/A';
    }

    // Create display event with the dashboard card layout
    const displayEvent: DashboardDisplayEventMessage = {
      type: 'dashboard_display_event',
      packageName: PACKAGE_NAME,
      sessionId,
      layout: dashboardData,
      durationMs: 10000,
    };

    console.log(`[Session ${sessionId}] Sending updated dashboard:`, displayEvent);
    sessionInfo.ws.send(JSON.stringify(displayEvent));
  }
}, 4000);

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
  console.log(`Dashboard Manager TPA running at http://localhost:${PORT}`);
});
