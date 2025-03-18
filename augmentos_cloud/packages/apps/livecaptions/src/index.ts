// augmentos_cloud/packages/apps/captions/src/index.ts
import path from 'path';
import { Request, Response } from 'express';
import {
  TranscriptionData,
  TpaSession,
  TpaServer,
  createTranscriptionStream,
} from '@augmentos/sdk';
import { TranscriptProcessor, languageToLocale } from '@augmentos/utils';
import { systemApps } from '@augmentos/config';
import axios from 'axios';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80; // Default http port.
const CLOUD_URL = process.env.CLOUD_URL || "http://localhost:8002";
const PACKAGE_NAME = systemApps.captions.packageName;
const API_KEY = 'test_key'; // In production, this would be securely stored
const MAX_FINAL_TRANSCRIPTS = 5; // Hardcoded to 5 final transcripts

// For debouncing transcripts per session
interface TranscriptDebouncer {
  lastSentTime: number;
  timer: NodeJS.Timeout | null;
}

// Maps to store user-specific data
const userTranscriptProcessors: Map<string, TranscriptProcessor> = new Map();
const userLanguageSettings: Map<string, string> = new Map(); // userId -> language code
const userSessions = new Map<string, Set<string>>(); // userId -> Set<sessionId>

function convertLineWidth(width: string | number, isHanzi: boolean): number {
  if (typeof width === 'number') return width;

  if (!isHanzi) {
  switch (width.toLowerCase()) {
      case 'very narrow': return 21;
      case 'narrow': return 30;
      case 'medium': return 38;
      case 'wide': return 44;
      case 'very wide': return 52;
      default: return 45;
    }
  } else {
    switch (width.toLowerCase()) {
      case 'very narrow': return 7;
      case 'narrow': return 10;
      case 'medium': return 14;
      case 'wide': return 18;
      case 'very wide': return 21;
      default: return 14;
    }
  }
}

/**
 * Session manager to handle transcriptions for a specific session
 */
class TranscriptionManager {
  private debouncer: TranscriptDebouncer = { lastSentTime: 0, timer: null };
  private session: TpaSession;
  private userId: string;
  private sessionId: string;
  private currentLanguage: string | null = null;
  private subscriptionCleanup: (() => void) | null = null;

  constructor(session: TpaSession, sessionId: string, userId: string) {
    this.session = session;
    this.userId = userId;
    this.sessionId = sessionId;

    // Track this session for the user
    if (!userSessions.has(userId)) {
      userSessions.set(userId, new Set());
    }
    userSessions.get(userId)!.add(sessionId);
  }
  
  /**
   * Processes a transcription, applies debouncing, and sends display events.
   */
  handleTranscription(transcriptionData: TranscriptionData): void {
    let transcriptProcessor = userTranscriptProcessors.get(this.userId);
    if (!transcriptProcessor) {
      transcriptProcessor = new TranscriptProcessor(30, 3, MAX_FINAL_TRANSCRIPTS);
      userTranscriptProcessors.set(this.userId, transcriptProcessor);
    }

    const isFinal = transcriptionData.isFinal;
    const newTranscript = transcriptionData.text || "";
    const language = transcriptionData.transcribeLanguage || 'en-US';

    // Log language information from the transcription
    console.log(`[Session ${this.sessionId}]: Received transcription in language: ${language}`);

    console.log("newTranscript", newTranscript);
    // Process the new transcript - this will add it to history if it's final
    transcriptProcessor.processString(newTranscript, isFinal);

    let textToDisplay;

    console.log("transcriptionData", transcriptionData);

    if (isFinal) {
      // For final transcripts, get the combined history of all final transcripts
      const finalTranscriptsHistory = transcriptProcessor.getCombinedTranscriptHistory();
      
      // Process this combined history to format it properly
      textToDisplay = transcriptProcessor.getFormattedTranscriptHistory();
      
      console.log(`[Session ${this.sessionId}]: finalTranscriptCount=${transcriptProcessor.getFinalTranscriptHistory().length}`);
    } else {
      // For non-final, get the combined history and add the current partial transcript
      const combinedTranscriptHistory = transcriptProcessor.getCombinedTranscriptHistory();
      const textToProcess = `${combinedTranscriptHistory} ${newTranscript}`;
      
      // Process this combined text for display
      textToDisplay = transcriptProcessor.getFormattedPartialTranscript(textToProcess);
    }

    console.log(`[Session ${this.sessionId}]: ${textToDisplay}`);
    console.log(`[Session ${this.sessionId}]: isFinal=${isFinal}`);

    this.debounceAndShowTranscript(textToDisplay, isFinal);
  }

