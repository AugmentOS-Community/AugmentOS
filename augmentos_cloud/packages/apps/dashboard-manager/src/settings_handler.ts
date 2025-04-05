import axios from 'axios';

const PACKAGE_NAME = 'com.augmentos.dashboard';
const CLOUD_URL = process.env.CLOUD_HOST_NAME || 'cloud';

// Define the settings interface
interface UserSettings {
  dashboardContent: string;
  // Add more settings as needed
}

// Default settings
const DEFAULT_SETTINGS: UserSettings = {
  dashboardContent: 'notification_summary'
};

// Store user settings in memory
const userSettingsMap = new Map<string, UserSettings>();

/**
 * Fetches and applies settings for a user
 * @param userId The user ID
 * @returns The user settings object
 */
async function fetchSettings(userId: string): Promise<UserSettings> {
  try {
    // Fetch user settings from the cloud
    const response = await axios.get(`http://${CLOUD_URL}/tpasettings/user/${PACKAGE_NAME}`, {
      headers: { Authorization: `Bearer ${userId}` }
    });

    const settings = response.data.settings;
    console.log(`Fetched settings for userId ${userId}:`, settings);

    // Find the relevant settings
    const dashboardContentSetting = settings.find((s: any) => s.key === 'dashboard_content');

    // Create settings object with defaults if not found
    const userSettings: UserSettings = {
      dashboardContent: dashboardContentSetting?.value || DEFAULT_SETTINGS.dashboardContent
    };

    // Store the settings for this user
    userSettingsMap.set(userId, userSettings);
    console.log(`Settings for user ${userId}:`, userSettings);

    return userSettings;
  } catch (err) {
    console.error(`Error fetching settings for userId ${userId}:`, err);

    // Fallback to default values
    userSettingsMap.set(userId, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Gets the current settings for a user
 * @param userId The user ID
 * @returns The user settings object
 */
function getUserSettings(userId: string): UserSettings {
  return userSettingsMap.get(userId) || DEFAULT_SETTINGS;
}

/**
 * Gets the dashboard content setting for a user
 * @param userId The user ID
 * @returns The dashboard content setting
 */
function getUserDashboardContent(userId: string): string {
  return getUserSettings(userId).dashboardContent;
}

export {
  fetchSettings,
  getUserSettings,
  getUserDashboardContent,
  UserSettings
};
