// augmentos_cloud/packages/apps/agent-gatekeeper/src/index.ts
import express from 'express';
import WebSocket from 'ws';
import path from 'path';
import {
  TpaConnectionInitMessage,
  TpaDisplayEventMessage,
  TpaSubscriptionUpdateMessage,
  CloudDataStreamMessage,
} from '@augmentos/types'; // Reuse shared types if needed

// Import the AgentGatekeeper and Agent interface (adjust the paths as needed)
import { AgentGatekeeper } from '../../../agents/AgentGateKeeper';
import { Agent } from '../../../agents/AgentInterface';

// Create or import your agents here.
// For demonstration, we create a dummy agent.
// Replace this with your actual agents.
const dummyAgent: Agent = {
  agentId: 'dummy_agent',
  agentName: 'Dummy Agent',
  agentDescription: 'A dummy agent for testing',
  agentPrompt: 'Process the following context: {context}',
  agentTools: ['dummy_tool'],
  async handleContext(inputData: Record<string, any>) {
    // Return some dummy response
    return { result: 'Dummy agent processed context successfully.' };
  }
};

const agents: Agent[] = [dummyAgent];

// Instantiate the AgentGatekeeper with the available agents.
const gatekeeper = new AgentGatekeeper(agents);

const app = express();
const PORT = 7013; // Use a different port from your captions app

const PACKAGE_NAME = 'org.mentra.agentgatekeeper';
const API_KEY = 'test_key'; // In production, secure this key

// Parse JSON bodies
app.use(express.json());

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
        if (streamMessage.streamType === 'transcription') {
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
    const response = await gatekeeper.processContext(inputData);

    // Create a display event for the transcription
    const displayEvent: TpaDisplayEventMessage = {
      type: 'display_event',
      packageName: PACKAGE_NAME,
      sessionId,
      layout: {
        layoutType: 'reference_card',
        title: "AgentGatekeeper Response",
        text: JSON.stringify(response, null, 2)
      },
      durationMs: 3000
    };

    console.log(`[Session ${sessionId}]: ${JSON.stringify(response, null, 2)}`);
  
    // Send the display event back to the cloud
    ws.send(JSON.stringify(displayEvent));
  }

// A simple health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', app: PACKAGE_NAME });
});

app.listen(PORT, () => {
  console.log(`AgentGatekeeper TPA server running at http://localhost:${PORT}`);
  console.log(`Logo available at http://localhost:${PORT}/logo.png`);
});
