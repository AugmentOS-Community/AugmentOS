// augmentos_cloud/packages/apps/captions/src/index.ts
import express from 'express';
import WebSocket from 'ws';
import path from 'path';
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
  createTranscriptionStream,
  ExtendedStreamType,
} from '@augmentos/sdk';
import { TranscriptProcessor, languageToLocale } from '@augmentos/utils';
import { systemApps } from '@augmentos/config';
import axios from 'axios';

const app = express();
// const PORT = systemApps.captions.port;
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80; // Default http port.
const CLOUD_URL = process.env.CLOUD_URL || "http://localhost:8002"; 
const PACKAGE_NAME = systemApps.captions.packageName;
const API_KEY = 'test_key'; // In production, this would be securely stored

// No longer need userFinalTranscripts map as we store history in the TranscriptProcessor
const userTranscriptProcessors: Map<string, TranscriptProcessor> = new Map();
const userSessions = new Map<string, Set<string>>(); // userId -> Set<sessionId>
const userLanguageSettings: Map<string, string> = new Map(); // userId -> language code
const MAX_FINAL_TRANSCRIPTS = 5; // Hardcoded to 3 final transcripts

// For debouncing transcripts per session
interface TranscriptDebouncer {
  lastSentTime: number;
  timer: NodeJS.Timeout | null;
}
const transcriptDebouncers: Map<string, TranscriptDebouncer> = new Map();

// Parse JSON bodies
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, './public')));

// Track active sessions
const activeSessions = new Map<string, WebSocket>();

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
    
    // Store the language setting for this user (default to en-US if not specified)
    const language = transcribeLanguageSetting?.value || 'en-US';
    const locale = languageToLocale(language);
    const numberOfLines = numberOfLinesSetting ? Number(numberOfLinesSetting.value) : 3; // fallback default
    
    const isChineseLanguage = locale.startsWith('zh-') || locale.startsWith('ja-');
    
    // Pass the divideByThree flag based on language
    const lineWidth = lineWidthSetting ? 
      convertLineWidth(lineWidthSetting.value, isChineseLanguage) : 
      (isChineseLanguage ? 10 : 30); // adjusted fallback defaults

    userLanguageSettings.set(userId, locale);
    console.log(`Language setting for user ${userId}: ${locale}`);

    const transcriptProcessor = new TranscriptProcessor(lineWidth, numberOfLines, MAX_FINAL_TRANSCRIPTS);
    userTranscriptProcessors.set(userId, transcriptProcessor);
    
    // Update subscription if websocket is already open
    updateSubscriptionForSession(sessionId, userId);
    
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

// Function to update subscription based on current language settings
function updateSubscriptionForSession(sessionId: string, userId: string) {
  const ws = activeSessions.get(sessionId);
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  
  const language = userLanguageSettings.get(userId) || 'en-US';
  const transcriptionStream = createTranscriptionStream(language);
  
  console.log(`Updating subscription for session ${sessionId} to language: ${language}`);
  
  // Create subscription with language-specific stream
  const subMessage: TpaSubscriptionUpdate = {
    type: TpaToCloudMessageType.SUBSCRIPTION_UPDATE,
    packageName: PACKAGE_NAME,
    sessionId,
    subscriptions: [transcriptionStream as ExtendedStreamType]
  };
  
  ws.send(JSON.stringify(subMessage));
  console.log(`Updated subscription for session ${sessionId} to ${transcriptionStream}`);
}

// Handle webhook call from AugmentOS Cloud
app.post('/webhook', async (req, res) => {
  try {
    const { sessionId, userId } = req.body;
    console.log(`\n\n🗣️🗣️🗣️Received session request for user ${userId}, session ${sessionId}\n\n`);

    // Start WebSocket connection to cloud
    const ws = new WebSocket(`ws://${CLOUD_URL}/tpa-ws`);

    ws.on('open', async () => {
      console.log(`\n[Session ${sessionId}]\n connected to augmentos-cloud\n`);
      // Send connection init with session ID
      const initMessage: TpaConnectionInit = {
        type: TpaToCloudMessageType.CONNECTION_INIT,
        sessionId,
        packageName: PACKAGE_NAME,
        apiKey: API_KEY
      };
      ws.send(JSON.stringify(initMessage));

      // Fetch and apply settings for the session
      // We'll subscribe to the appropriate language in the CONNECTION_ACK handler
      // after we've loaded the settings
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
      
      // Remove session from user's sessions map
      if (userSessions.has(userId)) {
        const sessions = userSessions.get(userId)!;
        sessions.delete(sessionId);
        if (sessions.size === 0) {
          userSessions.delete(userId);
        }
      }
      
      transcriptDebouncers.delete(sessionId);
    });

    // Track this session for the user
    if (!userSessions.has(userId)) {
      userSessions.set(userId, new Set());
    }
    userSessions.get(userId)!.add(sessionId);

    activeSessions.set(sessionId, ws);
    
    // Initialize debouncer for the session
    transcriptDebouncers.set(sessionId, { lastSentTime: 0, timer: null });

    res.status(200).json({ status: 'connecting' });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, './public')));

