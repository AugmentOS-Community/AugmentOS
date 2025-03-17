// middleware/admin-auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '@augmentos/utils';

const AUGMENTOS_AUTH_JWT_SECRET = process.env.AUGMENTOS_AUTH_JWT_SECRET || "";

/**
 * Middleware to validate admin access based on email
 * Gets admin emails from environment variable ADMIN_EMAILS (comma-separated)
 */
export const validateAdminEmail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Admin auth - Missing or invalid Authorization header');
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token || token === 'null' || token === 'undefined') {
      logger.warn('Admin auth - Empty or invalid token value');
      return res.status(401).json({ error: 'Empty or invalid token value' });
    }
    
    // Verify token
    let userData;
    try {
      userData = jwt.verify(token, AUGMENTOS_AUTH_JWT_SECRET);
    } catch (jwtError) {
      logger.error('Admin auth - JWT verification failed:', jwtError);
      return res.status(401).json({ 
        error: 'JWT verification failed', 
        message: jwtError.message 
      });
    }
    
    if (!userData || !(userData as jwt.JwtPayload).email) {
      logger.warn('Admin auth - Missing email in token payload');
      return res.status(401).json({ error: 'Invalid token data - missing email' });
    }

    const email = ((userData as jwt.JwtPayload).email as string).toLowerCase();
    logger.info(`Admin auth - Checking admin status for email: ${email}`);
    
    // Check if user's email is in the ADMIN_EMAILS environment variable
    const adminEmails = process.env.ADMIN_EMAILS || '';
    const emailList = adminEmails.split(',').map(e => e.trim().toLowerCase());
    
    if (!emailList.includes(email)) {
      logger.warn(`Admin auth - User ${email} is not an admin`);
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    logger.info(`Admin auth - User ${email} authenticated as admin`);
    
    // Add email to request body for reference
    req.body.userEmail = email;

    next();
  } catch (error) {
    logger.error('Admin authentication error:', error);
    return res.status(401).json({ 
      error: 'Authentication failed', 
      message: error.message || 'Unknown error' 
    });
  }
};

// Legacy functions - maintained for backward compatibility
export const validateAdminToken = validateAdminEmail;
export const validateSuperAdminToken = validateAdminEmail;