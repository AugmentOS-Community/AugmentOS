// src/types/index.ts

import { CloudToGlassesMessage, GlassesToCloudMessage } from './websocket/client';
import { CloudToTpaMessage, TpaToCloudMessage } from './websocket/tpa';

// Base exports
export * from './base';

// Model exports
export * from './models/user';
export * from './models/app';
export * from './models/session';

// Event exports
export * from './events/hardware';
export * from './events/display';
export * from './events/phone';

// WebSocket exports
export * from './websocket/common';
export * from './websocket/client';
export * from './websocket/tpa';

// Common type bundles
export type AnyCloudMessage = CloudToGlassesMessage | CloudToTpaMessage;
export type AnyClientMessage = GlassesToCloudMessage | TpaToCloudMessage;