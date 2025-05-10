import express from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';
import { logger } from '@augmentos/utils';

export const AUGMENTOS_AUTH_JWT_SECRET = process.env.AUGMENTOS_AUTH_JWT_SECRET || "";

const router = express.Router();

// GET /augmentos-settings
// Returns the user's AugmentOS settings
router.get('/', async (req, res) => {
  logger.info('Received request for AugmentOS settings');

  // Validate the Authorization header
  const authHeader = req.headers.authorization;
  console.log('Request headers:', req.headers);
  console.log('Authorization header:', authHeader);
  
  if (!authHeader) {
    console.log('No authorization header found');
    return res.status(401).json({ error: 'No authorization header' });
  }

  const token = authHeader.split(' ')[1];
  console.log('Extracted token:', token);
  
  if (!token) {
    console.log('No token found in authorization header');
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, AUGMENTOS_AUTH_JWT_SECRET) as jwt.JwtPayload;
    const userId = decoded.email;
    if (!userId) {
      return res.status(400).json({ error: 'User ID missing in token' });
    }

    // Find or create the user
    const user = await User.findOrCreateUser(userId);

    // Get the settings
    const settings = user.getAugmentosSettings();
    console.log("settings", settings)

    return res.json({
      success: true,
      userId,
      settings
    });
  } catch (error) {
    logger.error('Error processing AugmentOS settings request:', error);
    return res.status(401).json({ error: 'Invalid core token or error processing request' });
  }
});

// POST /augmentos-settings
// Updates the user's AugmentOS settings
router.post('/', async (req, res) => {
  logger.info('Received request to update AugmentOS settings');

  // Validate the Authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    logger.warn('No authorization header found');
    return res.status(401).json({ error: 'No authorization header' });
  }

  const token = authHeader.split(' ')[1];
  logger.debug('Extracted token from authorization header');
  
  if (!token) {
    logger.warn('No token found in authorization header');
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, AUGMENTOS_AUTH_JWT_SECRET) as jwt.JwtPayload;
    const userId = decoded.email;
    if (!userId) {
      logger.warn('User ID missing in token');
      return res.status(400).json({ error: 'User ID missing in token' });
    }

    // Validate request body
    const settings = req.body;
    logger.info('Received settings update request:', { userId, settings });
    
    if (!settings || typeof settings !== 'object') {
      logger.warn('Invalid settings payload received');
      return res.status(400).json({ error: 'Invalid settings payload' });
    }

    // Find or create the user
    const user = await User.findOrCreateUser(userId);
    logger.info(`Found/created user: ${userId}`);

    // Get current settings before update
    const currentSettings = JSON.parse(JSON.stringify(user.augmentosSettings));
    logger.info('Current settings before update:', currentSettings);

    // Check if anything actually changed
    const hasChanges = Object.entries(settings).some(([key, value]) => {
      // Also check for type differences (e.g., string "20" vs number 20)
      return currentSettings[key] !== value || 
             (typeof currentSettings[key] !== typeof value && 
              currentSettings[key] != value); // loose comparison to catch numeric/string differences
    });
    
    if (!hasChanges) {
      logger.info('No changes detected in settings - values are the same');
    } else {
      logger.info('Changes detected in settings:', {
        changedFields: Object.entries(settings)
          .filter(([key, value]) => {
            return currentSettings[key] !== value || 
                  (typeof currentSettings[key] !== typeof value && 
                   currentSettings[key] != value);
          })
          .map(([key, value]) => ({ 
            key, 
            from: `${currentSettings[key]} (${typeof currentSettings[key]})`, 
            to: `${value} (${typeof value})` 
          }))
      });
    }

    // Update the settings
    await user.updateAugmentosSettings(settings);
    logger.info('Back in the route handler after updateAugmentosSettings');

    // Verify update worked in the current user object
    logger.info('Current user object after update:', {
      augmentosSettings: JSON.parse(JSON.stringify(user.augmentosSettings))
    });

    // Fetch updated user to verify changes
    const updatedUser = await User.findOne({ email: userId });
    logger.info('Fresh user retrieval after update:', {
      email: userId,
      found: !!updatedUser
    });
    const updatedSettings = updatedUser?.augmentosSettings 
      ? JSON.parse(JSON.stringify(updatedUser.augmentosSettings))
      : null;
    
    logger.info('Settings after update:', updatedSettings);

    return res.json({ 
      success: true, 
      message: hasChanges ? 'Settings updated successfully' : 'No changes needed',
      previousSettings: currentSettings,
      newSettings: updatedSettings,
      changed: hasChanges
    });
  } catch (error) {
    logger.error('Error updating AugmentOS settings:', error);
    return res.status(401).json({ error: 'Invalid core token or error processing update' });
  }
});

export default router;
