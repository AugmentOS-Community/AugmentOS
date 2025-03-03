// src/messages/cloud-to-tpa.ts

import { BaseMessage } from './base';
import { CloudToTpaMessageType } from '../message-types';
import { StreamType } from '../streams';
import { AppSettings } from '../models';

//===========================================================
// Responses
//===========================================================

/**
 * Connection acknowledgment to TPA
 */
export interface TpaConnectionAck extends BaseMessage {
  type: CloudToTpaMessageType.CONNECTION_ACK;
  settings?: AppSettings;
}

/**
 * Connection error to TPA
 */
export interface TpaConnectionError extends BaseMessage {
  type: CloudToTpaMessageType.CONNECTION_ERROR;
  message: string;
  code?: string;
}

//===========================================================
// Updates
//===========================================================

/**
 * App stopped notification to TPA
 */
export interface AppStopped extends BaseMessage {
  type: CloudToTpaMessageType.APP_STOPPED;
  reason: "user_disabled" | "system_stop" | "error";
  message?: string;
}

/**
 * Settings update to TPA
 */
export interface SettingsUpdate extends BaseMessage {
  type: CloudToTpaMessageType.SETTINGS_UPDATE;
  packageName: string;
  settings: AppSettings;
}

//===========================================================
// Audio-related data types
//===========================================================
/**
 * Transcription data
 */
export interface TranscriptionData extends BaseMessage {
  type: StreamType.TRANSCRIPTION;
  text: string;  // The transcribed text
  isFinal: boolean;  // Whether this is a final transcription
  language?: string;  // Detected language code
  startTime: number;  // Start time in milliseconds
  endTime: number;  // End time in milliseconds
  speakerId?: string;  // ID of the speaker if available
  duration?: number;  // Audio duration in milliseconds
}

/**
 * Translation data
 */
export interface TranslationData extends BaseMessage {
  type: StreamType.TRANSLATION;
  text: string;  // The transcribed text
  isFinal: boolean;  // Whether this is a final transcription
  startTime: number;  // Start time in milliseconds
  endTime: number;  // End time in milliseconds
  speakerId?: string;  // ID of the speaker if available
  duration?: number;  // Audio duration in milliseconds
  transcribeLanguage?: string;  // The language code of the transcribed text
  translateLanguage?: string;  // The language code of the translated text
}


//===========================================================
// Stream data
//===========================================================

/**
 * Stream data to TPA
 */
export interface DataStream extends BaseMessage {
  type: CloudToTpaMessageType.DATA_STREAM;
  streamType: StreamType;
  data: unknown; // Type depends on the streamType
}

/**
 * Union type for all messages from cloud to TPAs
 */
export type CloudToTpaMessage =
  | TpaConnectionAck
  | TpaConnectionError
  | AppStopped
  | SettingsUpdate
  | TranscriptionData
  | TranslationData
  | DataStream;

//===========================================================
// Type guards
//===========================================================

export function isTpaConnectionAck(message: CloudToTpaMessage): message is TpaConnectionAck {
  return message.type === CloudToTpaMessageType.CONNECTION_ACK;
}

export function isTpaConnectionError(message: CloudToTpaMessage): message is TpaConnectionError {
  return message.type === CloudToTpaMessageType.CONNECTION_ERROR;
}

export function isAppStopped(message: CloudToTpaMessage): message is AppStopped {
  return message.type === CloudToTpaMessageType.APP_STOPPED;
}

export function isSettingsUpdate(message: CloudToTpaMessage): message is SettingsUpdate {
  return message.type === CloudToTpaMessageType.SETTINGS_UPDATE;
}

export function isDataStream(message: CloudToTpaMessage): message is DataStream {
  return message.type === CloudToTpaMessageType.DATA_STREAM;
}