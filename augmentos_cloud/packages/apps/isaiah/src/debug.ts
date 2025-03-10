import path from 'path';
import { TpaServer, TpaSession } from '@augmentos/sdk';

const PACKAGE_NAME = "dev.augmentos.isaiah";
const API_KEY = 'test_key'; // In production, this would be securely stored
const PORT = 42022;
const CLOUD_URL = process.env.CLOUD_URL || "http://localhost:8002"; 

const isaiahUserId = "isaiah@mentra.glass";
const appSessions = new Map<string, TpaSession>();
let isIsaiahConnected = false;
let isIsaiahBusy = false;
let whosTalkingWithIsaiah: string | undefined;

class ActuallyIsaiahServer extends TpaServer {
  private didTheySay(triggerPhrase: string, transcription: string): boolean {
    return transcription.toLowerCase().includes(triggerPhrase.toLowerCase());
  }

  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    let index = 0;
    // Store cleanup functions
    const cleanup = [
      session.events.onAudioChunk((data) => {
        // console.log('Audio chunk:', data.arrayBuffer.byteLength);
        // hex data of the pcm audio chunk.
        index++;
        if (index % 10 === 0) {
          console.log(data.arrayBuffer.slice(0, 42));
        }
        // console.log(new Uint8Array(data.arrayBuffer).reduce((acc, val) => acc + val.toString(16).padStart(2, '0'), ''));
        // session.layouts.showTextWall('Audio chunk received: ' + data.arrayBuffer.slice(0, 42));
      }),

      session.events.onTranscription((transcription) => {
        console.log('Transcription:', transcription.text);
        session.layouts.showTextWall('Transcription: ' + transcription.text);
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
const server = new ActuallyIsaiahServer({
  packageName: PACKAGE_NAME,
  apiKey: API_KEY,
  port: PORT,
  augmentOSWebsocketUrl: `ws://${CLOUD_URL}/tpa-ws`,
  webhookPath: '/webhook',
  // publicDir: path.join(__dirname, './public')
});

server.start().catch(console.error);