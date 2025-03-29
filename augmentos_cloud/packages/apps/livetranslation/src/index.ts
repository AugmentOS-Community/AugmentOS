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
  CloudToTpaMessageType,
  ViewType,
  LayoutType,
  createTranslationStream,    // New helper for language-specific translation streams
  ExtendedStreamType
} from '@augmentos/sdk';
import { TranscriptProcessor, convertLineWidth, languageToLocale } from '@augmentos/utils';

// const PORT = systemApps.liveTranslation.port;
const app = express();
const PORT =  process.env.PORT ? parseInt(process.env.PORT) : 80; // Default http port.
const CLOUD_HOST_NAME = process.env.CLOUD_HOST_NAME || "http://localhost:8002"; 
const PACKAGE_NAME = "com.augmentos.live-translation";
const API_KEY = process.env.LIVE_TRANSLATION_API_KEY || 'test_key'; // In production, store this securely
const MAX_FINAL_TRANSCRIPTS = 3; // Hardcoded to 3 final transcripts

// Maps to track state
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
 * Fetches TPA settings for the user and applies them.
 * For live translation we look for both a source language ("transcribe_language")
 * and a target language ("translate_language").
 */
async function fetchAndApplySettings(sessionId: string, userId: string) {
  try {
    const response = await axios.get(`http://${CLOUD_HOST_NAME}/tpasettings/user/${PACKAGE_NAME}`, {
      headers: { Authorization: `Bearer ${userId}` }
    });
    const settings = response.data.settings;
    console.log(`Fetched settings for session ${sessionId}:`, settings);
    const lineWidthSetting = settings.find((s: any) => s.key === 'line_width');
    const numberOfLinesSetting = settings.find((s: any) => s.key === 'number_of_lines');
    const transcribeLanguageSetting = settings.find((s: any) => s.key === 'transcribe_language');
    const translateLanguageSetting = settings.find((s: any) => s.key === 'translate_language');

    const numberOfLines = numberOfLinesSetting ? Number(numberOfLinesSetting.value) : 3;
    
    // Determine languages: default source is zh-CN; default target is en-US
    const sourceLang = transcribeLanguageSetting?.value ? languageToLocale(transcribeLanguageSetting.value) : 'zh-CN';
    const targetLang = translateLanguageSetting?.value ? languageToLocale(translateLanguageSetting.value) : 'en-US';
    
    usertranscribeLanguageSettings.set(userId, sourceLang);
    userTranslateLanguageSettings.set(userId, targetLang);
    console.log(`Settings for user ${userId}: source=${sourceLang}, target=${targetLang}`);
    
    const isChineseLanguage = targetLang.toLowerCase().startsWith('zh-') || targetLang.toLowerCase().startsWith('ja-');

    const lineWidth = lineWidthSetting ? convertLineWidth(lineWidthSetting.value, isChineseLanguage) : 30;
    const transcriptProcessor = new TranscriptProcessor(lineWidth, numberOfLines, MAX_FINAL_TRANSCRIPTS);
    userTranscriptProcessors.set(userId, transcriptProcessor);

    // Update subscription for the session to use translation stream.
    updateSubscriptionForSession(sessionId, userId);

    return { sourceLang, targetLang };
  } catch (err) {
    console.error(`Error fetching settings for session ${sessionId}:`, err);
    // Fallback defaults
    const transcriptProcessor = new TranscriptProcessor(30, 3, MAX_FINAL_TRANSCRIPTS);
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
  if (!ws || ws.readyState !== 1) return;

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
  let transcriptProcessor = userTranscriptProcessors.get(userId);
  if (!transcriptProcessor) {
    transcriptProcessor = new TranscriptProcessor(30, 3, MAX_FINAL_TRANSCRIPTS);
    userTranscriptProcessors.set(userId, transcriptProcessor);
  }

  const isFinal = translationData.isFinal;
  const newText = translationData.text;
  // For translation, we might have both source and target languages in the data.
  const sourceLanguage = translationData.language || 'zh-CN';
  const targetLanguage = translationData.targetLanguage || 'en-US';

  console.log(`[Session ${sessionId}]: Received translation (${sourceLanguage}->${targetLanguage})`);

  // Process the new transcript - this will add it to history if it's final
  transcriptProcessor.processString(newText, isFinal);

  let textToDisplay;

  if (isFinal) {
    // For final transcripts, get the combined history of all final transcripts
    const finalTranscriptsHistory = transcriptProcessor.getCombinedTranscriptHistory();
    
    // Process this combined history to format it properly
    textToDisplay = transcriptProcessor.getFormattedTranscriptHistory();
    
    console.log(`[Session ${sessionId}]: finalTranscriptCount=${transcriptProcessor.getFinalTranscriptHistory().length}`);
  } else {
    // For non-final, get the combined history and add the current partial transcript
    const combinedTranscriptHistory = transcriptProcessor.getCombinedTranscriptHistory();
    const textToProcess = `${combinedTranscriptHistory} ${newText}`;
    
    // Process this combined text for display
    textToDisplay = transcriptProcessor.getFormattedPartialTranscript(textToProcess);
  }

  console.log(`[Session ${sessionId}]: ${textToDisplay}`);
  console.log(`[Session ${sessionId}]: isFinal=${isFinal}`);

  debounceAndShowTranscript(sessionId, userId, ws, textToDisplay, isFinal);
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
    durationMs: 20 * 1000,
    forceDisplay: isFinal
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
    if (ws && ws.readyState === 1) {
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
    const ws = new WebSocket(`ws://${CLOUD_HOST_NAME}/tpa-ws`);

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
    
    // Create a new processor
    const newProcessor = new TranscriptProcessor(lineWidth, numberOfLines, MAX_FINAL_TRANSCRIPTS);
    
    // Important: Only preserve transcript history if language DIDN'T change
    if (!languageChanged && userTranscriptProcessors.has(userIdForSettings)) {
      // Get the previous transcript history
      const previousTranscriptHistory = userTranscriptProcessors.get(userIdForSettings)?.getFinalTranscriptHistory() || [];
      
      // Add each previous transcript to the new processor
      for (const transcript of previousTranscriptHistory) {
        newProcessor.processString(transcript, true);
      }
      
      console.log(`Preserved ${previousTranscriptHistory.length} transcripts after settings change`);
    } else if (languageChanged) {
      console.log(`Cleared transcript history due to language change`);
    }
    
    // Replace the old processor with the new one
    userTranscriptProcessors.set(userIdForSettings, newProcessor);
    
    // Get transcript to display
    const newUserTranscript = newProcessor.getCombinedTranscriptHistory() || "";
    
    const sessionsRefreshed = refreshUserSessions(userIdForSettings, newUserTranscript);
    
    res.json({ 
      status: 'Settings updated successfully',
      sessionsRefreshed,
      languageChanged,
      transcriptsPreserved: !languageChanged
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
