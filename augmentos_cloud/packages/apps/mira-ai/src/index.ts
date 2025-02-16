// augmentos_cloud/packages/apps/agent-gatekeeper/src/index.ts
import express from 'express';
import WebSocket from 'ws';
import path from 'path';
import {
  TpaConnectionInitMessage,
  TpaSubscriptionUpdateMessage,
  CloudDataStreamMessage,
  DisplayRequest,
} from '@augmentos/types'; // Reuse shared types if needed

// Import the AgentGatekeeper and Agent interface (adjust the paths as needed)
import { MiraAgent } from '../../../agents/MiraAgent';

const app = express();
const PORT = 7015; // Use a different port from your captions app

const PACKAGE_NAME = 'org.mentra.mira';
const API_KEY = 'test_key'; // In production, secure this key

// Parse JSON bodies
app.use(express.json());

const miraAgent = new MiraAgent();

// Track active sessions
const activeSessions = new Map<string, WebSocket>();

// Handle webhook call from AugmentOS Cloud
app.post('/webhook', async (req, res) => {
  try {
    // Expecting sessionId, userId, and (optionally) conversation_context in the POST body
    const { sessionId, userId, conversation_context } = req.body;
    console.log(`\n\n🗣️ Received session request for user ${userId}, session ${sessionId}\n\n`);

    // Start WebSocket connection to cloud (adjust the URL if needed)
    const ws = new WebSocket('ws://localhost:7002/tpa-ws');
    
    ws.on('open', () => {
      console.log(`\n[Session ${sessionId}]\n connected to augmentos-cloud`);
      // Send connection init message
      const initMessage: TpaConnectionInitMessage = {
        type: 'tpa_connection_init',
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
    });

    activeSessions.set(sessionId, ws);
    res.status(200).json({ status: 'connecting' });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve static files if necessary
app.use(express.static(path.join(__dirname, './public')));

async function debug() {
//   console.log("Debugging...");
//   const inputData = { conversation_context: "How many people live in the USA?"};
//   const response = await gatekeeper.processContext(inputData);
//   console.log(response.output[0].insight);
//   return response.output;
}

// Handle incoming WebSocket messages
async function handleMessage(sessionId: string, ws: WebSocket, message: any, conversation_context?: string) {
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
        if (streamMessage.streamType === 'transcription' && streamMessage.data.isFinal) {
          handleTranscription(sessionId, ws, streamMessage.data);
        }
        break;
    }

    // Handle additional message types if necessary.
    default:
      console.log('Unknown message type:', message.type);
  }
}

async function handleTranscription(sessionId: string, ws: WebSocket, transcriptionData: any) {
    const inputData = { conversation_context: transcriptionData.text };
    const response = await miraAgent.handleContext(inputData);

    console.log(`[Session ${sessionId}]: ${JSON.stringify(!response.selectedAgents, null, 2)}`);

    if (!response || !response.selectedAgents || !response.output[0] || !response.output[0].insight) {
      console.log("No insight found");
      return;
    } else {
      console.log("Insight found");
      console.log(response);
    }

    // Create a display event for the transcription
    const displayRequest: DisplayRequest = {
      type: 'display_event',
      view: 'main',
      packageName: PACKAGE_NAME,
      sessionId,
      layout: {
        layoutType: 'text_wall',
        text: JSON.stringify(response.output[0].insight, null, 2)
      },
      durationMs: 6000,
      timestamp: new Date()
    };

    console.log(`[Session ${sessionId}]: ${JSON.stringify(response, null, 2)}`);

    // Send the display event back to the cloud
    ws.send(JSON.stringify(displayRequest));
  }

// A simple health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', app: PACKAGE_NAME });
});

app.listen(PORT, () => {
  console.log(`AgentGatekeeper TPA server running at http://localhost:${PORT}`);
  console.log(`Logo available at http://localhost:${PORT}/logo.png`);
});
