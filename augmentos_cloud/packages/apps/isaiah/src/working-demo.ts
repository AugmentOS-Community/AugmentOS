import path from 'path';
import { TpaServer, TpaSession, StreamType } from '@augmentos/sdk';

// Configuration
const PACKAGE_NAME = "dev.augmentos.isaiah";
const API_KEY = 'test_key'; // In production, use a secure environment variable
const PORT = 42022;

// Constants
const ISAIAH_USER_ID = "isaiah@mentra.glass";
const TRIGGER_PHRASE = "isaiah";
const END_PHRASE = "peace out";
const FEEDBACK_DURATION = 3000; // Duration for self-feedback messages (3 seconds)
const MAX_TRANSCRIPT_HISTORY = 5; // Number of past messages to keep in transcript
const MAX_DISPLAY_REFRESH_DELAY = 800; // ms to wait before refreshing display

// Message history structure
interface TranscriptMessage {
  userId: string;
  text: string;
  timestamp: Date;
}

// Conversation state management
interface Conversation {
  userId: string;           // User talking with Isaiah
  sessionId: string;        // Session ID for the user
  startTime: Date;          // When the conversation started
  lastActivity: Date;       // Last message timestamp
  transcript: TranscriptMessage[];  // Ordered history of messages
  pendingDisplayUpdate: boolean;    // Flag to prevent display flicker
  displayUpdateTimer: NodeJS.Timeout | null; // Timer for display updates
}

/**
 * Actually Isaiah TPA Server
 * 
 * Provides a communication channel between Isaiah and other AR glasses users.
 * Users can initiate conversations by saying "Isaiah", and both parties
 * see transcriptions of what the other is saying.
 */
class ActuallyIsaiahServer extends TpaServer {
  // State tracking
  private activeConversation: Conversation | null = null;
  private isaiahSession: TpaSession | null = null;
  private userSessions = new Map<string, {session: TpaSession, userId: string}>();
  private isIsaiahConnected = false;

  /**
   * Check if text contains a specific phrase (case-insensitive)
   */
  private textContains(text: string, phrase: string): boolean {
    return text.toLowerCase().includes(phrase.toLowerCase());
  }

  /**
   * Format a text as an Isaiah message title
   */
  private formatTitle(speakerId: string): string {
    return speakerId === ISAIAH_USER_ID ? 
      ".\\i: Isaiah" : 
      `.\\i: ${speakerId.split('@')[0]}`;
  }

  /**
   * Generate combined display from transcript
   * Shows the most recent messages with emphasis on other person's messages
   */
  private generateDisplayFromTranscript(
    transcript: TranscriptMessage[],
    viewerId: string
  ): {title: string, text: string} {
    // If no transcript, return empty
    if (transcript.length === 0) {
      return {
        title: ".\\i: Empty",
        text: "No messages yet."
      };
    }

    // Get most recent message for title
    const lastMsg = transcript[transcript.length - 1];
    const titleSpeakerId = lastMsg.userId !== viewerId ? lastMsg.userId : 
      (transcript.length > 1 ? transcript[transcript.length - 2].userId : lastMsg.userId);
    
    // Build conversation text
    let text = '';
    
    // Take the most recent MAX_TRANSCRIPT_HISTORY messages
    const recentMessages = transcript.slice(-MAX_TRANSCRIPT_HISTORY);
    
    // Format each message
    for (const msg of recentMessages) {
      const isSelf = msg.userId === viewerId;
      const prefix = isSelf ? "You: " : `${msg.userId.split('@')[0]}: `;
      const msgText = msg.text.trim();
      
      // Emphasize messages from other person
      if (!isSelf) {
        text += `${prefix}${msgText}\n\n`;
      } else {
        text += `${prefix}${msgText}\n`;
      }
    }

    return {
      title: this.formatTitle(titleSpeakerId),
      text: text.trim()
    };
  }

