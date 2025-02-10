// src/types/websocket/common.ts

export interface WebSocketMessage {
  type: string;
  timestamp?: Date;
  sessionId?: string;
}

export type Subscription = 
  | 'button_press' 
  | 'head_position'
  | 'phone_notifications' 
  | 'open_dashboard' 
  | 'audio_chunk' 
  | 'video' 
  | 'transcription' 
  | 'translation' 
  | 'all' 
  | '*';

export interface WebSocketError {
  code: string;
  message: string;
  details?: any;
}