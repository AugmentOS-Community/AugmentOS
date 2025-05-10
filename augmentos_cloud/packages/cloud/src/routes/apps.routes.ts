// cloud/src/routes/apps.routes.ts
import express, { Request, Response, NextFunction } from 'express';
import webSocketService from '../services/core/websocket.service';
import sessionService, { ExtendedUserSession } from '../services/core/session.service';
import appService from '../services/core/app.service';
import { User } from '../models/user.model';
import App, { AppI } from '../models/app.model';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { DeveloperProfile } from '@augmentos/sdk';

// Extended app interface for API responses that include developer profile
interface AppWithDeveloperProfile extends AppI {
  developerProfile?: DeveloperProfile;
}

// Enhanced app interface with running state properties
interface EnhancedAppI extends AppI {
  is_running?: boolean;
  is_foreground?: boolean;
}

// Enhanced app with both developer profile and running state
interface EnhancedAppWithDeveloperProfile extends AppWithDeveloperProfile {
  is_running?: boolean;
  is_foreground?: boolean;
}

// Interface for Mongoose document with toObject method
interface MongooseDocument {
  toObject(): any;
}

export const CLOUD_VERSION = process.env.CLOUD_VERSION;
if (!CLOUD_VERSION) {
  console.error('CLOUD_VERSION is not set');
}


const AUGMENTOS_AUTH_JWT_SECRET = process.env.AUGMENTOS_AUTH_JWT_SECRET || "";

/**
 * Helper function to get the active session for a user from their coreToken
 * @param coreToken JWT token from authentication
 * @returns The user's active session or null if not found
 */
async function getSessionFromToken(coreToken: string) {
  try {
    // Verify and decode the token
    const userData = jwt.verify(coreToken, AUGMENTOS_AUTH_JWT_SECRET);
    const userId = (userData as JwtPayload).email;
    console.log("USERID: " + userId || '');
    if (!userId) {
      return null;
    }

    // Find the active session for this user
    const userSessions = sessionService.getSessionsForUser(userId);

    // Get the most recent active session for this user
    // We could add more sophisticated logic here if needed (e.g., device ID matching)
    if (userSessions && userSessions.length > 0) {
      return userSessions[0]; // Return the first active session
    }

    return null;
  } catch (error) {
    console.error('Error verifying token or finding session:', error);
    return null;
  }
}

/**
 * Helper function to get the user ID from a token
 * @param token JWT token from authentication
 * @returns The user ID (email) or null if token is invalid
 */
async function getUserIdFromToken(token: string): Promise<string | null> {
  try {
    // Verify and decode the token
    const userData = jwt.verify(token, AUGMENTOS_AUTH_JWT_SECRET);
    const userId = (userData as JwtPayload).email;
    
    if (!userId) {
      return null;
    }
    
    return userId;
  } catch (error) {
    console.error('Error verifying token:', error);
    return null;
  }
}

/**
 * Middleware to extract session from Authorization header
 * Falls back to sessionId in body if Authorization header is not present
 */
async function sessionAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  // Check for Authorization header
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const session = await getSessionFromToken(token);
    
    if (session) {
      // Add session to request object for route handlers
      (req as any).userSession = session;
      (req as any).authMode = 'full';
      next();
      return;
    }
  }

  // Fall back to sessionId in body
  if (req.body && req.body.sessionId) {
    const session = sessionService.getSession(req.body.sessionId);
    if (session) {
      (req as any).userSession = session;
      (req as any).authMode = 'full';
      next();
      return;
    }
  }

  // No valid session found
  res.status(401).json({
    success: false,
    message: 'No valid session. Please provide valid Authorization Bearer token or sessionId.'
  });
}

/**
 * Dual mode auth middleware - works with or without active sessions
 * If a valid token is present but no active session, creates a minimal user context
 */
async function dualModeAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  // Check for Authorization header
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Try to get full session first
    const session = await getSessionFromToken(token);
    
    if (session) {
      // Full session mode
      (req as any).userSession = session;
      (req as any).authMode = 'full';
      next();
      return;
    }
    
    // If no session found, try to at least verify the token for user ID
    const userId = await getUserIdFromToken(token);
    
    if (userId) {
      // Minimal auth mode - no session but valid user
      (req as any).userSession = { 
        userId, 
        minimal: true
      };
      (req as any).authMode = 'minimal';
      next();
      return;
    }
  }

  // Fall back to sessionId in body (for full session only)
  if (req.body && req.body.sessionId) {
    const session = sessionService.getSession(req.body.sessionId);
    if (session) {
      (req as any).userSession = session;
      (req as any).authMode = 'full';
      next();
      return;
    }
  }

  // No valid authentication found
  res.status(401).json({
    success: false,
    message: 'Authentication required. Please provide valid token or session ID.'
  });
}

