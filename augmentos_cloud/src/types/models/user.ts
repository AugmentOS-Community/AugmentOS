// src/types/models/user.ts
import { DatabaseModel } from '../base';

export interface UserI extends DatabaseModel {
  email: string;
  // Add any other user-specific fields here
}

export interface DeveloperI extends DatabaseModel {
  email: string;
  apiKeys?: string[];  // For managing TPA development
  organizationId?: string;  // For future organization support
}