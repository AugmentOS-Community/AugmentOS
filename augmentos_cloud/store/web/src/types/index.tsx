// src/types/app.types.ts

// Define TPA type enum
export enum TpaType {
  STANDARD = 'standard',
  SYSTEM = 'system',
  BACKGROUND = 'background'
}

// App settings interface
export interface AppSettings {
  [key: string]: unknown;
}

/**
 * App interface for frontend
 * Matches server-side AppI but adapted for the frontend needs
 */
export interface AppI {
  packageName: string;
  name: string;
  description?: string;
  webhookURL?: string;
  webviewURL?: string; // URL for phone UI
  logoURL: string;
  tpaType?: TpaType; // Type of TPA

  // App details
  version?: string;
  settings?: AppSettings;
  
  // Frontend-specific properties
  developerName?: string;
  isInstalled?: boolean;
  installedDate?: string;
  
  // Timestamps
  createdAt?: string;
  updatedAt?: string;
}

// Install info interface
export interface InstallInfo {
  packageName: string;
  installedDate: string;
}

// User interface
export interface User {
  id: string;
  email: string;
  installedApps?: InstallInfo[];
  createdAt?: string;
  updatedAt?: string;
}