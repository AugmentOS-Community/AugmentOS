// src/services/core/token.service.ts
import crypto from 'crypto';
import { TempToken, ITempToken } from '../../models/temp-token.model';
import { logger as rootLogger } from "../logging";
import { SignJWT, importPKCS8 } from 'jose';
const logger = rootLogger.child({ service: 'temp-token.service' });

// Environment variable for JWT signing
export const TPA_AUTH_JWT_PRIVATE_KEY = process.env.TPA_AUTH_JWT_PRIVATE_KEY || null;
if (!TPA_AUTH_JWT_PRIVATE_KEY) {
  console.warn('[token.service] TPA_AUTH_JWT_PRIVATE_KEY is not set');
}

export class TokenService {
  /**
   * Generates a secure temporary token and stores it.
   * @param userId The user ID associated with the token.
   * @param packageName The package name of the TPA this token is intended for.
   * @returns The generated temporary token string.
   */
  async generateTemporaryToken(userId: string, packageName: string): Promise<string> {
    const logger = rootLogger.child({ service: 'temp-token.service', userId, packageName });
    const token = crypto.randomBytes(32).toString('hex');

    const tempTokenDoc = new TempToken({
      token,
      userId,
      packageName,
      createdAt: new Date(), // Explicitly set createdAt for clarity, though default works
      // Note: MongoDB TTL index handles expiration based on 'createdAt' field
    });

    try {
      await tempTokenDoc.save();
      logger.info(`Generated temporary token for user ${userId} and package ${packageName}`);
      return token;
    } catch (error) {
      logger.error(`Error saving temporary token for user ${userId}, package ${packageName}:`, error);
      throw new Error('Failed to generate temporary token');
    }
  }

  /**
   * Exchanges a temporary token for the associated user ID, validating the requesting TPA.
   * @param tempToken The temporary token string.
   * @param requestingPackageName The package name of the TPA making the exchange request.
   * @returns An object containing the userId if the token is valid and unused, otherwise null.
   */
  async exchangeTemporaryToken(tempToken: string, requestingPackageName: string): Promise<{ userId: string } | null> {
    const logger = rootLogger.child({ service: 'temp-token.service', requestingPackageName, tempToken });
    try {
      const tokenDoc = await TempToken.findOne({ token: tempToken });

      if (!tokenDoc) {
        logger.warn(`Temporary token not found: ${tempToken}`);
        return null; // Token doesn't exist
      }

      if (tokenDoc.used) {
        logger.warn(`Temporary token already used: ${tempToken}`);
        return null; // Token already used
      }

      // Check if the token has expired (TTL index should handle this, but double-check)
      const now = new Date();
      const createdAt = new Date(tokenDoc.createdAt);
      if (now.getTime() - createdAt.getTime() > 60000) { // 60 seconds TTL
        logger.warn(`Temporary token expired: ${tempToken}`);
        // Optionally delete the expired token here if TTL isn't reliable enough
        // await TempToken.deleteOne({ token: tempToken });
        return null;
      }

      // **Crucial Security Check:** Verify the requesting TPA matches the one the token was issued for.
      if (tokenDoc.packageName !== requestingPackageName) {
        logger.error(`Token mismatch: Token for ${tokenDoc.packageName} used by ${requestingPackageName}`);
        return null; // Token not intended for this application
      }

      // Mark the token as used to prevent replay attacks
      tokenDoc.used = true;
      await tokenDoc.save();

      logger.info(`Successfully exchanged temporary token for user ${tokenDoc.userId}, requested by ${requestingPackageName}`);
      return { userId: tokenDoc.userId };

    } catch (error) {
      logger.error(`Error exchanging temporary token ${tempToken}:`, { error, requestingPackageName, tempToken });
      return null; // Return null on any error during exchange
    }
  }

  /**
   * Issue a signed JWT token for the AugmentOS user to be used in TPA webview.
   *
   * @param aosUserId - The AugmentOS user ID to include in the token
   * @returns A signed JWT token containing user ID and frontend token
   */
  async issueUserToken(aosUserId: string): Promise<string> {
    // Algorithm used for signing
    const alg = 'EdDSA';

    try {
      // Import the private key from the environment
      if (!TPA_AUTH_JWT_PRIVATE_KEY) {
        throw new Error('[token.service] TPA_AUTH_JWT_PRIVATE_KEY is not set');
      }
      const privateKey = await importPKCS8(TPA_AUTH_JWT_PRIVATE_KEY, alg);

      // Generate a frontend token as a secure hash of the user ID and a secret
      const frontendTokenSecret = process.env.FRONTEND_TOKEN_SECRET || 'default-frontend-secret';
      const frontendToken = crypto
        .createHash('sha256')
        .update(aosUserId + frontendTokenSecret)
        .digest('hex');

      // Create and sign the JWT token with both user ID and frontend token
      const token = await new SignJWT({
        sub: aosUserId,
        frontendToken: `${aosUserId}:${frontendToken}`
      })
        .setProtectedHeader({ alg, kid: 'v1' })
        .setIssuer('https://prod.augmentos.cloud')
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(privateKey);
      return token;
    } catch (error) {
      logger.error({ error, aosUserId }, '[token.service] Failed to issue user token');
      throw new Error('[token.service] Failed to generate signed user token');
    }
  }
}

export const tokenService = new TokenService();