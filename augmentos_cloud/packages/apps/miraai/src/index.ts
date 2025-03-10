// augmentos_cloud/packages/apps/agent-gatekeeper/src/index.ts
import express from 'express';
import WebSocket from 'ws';
import path from 'path';
import {
  TpaConnectionInit,
  TpaSubscriptionUpdate,
  DataStream,
  DisplayRequest,
  TpaToCloudMessageType,
  StreamType,
  ViewType,
  LayoutType,
} from '@augmentos/sdk';

import { systemApps } from '@augmentos/config';
import { MiraAgent } from '@augmentos/agents';
import { wrapText } from '@augmentos/utils';

// If needed, use node-fetch (if Node version < 18)
// import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80; // Default http port.
const CLOUD_URL = process.env.CLOUD_URL || "http://localhost:8002"; 
const PACKAGE_NAME = systemApps.mira.packageName;
const API_KEY = 'test_key'; // In production, secure this key

const explicitWakeWords = [
  "hey mira",
  "he mira",
  "hey mara",
  "he mara",
  "hey mirror",
  "he mirror",
  "hey miara",
  "he miara",
  "hey mia",
  "he mia",
  "hey mural",
  "he mural",
  "hey amira",
  "hey myra",
  "he myra",
  "hay mira",
  "hai mira",
  "hey-mira",
  "he-mira",
  "heymira",
  "heymara",
  "hey mirah",
  "he mirah",
  "hey meera",
  "he meera",
];

// Parse JSON bodies
app.use(express.json());

const miraAgent = new MiraAgent();

// Track active sessions and listening state
const activeSessions = new Map<string, WebSocket>();
// Track sessions that are in the process of capturing the wake-word and query
const activeListeningSessions = new Map<string, { startTime: number; firstTranscriptReceived: boolean }>();
const sessionTimers = new Map<string, NodeJS.Timeout>();
// New map to track if a session is currently processing a query
const sessionQuerying = new Map<string, boolean>();

