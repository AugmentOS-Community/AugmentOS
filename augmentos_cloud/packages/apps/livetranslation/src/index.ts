// src/index.ts
import express from 'express';
import WebSocket from 'ws';
import path from 'path';
import axios from 'axios';
import {
  TpaConnectionInit,
  DataStream,
  DisplayRequest,
  TpaSubscriptionUpdate,
  TpaToCloudMessageType,
  StreamType,
  CloudToGlassesMessageType,
  CloudToTpaMessageType,
  ViewType,
  LayoutType,
  createTranslationStream,    // New helper for language-specific translation streams
  ExtendedStreamType
} from '@augmentos/sdk';
import { TranscriptProcessor, languageToLocale } from '@augmentos/utils';
import { systemApps } from '@augmentos/config';

// const PORT = systemApps.liveTranslation.port;
const app = express();
const PORT =  process.env.PORT ? parseInt(process.env.PORT) : 80; // Default http port.
const CLOUD_URL = process.env.CLOUD_URL || "http://localhost:8002"; 
const PACKAGE_NAME = systemApps.liveTranslation.packageName;
const API_KEY = 'test_key'; // In production, store this securely

// Maps to track state
const userFinalTranscripts: Map<string, string> = new Map();
const userTranscriptProcessors: Map<string, TranscriptProcessor> = new Map();
const userSessions = new Map<string, Set<string>>(); // userId -> Set<sessionId>

// For language settings, we now have two maps: one for source language and one for target language.
const usertranscribeLanguageSettings: Map<string, string> = new Map(); // userId -> source language (e.g., "en-US")
const userTranslateLanguageSettings: Map<string, string> = new Map(); // userId -> target language (e.g., "es-ES")

// For debouncing display events per session
interface TranscriptDebouncer {
  lastSentTime: number;
  timer: NodeJS.Timeout | null;
}
const transcriptDebouncers: Map<string, TranscriptDebouncer> = new Map();

// Parse JSON bodies
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, './public')));

// Track active sessions (WebSocket connections)
const activeSessions = new Map<string, WebSocket>();

/**
 * Converts a line-width descriptor (or number) to a numeric value.
 */
