// src/messages/tpa-to-cloud.ts

import { BaseMessage } from './base';
import { TpaToCloudMessageType } from '../message-types';
import { ExtendedStreamType, StreamType } from '../streams';
import { DisplayRequest } from '../layouts';

/**
 * Connection initialization from TPA
 */
export interface TpaConnectionInit extends BaseMessage {
  type: TpaToCloudMessageType.CONNECTION_INIT;
  packageName: string;
  sessionId: string;
  apiKey: string;
}

/**
 * Subscription update from TPA
 */
export interface TpaSubscriptionUpdate extends BaseMessage {
  type: TpaToCloudMessageType.SUBSCRIPTION_UPDATE;
  packageName: string;
  subscriptions: ExtendedStreamType[];
}

/**
 * Photo request from TPA
 */
export interface PhotoRequest extends BaseMessage {
  type: TpaToCloudMessageType.PHOTO_REQUEST;
  packageName: string;
}

/**
 * Video stream request from TPA
 */
export interface VideoStreamRequest extends BaseMessage {
  type: TpaToCloudMessageType.VIDEO_STREAM_REQUEST;
  packageName: string;
}

/**
 * Union type for all messages from TPAs to cloud
 */
export type TpaToCloudMessage = 
  | TpaConnectionInit
  | TpaSubscriptionUpdate
  | DisplayRequest
  | PhotoRequest
  | VideoStreamRequest;

/**
 * Type guard to check if a message is a TPA connection init
 */
export function isTpaConnectionInit(message: TpaToCloudMessage): message is TpaConnectionInit {
  return message.type === TpaToCloudMessageType.CONNECTION_INIT;
}

/**
 * Type guard to check if a message is a TPA subscription update
 */
export function isTpaSubscriptionUpdate(message: TpaToCloudMessage): message is TpaSubscriptionUpdate {
  return message.type === TpaToCloudMessageType.SUBSCRIPTION_UPDATE;
}

/**
 * Type guard to check if a message is a TPA display request
 */
export function isDisplayRequest(message: TpaToCloudMessage): message is DisplayRequest {
  return message.type === TpaToCloudMessageType.DISPLAY_REQUEST;
}

/**
 * Type guard to check if a message is a TPA photo request
 */
export function isPhotoRequest(message: TpaToCloudMessage): message is PhotoRequest {
  return message.type === TpaToCloudMessageType.PHOTO_REQUEST;
}

/**
 * Type guard to check if a message is a TPA video stream request
 */
export function isVideoStreamRequest(message: TpaToCloudMessage): message is VideoStreamRequest {
  return message.type === TpaToCloudMessageType.VIDEO_STREAM_REQUEST;
}