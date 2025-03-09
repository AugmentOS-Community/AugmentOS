// src/message-types.ts

import { StreamType } from "./streams";

/**
 * Types of messages from glasses to cloud
 */
export enum GlassesToCloudMessageType {
  // Control actions
  CONNECTION_INIT = 'connection_init',
  // START_APP = 'start_app',
  // STOP_APP = 'stop_app',

  START_APP = StreamType.START_APP,
  STOP_APP = StreamType.STOP_APP,

  DASHBOARD_STATE = 'dashboard_state',
  OPEN_DASHBOARD = StreamType.OPEN_DASHBOARD,
  
  // OPEN_DASHBOARD = 'open_dashboard',
  // Events and data
  // BUTTON_PRESS = 'button_press',
  // HEAD_POSITION = 'head_position',
  // GLASSES_BATTERY_UPDATE = 'glasses_battery_update',
  // PHONE_BATTERY_UPDATE = 'phone_battery_update',
  // GLASSES_CONNECTION_STATE = 'glasses_connection_state',
  // LOCATION_UPDATE = 'location_update',
  // PHONE_NOTIFICATION = 'phone_notification',
  // NOTIFICATION_DISMISSED = 'notification_dismissed'

  BUTTON_PRESS = StreamType.BUTTON_PRESS,
  HEAD_POSITION = StreamType.HEAD_POSITION,
  GLASSES_BATTERY_UPDATE = StreamType.GLASSES_BATTERY_UPDATE,
  PHONE_BATTERY_UPDATE = StreamType.PHONE_BATTERY_UPDATE,
  GLASSES_CONNECTION_STATE = StreamType.GLASSES_CONNECTION_STATE,
  LOCATION_UPDATE = StreamType.LOCATION_UPDATE,
  VAD = StreamType.VAD,
  PHONE_NOTIFICATION = StreamType.PHONE_NOTIFICATION,
  NOTIFICATION_DISMISSED = StreamType.NOTIFICATION_DISMISSED,
  CALENDAR_EVENT = StreamType.CALENDAR_EVENT
}

/**
 * Types of messages from cloud to glasses
 */
export enum CloudToGlassesMessageType {
  // Responses
  CONNECTION_ACK = 'connection_ack',
  CONNECTION_ERROR = 'connection_error',
  AUTH_ERROR = 'auth_error',
  
  // Updates
  DISPLAY_EVENT = 'display_event',
  APP_STATE_CHANGE = 'app_state_change',
  MICROPHONE_STATE_CHANGE = 'microphone_state_change',

  WEBSOCKET_ERROR = 'websocket_error'
}

/**
 * Types of messages from TPAs to cloud
 */
export enum TpaToCloudMessageType {
  // Commands
  CONNECTION_INIT = 'tpa_connection_init',
  SUBSCRIPTION_UPDATE = 'subscription_update',
  
  // Requests
  DISPLAY_REQUEST = 'display_event'
}

/**
 * Types of messages from cloud to TPAs
 */
export enum CloudToTpaMessageType {
  // Responses
  CONNECTION_ACK = 'tpa_connection_ack',
  CONNECTION_ERROR = 'tpa_connection_error',
  
  // Updates
  APP_STOPPED = 'app_stopped',
  SETTINGS_UPDATE = 'settings_update',
  
  // Stream data
  DATA_STREAM = 'data_stream',

  WEBSOCKET_ERROR = 'websocket_error'
}

/**
 * Control action message types (subset of GlassesToCloudMessageType)
 */
export const ControlActionTypes = [
  GlassesToCloudMessageType.CONNECTION_INIT,
  GlassesToCloudMessageType.START_APP,
  GlassesToCloudMessageType.STOP_APP,
  GlassesToCloudMessageType.DASHBOARD_STATE,
  GlassesToCloudMessageType.OPEN_DASHBOARD
] as const;

/**
 * Event message types (subset of GlassesToCloudMessageType)
 */
export const EventTypes = [
  GlassesToCloudMessageType.BUTTON_PRESS,
  GlassesToCloudMessageType.HEAD_POSITION,
  GlassesToCloudMessageType.GLASSES_BATTERY_UPDATE,
  GlassesToCloudMessageType.PHONE_BATTERY_UPDATE,
  GlassesToCloudMessageType.GLASSES_CONNECTION_STATE,
  GlassesToCloudMessageType.LOCATION_UPDATE,
  GlassesToCloudMessageType.VAD,
  GlassesToCloudMessageType.PHONE_NOTIFICATION,
  GlassesToCloudMessageType.NOTIFICATION_DISMISSED,
  GlassesToCloudMessageType.CALENDAR_EVENT
] as const;

/**
 * Response message types (subset of CloudToGlassesMessageType)
 */
export const ResponseTypes = [
  CloudToGlassesMessageType.CONNECTION_ACK,
  CloudToGlassesMessageType.CONNECTION_ERROR,
  CloudToGlassesMessageType.AUTH_ERROR
] as const;

/**
 * Update message types (subset of CloudToGlassesMessageType)
 */
export const UpdateTypes = [
  CloudToGlassesMessageType.DISPLAY_EVENT,
  CloudToGlassesMessageType.APP_STATE_CHANGE,
  CloudToGlassesMessageType.MICROPHONE_STATE_CHANGE
] as const;