import path from 'path';
import { TpaServer, TpaSession } from '@augmentos/sdk';
import { systemApps } from '@augmentos/config';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80; // Default http port.
const CLOUD_URL = process.env.CLOUD_URL || "localhost:8002";
const PACKAGE_NAME = systemApps.flash.packageName;
const API_KEY = 'test_key'; // In production, this would be securely stored

class FlashServer extends TpaServer {
  // Changed from onNewSession to onSession to match parent class
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`Setting up flash for session ${sessionId}`);
    session.layouts.showReferenceCard("Flash", "Welcome to Flash!", { durationMs: 3000 });

    // Store cleanup functions
    const cleanup = [
      // Handle transcription events
      session.events.onTranscription((data) => {
        // Show transcription in AR view using reference card
        session.layouts.showReferenceCard(
          "Flash 2",
          data.text,
          { durationMs: data.isFinal ? 3000 : undefined }
        );

        // Log transcription
        console.log(`[User ${userId}]: ${data.text}`);
      }),

      session.events.onAudioChunk((data) => {
        // console.log(`[User ${userId}]: Received audio chunk of length ${data.arrayBuffer}`);
      }),

      // Handle connection events
      session.events.onConnected((settings) => {
        console.log(`\n[User ${userId}] connected to augmentos-cloud\n`);
        session.layouts.showReferenceCard("Flash", "Connected to AugmentOS", { durationMs: 2000 });
      }),

      // Handle errors
      session.events.onError((error) => {
        console.error(`[User ${userId}] Error:`, error);
      })
    ];

    // Add cleanup handlers
    cleanup.forEach(handler => this.addCleanupHandler(handler));
  }
}

// Create and start the server
const server = new FlashServer({
  packageName: PACKAGE_NAME,
  apiKey: API_KEY,
  port: PORT,
  augmentOSWebsocketUrl: `ws://${CLOUD_URL}/tpa-ws`,
  webhookPath: '/webhook',
  publicDir: path.join(__dirname, './public')
});

server.start().catch(console.error);