function convertLineWidth(width: string | number, isHanzi: boolean = false): number {
  if (typeof width === 'number') return width;

  console.log('Line width:', isHanzi);

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
 * Fetches TPA settings for the user and applies them.
 * For live translation we look for both a source language ("transcribe_language")
 * and a target language ("translate_language").
 */
async function fetchAndApplySettings(sessionId: string, userId: string) {
  try {
    const response = await axios.get(`http://${CLOUD_URL}/tpasettings/user/${PACKAGE_NAME}`, {
      headers: { Authorization: `Bearer ${userId}` }
    });
    const settings = response.data.settings;
    console.log(`Fetched settings for session ${sessionId}:`, settings);
    const lineWidthSetting = settings.find((s: any) => s.key === 'line_width');
    const numberOfLinesSetting = settings.find((s: any) => s.key === 'number_of_lines');
    const transcribeLanguageSetting = settings.find((s: any) => s.key === 'transcribe_language');
    const translateLanguageSetting = settings.find((s: any) => s.key === 'translate_language');

    const numberOfLines = numberOfLinesSetting ? Number(numberOfLinesSetting.value) : 3;
    
    // Determine languages: default source is en-US; default target can be set (here defaulting to es-ES)
    const sourceLang = transcribeLanguageSetting?.value ? languageToLocale(transcribeLanguageSetting.value) : 'zh-CN';
    const targetLang = translateLanguageSetting?.value ? languageToLocale(translateLanguageSetting.value) : 'en-US';
    
    usertranscribeLanguageSettings.set(userId, sourceLang);
    userTranslateLanguageSettings.set(userId, targetLang);
    console.log(`Settings for user ${userId}: source=${sourceLang}, target=${targetLang}`);
    
    const isChineseLanguage = targetLang.toLowerCase().startsWith('zh-') || targetLang.toLowerCase().startsWith('ja-');

    const lineWidth = lineWidthSetting ? convertLineWidth(lineWidthSetting.value, isChineseLanguage) : 30;
    const transcriptProcessor = new TranscriptProcessor(lineWidth, numberOfLines);
    userTranscriptProcessors.set(userId, transcriptProcessor);

    // Update subscription for the session to use translation stream.
    updateSubscriptionForSession(sessionId, userId);

    return { sourceLang, targetLang };
  } catch (err) {
    console.error(`Error fetching settings for session ${sessionId}:`, err);
    // Fallback defaults
    const transcriptProcessor = new TranscriptProcessor(30, 3);
    userTranscriptProcessors.set(userId, transcriptProcessor);
    usertranscribeLanguageSettings.set(userId, 'zh-CN');
    userTranslateLanguageSettings.set(userId, 'en-US');
    return { sourceLang: 'zh-CN', targetLang: 'en-US' };
  }
}

/**
 * Sends a subscription update to the cloud based on current user language settings.
 * Uses createTranslationStream(source, target).
 */
function updateSubscriptionForSession(sessionId: string, userId: string) {
  const ws = activeSessions.get(sessionId);
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const source = usertranscribeLanguageSettings.get(userId) || 'zh-CN';
  const target = userTranslateLanguageSettings.get(userId) || 'en-US';
  const translationStream = createTranslationStream(source, target);
  console.log(`Updating subscription for session ${sessionId} to translation stream: ${translationStream}`);

  const subMessage: TpaSubscriptionUpdate = {
    type: TpaToCloudMessageType.SUBSCRIPTION_UPDATE,
    packageName: PACKAGE_NAME,
    sessionId,
    subscriptions: [translationStream as ExtendedStreamType]
  };

  ws.send(JSON.stringify(subMessage));
}

/**
 * Handles a transcription/translation result message and sends it to the display.
 */
function handleTranslation(sessionId: string, userId: string, ws: WebSocket, translationData: any) {
  let userFinalTranscript = userFinalTranscripts.get(userId) || "";
  let transcriptProcessor = userTranscriptProcessors.get(userId);
  if (!transcriptProcessor) {
    transcriptProcessor = new TranscriptProcessor(30, 3);
    userTranscriptProcessors.set(userId, transcriptProcessor);
  }

  const isFinal = translationData.isFinal;
  const newText = translationData.text;
  // For translation, we might have both source and target languages in the data.
  const sourceLanguage = translationData.language || 'zh-CN';
  const targetLanguage = translationData.targetLanguage || 'en-US';

  console.log(`[Session ${sessionId}]: Received translation (${sourceLanguage}->${targetLanguage})`);

  const text = transcriptProcessor.processString(userFinalTranscript + " " + newText, isFinal);
  console.log(`[Session ${sessionId}]: ${text} (isFinal=${isFinal})`);

  if (isFinal) {
    const finalLiveCaption = newText.length > 100 ? newText.substring(newText.length - 100) : newText;
    userFinalTranscripts.set(userId, finalLiveCaption);
  }
  debounceAndShowTranscript(sessionId, userId, ws, text, isFinal);
}

/**
 * Debounces the display of transcript text.
 */
function debounceAndShowTranscript(sessionId: string, userId: string, ws: WebSocket, transcript: string, isFinal: boolean) {
  const debounceDelay = 400; // ms
  let debouncer = transcriptDebouncers.get(sessionId);
  if (!debouncer) {
    transcriptDebouncers.set(sessionId, { lastSentTime: 0, timer: null });
    debouncer = transcriptDebouncers.get(sessionId)!;
  }

  if (debouncer.timer) {
    clearTimeout(debouncer.timer);
    debouncer.timer = null;
  }

  const now = Date.now();
  if (isFinal) {
    showTranscriptsToUser(sessionId, ws, transcript, true);
    debouncer.lastSentTime = now;
  } else if (now - debouncer.lastSentTime >= debounceDelay) {
    showTranscriptsToUser(sessionId, ws, transcript, false);
    debouncer.lastSentTime = now;
  } else {
    debouncer.timer = setTimeout(() => {
      showTranscriptsToUser(sessionId, ws, transcript, false);
      debouncer!.lastSentTime = Date.now();
    }, debounceDelay);
  }
}

/**
 * Sends a display event to the cloud.
 */
function showTranscriptsToUser(sessionId: string, ws: WebSocket, transcript: string, isFinal: boolean) {
  const displayRequest: DisplayRequest = {
    type: TpaToCloudMessageType.DISPLAY_REQUEST,
    view: ViewType.MAIN,
    packageName: PACKAGE_NAME,
    sessionId,
    layout: {
      layoutType: LayoutType.TEXT_WALL,
      text: transcript
    },
    timestamp: new Date(),
    durationMs: 20 * 1000
  };

  ws.send(JSON.stringify(displayRequest));
}

/**
 * Refreshes all sessions for a user after settings change.
 */
function refreshUserSessions(userId: string, newUserTranscript: string): boolean {
  const sessionIds = userSessions.get(userId);
  if (!sessionIds || sessionIds.size === 0) {
    console.log(`No active sessions found for user ${userId}`);
    return false;
  }
  
  console.log(`Refreshing ${sessionIds.size} sessions for user ${userId}`);
  for (const sessionId of sessionIds) {
    const ws = activeSessions.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      updateSubscriptionForSession(sessionId, userId);
      const clearDisplayRequest: DisplayRequest = {
        type: TpaToCloudMessageType.DISPLAY_REQUEST,
        view: ViewType.MAIN,
        packageName: PACKAGE_NAME,
        sessionId,
        layout: { layoutType: LayoutType.TEXT_WALL, text: newUserTranscript },
        timestamp: new Date(),
        durationMs: 20 * 1000
      };
      try {
        ws.send(JSON.stringify(clearDisplayRequest));
      } catch (error) {
        console.error(`Error clearing display for session ${sessionId}:`, error);
      }
    } else {
      activeSessions.delete(sessionId);
      sessionIds.delete(sessionId);
    }
  }
  
  return sessionIds.size > 0;
}

