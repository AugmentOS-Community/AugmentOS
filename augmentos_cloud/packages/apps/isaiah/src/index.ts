import path from 'path';
import { TpaServer, TpaSession, StreamType } from '@augmentos/sdk';

// Configuration
const PACKAGE_NAME = "dev.augmentos.isaiah";
const API_KEY = 'test_key'; // In production, use a secure environment variable
// const PORT = 42022;
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80; // Default http port.
const CLOUD_URL = process.env.CLOUD_URL || "http://localhost:8002";

// Constants
const ISAIAH_USER_ID = "isaiah@mentra.glass";
const TRIGGER_PHRASE_ISAIAH = "isaiah";
const TRIGGER_PHRASE_HEY = "hey";
const END_PHRASE = "peace out";
const FEEDBACK_DURATION = 10000; // in ms
const MAX_DISPLAY_REFRESH_DELAY = 1000; // in ms
const MAX_WORD_COUNT = 15; // For trimming messages in idle view

// Structures
interface TranscriptMessage {
  userId: string;
  text: string;
  timestamp: Date;
}

interface Participant {
  sessionId: string;
  userId: string;
  // In conversation mode:
  // true = show own latest message (i.e. head is "up")
  // false = show partner's latest message (i.e. head is "down")
  isLookingUp: boolean;
}

interface Conversation {
  participantA: Participant;
  participantB: Participant;
  transcript: TranscriptMessage[];
  lastActivity: Date;
  pendingDisplayUpdate: boolean;
  displayUpdateTimer: NodeJS.Timeout | null;
}

// Additional per-session state for idle mode.
interface SessionInfo {
  session: TpaSession;
  userId: string;
  // "up" or "down" based on head position.
  view: "up" | "down";
  // Local transcript for idle mode (when not in a conversation)
  localTranscript: TranscriptMessage[];
}

/**
 * Isaiah server – updated idle behavior.
 * 
 * When not connected (idle):
 * - If you're looking down (default), the display shows your own most recent (trimmed) message.
 * - If you look up, the display shows the chatroom (list of connected users).
 * 
 * When connected, the conversation view logic applies.
 */
class ActuallyIsaiahServer extends TpaServer {
  private activeConversation: Conversation | null = null;
  private isaiahSession: TpaSession | null = null;
  private userSessions = new Map<string, SessionInfo>();

  private textContains(text: string, phrase: string): boolean {
    return text.toLowerCase().includes(phrase.toLowerCase());
  }

  // Returns an array of connected user names (excluding domain)
  private getAllUsers(): string[] {
    const users: string[] = [];
    for (const info of this.userSessions.values()) {
      if (info.userId) {
        users.push(info.userId.split('@')[0]);
      }
    }
    return users;
  }

  // Trim a text to the last MAX_WORD_COUNT words.
  private trimMessage(text: string): string {
    const words = text.trim().split(/\s+/);
    if (words.length > MAX_WORD_COUNT) {
      return words.slice(-MAX_WORD_COUNT).join(" ");
    }
    return text;
  }

  // For conversation mode: get the latest message for a given user.
  private getLatestMessageText(userId: string): string {
    if (!this.activeConversation) return "";
    const messages = this.activeConversation.transcript.filter(msg => msg.userId === userId);
    if (messages.length === 0) return "";
    return this.trimMessage(messages[messages.length - 1].text);
  }