  /**
   * Debounces the sending of transcript display events so that non-final transcripts
   * are not sent too frequently. Final transcripts are sent immediately.
   */
  private debounceAndShowTranscript(transcript: string, isFinal: boolean): void {
    const debounceDelay = 400; // in milliseconds

    // Clear any previously scheduled timer
    if (this.debouncer.timer) {
      clearTimeout(this.debouncer.timer);
      this.debouncer.timer = null;
    }

    const now = Date.now();

    if (isFinal) {
      this.showTranscriptsToUser(transcript, isFinal);
      this.debouncer.lastSentTime = now;
      return;
    }

    if (now - this.debouncer.lastSentTime >= debounceDelay) {
      this.showTranscriptsToUser(transcript, isFinal);
      this.debouncer.lastSentTime = now;
    } else {
      this.debouncer.timer = setTimeout(() => {
        this.showTranscriptsToUser(transcript, isFinal);
        this.debouncer.lastSentTime = Date.now();
      }, debounceDelay);
    }
  }

  /**
   * Sends a display event (transcript) to the glasses.
   */
  private showTranscriptsToUser(transcript: string, isFinal: boolean): void {
    console.log(`[Session ${this.sessionId}]: Transcript to show: \n${transcript}`);

    // Use the session's layout interface to show the transcript
    this.session.layouts.showTextWall(
      transcript,
      { 
        durationMs: 20 * 1000 // 20 seconds
      }
    );
  }

  /**
   * Updates the subscription for this session based on language settings
   */
  updateSubscription(): void {
    const language = userLanguageSettings.get(this.userId) || 'en-US';
    
    // If language hasn't changed, no need to update subscription
    if (this.currentLanguage === language) {
      console.log(`[Session ${this.sessionId}]: Language unchanged (${language}), skipping subscription update`);
      return;
    }
    
    console.log(`[Session ${this.sessionId}]: Updating subscription from ${this.currentLanguage || 'none'} to language: ${language}`);
    
    // Clean up previous subscription if it exists
    if (this.subscriptionCleanup) {
      console.log(`[Session ${this.sessionId}]: Cleaning up previous subscription for language: ${this.currentLanguage}`);
      this.subscriptionCleanup();
      this.subscriptionCleanup = null;
    }

    // Create new subscription for the current language
    this.subscriptionCleanup = this.session.events.onTranscriptionForLanguage(language, this.handleTranscription.bind(this));
    
    // Update the current language
    this.currentLanguage = language;
    
    console.log(`[Session ${this.sessionId}]: Successfully subscribed to language: ${language}`);
  }

  /**
   * Refreshes the session display after settings changes
   */
  refreshDisplay(transcript: string): void {
    console.log(`[Session ${this.sessionId}]: Refreshing display`);
    
    // Update subscription for new language settings
    this.updateSubscription();
    
    // Clear display to reset visual state
    this.session.layouts.showTextWall(
      transcript,
      { durationMs: 20 * 1000 }
    );
  }

  /**
   * Cleanup resources when the session ends
   */
  cleanup(): void {
    if (this.debouncer.timer) {
      clearTimeout(this.debouncer.timer);
    }
    
    // Clean up subscription
    if (this.subscriptionCleanup) {
      this.subscriptionCleanup();
      this.subscriptionCleanup = null;
    }
    
    // Remove session from user's sessions map
    if (userSessions.has(this.userId)) {
      const sessions = userSessions.get(this.userId)!;
      sessions.delete(this.sessionId);
      if (sessions.size === 0) {
        userSessions.delete(this.userId);
      }
    }
  }
}

class LiveCaptionsServer extends TpaServer {
  // Map to store transcription managers for each session
  private transcriptionManagers = new Map<string, TranscriptionManager>();

  constructor(options: any) {
    super(options);
    
    // Add routes after calling super constructor
    this.addRoutes();
  }

  /**
   * Add custom routes
   */
  private addRoutes(): void {
    // @ts-ignore - Accessing the Express app instance
    const app = this.app;
    
    if (app) {
      // Settings route
      app.post('/settings', this.settingsHandler.bind(this));
      
      // Health check route
      app.get('/health', this.healthCheckHandler.bind(this));
    } else {
      console.error("Could not access Express app instance");
    }
  }

