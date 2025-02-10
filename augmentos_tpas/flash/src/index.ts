import express from 'express';
import WebSocket from 'ws';
import path from 'path';
import {
  TpaConnectionInitMessage,
  CloudDataStreamMessage,
  TpaDisplayEventMessage,
  TpaSubscriptionUpdateMessage,
} from '../../../augmentos_cloud/src/types';
import dotenv from 'dotenv';
dotenv.config();

const app = express();

const PORT = process.env.PORT || 7011;
const PACKAGE_NAME = process.env.PACKAGE_NAME || 'org.mentra.flash';
const API_KEY = process.env.API_KEY || 'test_key';
const AUGMENTOS_CLOUD_TPA_WS = process.env.AUGMENTOS_CLOUD_TPA_WS || 'ws://localhost:7002/tpa-ws';

// Parse JSON bodies
app.use(express.json());

// Track active sessions
const activeSessions = new Map<string, WebSocket>();

// Handle webhook call from AugmentOS Cloud
app.post('/webhook', async (req, res) => {
  try {
    const { sessionId, userId, timestamp } = req.body;
    console.log(`\n\n🗣️🗣️🗣️Received session request for user ${userId}, session ${sessionId}\n\n`);

    // Start WebSocket connection to cloud
    const ws = new WebSocket(AUGMENTOS_CLOUD_TPA_WS);
    
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

    activeSessions.set(sessionId, ws);
    res.status(200).json({ status: 'connecting' });

  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve static files from the public directory - this is where the logo.png file is stored
app.use(express.static(path.join(__dirname, './public')));

function handleMessage(sessionId: string, ws: WebSocket, message: any) {
  switch (message.type) {
    case 'tpa_connection_ack': {
      // Connection acknowledged, subscribe to transcription
      const subMessage: TpaSubscriptionUpdateMessage = {
        type: 'subscription_update',
        packageName: PACKAGE_NAME,
        sessionId,
        subscriptions: ['transcription']
      };
      ws.send(JSON.stringify(subMessage));
      console.log(`Session ${sessionId} connected and subscribed`);
      break;
    }

    case 'data_stream': {
      const streamMessage = message as CloudDataStreamMessage;
      if (streamMessage.streamType === 'transcription') {
        handleTranscription(sessionId, ws, streamMessage.data);
      }
      break;
    }

    default:
      console.log('Unknown message type:', message.type);
  }
}

function handleTranscription(sessionId: string, ws: WebSocket, transcriptionData: any) {
  // Create a display event for the transcription
  const displayEvent: TpaDisplayEventMessage = {
    type: 'display_event',
    packageName: PACKAGE_NAME,
    sessionId,
    layout: {
      layoutType: 'text_rows',
      text: 
      [
        "⚡️ Flash:",
        transcriptionData.text,
      ]
    },
    durationMs: transcriptionData.isFinal ? 3000 : undefined
  };

  // Send the display event back to the cloud
  ws.send(JSON.stringify(displayEvent));
}

// Add a route to verify the server is running
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', app: PACKAGE_NAME });
});

app.listen(PORT, () => {
  console.log(`Flash TPA server running at http://localhost:${PORT}`);
  console.log(`Logo available at http://localhost:${PORT}/logo.png`);
});