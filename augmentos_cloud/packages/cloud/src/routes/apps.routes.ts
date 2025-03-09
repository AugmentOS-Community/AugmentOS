// cloud/src/routes/apps.routes.ts
import express, { Request, Response } from 'express';
import webSocketService from '../services/core/websocket.service';
import sessionService from '../services/core/session.service';
import appService from '../services/core/app.service';
import { User } from '../models/user.model';

export const CLOUD_VERSION = process.env.CLOUD_VERSION;
if (!CLOUD_VERSION) {
  console.error('CLOUD_VERSION is not set');
}

const router = express.Router();

// Route Handlers
/**
 * Get all available apps
 */
async function getAllApps(req: Request, res: Response) {
  try {
    const apps = await appService.getAllApps();
    res.json({
      success: true,
      data: apps
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

    res.json({
      success: true,
      data: app
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
  const { sessionId } = req.body;

  try {
    const session = sessionService.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    const app = await appService.getApp(packageName);
    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }

    const tpaSessionId = await webSocketService.startAppSession(session, packageName);
    session.activeAppSessions.push(tpaSessionId);

    res.json({
      success: true,
      data: { status: 'initiated', tpaSessionId }
    });
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
  const { sessionId } = req.body;

  try {
    const session = sessionService.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    const app = await appService.getApp(packageName);
    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }

    session.activeAppSessions = session.activeAppSessions.filter(
      (appSession) => appSession !== packageName
    );

    res.json({
      success: true,
      data: { status: 'stopped', packageName }
    });
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
  console.log('installApp', req.params);
  const { packageName, email } = req.params;
  console.log('installApp', packageName, email);

  if (!email || !packageName) {
    return res.status(400).json({
      success: false,
      message: 'Email and package name are required'
    });
  }

  try {
    // Find or create user
    const user = await User.findOrCreateUser(email);
    
    // Get app details
    const app = await appService.getApp(packageName);
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
  const { packageName, email } = req.params;
  console.log('installApp', packageName, email);

  if (!email || !packageName) {
    return res.status(400).json({
      success: false,
      message: 'Email and package name are required'
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
  const email = req.query.email as string;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required'
    });
  }

  try {
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

// Route Definitions
router.get('/', getAllApps);
router.get('/public', getPublicApps);
router.get('/search', searchApps);
router.get('/installed', getInstalledApps);
router.post('/install/:packageName/:email', installApp);
router.post('/uninstall/:packageName/:email', uninstallApp);
router.get('/install/:packageName/:email', installApp);
router.get('/uninstall/:packageName/:email', uninstallApp);

router.get('/:packageName', getAppByPackage);
router.post('/:packageName/start', startApp);
router.post('/:packageName/stop', stopApp);


// TODO(isaiah): Add supabase auth middleare to routes that require it.
router.get('/version', async (req, res) => {
  res.json({ version: CLOUD_VERSION });
});

export default router;
