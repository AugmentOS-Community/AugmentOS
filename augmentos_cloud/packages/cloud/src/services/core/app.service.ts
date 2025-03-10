/**
 * @fileoverview Service for managing TPAs (Third Party Applications).
 * Handles app lifecycle, authentication, and webhook interactions.
 * 
 * Currently uses in-memory storage with hardcoded system TPAs.
 * Design decision: Separate system TPAs from user-created TPAs
 * to maintain core functionality regardless of database state.
 */

import { AppI, StopWebhookRequest, TpaType, WebhookResponse, AppState } from '@augmentos/sdk';
import axios, { AxiosError } from 'axios';
import { systemApps } from '@augmentos/config';
import App from '../../models/app.model';

const APPSTORE_ENABLED = process.env.NODE_ENV === 'staging';

/**
 * System TPAs that are always available.
 * These are core applications provided by the platform.
 * @Param developerId - leaving this undefined indicates a system app.
 */
export const LOCAL_APPS: AppI[] = [
  {
    packageName: systemApps.captions.packageName,
    name: systemApps.captions.name,
    tpaType: TpaType.STANDARD,
    webhookURL: `http://${systemApps.captions.host}/webhook`,
    logoURL: `https://cloud.augmentos.org/${systemApps.captions.packageName}.png`,
    description: systemApps.captions.description
  },
  {
    packageName: systemApps.notify.packageName,
    name: systemApps.notify.name,
    tpaType: TpaType.BACKGROUND,
    webhookURL: `http://${systemApps.notify.host}/webhook`,
    logoURL: `https://cloud.augmentos.org/${systemApps.notify.packageName}.png`,
    description: systemApps.notify.description,

  },
  {
    packageName: systemApps.mira.packageName,
    name: systemApps.mira.name,
    tpaType: TpaType.BACKGROUND,
    webhookURL: `http://${systemApps.mira.host}/webhook`,
    logoURL: `https://cloud.augmentos.org/${systemApps.mira.packageName}.png`,
    description: systemApps.mira.description,
  },
  {
    packageName: systemApps.merge.packageName,
    name: systemApps.merge.name,
    tpaType: TpaType.BACKGROUND,
    webhookURL: `http://${systemApps.merge.host}/webhook`,
    logoURL: `https://cloud.augmentos.org/${systemApps.merge.packageName}.png`,
    description: systemApps.merge.description,
  },
  {
    packageName: systemApps.liveTranslation.packageName,
    name: systemApps.liveTranslation.name,
    tpaType: TpaType.STANDARD,
    webhookURL: `http://${systemApps.liveTranslation.host}/webhook`,
    logoURL: `https://cloud.augmentos.org/${systemApps.liveTranslation.packageName}.png`,
    description: systemApps.liveTranslation.description,
  }
];

// if we are not in production, add the dashboard to the app 
if (process.env.NODE_ENV !== 'production') {
  LOCAL_APPS.push({
    packageName: systemApps.flash.packageName,
    name: systemApps.flash.name,
    description: systemApps.flash.description,
    tpaType: TpaType.BACKGROUND,
    webhookURL: `http://${systemApps.flash.host}/webhook`,
    logoURL: `https://cloud.augmentos.org/${systemApps.flash.packageName}.png`,
  });
}

/**
 * System TPAs that are always available.
 * These are core applications provided by the platform.
 * @Param developerId - leaving this undefined indicates a system app.
 */
export const SYSTEM_TPAS: AppI[] = [
  {
    packageName: systemApps.dashboard.packageName,
    name: systemApps.dashboard.name,
    tpaType: TpaType.BACKGROUND,
    description: "The time, The news, The weather, The notifications, The everything. 😎🌍🚀",
    webhookURL: `http:/${systemApps.dashboard.host}/webhook`,
    logoURL: `https://cloud.augmentos.org/${systemApps.dashboard.packageName}.png`,
  },
];

// Map systemApps to SYSTEM_TPAS.
// export const SYSTEM_TPAS: AppI[] = Object.keys(systemApps).map((key) => {
//   const app = systemApps[key as keyof typeof systemApps];

//   return {
//     packageName: systemApps[key as keyof typeof systemApps].packageName,
//     name: key,
//     description: key, // TODO(isaiah): Add descriptions
//     webhookURL: `http://localhost:${app.port}/webhook`,
//     logoURL: `https://cloud.augmentos.org/${app.packageName}.png`,
//   }
// });

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
 * Implementation of the app management service.
 * Design decisions:
 * 1. Separate system and user TPAs
 * 2. Immutable system TPA list
 * 3. Webhook retry logic
 * 4. API key validation
 */
export class AppService {
  // In-memory cache for app states
  // Map of userId to Map of packageName to AppState
  private appStates = new Map<string, Map<string, AppState>>();

  /**
   * Gets all available TPAs, both system and user-created.
   * @returns Promise resolving to array of all apps
   */
  async getAllApps(): Promise<AppI[]> {
    let appstoreApps: AppI[] = [];
    if (APPSTORE_ENABLED) {
      appstoreApps = await App.find() as AppI[];
    }
    const allApps = [...LOCAL_APPS, ...appstoreApps];
    return allApps;
  }

  // /**
  //  * Gets available system TPAs.
  //  * @returns array of system apps.
  //  */
  getSystemApps(): AppI[] {
    return SYSTEM_TPAS;
  }

  /**
   * Gets a specific TPA by ID.
   * @param packageName - TPA identifier
   * @returns Promise resolving to app if found
   */
  async getApp(packageName: string): Promise<AppI | undefined> {
    // return [...SYSTEM_TPAS, ...APP_STORE].find(app => app.packageName === packageName);
    let app: AppI | undefined = [...SYSTEM_TPAS, ...LOCAL_APPS].find(app => app.packageName === packageName);
    // if we can't find the app, try checking the appstore via the App Mongodb model.

    if (APPSTORE_ENABLED) {
      if (!app) {
        app = await App.findOne({
          packageName: packageName
        }) as AppI;
      }
    }

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
          },
          timeout: 10000 // Increase timeout to 10 seconds
        });
        return;
      } catch (error: unknown) {
        if (attempt === maxRetries - 1) {
          if (axios.isAxiosError(error)) {
            console.error(`Webhook failed: ${error}`);
            console.error(`URL: ${url}`);
            console.error(`Response: ${error.response?.data}`);
            console.error(`Status: ${error.response?.status}`);
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
 * Triggers the stop webhook for a TPA app session.
 * @param url - Stop Webhook URL
 * @param payload - Data to send
 * @throws If stop webhook fails
 */
  async triggerStopWebhook(webhookUrl: string, payload: StopWebhookRequest): Promise<{
    status: number;
    data: WebhookResponse;
  }> {
    const response = await axios.post(`${webhookUrl}/stop`, payload);
    return {
      status: response.status,
      data: response.data
    };
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
    return userStates.get(packageName) || AppState.NOT_INSTALLED;
  }
}

// Create singleton instance
export const appService = new AppService();
console.log('✅ App Service');

export default appService;