/**
 * Middleware to allow authentication via either core token/session or apiKey+packageName+userId
 */
async function apiKeyOrSessionAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  // Accept apiKey/packageName/userId from query, body, or headers
  const apiKey = req.query.apiKey as string || req.body.apiKey || req.headers['x-api-key'] as string;
  const packageName = req.query.packageName as string || req.body.packageName || req.headers['x-package-name'] as string;
  const userId = req.query.userId as string || req.body.userId || req.headers['x-user-id'] as string;
  const allowedPackages = ['test.augmentos.mira', 'com.augmentos.mira'];

  if (apiKey && packageName && userId && allowedPackages.includes(packageName)) {
    // Validate API key
    const valid = await appService.validateApiKey(packageName, apiKey, req.ip);
    if (valid) {
      const userSessions = sessionService.getSessionsForUser(userId);
      if (userSessions && userSessions.length > 0) {
        (req as any).userSession = userSessions[0];
        (req as any).authMode = 'apiKey';
        return next();
      } else {
        // Optionally: fallback to a minimal session, or return an error
        return res.status(401).json({
          success: false,
          message: 'No active session found for user.'
        });
      }
    } else {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key or package name.'
      });
    }
  }

  // Fallback to existing dualModeAuthMiddleware
  return dualModeAuthMiddleware(req, res, next);
}

const router = express.Router();

// Route Handlers
/**
 * Get all available apps
 */
async function getAllApps(req: Request, res: Response) {
  try {
    const session = (req as any).userSession;
    const userId = session?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required (via token or userId param)'
      });
    }
    const apps = await appService.getAllApps(userId);
    const userSessions = sessionService.getSessionsForUser(userId);
    const plainApps = apps.map(app => {
      return (app as unknown as MongooseDocument).toObject?.() || app;
    });
    const enhancedApps = plainApps.map(app => {
      const enhancedApp: EnhancedAppI = {
        ...app,
        is_running: false,
        is_foreground: false
      };
      if (userSessions && userSessions.length > 0) {
        const isRunning = userSessions.some(session =>
          session.activeAppSessions && session.activeAppSessions.includes(app.packageName)
        );
        enhancedApp.is_running = isRunning;
        if (isRunning) {
          const isForeground = userSessions.some(session => {
            return (
              (session as any).foregroundAppPackageName === app.packageName ||
              (session as any).foregroundApp === app.packageName
            );
          });
          enhancedApp.is_foreground = isForeground;
        }
      }
      return enhancedApp;
    });
    res.json({
      success: true,
      data: enhancedApps
    });
  } catch (error) {
    console.error('Error fetching apps:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching apps'
    });
  }
}

/**
 * Get public apps
 */
async function getPublicApps(req: Request, res: Response) {
  try {
    const apps = await appService.getAllApps();
    res.json({
      success: true,
      data: apps
    });
  } catch (error) {
    console.error('Error fetching public apps:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching public apps'
    });
  }
}

/**
 * Search apps by query
 */
async function searchApps(req: Request, res: Response) {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const apps = await appService.getAllApps();
    const searchResults = apps.filter(app =>
      app.name.toLowerCase().includes(query.toLowerCase()) ||
      (app.description && app.description.toLowerCase().includes(query.toLowerCase()))
    );

    res.json({
      success: true,
      data: searchResults
    });
  } catch (error) {
    console.error('Error searching apps:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching apps'
    });
  }
}

/**
 * Get specific app by package name
 */
async function getAppByPackage(req: Request, res: Response) {
  try {
    const { packageName } = req.params;
    const app = await appService.getApp(packageName);

    if (!app) {
      return res.status(404).json({
        success: false,
        message: `App with package name ${packageName} not found`
      });
    }

    // If the app has a developerId, try to get the developer profile information
    let developerProfile = null;
    if (app.developerId) {
      try {
        const developer = await User.findByEmail(app.developerId);
        if (developer && developer.profile) {
          developerProfile = developer.profile;
        }
      } catch (err) {
        console.error('Error fetching developer profile:', err);
        // Continue without developer profile
      }
    }

    // Create response with developer profile if available
    // Use the AppWithDeveloperProfile interface for type safety
    const appObj = { ...app } as unknown as AppWithDeveloperProfile;
    if (developerProfile) {
      appObj.developerProfile = developerProfile;
    }

    res.json({
      success: true,
      data: appObj
    });
  } catch (error) {
    console.error('Error fetching app:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching app'
    });
  }
}

