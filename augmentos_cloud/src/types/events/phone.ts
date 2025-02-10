// src/types/events/phone.ts
import { WebSocketMessage } from '../websocket/common';

export interface PhoneNotificationEvent extends WebSocketMessage {
  type: 'phone_notification';
  notificationId: string;
  app: string;
  title: string;
  content: string;
  priority: 'low' | 'normal' | 'high';
  timestamp: Date;
}

export interface NotificationDismissedEvent extends WebSocketMessage {
  type: 'notification_dismissed';
  notificationId: string;
  timestamp: Date;
}

export type PhoneEvent = 
  | PhoneNotificationEvent 
  | NotificationDismissedEvent;