// --------------------------------------------------------------------
// Webhook and WebSocket connection handling
// --------------------------------------------------------------------
app.post('/webhook', async (req, res) => {
  try {
    const { sessionId, userId } = req.body;
    console.log(`Received session request for user ${userId}, session ${sessionId}`);

    // Connect to cloud WebSocket
    const ws = new WebSocket(`ws://${CLOUD_URL}/tpa-ws`);

    ws.on('open', async () => {
      console.log(`Session ${sessionId} connected to cloud`);
      const initMessage: TpaConnectionInit = {
        type: TpaToCloudMessageType.CONNECTION_INIT,
        sessionId,
        packageName: PACKAGE_NAME,
        apiKey: API_KEY
      };
      ws.send(JSON.stringify(initMessage));
      await fetchAndApplySettings(sessionId, userId).catch(err =>
        console.error(`Error in fetchAndApplySettings for session ${sessionId}:`, err)
      );
    });

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(sessionId, userId, ws, message);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    ws.on('close', () => {
      console.log(`Session ${sessionId} disconnected`);
      activeSessions.delete(sessionId);
      if (userSessions.has(userId)) {
        const sessions = userSessions.get(userId)!;
        sessions.delete(sessionId);
        if (sessions.size === 0) {
          userSessions.delete(userId);
        }
      }
      transcriptDebouncers.delete(sessionId);
    });

    if (!userSessions.has(userId)) {
      userSessions.set(userId, new Set());
    }
    userSessions.get(userId)!.add(sessionId);
    activeSessions.set(sessionId, ws);
    userFinalTranscripts.set(userId, "");
    transcriptDebouncers.set(sessionId, { lastSentTime: 0, timer: null });

    res.status(200).json({ status: 'connecting' });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use(express.static(path.join(__dirname, './public')));

function handleMessage(sessionId: string, userId: string, ws: WebSocket, message: any) {
  switch (message.type) {
    case CloudToTpaMessageType.CONNECTION_ACK: {
      // Connection acknowledged; update subscription for translation.
      const source = usertranscribeLanguageSettings.get(userId) || 'zh-CN';
      const target = userTranslateLanguageSettings.get(userId) || 'en-US';
      const translationStream = createTranslationStream(source, target);
      const subMessage: TpaSubscriptionUpdate = {
        type: TpaToCloudMessageType.SUBSCRIPTION_UPDATE,
        packageName: PACKAGE_NAME,
        sessionId,
        subscriptions: [translationStream as ExtendedStreamType]
      };
      ws.send(JSON.stringify(subMessage));
      console.log(`Session ${sessionId} connected and subscribed to ${translationStream}`);
      break;
    }
    case CloudToTpaMessageType.DATA_STREAM: {
      const streamMessage = message as DataStream;
      console.log("🎤 Stream message: ", streamMessage);
      handleTranslation(sessionId, userId, ws, streamMessage.data);
      break;
    }
    default:
      console.log('Unknown message type:', message.type);
  }
}

app.post('/settings', async (req, res) => {
  try {
    console.log('Received settings update for live translation:', req.body);
    const { userIdForSettings, settings } = req.body;
    if (!userIdForSettings || !Array.isArray(settings)) {
      return res.status(400).json({ error: 'Missing userId or settings array in payload' });
    }
    
    const lineWidthSetting = settings.find((s: any) => s.key === 'line_width');
    const numberOfLinesSetting = settings.find((s: any) => s.key === 'number_of_lines');
    const transcribeLanguageSetting = settings.find((s: any) => s.key === 'transcribe_language');
    const translateLanguageSetting = settings.find((s: any) => s.key === 'translate_language');

    let numberOfLines = numberOfLinesSetting ? Number(numberOfLinesSetting.value) : 3;
    if (isNaN(numberOfLines) || numberOfLines < 1) numberOfLines = 3;
    
    const sourceLanguage = transcribeLanguageSetting?.value ? languageToLocale(transcribeLanguageSetting.value) : 'zh-CN';
    const targetLanguage = translateLanguageSetting?.value ? languageToLocale(translateLanguageSetting.value) : 'en-US';
    
    const prevSource = usertranscribeLanguageSettings.get(userIdForSettings);
    const prevTarget = userTranslateLanguageSettings.get(userIdForSettings);
    const languageChanged = sourceLanguage !== prevSource || targetLanguage !== prevTarget;
    
    const isChineseLanguage = targetLanguage.toLowerCase().startsWith('zh-') || targetLanguage.toLowerCase().startsWith('ja-');
    const lineWidth = lineWidthSetting ? convertLineWidth(lineWidthSetting.value, isChineseLanguage) : 30;
    if (languageChanged) {
      console.log(`Language settings changed for user ${userIdForSettings}: source ${prevSource} -> ${sourceLanguage}, target ${prevTarget} -> ${targetLanguage}`);
      usertranscribeLanguageSettings.set(userIdForSettings, sourceLanguage);
      userTranslateLanguageSettings.set(userIdForSettings, targetLanguage);
    }
    
    console.log(`Updating settings for user ${userIdForSettings}: lineWidth=${lineWidth}, numberOfLines=${numberOfLines}, source=${sourceLanguage}, target=${targetLanguage}`);
    
    // Determine what to do with the transcript based on language change
    let lastUserTranscript = "";
    if (!languageChanged) {
      // Only keep the previous transcript if language hasn't changed
      lastUserTranscript = userTranscriptProcessors.get(userIdForSettings)?.getLastUserTranscript() || "";
    }
    
    const newProcessor = new TranscriptProcessor(lineWidth, numberOfLines);
    userTranscriptProcessors.set(userIdForSettings, newProcessor);
    userFinalTranscripts.set(userIdForSettings, lastUserTranscript);

    // Process string will give empty result when lastUserTranscript is empty
    const newUserTranscript = languageChanged ? "" : 
      userTranscriptProcessors.get(userIdForSettings)?.processString(lastUserTranscript, true) || "";
    
    const sessionsRefreshed = refreshUserSessions(userIdForSettings, newUserTranscript);
    
    res.json({ 
      status: 'Settings updated successfully',
      sessionsRefreshed,
      languageChanged
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Internal server error updating settings' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', app: PACKAGE_NAME });
});

app.listen(PORT, () => {
  console.log(`${PACKAGE_NAME} server running`);
});
