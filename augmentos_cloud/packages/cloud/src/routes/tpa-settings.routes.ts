// backend/src/routes/tpa-settings.ts
import express from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { systemApps } from '@augmentos/config';
import { User } from '../models/user.model';

export const AUGMENTOS_AUTH_JWT_SECRET = process.env.AUGMENTOS_AUTH_JWT_SECRET || "";
import appService from '../services/core/app.service';

const router = express.Router();

// GET /tpasettings/:tpaName
// Returns the TPA config with each non-group setting having a "selected" property
// that comes from the user's stored settings (or defaultValue if not present).
router.get('/:tpaName', async (req, res) => {
  console.log('Received request for TPA settings');

  // Extract TPA name from URL (use third segment if dot-separated).
  const parts = req.params.tpaName.split('.');
  const tpaName = parts.length > 2 ? parts[2] : req.params.tpaName;
  if (!tpaName) {
    return res.status(400).json({ error: 'TPA name missing in request' });
  }

  // Validate the Authorization header.
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }
  const authParts = authHeader.split(' ');
  if (authParts.length !== 2 || authParts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid Authorization header format' });
  }
  const coreToken = authParts[1];

  try {
    // Verify token.
    const decoded = jwt.verify(coreToken, AUGMENTOS_AUTH_JWT_SECRET) as jwt.JwtPayload;
    const userId = decoded.email;
    if (!userId) {
      return res.status(400).json({ error: 'User ID missing in token' });
    }

    // Read TPA configuration file.
    // const configFilePath = path.join(__dirname, '..', '..', '..', 'apps', tpaName, 'tpa_config.json');
    let tpaConfig;
    try {
      // const rawData = fs.readFileSync(configFilePath, 'utf8');
      // tpaConfig = JSON.parse(rawData);
      // find the app, then call it with it's port. i.e: http://localhost:8017/tpa_config.json
      const _tpa = await appService.getApp(req.params.tpaName);
      const host = Object.values(systemApps).find(app => app.packageName === req.params.tpaName)?.host;
      
      if (!host || !_tpa) {
        throw new Error('Port / TPA not found for app ' + req.params.tpaName); // throw an error if the port is not found.
      }
      const _tpaConfig = (await axios.get(`http://${host}/tpa_config.json`)).data; 
      tpaConfig = _tpaConfig;

    } catch (err) {
      const _tpa = await appService.getApp(req.params.tpaName);
      if (_tpa) {
        tpaConfig = {
          name: _tpa.name || req.params.tpaName,
          description: _tpa.description || '',
          version: "1.0.0",
          settings: []
        }
      } else {
        console.error('Error reading TPA config file:', err);
        return res.status(500).json({ error: 'Error reading TPA config file' });
      }
      // If the config file doesn't exist or is invalid, just return 
      // console.error('Error reading TPA config file:', err);
      // return res.status(500).json({ error: 'Error reading TPA config file' });
    }

    // Find or create the user.
    const user = await User.findOrCreateUser(userId);

    // Retrieve stored settings for this TPA.
    let storedSettings = user.getAppSettings(tpaName);
    if (!storedSettings) {
      // Build default settings from config (ignoring groups)
      const defaultSettings = tpaConfig.settings
        .filter((setting: any) => setting.type !== 'group')
        .map((setting: any) => ({
          key: setting.key,
          value: setting.defaultValue,       // initially, use defaultValue
          defaultValue: setting.defaultValue,
          type: setting.type,
          label: setting.label,
          options: setting.options || []
        }));
      await user.updateAppSettings(tpaName, defaultSettings);
      storedSettings = defaultSettings;
    }

    // Merge config settings with stored values.
    const mergedSettings = tpaConfig.settings.map((setting: any) => {
      if (setting.type === 'group') return setting;
      const stored = storedSettings?.find((s: any) => s.key === setting.key);
      return {
        ...setting,
        selected: stored && stored.value !== undefined ? stored.value : setting.defaultValue
      };
    });

    // console.log('Merged settings:', mergedSettings);

    return res.json({
      success: true,
      userId,
      name: tpaConfig.name,
      description: tpaConfig.description,
      version: tpaConfig.version,
      settings: mergedSettings,
    });
  } catch (error) {
    console.error('Error processing TPA settings request:', error);
    return res.status(401).json({ error: 'Invalid core token or error processing request' });
  }
});

