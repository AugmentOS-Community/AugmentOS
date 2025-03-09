/**
 * @fileoverview AugmentOS Cloud Server entry point.
 * Initializes core services and sets up HTTP/WebSocket servers.
 */
// import "./instrument";
import "./sentry";

import express from 'express';
import { Server } from 'http';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';

// Import services
import { webSocketService } from './services/core/websocket.service';

// Import routes
import appRoutes from './routes/apps.routes';
import authRoutes from './routes/auth.routes';
import transcriptRoutes from './routes/transcripts.routes';
import tpaSettingsRoutes from './routes/tpa-settings.routes';
import errorReportRoutes from './routes/error-report.routes';

import path from 'path';

// Load configuration from environment
import * as mongoConnection from "./connections/mongodb.connection";
import { logger } from "@augmentos/utils";

// Initialize MongoDB connection
mongoConnection.init();

// Initialize Express and HTTP server
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80; // Default http port.
const app = express();
const server = new Server(app);

// Middleware setup
app.use(helmet());
app.use(cors({
  credentials: true, 
  origin: [
    '*',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:5174',
    'http://localhost:5174',
    'http://localhost:5173',
    'http://localhost:53216',
    'http://localhost:6173',
    'https://cloud.augmentos.org',
    'https://dev.augmentos.org',
    'https://www.augmentos.org',
    'https://augmentos.org',
    "https://augmentos.dev",

    // AugmentOS App Store / Developer Portal
    "https://augmentos.dev",
    "https://appstore.augmentos.dev",

    "https://dev.appstore.augmentos.dev",
    "https://dev.augmentos.dev",
    "https://staging.appstore.augmentos.dev",
    "https://staging.augmentos.dev",
    "https://prod.appstore.augmentos.dev",
    "https://prod.augmentos.dev",

    "https://augmentos-developer-portal.netlify.app",
  ]
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// Routes
app.use('/api/apps', appRoutes);
app.use('/api/auth', authRoutes);
app.use('/apps', appRoutes);
app.use('/auth', authRoutes);
app.use('/tpasettings', tpaSettingsRoutes);

app.use(errorReportRoutes);
app.use(transcriptRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, './public')));

// Initialize WebSocket service
webSocketService.setupWebSocketServers(server);

// Start the server
server.listen(PORT, () => {
  logger.info(`\n\n\n ☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️ `);
  logger.info('\n😎 AugmentOS Cloud Server🚀\n');
  logger.info(`HTTP server: http://cloud:${PORT}`);
  logger.info('WebSocket endpoints:');
  logger.info(`  - Glasses: ws://cloud/glasses-ws`);
  logger.info(`  - TPA:     ws://cloud/tpa-ws\n`);
  logger.info('\n🚀 Cloud Server ready\n');
  logger.info(`\n\n\n ☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️ \n`);
});

export default server;
