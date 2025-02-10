// src/types/models/session.ts
import { DatabaseModel } from '../base';
import { Language } from '../base';
import { AppState } from './app';
import { DisplayHistory, Layout } from '../events/display';
import { WebSocket } from 'ws';

export interface TranscriptSegment {
  speakerId: string;
  text: string;
  durationInMilliseconds: number;
  relativeStartTimeInMilliseconds: number;
  wordsEndAndStartTimesInMilliseconds: [number, number];
}

export interface TranscriptI extends DatabaseModel {
  userId: string;
  transcriptSegments: TranscriptSegment[];
}

export interface AppSessionI extends DatabaseModel {
  userId: string;
  packageName: string;
  state: AppState;
  subscriptions: string[];
  translateToLanguages?: Language[];
  translationConfig?: {
    preserveFormatting?: boolean;
    profanityFilter?: boolean;
    contextLength?: number;
  };
  endedAt?: Date;
  disconnectedAt?: Date;
  websocket?: WebSocket;
}

export interface UserSessionI extends DatabaseModel {
  userId: string;
  sessionStartTime: Date;
  appSessions: AppSessionI[];
  activeAppSession?: AppSessionI;
  transcript: TranscriptI;
  displayHistory: DisplayHistory;
  currentDisplay?: Layout;
  pushStream?: any;  // For audio streaming
  recognizer?: any;  // For speech recognition
  bufferedAudio?: ArrayBuffer[];
}