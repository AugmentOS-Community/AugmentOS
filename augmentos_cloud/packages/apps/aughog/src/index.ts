/**
 * AugHog - PostHog Analytics Viewer for AugmentOS
 * 
 * Displays analytics data from PostHog on AugmentOS smart glasses.
 * Uses the enhanced SDK features including automatic resource tracking
 * and improved error handling.
 */

import express from 'express';
import { TpaServer, TpaSession } from '@augmentos/sdk';
import { logger } from '@augmentos/utils';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration Constants
const PORT = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT) : 3456;
const PACKAGE_NAME = process.env.TPA_PACKAGE_NAME || 'org.augmentos.aughog';
const API_KEY = process.env.TPA_API_KEY || 'dev_key';

// PostHog API Configuration
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_API_HOST = process.env.POSTHOG_API_HOST || 'https://app.posthog.com';
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;

// Data refresh intervals (in milliseconds)
const ACTIVE_USERS_REFRESH = 30000; // 30 seconds
const EVENTS_REFRESH = 60000;       // 1 minute
const DASHBOARD_REFRESH = 15000;    // 15 seconds

// Initialize the app
const app = express();

// Determine the WebSocket URL based on environment
const CLOUD_HOST_NAME = process.env.CLOUD_HOST_NAME || 'localhost:8002';
let wsUrl: string;

// In a container environment, use the service name
if (process.env.CONTAINER_ENVIRONMENT === 'true' || CLOUD_HOST_NAME === 'cloud') {
  wsUrl = 'ws://cloud/tpa-ws';
  logger.info(`🔌 Using Docker internal URL: ${wsUrl}`);
} else if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
  // Production environment - use secure WebSocket
  wsUrl = `wss://${process.env.PUBLIC_HOST_NAME || 'dev.augmentos.org'}/tpa-ws`;
  logger.info(`🔌 Using production URL: ${wsUrl}`);
} else {
  // Local development
  wsUrl = `ws://${CLOUD_HOST_NAME}/tpa-ws`;
  logger.info(`🔌 Using local development URL: ${wsUrl}`);
}

// Create TPA server with environment-aware configuration
const tpaServer = new TpaServer({
  packageName: PACKAGE_NAME,
  apiKey: API_KEY,
  // Override default WebSocket URL with our environment-specific one
  augmentOSWebsocketUrl: wsUrl,
  // Register with multiple server environments for recovery
  serverUrls: 'wss://dev.augmentos.org/tpa-ws,wss://cloud.augmentos.org/tpa-ws'
});

// Active sessions
const sessions = new Map<string, TpaSession>();

// Track the PostHog data
type AnalyticsData = {
  activeUsers: number;
  activeUsersTrend: number; // +/- percentage change
  todayEvents: number;
  topEvents: Array<{name: string, count: number}>;
  lastUpdated: Date;
};

let analyticsData: AnalyticsData = {
  activeUsers: 0,
  activeUsersTrend: 0,
  todayEvents: 0,
  topEvents: [],
  lastUpdated: new Date()
};

/**
 * Fetch active users count from PostHog
 */
async function fetchActiveUsers(): Promise<void> {
  try {
    if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
      logger.warn('PostHog API credentials not configured');
      return;
    }

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const response = await axios.get(
      `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/persons/`,
      {
        headers: {
          'Authorization': `Bearer ${POSTHOG_API_KEY}`
        },
        params: {
          active_days: 1,
          date_from: yesterday.toISOString(),
          date_to: now.toISOString()
        }
      }
    );
    
    const newActiveUsers = response.data.count || 0;
    const prevActiveUsers = analyticsData.activeUsers;
    
    // Calculate trend
    let trend = 0;
    if (prevActiveUsers > 0) {
      trend = ((newActiveUsers - prevActiveUsers) / prevActiveUsers) * 100;
    }
    
    analyticsData.activeUsers = newActiveUsers;
    analyticsData.activeUsersTrend = trend;
    analyticsData.lastUpdated = now;
    
    logger.info(`Active users updated: ${newActiveUsers} (${trend >= 0 ? '+' : ''}${trend.toFixed(1)}%)`);
    
    // Update all sessions with new data
    updateAllSessions();
    
  } catch (error) {
    logger.error('Error fetching active users:', error);
  }
}

/**
 * Fetch event data from PostHog
 */
async function fetchEvents(): Promise<void> {
  try {
    if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
      logger.warn('PostHog API credentials not configured');
      return;
    }

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    
    // Get today's events
    const eventsResponse = await axios.get(
      `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/events/`,
      {
        headers: {
          'Authorization': `Bearer ${POSTHOG_API_KEY}`
        },
        params: {
          date_from: startOfDay.toISOString(),
          date_to: now.toISOString()
        }
      }
    );
    
    const todayEvents = eventsResponse.data.count || 0;
    
    // Get top events
    const topEventsResponse = await axios.get(
      `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/insights/trend/`,
      {
        headers: {
          'Authorization': `Bearer ${POSTHOG_API_KEY}`
        },
        params: {
          date_from: startOfDay.toISOString(),
          date_to: now.toISOString(),
          breakdown_type: 'event',
          display: 'ActionsPie'
        }
      }
    );
    
    // Parse top events from response
    const topEvents = (topEventsResponse.data.result || [])
      .slice(0, 5)
      .map((item: any) => ({
        name: item.name || 'Unknown',
        count: item.count || 0
      }));
    
    analyticsData.todayEvents = todayEvents;
    analyticsData.topEvents = topEvents;
    analyticsData.lastUpdated = now;
    
    logger.info(`Event data updated: ${todayEvents} events today`);
    
    // Update all sessions with new data
    updateAllSessions();
    
  } catch (error) {
    logger.error('Error fetching events:', error);
  }
}

