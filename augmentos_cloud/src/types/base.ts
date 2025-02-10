// src/types/base.ts

/**
 * Base model for all database entities
 */
export interface DatabaseModel {
    _id?: string;
    createdAt?: Date;
    updatedAt?: Date;
  }
  
  /**
   * Supported languages for translation and localization
   */
  export type Language = 
    | "en" | "es" | "fr" | "de" | "it" | "pt" | "zh-Hans" 
    | "ja" | "ko" | "ru" | "ar" | "hi" | "tr" | "he" 
    | "ms" | "vi" | "id" | "th" | "pl" | "nl" | "sv" 
    | "da" | "fi" | "no" | "cs" | "hu" | "el" | "ro" 
    | "sk" | "bg" | "uk" | "hr" | "ca" | "eu" | "gl";  // Trimmed to most common languages