function handleMessage(sessionId: string, userId: string, ws: WebSocket, message: any) {
  switch (message.type) {
    case CloudToTpaMessageType.CONNECTION_ACK: {
      // Connection acknowledged, subscribe to language-specific transcription
      const language = userLanguageSettings.get(userId) || 'en-US';
      const transcriptionStream = createTranscriptionStream(language);
      
      const subMessage: TpaSubscriptionUpdate = {
        type: TpaToCloudMessageType.SUBSCRIPTION_UPDATE,
        packageName: PACKAGE_NAME,
        sessionId,
        subscriptions: [transcriptionStream as ExtendedStreamType]
      };
      ws.send(JSON.stringify(subMessage));
      console.log(`Session ${sessionId} connected and subscribed to ${transcriptionStream}`);
      break;
    }

    case CloudToTpaMessageType.DATA_STREAM: {
      const streamMessage = message as DataStream;
      if (streamMessage.streamType === StreamType.TRANSCRIPTION) {
          handleTranscription(sessionId, userId, ws, streamMessage.data);
      }
      break;
    }

    default:
      console.log('Unknown message type:', message.type);
  }
}

/**
 * Processes the transcription, applies debouncing, and then sends a display event.
 */
function handleTranscription(sessionId: string, userId: string, ws: WebSocket, transcriptionData: any) {
  let transcriptProcessor = userTranscriptProcessors.get(userId);
  if (!transcriptProcessor) {
    transcriptProcessor = new TranscriptProcessor(30, 3, MAX_FINAL_TRANSCRIPTS);
    userTranscriptProcessors.set(userId, transcriptProcessor);
  }

  const isFinal = transcriptionData.isFinal;
  const newTranscript = transcriptionData.text;
  const language = transcriptionData.transcribeLanguage || 'en-US';

  // Log language information from the transcription
  console.log(`[Session ${sessionId}]: Received transcription in language: ${language}`);

  // Process the new transcript - this will add it to history if it's final
  transcriptProcessor.processString(newTranscript, isFinal);

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
    const textToProcess = `${combinedTranscriptHistory} ${newTranscript}`;
    
    // Process this combined text for display
    textToDisplay = transcriptProcessor.getFormattedPartialTranscript(textToProcess);
  }

  console.log(`[Session ${sessionId}]: ${textToDisplay}`);
  console.log(`[Session ${sessionId}]: isFinal=${isFinal}`);

  debounceAndShowTranscript(sessionId, userId, ws, textToDisplay, isFinal);
}

/**
 * Debounces the sending of transcript display events so that non-final transcripts
 * are not sent too frequently. Final transcripts are sent immediately.
 */
function debounceAndShowTranscript(sessionId: string, userId: string, ws: WebSocket, transcript: string, isFinal: boolean) {
  const debounceDelay = 400; // in milliseconds
  const debouncer = transcriptDebouncers.get(sessionId);
  if (!debouncer) {
    // Initialize if it doesn't exist
    transcriptDebouncers.set(sessionId, { lastSentTime: 0, timer: null });
  }
  const currentDebouncer = transcriptDebouncers.get(sessionId)!;

  // Clear any previously scheduled timer
  if (currentDebouncer.timer) {
    clearTimeout(currentDebouncer.timer);
    currentDebouncer.timer = null;
  }

  const now = Date.now();

  if (isFinal) {
    showTranscriptsToUser(sessionId, ws, transcript, true);
    currentDebouncer.lastSentTime = now;
    return;
  }

  if (now - currentDebouncer.lastSentTime >= debounceDelay) {
    showTranscriptsToUser(sessionId, ws, transcript, false);
    currentDebouncer.lastSentTime = now;
  } else {
    currentDebouncer.timer = setTimeout(() => {
      showTranscriptsToUser(sessionId, ws, transcript, false);
      currentDebouncer.lastSentTime = Date.now();
    }, debounceDelay);
  }
}