app.post('/webhook', async (req, res) => {
  try {
    const { sessionId, userId, conversation_context } = req.body;
    console.log(`\n\n🗣️ Received session request for user ${userId}, session ${sessionId}\n\n`);

    const ws = new WebSocket(`ws://${CLOUD_URL}/tpa-ws`);
    
    ws.on('open', () => {
      console.log(`\n[Session ${sessionId}]\n connected to augmentos-cloud`);
      const initMessage: TpaConnectionInit = {
        // type: 'tpa_connection_init',
        type: TpaToCloudMessageType.CONNECTION_INIT,
        sessionId,
        packageName: PACKAGE_NAME,
        apiKey: API_KEY
      };
      console.log(`Sending init message: ${JSON.stringify(initMessage)}`);
      ws.send(JSON.stringify(initMessage));
    });

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        await handleMessage(sessionId, ws, message, conversation_context);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      console.log(`Session ${sessionId} disconnected`);
      activeSessions.delete(sessionId);
      if (sessionTimers.has(sessionId)) {
        clearTimeout(sessionTimers.get(sessionId));
        sessionTimers.delete(sessionId);
      }
      activeListeningSessions.delete(sessionId);
      sessionQuerying.delete(sessionId);
    });

    activeSessions.set(sessionId, ws);
    res.status(200).json({ status: 'connecting' });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use(express.static(path.join(__dirname, './public')));

async function debug() {
  // Debugging function if needed.
}

async function handleMessage(sessionId: string, ws: WebSocket, message: any, conversation_context?: string) {
  switch (message.type) {
    case 'tpa_connection_ack': {
      const subMessage: TpaSubscriptionUpdate = {
        // type: 'subscription_update',
        type: TpaToCloudMessageType.SUBSCRIPTION_UPDATE,
        packageName: PACKAGE_NAME,
        sessionId,
        // subscriptions: ['transcription']
        subscriptions: [StreamType.TRANSCRIPTION]
      };
      ws.send(JSON.stringify(subMessage));
      console.log(`Session ${sessionId} connected and subscribed`);
      break;
    }
    case 'data_stream': {
      const streamMessage = message as DataStream;
      // if (streamMessage.streamType === 'transcription') {
      if (streamMessage.streamType === StreamType.TRANSCRIPTION) {
        await handleTranscription(sessionId, ws, streamMessage.data);
      }
      break;
    }
    default:
      console.log('Unknown message type:', message.type);
  }
}

async function handleTranscription(sessionId: string, ws: WebSocket, transcriptionData: any) {
  // If a query is already being processed for this session, ignore additional transcriptions.
  if (sessionQuerying.get(sessionId)) {
    console.log(`[Session ${sessionId}]: Query already in progress. Ignoring transcription.`);
    return;
  }

  const text = transcriptionData.text;
  // Clean the text: lowercase and remove punctuation for easier matching.
  const cleanedText = text.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const hasWakeWord = explicitWakeWords.some(word => cleanedText.includes(word));
  
  if (!hasWakeWord) {
    console.log('No wake word detected');
    return;
  }

  console.log(`[Session ${sessionId}]: Wake word detected in text "${text}"`);

  let timerDuration: number;

  if (transcriptionData.isFinal) {
    // Check if the final transcript ends with a wake word.
    if (endsWithWakeWord(cleanedText)) {
      // If the final transcript ends with just a wake word (or with trailing punctuation),
      // wait 3 seconds to allow for additional query text.
      timerDuration = 3000;
      console.log(`[Session ${sessionId}]: Final transcript ends with a wake word; waiting 3 seconds.`);
    } else {
      // Final transcript with additional content should be processed immediately.
      timerDuration = 1500;
    }
  } else {
    // For non-final transcripts, use the established heuristic.
    if (!activeListeningSessions.has(sessionId)) {
      activeListeningSessions.set(sessionId, { startTime: Date.now(), firstTranscriptReceived: false });
      timerDuration = 3000;
    } else {
      timerDuration = 1500;
    }
  }

  // Send immediate display feedback (e.g., "Listening...")
  const listeningDisplayRequest: DisplayRequest = {
    // type: 'display_event',
    // view: 'main',
    type: TpaToCloudMessageType.DISPLAY_REQUEST,
    view: ViewType.MAIN,
    packageName: PACKAGE_NAME,
    sessionId,
    layout: { 
      // layoutType: 'text_wall', 
      layoutType: LayoutType.TEXT_WALL,
      text: "Listening..." 
    },
    durationMs: 10000,
    timestamp: new Date()
  };
  ws.send(JSON.stringify(listeningDisplayRequest));

  if (timerDuration === 0) {
    if (sessionTimers.has(sessionId)) {
      clearTimeout(sessionTimers.get(sessionId));
      sessionTimers.delete(sessionId);
    }
    console.log(`[Session ${sessionId}]: Final transcript with query content received; processing immediately.`);
    await processTranscripts(sessionId, ws);
    return;
  }

  if (sessionTimers.has(sessionId)) {
    clearTimeout(sessionTimers.get(sessionId));
  }
  const timer = setTimeout(async () => {
    await processTranscripts(sessionId, ws);
  }, timerDuration);
  sessionTimers.set(sessionId, timer);
}

async function processTranscripts(sessionId: string, ws: WebSocket) {
  // Ensure that if a query is already processing, we do not process a new one.
  if (sessionQuerying.get(sessionId)) {
    console.log(`[Session ${sessionId}]: Query is already processing.`);
    return;
  }
  // Set the session as currently processing a query.
  sessionQuerying.set(sessionId, true);

  const sessionData = activeListeningSessions.get(sessionId);
  const startTime = sessionData ? sessionData.startTime : Date.now();
  const durationSeconds = Math.ceil((Date.now() - startTime) / 1000);
  console.log(`Processing transcripts for session ${sessionId} after ${durationSeconds} seconds`);

  try {
    const backendUrl = `http://${CLOUD_URL}/api/transcripts/${sessionId}?duration=${durationSeconds}`;
    const response = await fetch(backendUrl);
    const data = await response.json();
    console.log(`Retrieved transcripts: ${JSON.stringify(data)}`);

    const rawCombinedText = data.segments.map((segment: any) => segment.text).join(' ');
    const combinedText = removeWakeWord(rawCombinedText);

    console.log("Combined text:", combinedText);

    if (combinedText.trim().length === 0) {
      console.log("No query provided");
      const noQueryDisplayRequest: DisplayRequest = {
        // type: 'display_event',
        // view: 'main',
        type: TpaToCloudMessageType.DISPLAY_REQUEST,
        view: ViewType.MAIN,
        packageName: PACKAGE_NAME,
        sessionId,
        layout: { 
          // layoutType: 'text_wall', 
          layoutType: LayoutType.TEXT_WALL,
          text: wrapText("No query provided", 30) 
        },
        durationMs: 5000,
        timestamp: new Date()
      };
      ws.send(JSON.stringify(noQueryDisplayRequest));
      return;
    }

    const displayProcessingQueryRequest: DisplayRequest = {
      // type: 'display_event',
      // view: 'main',
      type: TpaToCloudMessageType.DISPLAY_REQUEST,
      view: ViewType.MAIN,
      packageName: PACKAGE_NAME,
      sessionId,
      layout: { 
        // layoutType: 'text_wall', 
        layoutType: LayoutType.TEXT_WALL,
        text: wrapText("Processing query: " + combinedText, 30) 
      },
      durationMs: 8000,
      timestamp: new Date()
    };
    ws.send(JSON.stringify(displayProcessingQueryRequest));

    const inputData = { query: combinedText };
    const agentResponse = await miraAgent.handleContext(inputData);
    if (!agentResponse) {
      console.log("No insight found");
      return;
    } else {
      console.log("Insight found:", agentResponse);
    }

    const displayRequest: DisplayRequest = {
      // type: 'display_event',
      // view: 'main',
      type: TpaToCloudMessageType.DISPLAY_REQUEST,
      view: ViewType.MAIN,
      packageName: PACKAGE_NAME,
      sessionId,
      layout: { 
        // layoutType: 'text_wall', 
        layoutType: LayoutType.TEXT_WALL,
        text: wrapText(agentResponse, 30) 
      },
      durationMs: 8000,
      timestamp: new Date()
    };
    ws.send(JSON.stringify(displayRequest));
  } catch (error) {
    console.error("Error retrieving transcripts:", error);
  } finally {
    activeListeningSessions.delete(sessionId);
    if (sessionTimers.has(sessionId)) {
      clearTimeout(sessionTimers.get(sessionId));
      sessionTimers.delete(sessionId);
    }
    // Reset the querying state so the user can make new queries.
    setTimeout(() => {
      sessionQuerying.delete(sessionId);
    }, 1000);
  }
}

function removeWakeWord(text: string): string {
  // Escape each wake word for regex special characters
  const escapedWakeWords = explicitWakeWords.map(word =>
    word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  // Build patterns that allow for spaces, commas, or periods between the words
  const wakePatterns = escapedWakeWords.map(word =>
    word.split(' ').join('[\\s,\\.]*')
  );
  // Create a regex that removes everything from the start until (and including) a wake word
  const wakeRegex = new RegExp(`.*?(?:${wakePatterns.join('|')})[\\s,\\.]*`, 'i');
  return text.replace(wakeRegex, '').trim();
}

// Helper to check if a text ends with one of the wake words.
function endsWithWakeWord(text: string): boolean {
  return explicitWakeWords.some(word => text.trim().endsWith(word));
}

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', app: PACKAGE_NAME });
});

app.listen(PORT, () => {
  console.log(`MiraAI TPA server running`);
});