/**
 * Update all active sessions with the latest data
 */
function updateAllSessions(): void {
  for (const [sessionId, session] of sessions.entries()) {
    updateSessionDisplay(session);
  }
}

/**
 * Update main display for a session
 */
function updateSessionDisplay(session: TpaSession): void {
  try {
    // Format the data for display
    const formattedTime = analyticsData.lastUpdated.toLocaleTimeString();
    
    // Create the main display
    const mainText = [
      `// AugHog Stats`,
      `Active Users: ${analyticsData.activeUsers} (${analyticsData.activeUsersTrend >= 0 ? '+' : ''}${analyticsData.activeUsersTrend.toFixed(1)}%)`,
      `Today's Events: ${analyticsData.todayEvents}`,
      ``,
      `Top Events:`,
      ...analyticsData.topEvents.map(event => ` - ${event.name}: ${event.count}`),
      ``,
      `Updated: ${formattedTime}`
    ].join('\n');
    
    // Show the main display
    session.layouts.showTextWall(mainText);
    
    // Update dashboard view with key metrics
    session.layouts.showDashboardCard('Active Users', analyticsData.activeUsers.toString(), {
      view: 'dashboard'
    });
    
    session.layouts.showDashboardCard('Today\'s Events', analyticsData.todayEvents.toString(), {
      view: 'dashboard'
    });
    
    logger.info(`Updated display for session ${session.getSessionId()}`);
  } catch (error) {
    logger.error(`Error updating display for session:`, error);
  }
}

// Set up data refresh timers
let activeUsersTimer: NodeJS.Timeout | null = null;
let eventsTimer: NodeJS.Timeout | null = null;
let dashboardTimer: NodeJS.Timeout | null = null;

/**
 * Start the data refresh timers
 */
function startDataRefresh(): void {
  // Clear any existing timers
  if (activeUsersTimer) clearInterval(activeUsersTimer);
  if (eventsTimer) clearInterval(eventsTimer);
  if (dashboardTimer) clearInterval(dashboardTimer);
  
  // Fetch initial data
  fetchActiveUsers();
  fetchEvents();
  
  // Set up refresh intervals
  activeUsersTimer = setInterval(fetchActiveUsers, ACTIVE_USERS_REFRESH);
  eventsTimer = setInterval(fetchEvents, EVENTS_REFRESH);
  
  // Dashboard update timer (updates display even if data hasn't changed)
  dashboardTimer = setInterval(updateAllSessions, DASHBOARD_REFRESH);
  
  logger.info('Data refresh timers started');
}

/**
 * Handle session start for a new TPA session
 */
function handleSessionStart(session: TpaSession): void {
  const sessionId = session.getSessionId();
  logger.info(`New session started: ${sessionId}`);
  
  // Store the session
  sessions.set(sessionId, session);
  
  // Set up event handlers using new automatic resource tracking
  session.onButtonPress((data) => {
    logger.info(`Button press: ${data.buttonType} for session ${sessionId}`);
    
    // Refresh data immediately when menu button is pressed
    if (data.buttonType === 'MENU' || data.buttonType === 'SELECT') {
      fetchActiveUsers();
      fetchEvents();
      session.layouts.showTextWall('Refreshing analytics data...');
    }
  });
  
  // Display welcome message
  session.layouts.showTextWall('AugHog Analytics\nLoading data...');
  
  // Show immediate dashboard metrics
  session.layouts.showDashboardCard('AugHog', 'Loading...', {
    view: 'dashboard' 
  });
  
  // Start data refresh if this is the first session
  if (sessions.size === 1) {
    startDataRefresh();
  } else {
    // Otherwise just update this session with existing data
    updateSessionDisplay(session);
  }
}

/**
 * Handle session end
 */
function handleSessionEnd(sessionId: string): void {
  logger.info(`Session ended: ${sessionId}`);
  
  // Remove the session
  sessions.delete(sessionId);
  
  // If no more sessions, stop the refresh timers
  if (sessions.size === 0) {
    if (activeUsersTimer) clearInterval(activeUsersTimer);
    if (eventsTimer) clearInterval(eventsTimer);
    if (dashboardTimer) clearInterval(dashboardTimer);
    
    activeUsersTimer = null;
    eventsTimer = null;
    dashboardTimer = null;
    
    logger.info('All sessions ended, stopping data refresh');
  }
}

// Set up TPA server event handlers
tpaServer.onSessionStart(handleSessionStart);
tpaServer.onSessionEnd(handleSessionEnd);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeSessions: sessions.size,
    lastUpdated: analyticsData.lastUpdated,
    posthogConfigured: !!(POSTHOG_API_KEY && POSTHOG_PROJECT_ID)
  });
});

// Start the server
app.listen(PORT, () => {
  logger.info(`AugHog server running on port ${PORT}`);
  
  // Start the TPA server
  tpaServer.start();
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down AugHog...');
  
  // Clear all timers
  if (activeUsersTimer) clearInterval(activeUsersTimer);
  if (eventsTimer) clearInterval(eventsTimer);
  if (dashboardTimer) clearInterval(dashboardTimer);
  
  // Close all sessions
  for (const session of sessions.values()) {
    try {
      session.disconnect();
    } catch (error) {
      logger.error('Error disconnecting session:', error);
    }
  }
  
  // Stop the TPA server
  await tpaServer.stop();
  
  process.exit(0);
});