/**
 * Start app for session
 */
async function startApp(req: Request, res: Response) {
  const { packageName } = req.params;
  const session = (req as any).userSession;
  try {
    await webSocketService.startAppSession(session, packageName);
    const appStateChange = await webSocketService.generateAppStateStatus(session);
    res.json({
      success: true,
      data: {
        status: 'started',
        packageName,
        appState: appStateChange
      }
    });
    if (session.websocket && session.websocket.readyState === 1) {
      session.websocket.send(JSON.stringify(appStateChange));
    }
  } catch (error) {
    console.error(`Error starting app ${packageName}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error starting app'
    });
  }
}

/**
 * Stop app for session 
 */
async function stopApp(req: Request, res: Response) {
  const { packageName } = req.params;
  const session = (req as any).userSession;
  try {
    const app = await appService.getApp(packageName);
    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }
    await webSocketService.stopAppSession(session, packageName);
    const appStateChange = await webSocketService.generateAppStateStatus(session);
    res.json({
      success: true,
      data: {
        status: 'stopped',
        packageName,
        appState: appStateChange
      }
    });
    if (session.websocket && session.websocket.readyState === 1) {
      session.websocket.send(JSON.stringify(appStateChange));
    }
  } catch (error) {
    console.error(`Error stopping app ${packageName}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error stopping app'
    });
  }
}

/**
 * Install app for user
 */
async function installApp(req: Request, res: Response) {
  const { packageName } = req.params;
  const session = (req as any).userSession; // Get session from middleware
  const authMode = (req as any).authMode || 'minimal';
  const email = session.userId;

  if (!email || !packageName) {
    return res.status(400).json({
      success: false,
      message: 'User session and package name are required'
    });
  }

  try {
    // Find or create user
    const user = await User.findOrCreateUser(email);

    // Get app details
    const app = await appService.findFromAppStore(packageName);
    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }

    // Check if app is already installed
    if (user.installedApps?.some(app => app.packageName === packageName)) {
      return res.status(400).json({
        success: false,
        message: 'App is already installed'
      });
    }

    // Add to installed apps
    if (!user.installedApps) {
      user.installedApps = [];
    }

    user.installedApps.push({
      packageName,
      installedDate: new Date()
    });

    await user.save();

    res.json({
      success: true,
      message: `App ${packageName} installed successfully`
    });

    // Only attempt WebSocket notifications for full auth mode
    if (authMode === 'full' && !session.minimal) {
      console.log(`✅✅✅ Sending real-time notification for user ${email} in ${authMode} auth mode ✅✅✅`);
      try {
        // TriggerAppStateChange which send's a appstate change notification to the client.
        // By default we can just use sessionService.triggerAppStateChange(), because it handles all the logic for us.
        sessionService.triggerAppStateChange(email);
      } catch (error) {
        console.error('Error sending app state notification:', error);
        // Non-critical error, installation succeeded
      }
    } else {
      console.log(`⛔️⛔️⛔️ Skipping real-time notification for user ${email} in ${authMode} auth mode ⛔️⛔️⛔️`);
    }
  } catch (error) {
    console.error('Error installing app:', error);
    res.status(500).json({
      success: false,
      message: 'Error installing app'
    });
  }
}

/**
 * Uninstall app for user
 */
async function uninstallApp(req: Request, res: Response) {
  const { packageName } = req.params;
  const session = (req as any).userSession; // Get session from middleware
  const authMode = (req as any).authMode || 'minimal';
  const email = session.userId;

  if (!email || !packageName) {
    return res.status(400).json({
      success: false,
      message: 'User session and package name are required'
    });
  }

  try {
    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Remove from installed apps
    if (!user.installedApps) {
      return res.status(400).json({
        success: false,
        message: 'App is not installed'
      });
    }

    user.installedApps = user.installedApps.filter(
      app => app.packageName !== packageName
    );

    await user.save();

    res.json({
      success: true,
      message: `App ${packageName} uninstalled successfully`
    });

    // Only attempt WebSocket notifications for full auth mode
    if (authMode === 'full' && !session.minimal) {
      try {
        // TriggerAppStateChange which send's a appstate change notification to the client.
        // By default we can just use sessionService.triggerAppStateChange(), because it handles all the logic for us.
        sessionService.triggerAppStateChange(email);
      } catch (error) {
        console.error('Error sending app state notification:', error);
        // Non-critical error, uninstallation succeeded
      }
    } else {
      console.log(`Skipping real-time notification for user ${email} in ${authMode} auth mode`);
    }
  } catch (error) {
    console.error('Error uninstalling app:', error);
    res.status(500).json({
      success: false,
      message: 'Error uninstalling app'
    });
  }
}