  /**
   * Update the display for a given session.
   * 
   * If in a conversation:
   *   - If your head is up, show your own latest message (trimmed).
   *   - If down, show your partner's latest message.
   * 
   * If not in a conversation (idle):
   *   - If view is "down", show your local transcript (latest message trimmed).
   *   - If view is "up", show the chatroom listing.
   */
  private updateDisplayForSession(sessionId: string): void {
    const info = this.userSessions.get(sessionId);
    if (!info) return;
    const { userId } = info;
    let title = "";
    let body = "";
    
    if (this.activeConversation) {
      // Check if this session is part of the active conversation.
      let selfParticipant: Participant | null = null;
      let partnerParticipant: Participant | null = null;
      const { participantA, participantB } = this.activeConversation;
      if (participantA.sessionId === sessionId) {
        selfParticipant = participantA;
        partnerParticipant = participantB;
      } else if (participantB.sessionId === sessionId) {
        selfParticipant = participantB;
        partnerParticipant = participantA;
      }
      if (selfParticipant && partnerParticipant) {
        // Special handling if it's a self conversation.
        if (selfParticipant.userId === partnerParticipant.userId) {
          if (selfParticipant.isLookingUp) {
            title = `.\\i ${selfParticipant.userId.split('@')[0]}`;
            body = this.getLatestMessageText(selfParticipant.userId);
          } else {
            // When looking down in a self conversation, show a default view.
            title = `.\\i ${selfParticipant.userId.split('@')[0]}: idle`;
            body = "No messages yet.";
          }
        } else {
          // Normal conversation with two distinct users.
          if (selfParticipant.isLookingUp) {
            title = `.\\i ${selfParticipant.userId.split('@')[0]}`;
            body = this.getLatestMessageText(selfParticipant.userId);
          } else {
            title = `.\\i ${partnerParticipant.userId.split('@')[0]}`;
            body = this.getLatestMessageText(partnerParticipant.userId);
          }
        }
      }
    } else {
      // Idle mode (no active conversation).
      if (info.view === "down") {
        title = `.\\i ${userId.split('@')[0]}`;
        if (info.localTranscript.length > 0) {
          const lastMsg = info.localTranscript[info.localTranscript.length - 1].text;
          body = this.trimMessage(lastMsg);
        } else {
          body = "No messages yet.";
        }
      } else {
        title = `.\\i ${userId.split('@')[0]}: idle`;
        body = `Users in room:\n${this.getAllUsers().join(', ') || "None"}`;
      }
    }
    
    info.session.layouts.showReferenceCard(title, body, { durationMs: 10000 });
  }
  
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`User ${userId} connected with session ${sessionId}`);
    // Initialize session info with default view "down" and an empty local transcript.
    this.userSessions.set(sessionId, {
      session,
      userId,
      view: "down",
      localTranscript: []
    });
    
    if (userId === ISAIAH_USER_ID) {
      this.isaiahSession = session;
      session.layouts.showReferenceCard(
        ".\\i: System",
        "You are now connected. Normal users can reach you by saying 'isaiah'. You can also use 'hey' to test as a normal user.",
        { durationMs: 5000 }
      );
    } else {
      session.layouts.showReferenceCard(
        ".\\i: Welcome",
        "Say 'isaiah' to connect with Isaiah or 'hey <name>' to connect with someone.",
        { durationMs: 5000 }
      );
    }
    
    session.subscribe(StreamType.TRANSCRIPTION);
    session.subscribe(StreamType.HEAD_POSITION);

    const cleanupHandlers = [
      session.events.onDisconnected(() => { this.handleDisconnection(sessionId); }),
      session.events.onTranscription((data) => { this.handleTranscription(sessionId, data.text); }),
      session.events.onHeadPosition((data) => {
        const info = this.userSessions.get(sessionId);
        if (!info) return;
        // Update view regardless of conversation state.
        // In conversation mode, we'll update the Participant flag.
        // When idle, we update our local view flag.
        const pos = data.position.toLowerCase();
        if (this.activeConversation) {
          const conv = this.activeConversation;
          for (const participant of [conv.participantA, conv.participantB]) {
            if (participant.sessionId === sessionId) {
              participant.isLookingUp = (pos === "up");
            }
          }
        } else {
          info.view = (pos === "up") ? "up" : "down";
        }
        this.updateDisplayForSession(sessionId);
      }),
      session.events.onError((error) => {
        console.error(`[${userId}] Error:`, error);
      })
    ];
    cleanupHandlers.forEach(handler => this.addCleanupHandler(handler));
  }

  private handleDisconnection(sessionId: string): void {
    const info = this.userSessions.get(sessionId);
    if (!info) return;
    const { userId } = info;
    console.log(`User ${userId} disconnected`);
    this.userSessions.delete(sessionId);
    
    if (userId === ISAIAH_USER_ID) {
      this.isaiahSession = null;
      console.log("Isaiah disconnected!");
      if (this.activeConversation) {
        const otherSessionId = (this.activeConversation.participantA.sessionId === sessionId)
          ? this.activeConversation.participantB.sessionId
          : this.activeConversation.participantA.sessionId;
        const otherInfo = this.userSessions.get(otherSessionId);
        if (otherInfo) {
          otherInfo.session.layouts.showReferenceCard(
            ".\\i: Disconnected",
            "Isaiah has disconnected. Conversation ended.",
            { durationMs: 5000 }
          );
        }
        if (this.activeConversation.displayUpdateTimer) {
          clearTimeout(this.activeConversation.displayUpdateTimer);
        }
        this.activeConversation = null;
      }
    } else {
      if (this.activeConversation &&
          (this.activeConversation.participantA.sessionId === sessionId ||
           this.activeConversation.participantB.sessionId === sessionId)) {
        const otherSessionId = (this.activeConversation.participantA.sessionId === sessionId)
          ? this.activeConversation.participantB.sessionId
          : this.activeConversation.participantA.sessionId;
        const otherInfo = this.userSessions.get(otherSessionId);
        if (otherInfo) {
          otherInfo.session.layouts.showReferenceCard(
            ".\\i: Disconnected",
            `${userId} disconnected. Conversation ended.`,
            { durationMs: 5000 }
          );
        }
        if (this.activeConversation.displayUpdateTimer) {
          clearTimeout(this.activeConversation.displayUpdateTimer);
        }
        this.activeConversation = null;
      }
    }
  }

  private handleTranscription(sessionId: string, text: string): void {
    const info = this.userSessions.get(sessionId);
    if (!info) return;
    const userId = info.userId;
    const isIsaiahSpeaking = (userId === ISAIAH_USER_ID);
    console.log(`[TRANSCRIPT] ${userId}: "${text}"`);
    
    if (this.activeConversation) {
      if (this.textContains(text, END_PHRASE)) {
        this.endConversation(`User ${userId} requested to end conversation.`);
        return;
      }
      this.activeConversation.transcript.push({
        userId,
        text,
        timestamp: new Date()
      });
      this.activeConversation.lastActivity = new Date();
      
      info.session.layouts.showReferenceCard(
        ".\\i: You", text, { durationMs: FEEDBACK_DURATION }
      );
      
      if (!this.activeConversation.pendingDisplayUpdate) {
        this.activeConversation.pendingDisplayUpdate = true;
        if (this.activeConversation.displayUpdateTimer) {
          clearTimeout(this.activeConversation.displayUpdateTimer);
        }
        this.activeConversation.displayUpdateTimer = setTimeout(() => {
          this.updateDisplayForSession(this.activeConversation!.participantA.sessionId);
          this.updateDisplayForSession(this.activeConversation!.participantB.sessionId);
          this.activeConversation!.pendingDisplayUpdate = false;
          this.activeConversation!.displayUpdateTimer = null;
        }, MAX_DISPLAY_REFRESH_DELAY);
      }
    } else {
      // Idle mode: store self message in localTranscript.
      info.localTranscript.push({
        userId,
        text,
        timestamp: new Date()
      });
      // Update display based on current view.
      setTimeout(() => {
        this.updateDisplayForSession(sessionId);
      }, FEEDBACK_DURATION);
      
      // Process trigger phrases for starting a conversation.
      if (!isIsaiahSpeaking && this.textContains(text, TRIGGER_PHRASE_ISAIAH)) {
        if (this.isaiahSession) {
          this.startConversationWith(ISAIAH_USER_ID, sessionId, userId, text);
          info.session.layouts.showReferenceCard(
            ".\\i: Connected",
            "You are now connected with Isaiah. Look up to see your messages; down to see his.",
            { durationMs: 5000 }
          );
          this.isaiahSession.layouts.showReferenceCard(
            ".\\i: New Conversation",
            `${userId} wants to talk with you: "${text}"`,
            { durationMs: 5000 }
          );
        } else {
          info.session.layouts.showReferenceCard(
            ".\\i: Unavailable",
            "Isaiah is not connected. Please try again later.",
            { durationMs: 5000 }
          );
        }
      } else if (this.textContains(text, TRIGGER_PHRASE_HEY)) {
        const match = text.toLowerCase().split(TRIGGER_PHRASE_HEY)[1]?.trim();
        if (match) {
          let targetUser: string | null = null;
          for (const otherInfo of this.userSessions.values()) {
            if (!isIsaiahSpeaking && otherInfo.userId === userId) continue;
            if (otherInfo.userId.toLowerCase().includes(match)) {
              targetUser = otherInfo.userId;
              break;
            }
          }
          if (targetUser) {
            this.startConversationWith(targetUser, sessionId, userId, text);
            info.session.layouts.showReferenceCard(
              ".\\i: Connected",
              `You are now connected with ${targetUser.split('@')[0]}. Look up for your own messages; down for theirs.`,
              { durationMs: 5000 }
            );
            for (const otherInfo of this.userSessions.values()) {
              if (otherInfo.userId === targetUser) {
                otherInfo.session.layouts.showReferenceCard(
                  ".\\i: New Conversation",
                  `${userId.split('@')[0]} wants to talk with you: "${text}"`,
                  { durationMs: 5000 }
                );
              }
            }
          } else {
            info.session.layouts.showReferenceCard(
              ".\\i: Not Found",
              `No user found matching "${match}".`,
              { durationMs: 5000 }
            );
          }
        }
      } else {
        info.session.layouts.showReferenceCard(
          ".\\i: You", text, { durationMs: FEEDBACK_DURATION }
        );
      }
    }
  }

  private startConversationWith(targetUserId: string, initiatorSessionId: string, initiatorUserId: string, initialText: string): void {
    console.log(`Starting conversation between ${initiatorUserId} and ${targetUserId}`);
    let targetSessionId: string | null = null;
    for (const [sessId, info] of this.userSessions) {
      if (info.userId === targetUserId) {
        targetSessionId = sessId;
        break;
      }
    }
    if (!targetSessionId) return;
    const participantA: Participant = { sessionId: initiatorSessionId, userId: initiatorUserId, isLookingUp: true };
    const participantB: Participant = { sessionId: targetSessionId, userId: targetUserId, isLookingUp: true };
    this.activeConversation = {
      participantA,
      participantB,
      transcript: [{
        userId: initiatorUserId,
        text: initialText,
        timestamp: new Date()
      }],
      lastActivity: new Date(),
      pendingDisplayUpdate: false,
      displayUpdateTimer: null
    };
  }

  private endConversation(reason: string): void {
    if (!this.activeConversation) return;
    console.log(`Ending conversation: ${reason}`);
    for (const participant of [this.activeConversation.participantA, this.activeConversation.participantB]) {
      const info = this.userSessions.get(participant.sessionId);
      if (info) {
        info.session.layouts.showReferenceCard(
          ".\\i: Peace out!",
          "Conversation ended. Say 'isaiah' or 'hey <name>' to start a new one.",
          { durationMs: 5000 }
        );
      }
    }
    if (this.activeConversation.displayUpdateTimer) {
      clearTimeout(this.activeConversation.displayUpdateTimer);
    }
    this.activeConversation = null;
  }
}

const server = new ActuallyIsaiahServer({
  packageName: PACKAGE_NAME,
  apiKey: API_KEY,
  port: PORT,
  augmentOSWebsocketUrl: `ws://${CLOUD_URL}/tpa-ws`,
  webhookPath: '/webhook',
  // publicDir: path.join(__dirname, './public')
});

server.start()
  .then(() => console.log(`✅ Actually Isaiah server running on port ${PORT}`))
  .catch(error => console.error('Failed to start server:', error));