/**
 * Sends a display event (transcript) to the cloud.
 */
function showTranscriptsToUser(sessionId: string, ws: WebSocket, transcript: string, isFinal: boolean) {
  console.log(`[Session ${sessionId}]: Transcript to show: \n${transcript}`);

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
    // Use a fixed duration for final transcripts; non-final ones omit the duration
    durationMs: isFinal ? 20 * 1000 : undefined
    // durationMs: 20 * 1000 // 20 seconds. If no other transcript is received it will be cleared after this time.
  };

  ws.send(JSON.stringify(displayRequest));
}

/**
 * Refreshes all sessions for a user after settings changes.
 * Returns true if at least one session was refreshed.
 */
function refreshUserSessions(userId: string, newUserTranscript: string) {
  const sessionIds = userSessions.get(userId);
  if (!sessionIds || sessionIds.size === 0) {
    console.log(`No active sessions found for user ${userId}`);
    return false;
  }
  
  console.log(`Refreshing ${sessionIds.size} sessions for user ${userId}`);
  console.log(`New user transcript: ${newUserTranscript}`);
  
  // Refresh each session
  for (const sessionId of sessionIds) {
    const ws = activeSessions.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log(`Refreshing session ${sessionId}`);
      
      // Update subscription for new language settings
      updateSubscriptionForSession(sessionId, userId);
      
      // Clear display to reset visual state
      const clearDisplayRequest: DisplayRequest = {
        type: TpaToCloudMessageType.DISPLAY_REQUEST,
        view: ViewType.MAIN,
        packageName: PACKAGE_NAME,
        sessionId,
        layout: {
          layoutType: LayoutType.TEXT_WALL,
          text: newUserTranscript // Empty text to clear the display
        },
        timestamp: new Date(),
        durationMs: 20 * 1000 // 20 seconds. If no other transcript is received it will be cleared after this time.
      };
      
      try {
        ws.send(JSON.stringify(clearDisplayRequest));
      } catch (error) {
        console.error(`Error clearing display for session ${sessionId}:`, error);
      }
    } else {
      console.log(`Session ${sessionId} is not open, removing from tracking`);
      activeSessions.delete(sessionId);
      sessionIds.delete(sessionId);
    }
  }
  
  return sessionIds.size > 0;
}

app.post('/settings', (req, res) => {
  try {
    console.log('Received settings update for captions:', req.body);
    const { userIdForSettings, settings } = req.body;
    
    if (!userIdForSettings || !Array.isArray(settings)) {
      return res.status(400).json({ error: 'Missing userId or settings array in payload' });
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
    const previousLanguage = userLanguageSettings.get(userIdForSettings);
    const languageChanged = language !== previousLanguage;

    if (lineWidthSetting) {
      const isChineseLanguage = language.startsWith('zh-') || language.startsWith('ja-');
      lineWidth = typeof lineWidthSetting.value === 'string' ? 
        convertLineWidth(lineWidthSetting.value, isChineseLanguage) : 
        (typeof lineWidthSetting.value === 'number' ? lineWidthSetting.value : 30);
    }

    console.log(`Line width setting: ${lineWidth}`);
    
    if (languageChanged) {
      console.log(`Language changed for user ${userIdForSettings}: ${previousLanguage} -> ${language}`);
      userLanguageSettings.set(userIdForSettings, language);
    }
    
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

    // Refresh active sessions
    const sessionsRefreshed = refreshUserSessions(userIdForSettings, newUserTranscript);
    
    res.json({ 
      status: 'Settings updated successfully',
      sessionsRefreshed: sessionsRefreshed,
      languageChanged: languageChanged,
      transcriptsPreserved: !languageChanged
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Internal server error updating settings' });
  }
});

// Add a route to verify the server is running
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', app: PACKAGE_NAME });
});

app.listen(PORT, () => {
  console.log(`${PACKAGE_NAME} server running`);
});