/**
 * Get installed apps for user
 */
async function getInstalledApps(req: Request, res: Response) {
  const session = (req as any).userSession; // Get session from middleware
  const authMode = (req as any).authMode || 'minimal';
  const email = session.userId;

  try {
    // Log authentication mode for debugging
    console.log(`Getting installed apps for user ${email} in ${authMode} mode`);
    
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get details for all installed apps
    const installedApps = await Promise.all(
      (user.installedApps || []).map(async (installedApp) => {
        const appDetails = await appService.getApp(installedApp.packageName);
        if (!appDetails) return null;
        return {
          ...appDetails,
          installedDate: installedApp.installedDate
        };
      })
    );

    // Filter out null entries (in case an app was deleted)
    const validApps = installedApps.filter(app => app !== null);

    res.json({
      success: true,
      data: validApps
    });
  } catch (error) {
    console.error('Error fetching installed apps:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching installed apps'
    });
  }
}

  /**
   * Get app details by package name
   * Public endpoint - no authentication required
   */
  async function getAppDetails (req: Request, res: Response) {
    try {
      const { packageName } = req.params;

      // Get app details
      const app = await appService.getAppByPackageName(packageName);

      if (!app) {
        return res.status(404).json({
          success: false,
          message: `App with package name ${packageName} not found`
        });
      }

      // If the app has a developerId, try to get the developer profile information
      let developerProfile = null;
      if (app.developerId) {
        try {
          const developer = await User.findByEmail(app.developerId);
          if (developer && developer.profile) {
            developerProfile = developer.profile;
          }
        } catch (err) {
          console.error('Error fetching developer profile:', err);
          // Continue without developer profile
        }
      }

      // Create response with developer profile if available
      // Use the AppWithDeveloperProfile interface for type safety
      const appObj = { ...app } as unknown as AppWithDeveloperProfile;
      if (developerProfile) {
        appObj.developerProfile = developerProfile;
      }

      res.json({
        success: true,
        data: appObj
      });
    } catch (error) {
      console.error('Error fetching app details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch app details'
      });
    }
  };

async function getAvailableApps (req: Request, res: Response) {
  try {
    const apps = await appService.getAvailableApps();
    
    // Enhance apps with developer profiles
    const enhancedApps = await Promise.all(apps.map(async (app) => {
      // Convert app to plain object for modification and type as AppWithDeveloperProfile
      const appObj = { ...app } as unknown as AppWithDeveloperProfile;
      
      // Add developer profile if the app has a developerId
      if (app.developerId) {
        try {
          const developer = await User.findByEmail(app.developerId);
          if (developer && developer.profile) {
            appObj.developerProfile = developer.profile;
          }
        } catch (err) {
          console.error(`Error fetching developer profile for app ${app.packageName}:`, err);
          // Continue without developer profile
        }
      }
      
      return appObj;
    }));

    // Return the enhanced apps with success flag
    res.json({
      success: true,
      data: enhancedApps
    });
  } catch (error) {
    console.error('Error fetching available apps:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available apps'
    });
  }
};

// Route Definitions
router.get('/', apiKeyOrSessionAuthMiddleware, getAllApps);
router.get('/public', getPublicApps);
router.get('/search', searchApps);

// App store operations - use dual-mode auth (work with or without active sessions)
router.get('/installed', dualModeAuthMiddleware, getInstalledApps);
router.post('/install/:packageName', dualModeAuthMiddleware, installApp);
router.post('/uninstall/:packageName', dualModeAuthMiddleware, uninstallApp);

// Keep backward compatibility for now (can be removed later)
// router.post('/install/:packageName/:email', installApp);
// router.post('/uninstall/:packageName/:email', uninstallApp);
// router.get('/install/:packageName/:email', installApp);
// router.get('/uninstall/:packageName/:email', uninstallApp);

router.get('/version', async (req, res) => {
  res.json({ version: CLOUD_VERSION });
});

router.get('/available', getAvailableApps);
router.get('/:packageName', getAppByPackage);

// Device-specific operations - require full sessions
router.post('/:packageName/start', apiKeyOrSessionAuthMiddleware, startApp);
router.post('/:packageName/stop', apiKeyOrSessionAuthMiddleware, stopApp);

export default router;