  /**
   * Update displays for both conversation participants
   * This ensures consistent displays with the full transcript history
   */
  private updateConversationDisplays(): void {
    if (!this.activeConversation || this.activeConversation.pendingDisplayUpdate) return;

    // Get sessions
    const userSessionInfo = this.userSessions.get(this.activeConversation.sessionId);
    if (!userSessionInfo || !this.isaiahSession) return;

    // Set pending flag to prevent rapid updates
    this.activeConversation.pendingDisplayUpdate = true;
    
    // Clear any existing timer
    if (this.activeConversation.displayUpdateTimer) {
      clearTimeout(this.activeConversation.displayUpdateTimer);
    }

    // Set timer to update displays after a short delay
    this.activeConversation.displayUpdateTimer = setTimeout(() => {
      // Generate displays for both parties
      const userDisplay = this.generateDisplayFromTranscript(
        this.activeConversation!.transcript,
        userSessionInfo.userId
      );
      
      const isaiahDisplay = this.generateDisplayFromTranscript(
        this.activeConversation!.transcript,
        ISAIAH_USER_ID
      );
      
      // Update displays (persistent)
      userSessionInfo.session.layouts.showReferenceCard(
        userDisplay.title,
        userDisplay.text,
        { durationMs: -1 }
      );
      
      this.isaiahSession?.layouts.showReferenceCard(
        isaiahDisplay.title,
        isaiahDisplay.text,
        { durationMs: -1 }
      );
      
      // Reset pending flag
      if (this.activeConversation) {
        this.activeConversation.pendingDisplayUpdate = false;
        this.activeConversation.displayUpdateTimer = null;
      }
      
    }, MAX_DISPLAY_REFRESH_DELAY);
  }

