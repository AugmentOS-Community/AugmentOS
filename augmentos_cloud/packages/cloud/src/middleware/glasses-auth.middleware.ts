/**
 * Middleware for authenticating glasses API requests
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '@augmentos/utils';
import sessionService from '../services/core/session.service';

/**
 * Validates the glasses authentication token
 */
export const validateGlassesAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get token from header
    let token = '';
    
    // First try to get from header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } 
    
    // If not in header, try to get from request body
    if (!token && req.body && req.body.coreToken) {
      token = req.body.coreToken;
    }
    
    // If still no token, reject
    if (!token) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    // For now, we'll just check if the token is non-empty
    // In a production implementation, you would validate the token properly
    // Attach the token to the request for use in the route handler
    (req as any).coreToken = token;
    
    // For now, we're bypassing actual token validation
    // In production, you would implement proper validation
    
    // Token is "valid", proceed
    next();
  } catch (error) {
    logger.error('Error validating glasses auth token:', error);
    return res.status(500).json({ error: 'Server error during authentication' });
  }
};