// src/types/websocket/client.ts
import type { WebSocketMessage } from './common';
import type { Layout } from '../layout/layout';
import type { HardwareEvent } from '../events/hardware';
import type { PhoneEvent } from '../events/phone';
import type { UserSession } from '../core/user.session';

// Client -> Cloud Messages
export interface GlassesConnectionInitMessage extends WebSocketMessage {
  type: "connection_init";
  userId?: string;
}

export interface GlassesStartAppMessage extends WebSocketMessage {
  type: "start_app";
  packageName: string;
}

export interface GlassesStopAppMessage extends WebSocketMessage {
  type: "stop_app";
  packageName: string;
}

export interface GlassesDashboardStateMessage extends WebSocketMessage {
  type: "dashboard_state";
  isOpen: boolean;
}

export type GlassesToCloudMessage =
  | GlassesConnectionInitMessage
  | GlassesStartAppMessage
  | GlassesStopAppMessage
  | GlassesDashboardStateMessage
  | HardwareEvent
  | PhoneEvent;

// Cloud -> Client Messages
export interface CloudConnectionAckMessage extends WebSocketMessage {
  type: "connection_ack";
  userSession: Partial<UserSession>;
  sessionId: string;
}

export interface CloudConnectionErrorMessage extends WebSocketMessage {
  type: "connection_error";
  message: string;
}

export interface CloudDisplayEventMessage extends WebSocketMessage {
  type: "display_event";
  layout: Layout;
  durationMs?: number;
}

export interface CloudAppStateUpdateMessage extends WebSocketMessage {
  type: "app_state_update";
  packageName: string;
  status: 'not_installed' | 'installed' | 'booting' | 'running' | 'stopped' | 'error';
  error?: string;
}

export type CloudToGlassesMessage =
  | CloudConnectionAckMessage
  | CloudConnectionErrorMessage
  | CloudDisplayEventMessage
  | CloudAppStateUpdateMessage;