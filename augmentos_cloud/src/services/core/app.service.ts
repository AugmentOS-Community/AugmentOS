/**
 * @fileoverview Service for managing TPAs (Third Party Applications).
 * Handles app lifecycle, authentication, and webhook interactions.
 * 
 * Currently uses in-memory storage with hardcoded system TPAs.
 * Design decision: Separate system TPAs from user-created TPAs
 * to maintain core functionality regardless of database state.
 */

import { AppI, AppState } from '../../types';
import axios, { AxiosError } from 'axios';

/**
 * System TPAs that are always available.
 * These are core applications provided by the platform.
 * @Param developerId - leaving this undefined indicates a system app.
 */
const SYSTEM_TPAS: AppI[] = [
  {
    packageName: "org.mentra.captions",
    name: "Captions",
    description: "Constant Live captions from your device microphone",
    webhookURL: "http://localhost:7010/webhook",
    logoURL: "http://localhost:7010/logo.png",
  },
  {
    packageName: "org.mentra.flash",
    name: "Flash",
    description: "Welcome to the future",
    webhookURL: "http://localhost:7011/webhook",
    logoURL: "http://localhost:7011/logo.png",
  }
];

/**
 * Interface for webhook payloads sent to TPAs.
 */
interface WebhookPayload {
  type: 'session_request' | 'app_update' | 'system_event';
  sessionId?: string;
  userId?: string;
  timestamp: string;
  data?: any;
}

/**
 * Interface defining the public API of the app service.
 */
export interface IAppService {
  getAllApps(): Promise<AppI[]>;
  getApp(packageName: string): Promise<AppI | undefined>;
  createApp(app: AppI): Promise<AppI>;
  triggerWebhook(url: string, payload: WebhookPayload): Promise<void>;
  validateApiKey(packageName: string, apiKey: string): Promise<boolean>;
  getAppState(packageName: string, userId: string): Promise<AppState>;
}

/**
 * Implementation of the app management service.
 * Design decisions:
 * 1. Separate system and user TPAs
 * 2. Immutable system TPA list
 * 3. Webhook retry logic
 * 4. API key validation
 */
export class AppService implements IAppService {
  // In-memory storage for user-created TPAs
  private userTpas: AppI[] = [];

  // In-memory cache for app states
  // Map of userId to Map of packageName to AppState
  private appStates = new Map<string, Map<string, AppState>>();

  /**
   * Gets all available TPAs, both system and user-created.
   * @returns Promise resolving to array of all apps
   */
  async getAllApps(): Promise<AppI[]> {
    return [...SYSTEM_TPAS, ...this.userTpas];
  }

  /**
   * Gets a specific TPA by ID.
   * @param packageName - TPA identifier
   * @returns Promise resolving to app if found
   */
  async getApp(packageName: string): Promise<AppI | undefined> {
    return [...SYSTEM_TPAS, ...this.userTpas].find(app => app.packageName === packageName);
  }

  /**
   * Creates a new TPA.
   * @param app - TPA to create
   * @returns Promise resolving to created app
   * @throws If packageName already exists
   */
  async createApp(app: AppI): Promise<AppI> {
    const existingApp = await this.getApp(app.packageName);
    if (existingApp) {
      throw new Error(`App with ID ${app.packageName} already exists`);
    }

    // Validate required fields
    this.validateAppFields(app);

    this.userTpas.push(app);
    return app;
  }

  /**
   * Triggers a webhook for a TPA.
   * @param url - Webhook URL
   * @param payload - Data to send
   * @throws If webhook fails after retries
   */
  async triggerWebhook(url: string, payload: WebhookPayload): Promise<void> {
    const maxRetries = 2;
    const baseDelay = 1000; // 1 second

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await axios.post(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            // Add signature/authentication headers here when implemented
          },
          timeout: 5000 // 5 second timeout
        });
        return;
      } catch (error : unknown) {
        if (attempt === maxRetries - 1) {
            // check if error is an AxiosError.
            if (axios.isAxiosError(error)) {
                // log the error message
                console.error(`Webhook failed after ${maxRetries} attempts: ${(error as AxiosError).message}`);
            }
          throw new Error(`Webhook failed after ${maxRetries} attempts: ${(error as AxiosError).message || 'Unknown error'}`);
        }
        // Exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, baseDelay * Math.pow(2, attempt))
        );
      }
    }
  }

  /**
   * Validates a TPA's API key.
   * @param packageName - TPA identifier
   * @param apiKey - API key to validate
   * @returns Promise resolving to validation result
   */
  async validateApiKey(packageName: string, apiKey: string): Promise<boolean> {
    const app = await this.getApp(packageName);
    if (!app) return false;

    // TODO: Implement proper API key validation
    // For now, accept all keys for development
    return true;
  }

  /**
   * Gets the current state of a TPA for a user.
   * @param packageName - TPA identifier
   * @param userId - User identifier
   * @returns Promise resolving to app state
   */
  async getAppState(packageName: string, userId: string): Promise<AppState> {
    const userStates = this.appStates.get(userId) || new Map<string, AppState>();
    
    // Return existing state or default to not_installed
    return userStates.get(packageName) || 'not_installed';
  }

  /**
   * Updates the state of a TPA for a user.
   * @param packageName - TPA identifier
   * @param userId - User identifier
   * @param state - New state
   * @private
   */
  private async updateAppState(packageName: string, userId: string, state: AppState): Promise<void> {
    const userStates = this.appStates.get(userId) || new Map<string, AppState>();
    userStates.set(packageName, state);
    this.appStates.set(userId, userStates);

    // Log state change
    console.log(`App ${packageName} state changed to ${state} for user ${userId}`);
  }

  /**
   * Validates required fields for a new TPA.
   * @param app - TPA to validate
   * @throws If validation fails
   * @private
   */
  private validateAppFields(app: AppI): void {
    const requiredFields: (keyof AppI)[] = [
      'packageName',
      'name',
      'webhookURL',
      'logoURL'
    ];

    for (const field of requiredFields) {
      if (!app[field]) {
        throw new Error(`Missing required field: ${String(field)}`);
      }
    }

    // Validate packageName format
    if (!app.packageName.match(/^[a-z0-9.-]+$/)) {
      throw new Error('Invalid packageName format. Use lowercase letters, numbers, dots, and hyphens only.');
    }

    // Validate URLs
    try {
      new URL(app.webhookURL);
      new URL(app.logoURL);
    } catch {
      throw new Error('Invalid webhook or logo URL');
    }
  }
}

// Create singleton instance
export const appService = new AppService();
console.log('✅ App Service');

export default appService;