  /**
   * Handle a new session connection
   */
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`User ${userId} connected with session ${sessionId}`);
    
    // Store session for later use
    this.userSessions.set(sessionId, {session, userId});
    
    // Set up special handling for Isaiah's session
    if (userId === ISAIAH_USER_ID) {
      this.isIsaiahConnected = true;
      this.isaiahSession = session;
      console.log(`🎉 Isaiah connected! Ready to help users.`);
      
      // Welcome message for Isaiah
      session.layouts.showReferenceCard(
        ".\\i: System", 
        "You are now connected. Users can reach you by saying 'Isaiah'.",
        { durationMs: 5000 }
      );
    } else {
      // Welcome for regular users
      session.layouts.showReferenceCard(
        ".\\i: Welcome", 
        "Say 'Isaiah' to start a conversation.",
        { durationMs: 5000 }
      );
    }

    // Subscribe to necessary events
    session.subscribe(StreamType.TRANSCRIPTION);
    session.subscribe(StreamType.HEAD_POSITION);

    // Set up event handlers
    const cleanupHandlers = [
      // Handle disconnection
      session.events.onDisconnected(() => {
        this.handleDisconnection(sessionId);
      }),

      // Handle transcription events
      session.events.onTranscription((data) => {
        this.handleTranscription(sessionId, data.text);
      }),

      // Handle head position events for Isaiah
      session.events.onHeadPosition((data) => {
        if (userId === ISAIAH_USER_ID) {
          console.log(`Isaiah head position: ${data.position}`);
        }
      }),

      // Handle errors
      session.events.onError((error) => {
        console.error(`[${userId}] Error:`, error);
      })
    ];

    // Register cleanup handlers
    cleanupHandlers.forEach(handler => this.addCleanupHandler(handler));
  }

  /**
   * Handle user disconnection
   */
  private handleDisconnection(sessionId: string): void {
    const sessionInfo = this.userSessions.get(sessionId);
    if (!sessionInfo) return;
    
    const userId = sessionInfo.userId;
    console.log(`User ${userId} disconnected`);
    
    // Remove from sessions map
    this.userSessions.delete(sessionId);
    
    // Special handling for Isaiah
    if (userId === ISAIAH_USER_ID) {
      this.isIsaiahConnected = false;
      this.isaiahSession = null;
      console.log("😢 Isaiah disconnected!");
      
      // If there was an active conversation, notify the user
      if (this.activeConversation) {
        const userSessionInfo = this.userSessions.get(this.activeConversation.sessionId);
        if (userSessionInfo) {
          userSessionInfo.session.layouts.showReferenceCard(
            ".\\i: Disconnected", 
            "Isaiah has disconnected. Conversation ended.",
            { durationMs: 5000 }
          );
        }
        this.activeConversation = null;
      }
    }
    
    // Handle if disconnected user was in active conversation
    if (this.activeConversation && this.activeConversation.sessionId === sessionId) {
      console.log("User in active conversation disconnected");
      
      // Notify Isaiah if connected
      if (this.isaiahSession) {
        this.isaiahSession.layouts.showReferenceCard(
          ".\\i: System", 
          `${userId} has disconnected. Conversation ended.`,
          { durationMs: 5000 }
        );
      }
      
      // Clean up conversation
      if (this.activeConversation.displayUpdateTimer) {
        clearTimeout(this.activeConversation.displayUpdateTimer);
      }
      this.activeConversation = null;
    }
  }

  /**
   * Handle transcription events
   */
  private handleTranscription(sessionId: string, text: string): void {
    const sessionInfo = this.userSessions.get(sessionId);
    if (!sessionInfo) return;
    
    const userId = sessionInfo.userId;
    const isIsaiahSpeaking = (userId === ISAIAH_USER_ID);
    
    console.log(`[TRANSCRIPT] ${userId}: "${text}"`);
    
    // CASE 1: Active conversation exists
    if (this.activeConversation) {
      // Check if conversation should end
      if (this.textContains(text, END_PHRASE)) {
        this.endConversation("User requested to end the conversation");
        return;
      }

      const isUserInConversation = (sessionId === this.activeConversation.sessionId);
      
      // Only process messages from conversation participants
      if (isIsaiahSpeaking || isUserInConversation) {
        // Add message to transcript
        this.activeConversation.transcript.push({
          userId,
          text,
          timestamp: new Date()
        });
        
        // Update last activity
        this.activeConversation.lastActivity = new Date();
        
        // Show immediate self-feedback
        sessionInfo.session.layouts.showReferenceCard(
          ".\\i: You",
          text,
          { durationMs: FEEDBACK_DURATION }
        );
        
        // Update conversation displays
        this.updateConversationDisplays();
      }
    }
    // CASE 2: No active conversation - check if trying to start one
    else if (!isIsaiahSpeaking && this.textContains(text, TRIGGER_PHRASE)) {
      // User wants to talk to Isaiah
      if (this.isIsaiahConnected) {
        // Start a new conversation
        this.startConversation(sessionId, userId, text);
        
        // Show initial messages
        sessionInfo.session.layouts.showReferenceCard(
          ".\\i: Connected",
          "Isaiah is now listening. Say 'peace out' when you're done.",
          { durationMs: 5000 }
        );
        
        if (this.isaiahSession) {
          this.isaiahSession.layouts.showReferenceCard(
            ".\\i: New Conversation",
            `${userId} wants to talk with you. They said: "${text}"`,
            { durationMs: -1 }
          );
        }
      } else {
        // Isaiah is not available
        sessionInfo.session.layouts.showReferenceCard(
          ".\\i: Unavailable",
          "Isaiah is not connected right now. Please try again later.",
          { durationMs: 5000 }
        );
      }
    }
    // CASE 3: Isaiah speaking without active conversation
    else if (isIsaiahSpeaking && !this.activeConversation) {
      // Just show Isaiah his own speech
      sessionInfo.session.layouts.showReferenceCard(
        ".\\i: You (Isaiah)",
        text,
        { durationMs: 5000 }
      );
    }
  }

  /**
   * Start a new conversation between Isaiah and a user
   */
  private startConversation(sessionId: string, userId: string, initialText: string): void {
    console.log(`Starting conversation between Isaiah and ${userId}`);
    
    this.activeConversation = {
      userId,
      sessionId,
      startTime: new Date(),
      lastActivity: new Date(),
      transcript: [{
        userId,
        text: initialText,
        timestamp: new Date()
      }],
      pendingDisplayUpdate: false,
      displayUpdateTimer: null
    };
  }

  /**
   * End the current conversation
   */
  private endConversation(reason: string): void {
    if (!this.activeConversation) return;
    
    console.log(`Ending conversation with ${this.activeConversation.userId}: ${reason}`);
    
    // Clean up any pending timer
    if (this.activeConversation.displayUpdateTimer) {
      clearTimeout(this.activeConversation.displayUpdateTimer);
    }
    
    // Notify both parties
    const userSessionInfo = this.userSessions.get(this.activeConversation.sessionId);
    if (userSessionInfo) {
      userSessionInfo.session.layouts.showReferenceCard(
        ".\\i: Peace out!",
        "Conversation ended. Say 'Isaiah' to start a new one.",
        { durationMs: 5000 }
      );
    }
    
    if (this.isaiahSession) {
      this.isaiahSession.layouts.showReferenceCard(
        ".\\i: Peace out!",
        `Conversation with ${this.activeConversation.userId} ended.`,
        { durationMs: 5000 }
      );
    }
    
    // Clear the active conversation
    this.activeConversation = null;
  }

  /**
   * Get all connected user names (excluding Isaiah)
   */
  private getAllUsers(): string[] {
    const users: string[] = [];
    
    for (const [_, info] of this.userSessions) {
      if (info.userId !== ISAIAH_USER_ID) {
        users.push(info.userId.split('@')[0]);
      }
    }
    
    return users;
  }
}

// Create and start the server
const server = new ActuallyIsaiahServer({
  packageName: PACKAGE_NAME,
  apiKey: API_KEY,
  port: PORT,
  augmentOSWebsocketUrl: `ws://staging.augmentos.org/tpa-ws`,
  webhookPath: '/webhook',
  // Uncomment if you have static assets to serve
  // publicDir: path.join(__dirname, './public')
});

// Start the server
server.start()
  .then(() => console.log(`✅ Actually Isaiah server running on port ${PORT}`))
  .catch(error => console.error('Failed to start server:', error));