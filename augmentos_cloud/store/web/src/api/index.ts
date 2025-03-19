// store/web/src/services/api.service.ts
import { AppI } from "@/types";
import axios from "axios";

// Configure base axios defaults
axios.defaults.withCredentials = true;

// Get appropriate base URL based on endpoint type
const getBaseUrl = (): string => {
  return import.meta.env.VITE_CLOUD_API_URL || "http://localhost:8002";
};

// Response interfaces
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// Token exchange response
export interface TokenExchangeResponse {
  coreToken: string;
}

// User interface
export interface User {
  id: string;
  email: string;
  createdAt?: string;
}

// App service functions
const appService = {
  /**
   * Get all public apps (no auth required)
   * Uses store backend
   */
  getPublicApps: async (): Promise<AppI[]> => {
    try {
      const response = await axios.get<ApiResponse<AppI[]>>(
        `${getBaseUrl()}/api/apps/public`
      );
      return response.data.data || [];
    } catch (error) {
      console.error("Error fetching public apps:", error);
      return []; // Return empty array on error
    }
  },

  /**
   * Get all available apps (auth required)
   * Uses store backend
   */
  getAvailableApps: async (): Promise<AppI[]> => {
    try {
      const response = await axios.get<ApiResponse<AppI[]>>(
        `${getBaseUrl()}/api/apps/available`
      );
      return response.data.data;
    } catch (error) {
      console.error("Error fetching available apps:", error);
      throw error;
    }
  },

  /**
   * Get user's installed apps (auth required)
   * Uses store backend
   */
  getInstalledApps: async (): Promise<AppI[]> => {
    try {
      const response = await axios.get<ApiResponse<AppI[]>>(
        `${getBaseUrl()}/api/apps/installed`
      );
      return response.data.data;
    } catch (error) {
      console.error("Error fetching installed apps:", error);
      throw error;
    }
  },

  /**
   * Get app details by package name (no auth required)
   * Uses store backend
   */
  getAppByPackageName: async (packageName: string): Promise<AppI | null> => {
    try {
      const response = await axios.get<ApiResponse<AppI>>(
        `${getBaseUrl()}/api/apps/${packageName}`
      );
      return response.data.data;
    } catch (error) {
      console.error(`Error fetching app ${packageName}:`, error);
      return null;
    }
  },

  /**
   * Install an app (auth required)
   * Uses cloud backend
   */
  installApp: async (packageName: string): Promise<boolean> => {
    try {
      const response = await axios.post<ApiResponse<null>>(
        `${getBaseUrl()}/api/apps/install/${packageName}`
      );
      return response.data.success;
    } catch (error) {
      console.error(`Error installing app ${packageName}:`, error);
      throw error;
    }
  },

  /**
   * Uninstall an app (auth required)
   * Uses cloud backend
   */
  uninstallApp: async (packageName: string): Promise<boolean> => {
    try {
      const response = await axios.post<ApiResponse<null>>(
        `${getBaseUrl()}/api/apps/uninstall/${packageName}`
      );
      return response.data.success;
    } catch (error) {
      console.error(`Error uninstalling app ${packageName}:`, error);
      throw error;
    }
  },

  /**
   * Start an app (auth required)
   * Uses cloud backend
   */
  startApp: async (packageName: string): Promise<boolean> => {
    try {
      const response = await axios.post<ApiResponse<null>>(
        `${getBaseUrl()}/api/apps/${packageName}/start`,
      );
      return response.data.success;
    } catch (error) {
      console.error(`Error starting app ${packageName}:`, error);
      throw error;
    }
  },

  /**
   * Stop an app (auth required)
   * Uses cloud backend
   */
  stopApp: async (packageName: string): Promise<boolean> => {
    try {
      const response = await axios.post<ApiResponse<null>>(
        `${getBaseUrl()}/api/apps/${packageName}/stop`,
      );
      return response.data.success;
    } catch (error) {
      console.error(`Error stopping app ${packageName}:`, error);
      throw error;
    }
  },

  /**
   * Search for apps (no auth required)
   * Uses store backend
   */
  searchApps: async (query: string): Promise<AppI[]> => {
    try {
      const response = await axios.get<ApiResponse<AppI[]>>(
        `${getBaseUrl()}/api/apps/search?q=${encodeURIComponent(query)}`
      );
      return response.data.data || [];
    } catch (error) {
      console.error(`Error searching apps with query "${query}":`, error);
      return []; // Return empty array on error
    }
  }
};

// User service functions
const userService = {
  /**
   * Get current user info (auth required)
   * Uses store backend
   */
  getCurrentUser: async (): Promise<User | null> => {
    try {
      const response = await axios.get<ApiResponse<User>>(
        `${getBaseUrl()}/api/user/me`
      );
      return response.data.data;
    } catch (error) {
      console.error("Error fetching current user:", error);
      return null;
    }
  }
};

// Auth service functions
const authService = {
  /**
   * Exchange a Supabase token for a Core token
   * @param supabaseToken The Supabase JWT token
   * @returns Promise with the Core token
   */
  exchangeToken: async (supabaseToken: string): Promise<string> => {
    try {
      const response = await axios.post<TokenExchangeResponse>(
        `${getBaseUrl()}/api/auth/exchange-token`,
        { supabaseToken },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      if (response.status === 200 && response.data.coreToken) {
        return response.data.coreToken;
      } else {
        throw new Error(`Failed to exchange token: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Error exchanging token:", error);
      throw error;
    }
  }
};

// Set up auth token interceptor
export const setAuthToken = (token: string | null) => {
  if (token) {
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common["Authorization"];
  }
};

// Export services
export default {
  app: appService,
  user: userService,
  auth: authService,
  setAuthToken
};