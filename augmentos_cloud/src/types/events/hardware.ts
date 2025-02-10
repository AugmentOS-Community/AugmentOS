// src/types/events/hardware.ts
import { WebSocketMessage } from '../websocket/common';

export interface ButtonPressEvent extends WebSocketMessage {
  type: 'button_press';
  buttonId: string;
  pressType: 'short' | 'long';
  timestamp: Date;
}

export interface HeadPositionEvent extends WebSocketMessage {
  type: 'head_position';
  position: 'up' | 'down';
  timestamp: Date;
}

export interface BatteryUpdateEvent extends WebSocketMessage {
  type: 'battery_update';
  level: number;  // 0-100
  charging: boolean;
  timeRemaining?: number;  // minutes
  timestamp: Date;
}

export type HardwareEvent = 
  | ButtonPressEvent 
  | HeadPositionEvent 
  | BatteryUpdateEvent;