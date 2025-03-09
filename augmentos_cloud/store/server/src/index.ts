import { TpaServer, TpaSession } from '@augmentos/sdk';
import * as dotenv from 'dotenv';
import { setupAppRoutes } from './routes/appstore.routes';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import express, { Express } from 'express';
import { setupDevPortalRoutes } from './routes/developer.routes';
import * as mongoConnection from "./connections/mongodb.connection";

// Initialize MongoDB connection
mongoConnection.init();

// Load environment variables
dotenv.config();

// Get environment variables with defaults
const PORT = Number(process.env.PORT || 7010);
const PACKAGE_NAME = process.env.PACKAGE_NAME || 'io.augmentos.system.appstore';
const API_KEY = process.env.API_KEY || '';
const SECRET_KEY = process.env.SECRET_KEY || '';
const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:7002/tpa-ws';

// Verify required environment variables
if (!API_KEY) {
  console.error('❌ API_KEY environment variable is required');
  process.exit(1);
}

if (!SECRET_KEY) {
  console.error('❌ SECRET_KEY environment variable is required');
  process.exit(1);
}

/**
 * App Store TPA Server
 */
class AppStoreTpaServer extends TpaServer {
  private tokenSecretKey: string;

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: API_KEY,
      port: PORT,
      augmentOSWebsocketUrl: SERVER_URL,
      publicDir: './public',
    });

    this.tokenSecretKey = SECRET_KEY;
    const app = this.getExpressApp();
    app.use(cors(
      {
        origin: true,
        credentials: true,
      }
    ));
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));
    app.use(cookieParser());

    // Set up API routes
    this.setupApiRoutes();
  }

  /**
   * Set up API routes for the App Store
   */
  private setupApiRoutes() {
    // Get the Express app instance
    const app: Express = this.getExpressApp();

    // Set up app routes
    setupAppRoutes(app, this.tokenSecretKey);
    setupDevPortalRoutes(app);
    console.log('App Store API routes set up');

  }

  /**
   * Handle new user sessions
   */
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`New App Store session for user ${userId}`);

    // Generate a token for the user
    const token = this.generateToken(userId, sessionId, this.tokenSecretKey);
    // session.send('token', token);
    // TODO(isaiah): build the tpa_token response into the sdk. As soon as the serevr hits the webhook to start an app, it should generate and send the token.

  }
}

// Create and start the server
const server = new AppStoreTpaServer();
// const app = server.getExpressApp();
// setup cors.

server.start().then(() => {
  console.log(`🚀 App Store TPA Server running on port ${PORT}`);
}).catch(error => {
  console.error('Failed to start server:', error);
});