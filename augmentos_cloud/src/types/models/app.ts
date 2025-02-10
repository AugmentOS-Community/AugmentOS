// src/types/models/app.ts
import { DatabaseModel } from '../base';
import { Language } from '../base';

export type AppState = 
  | 'not_installed'  // Initial state
  | 'installed'      // Installed but never run
  | 'booting'        // Starting up
  | 'running'        // Active and running
  | 'stopped'        // Manually stopped
  | 'error';         // Error state

export interface AppI extends DatabaseModel {
  packageName: string;
  name: string;
  webhookURL: string;
  logoURL: string;
  developerId?: string;
  
  // Auth
  hashedEndpointSecret?: string;
  hashedApiKey?: string;
  
  // App details
  description?: string;
  version?: string;
  settings?: AppSettings;
}

// Setting types
export type SettingType = 
  | { type: "toggle"; key: string; label: string; defaultValue: boolean }
  | { type: "text"; key: string; label: string; defaultValue?: string }
  | { type: "select"; key: string; label: string; options: { label: string; value: string }[]; defaultValue?: string };

export type AppSettings = SettingType[];