  /**
   * Handler for settings updates
   */
  private settingsHandler(req: Request, res: Response): void {
    try {
      const { userIdForSettings, settings } = req.body;
      
      this.handleSettingsUpdate(userIdForSettings, settings)
        .then(result => res.json(result))
        .catch(error => {
          console.error('Error in settings endpoint:', error);
          res.status(500).json({ error: 'Internal server error updating settings' });
        });
    } catch (error) {
      console.error('Error in settings endpoint:', error);
      res.status(500).json({ error: 'Internal server error updating settings' });
    }
  }

  /**
   * Handler for health check requests
   */
  private healthCheckHandler(_req: Request, res: Response): void {
    res.json({ status: 'healthy', app: PACKAGE_NAME });
  }

  /**
   * Handles a new session connection
   */
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`\n\n🗣️🗣️🗣️Setting up captions for session ${sessionId}, user ${userId}\n\n`);

    // Fetch and apply settings first
    await this.fetchAndApplySettings(sessionId, userId);
    
    // Create transcription manager for this session
    const transcriptionManager = new TranscriptionManager(session, sessionId, userId);
    this.transcriptionManagers.set(sessionId, transcriptionManager);
    
    // Update subscription based on settings
    transcriptionManager.updateSubscription();
    
    // Handle connection events
    session.events.onConnected((settings) => {
      console.log(`\n[Session ${sessionId}]\n connected to augmentos-cloud\n`);
    });

    // Handle errors
    session.events.onError((error) => {
      console.error(`[User ${userId}] Error:`, error);
    });

    // Handle session cleanup when disconnected
    session.events.onDisconnected(() => {
      console.log(`Session ${sessionId} disconnected`);
      const manager = this.transcriptionManagers.get(sessionId);
      if (manager) {
        manager.cleanup();
        this.transcriptionManagers.delete(sessionId);
      }
    });
  }
  
  /**
   * Fetches settings from the server and sets up the transcript processor
   */
  private async fetchAndApplySettings(sessionId: string, userId: string): Promise<string> {
    try {
      const response = await axios.get(`http://${CLOUD_URL}/tpasettings/user/${PACKAGE_NAME}`, {
        headers: { Authorization: `Bearer ${userId}` }
      });
      const settings = response.data.settings;
      console.log(`Fetched settings for session ${sessionId}:`, settings);
      const lineWidthSetting = settings.find((s: any) => s.key === 'line_width');
      const numberOfLinesSetting = settings.find((s: any) => s.key === 'number_of_lines');
      const transcribeLanguageSetting = settings.find((s: any) => s.key === 'transcribe_language');
      
      // Store the language setting for this user (default to en-US if not specified)
      const language = transcribeLanguageSetting?.value || 'en-US';
      const locale = languageToLocale(language);
      const numberOfLines = numberOfLinesSetting ? Number(numberOfLinesSetting.value) : 3; // fallback default
      
      const isChineseLanguage = locale.startsWith('zh-') || locale.startsWith('ja-');
      
      // Get line width based on language
      const lineWidth = lineWidthSetting ? 
        convertLineWidth(lineWidthSetting.value, isChineseLanguage) : 
        (isChineseLanguage ? 10 : 30); // adjusted fallback defaults

      userLanguageSettings.set(userId, locale);
      console.log(`Language setting for user ${userId}: ${locale}`);

      const transcriptProcessor = new TranscriptProcessor(lineWidth, numberOfLines, MAX_FINAL_TRANSCRIPTS);
      userTranscriptProcessors.set(userId, transcriptProcessor);
      
      return language;
    } catch (err) {
      console.error(`Error fetching settings for session ${sessionId}:`, err);
      // Fallback to default values.
      const transcriptProcessor = new TranscriptProcessor(30, 3, MAX_FINAL_TRANSCRIPTS);
      userTranscriptProcessors.set(userId, transcriptProcessor);
      userLanguageSettings.set(userId, 'en-US'); // Default language
      return 'en-US';
    }
  }

  /**
   * Refreshes all sessions for a user after settings changes.
   * Returns true if at least one session was refreshed.
   */
  refreshUserSessions(userId: string, newUserTranscript: string, languageChanged: boolean = false): boolean {
    const sessionIds = userSessions.get(userId);
    if (!sessionIds || sessionIds.size === 0) {
      console.log(`No active sessions found for user ${userId}`);
      return false;
    }
    
    const currentLanguage = userLanguageSettings.get(userId) || 'en-US';
    
    if (languageChanged) {
      console.log(`📢 Language change detected for user ${userId}. New language: ${currentLanguage}`);
      console.log(`📢 Updating subscriptions for ${sessionIds.size} active sessions to use ${currentLanguage}`);
    } else {
      console.log(`Refreshing ${sessionIds.size} sessions for user ${userId} (same language: ${currentLanguage})`);
    }
    
    console.log(`New user transcript: ${newUserTranscript}`);
    
    // Refresh each session
    for (const sessionId of sessionIds) {
      const manager = this.transcriptionManagers.get(sessionId);
      if (manager) {
        console.log(`Refreshing session ${sessionId} with ${languageChanged ? 'new language subscription' : 'updated settings'}`);
        manager.refreshDisplay(newUserTranscript);
      } else {
        console.log(`Manager for session ${sessionId} not found, removing from tracking`);
        sessionIds.delete(sessionId);
      }
    }
    
    return sessionIds.size > 0;
  }

  /**
   * Handles settings updates for a user
   */
  async handleSettingsUpdate(userId: string, settings: any[]): Promise<any> {
    try {
      console.log('Received settings update for captions:', { userId, settings });
      
      if (!userId || !Array.isArray(settings)) {
        throw new Error('Missing userId or settings array in payload');
      }
      
      const lineWidthSetting = settings.find((s: any) => s.key === 'line_width');
      const numberOfLinesSetting = settings.find((s: any) => s.key === 'number_of_lines');
      const transcribeLanguageSetting = settings.find((s: any) => s.key === 'transcribe_language');

      // Validate settings
      let lineWidth = 30; // default
      
      let numberOfLines = 3; // default
      if (numberOfLinesSetting) {
        numberOfLines = Number(numberOfLinesSetting.value);
        if (isNaN(numberOfLines) || numberOfLines < 1) numberOfLines = 3;
      }
      
      // Get language setting
      const language = languageToLocale(transcribeLanguageSetting?.value) || 'en-US';
      const previousLanguage = userLanguageSettings.get(userId);
      const languageChanged = language !== previousLanguage;

      if (lineWidthSetting) {
        const isChineseLanguage = language.startsWith('zh-') || language.startsWith('ja-');
        lineWidth = typeof lineWidthSetting.value === 'string' ? 
          convertLineWidth(lineWidthSetting.value, isChineseLanguage) : 
          (typeof lineWidthSetting.value === 'number' ? lineWidthSetting.value : 30);
      }

      console.log(`Line width setting: ${lineWidth}`);
      
      if (languageChanged) {
        console.log(`Language changed for user ${userId}: ${previousLanguage} -> ${language}`);
        userLanguageSettings.set(userId, language);
      }
      
      // Create a new processor
      const newProcessor = new TranscriptProcessor(lineWidth, numberOfLines, MAX_FINAL_TRANSCRIPTS);
      
      // Important: Only preserve transcript history if language DIDN'T change
      if (!languageChanged && userTranscriptProcessors.has(userId)) {
        // Get the previous transcript history
        const previousTranscriptHistory = userTranscriptProcessors.get(userId)?.getFinalTranscriptHistory() || [];
        
        // Add each previous transcript to the new processor
        for (const transcript of previousTranscriptHistory) {
          newProcessor.processString(transcript, true);
        }
 
        console.log(`Preserved ${previousTranscriptHistory.length} transcripts after settings change`);
      } else if (languageChanged) {
        console.log(`Cleared transcript history due to language change`);
      }

      // Replace the old processor with the new one
      userTranscriptProcessors.set(userId, newProcessor);

      // Get transcript to display
      const newUserTranscript = newProcessor.getCombinedTranscriptHistory() || "";

      // Refresh active sessions
      const sessionsRefreshed = this.refreshUserSessions(userId, newUserTranscript, languageChanged);

      return { 
        status: 'Settings updated successfully',
        sessionsRefreshed: sessionsRefreshed,
        languageChanged: languageChanged,
        transcriptsPreserved: !languageChanged
      };
    } catch (error) {
      console.error('Error updating settings:', error);
      throw error;
    }
  }
}

// Create and start the server
const server = new LiveCaptionsServer({
  packageName: PACKAGE_NAME,
  apiKey: API_KEY,
  port: PORT,
  augmentOSWebsocketUrl: `ws://${CLOUD_URL}/tpa-ws`,
  webhookPath: '/webhook',
  publicDir: path.join(__dirname, './public')
});

server.start()
  .then(() => {
    console.log(`${PACKAGE_NAME} server running`);
  })
  .catch(error => {
    console.error('Failed to start server:', error);
  });