// GET /tpasettings/user/:tpaName
router.get('/user/:tpaName', async (req, res) => {
  console.log('Received request for user-specific TPA settings' + JSON.stringify(req.params));

  // Extract userId from the Authorization header (assumes header is "Bearer <userId>")
  const authHeader = req.headers.authorization;
  console.log('Received request for user-specific TPA settings' + JSON.stringify(authHeader));

  if (!authHeader) {
    return res.status(400).json({ error: 'User ID missing in Authorization header' });
  }
  const userId = authHeader.split(' ')[1]; // directly use the token as the userId

  console.log('Received request for user-specific TPA settings 121223213' + JSON.stringify(userId));
  const parts = req.params.tpaName.split('.');
  const tpaName = parts.length > 2 ? parts[2] : req.params.tpaName;
  try {
    // Find or create the user.
    const user = await User.findOrCreateUser(userId);

    // Retrieve stored settings for this TPA.
    let storedSettings = user.getAppSettings(tpaName);

    if (!storedSettings) {
      // If settings are missing, load default settings from the TPA config file.
      const configFilePath = path.join(__dirname, '..', '..', '..', 'apps', tpaName, 'tpa_config.json');
      let tpaConfig;
      try {
        const rawData = fs.readFileSync(configFilePath, 'utf8');
        tpaConfig = JSON.parse(rawData);
      } catch (err) {
        console.error('Error reading TPA config file:', err);
        return res.status(500).json({ error: 'Error reading TPA config file' });
      }

      // Build default settings (ignoring groups).
      const defaultSettings = tpaConfig.settings
        .filter((setting: any) => setting.type !== 'group')
        .map((setting: any) => ({
          key: setting.key,
          value: setting.defaultValue,
          defaultValue: setting.defaultValue,
          type: setting.type,
          label: setting.label,
          options: setting.options || []
        }));
      await user.updateAppSettings(req.params.tpaName, defaultSettings);
      storedSettings = defaultSettings;
    }

    return res.json({ success: true, settings: storedSettings });
  } catch (error) {
    console.error('Error processing user-specific TPA settings request:', error);
    return res.status(401).json({ error: 'Error processing request' });
  }
});

// POST /tpasettings/:tpaName
// Receives an update payload containing all settings with new values and updates the database.
// backend/src/routes/tpa-settings.ts
router.post('/:tpaName', async (req, res) => {
  console.log('Received update for TPA settings');

  // Extract TPA name.
  const parts = req.params.tpaName.split('.');
  const tpaName = parts.length > 2 ? parts[2] : req.params.tpaName;
  if (!tpaName) {
    return res.status(400).json({ error: 'TPA name missing in request' });
  }

  // Validate Authorization header.
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }
  const authParts = authHeader.split(' ');
  if (authParts.length !== 2 || authParts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid Authorization header format' });
  }
  const coreToken = authParts[1];

  try {
    // Verify token.
    const decoded = jwt.verify(coreToken, AUGMENTOS_AUTH_JWT_SECRET) as jwt.JwtPayload;
    const userId = decoded.email;
    if (!userId) {
      return res.status(400).json({ error: 'User ID missing in token' });
    }

    const updatedPayload = req.body;
    if (!Array.isArray(updatedPayload)) {
      return res.status(400).json({ error: 'Invalid update payload format' });
    }

    // Find or create the user.
    const user = await User.findOrCreateUser(userId);

    // Update the settings for this TPA from scratch.
    // We assume that the payload contains the complete set of settings (each with key and value).
    await user.updateAppSettings(tpaName, updatedPayload);

    console.log(`Updated settings for app "${tpaName}" for user ${userId}`);

    const matchingApp = Object.values(systemApps).find(app =>
      app.packageName.endsWith(tpaName)
    );

    if (matchingApp) {
      const appEndpoint = `http://${matchingApp.host}/settings`;
      try {
        // Add userIdForSettings to the payload that the captions app expects
        const response = await axios.post(appEndpoint, {
          userIdForSettings: userId,
          settings: updatedPayload
        });
        console.log(`Called app endpoint at ${appEndpoint} with response:`, response.data);
      } catch (err) {
        console.error(`Error calling app endpoint at ${appEndpoint}:`, err);
      }
    }

    return res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error processing update for TPA settings:', error);
    return res.status(401).json({ error: 'Invalid core token or error processing update' });
  }
});

export default router;
