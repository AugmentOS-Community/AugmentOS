import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform, Linking } from "react-native";
import { request, check, PERMISSIONS, Permission, RESULTS } from 'react-native-permissions';
import { Permission as RNPermission } from 'react-native';
import { PermissionsAndroid } from 'react-native';
import { checkNotificationAccessSpecialPermission } from "../utils/NotificationServiceUtils";

// Define permission features with their required permissions
export const PermissionFeatures: Record<string, string> = {
  BASIC: 'basic',             // Basic permissions needed for the app to function
  NOTIFICATIONS: 'notifications',
  CAMERA: 'camera',
  MICROPHONE: 'microphone',
  CALENDAR: 'calendar',
  LOCATION: 'location',
  BACKGROUND_LOCATION: 'background_location',
  BATTERY_OPTIMIZATION: 'battery_optimization'
};

// Define permission configuration interface
interface PermissionConfig {
  name: string;
  description: string;
  ios: any[]; // Using any to accommodate various permission types
  android: any[]; // Using any to accommodate various permission types
  critical: boolean;
  specialRequestNeeded?: boolean;
}

// Define permission configurations
const PERMISSION_CONFIG: Record<string, PermissionConfig> = {
  [PermissionFeatures.BASIC]: {
    name: 'Basic Permissions',
    description: 'Basic permissions required for AugmentOS to function',
    ios: [], // Different approach for iOS - we'll handle these individually
    android: [], // Will be set dynamically based on Android version
    critical: true, // App can't function without these
  },
  [PermissionFeatures.NOTIFICATIONS]: {
    name: 'Notification Access',
    description: 'Allow AugmentOS to forward notifications to your glasses',
    ios: [], // iOS handles notification permission differently
    android: typeof Platform.Version === 'number' && Platform.Version >= 33 ? 
      [PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS] : 
      [],
    critical: false,
  },
  [PermissionFeatures.CAMERA]: {
    name: 'Camera',
    description: 'Used for the fullscreen mirror mode',
    ios: [PERMISSIONS.IOS.CAMERA],
    android: [PermissionsAndroid.PERMISSIONS.CAMERA],
    critical: false,
  },
  [PermissionFeatures.MICROPHONE]: {
    name: 'Microphone',
    description: 'Used for audio and voice commands on your glasses',
    ios: [PERMISSIONS.IOS.MICROPHONE],
    android: [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO],
    critical: false,
  },
  [PermissionFeatures.CALENDAR]: {
    name: 'Calendar',
    description: 'Used to display your events on your glasses',
    ios: [PERMISSIONS.IOS.CALENDARS],
    android: [
      PermissionsAndroid.PERMISSIONS.READ_CALENDAR,
      PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR
    ],
    critical: false,
  },
  [PermissionFeatures.LOCATION]: {
    name: 'Location',
    description: 'Used for navigation and location-based services',
    ios: [PERMISSIONS.IOS.LOCATION_WHEN_IN_USE, PERMISSIONS.IOS.LOCATION_ALWAYS],
    android: [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION],
    critical: false,
  }
};

// Add separate entry for background location
PERMISSION_CONFIG[PermissionFeatures.BACKGROUND_LOCATION] = {
  name: 'Background Location',
  description: 'Used to track location when the app is in the background',
  ios: [PERMISSIONS.IOS.LOCATION_ALWAYS],
  android: typeof Platform.Version === 'number' && Platform.Version >= 29 ? 
    [PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION] : 
    [],
  critical: false,
  specialRequestNeeded: true // This flag indicates we need special handling
};

// Battery optimization permission temporarily disabled
// PERMISSION_CONFIG[PermissionFeatures.BATTERY_OPTIMIZATION] = {
//   name: 'Battery Optimization',
//   description: 'Allow AugmentOS to run in the background without battery restrictions',
//   ios: [], // iOS doesn't need this
//   android: [], // No actual Android permission, needs special handling
//   critical: false,
//   specialRequestNeeded: true
// };

// Initialize Android basic permissions based on device version
if (Platform.OS === 'android') {
  const basicPermissions = [];
  
  // Storage permissions based on Android version
  if (Platform.Version < 29) {
    basicPermissions.push(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
  }
  if (Platform.Version < 33) {
    basicPermissions.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
  }
  
  // Bluetooth permissions based on Android version
  if (Platform.Version >= 30 && Platform.Version < 31) {
    basicPermissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH);
    basicPermissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADMIN);
  }
  if (Platform.Version >= 31) {
    basicPermissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
    basicPermissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
    basicPermissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE);
  }
  
  // Add phone state permission
  basicPermissions.push(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE);
  
  PERMISSION_CONFIG[PermissionFeatures.BASIC].android = basicPermissions;
}

// Track which permission has been requested
export const markPermissionRequested = async (featureKey: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(`PERMISSION_REQUESTED_${featureKey}`, 'true');
  } catch (e) {
    console.error('Failed to save permission requested status', e);
  }
};

// Check if a permission has been requested before
export const hasPermissionBeenRequested = async (featureKey: string): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(`PERMISSION_REQUESTED_${featureKey}`);
    return value === 'true';
  } catch (e) {
    console.error('Failed to get permission requested status', e);
    return false;
  }
};

// Battery optimization permission temporarily disabled
// Function to handle battery optimization permission
export const requestBatteryOptimizationPermission = async (): Promise<boolean> => {
  // Always return true for now since battery optimization is disabled
  return true;
  
  // if (Platform.OS !== 'android') return true;
  
  // try {
  //   // Check if we need to request battery optimization permission
  //   const PowerManager = (Platform as any).NativeModules.PowerManager;
  //   if (!PowerManager) {
  //     console.log('PowerManager module not available');
  //     return false;
  //   }
    
  //   const isIgnoringBatteryOptimizations = await PowerManager.isIgnoringBatteryOptimizations();
    
  //   if (!isIgnoringBatteryOptimizations) {
  //     return new Promise((resolve) => {
  //       Alert.alert(
  //         'Disable Battery Optimization',
  //         'This application needs to remain active in the background to function properly. ' +
  //         'Please disable battery optimization for better performance and reliability.',
  //         [
  //           {
  //             text: 'Go to Settings',
  //             onPress: () => {
  //               // Open battery optimization settings
  //               Linking.openSettings();
  //               resolve(true);
  //             },
  //           },
  //           {
  //             text: 'Skip',
  //             style: 'cancel',
  //             onPress: () => resolve(false),
  //           },
  //         ],
  //         { cancelable: false }
  //       );
  //     });
  //   }
    
  //   return true;
  // } catch (error) {
  //   console.error('Error checking battery optimization status:', error);
  //   return false;
  // }
};

// Function to request background location
export const requestBackgroundLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    // For iOS, we already request background location as part of location
    return true;
  }
  
  if (typeof Platform.Version !== 'number' || Platform.Version < 29) {
    // No special handling needed for Android < 10
    return true;
  }
  
  // For Android 10+, need to request separately after other permissions
  try {
    const backgroundLocationPermission = PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION;
    
    // First check if we already have the permission
    const hasPermission = await PermissionsAndroid.check(backgroundLocationPermission);
    if (hasPermission) {
      return true;
    }
    
    // Need to show dialog first explaining why we need background location
    return new Promise((resolve) => {
      Alert.alert(
        'Background Location Permission',
        'AugmentOS needs access to your location when the app is in the background ' +
        'to provide continuous tracking and location-based features. ' +
        'On the next screen, please select "Allow all the time".',
        [
          {
            text: 'Continue',
            onPress: async () => {
              try {
                const result = await PermissionsAndroid.request(backgroundLocationPermission);
                resolve(result === PermissionsAndroid.RESULTS.GRANTED);
              } catch (error) {
                console.error('Error requesting background location permission:', error);
                resolve(false);
              }
            },
          },
          {
            text: 'Skip',
            style: 'cancel',
            onPress: () => resolve(false),
          },
        ],
        { cancelable: false }
      );
    });
  } catch (error) {
    console.error('Error in background location permission flow:', error);
    return false;
  }
};

// Request permissions for a specific feature - the main entry point
export const requestFeaturePermissions = async (featureKey: string): Promise<boolean> => {
  const config = PERMISSION_CONFIG[featureKey];
  if (!config) {
    console.error(`Unknown permission feature: ${featureKey}`);
    return false;
  }
  
  // Handle special permission cases
  if (config.specialRequestNeeded) {
    if (featureKey === PermissionFeatures.BACKGROUND_LOCATION) {
      return await requestBackgroundLocationPermission();
    } 
    // Battery optimization temporarily disabled
    else if (featureKey === PermissionFeatures.BATTERY_OPTIMIZATION) {
      return await requestBatteryOptimizationPermission(); // This now just returns true
    }
  }
  
  let allGranted = true;
  let partiallyGranted = false;
  
  // Mark this feature as having been requested
  await markPermissionRequested(featureKey);
  
  // For Android
  if (Platform.OS === 'android' && config.android.length > 0) {
    try {
      // Request all permissions for this feature
      const results = await PermissionsAndroid.requestMultiple(config.android);
      console.log(`${featureKey} permissions results:`, results);
      
      // Check each permission result
      let hasGranted = false;
      let allDenied = true;
      
      Object.entries(results).forEach(([permission, result]) => {
        if (result === PermissionsAndroid.RESULTS.GRANTED) {
          hasGranted = true;
          allDenied = false;
        } else if (result !== PermissionsAndroid.RESULTS.DENIED) {
          allDenied = false;
        }
      });
      
      if (hasGranted && !allDenied) {
        partiallyGranted = true;
      }
      
      if (allDenied && config.critical) {
        // Show critical permission denied message for essential features
        await displayCriticalPermissionDeniedWarning(config.name);
        return false;
      }
      
      if (!hasGranted && config.critical) {
        // Show warning for critical features
        await displayPermissionDeniedWarning(config.name);
        return false;
      }
      
      allGranted = Object.values(results).every(
        (value) => value === PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (error) {
      console.error(`Error requesting ${featureKey} permissions:`, error);
      return false;
    }
  }
  
  // For iOS
  if (Platform.OS === 'ios' && config.ios.length > 0) {
    for (const permission of config.ios) {
      try {
        const result = await request(permission);
        console.log(`iOS permission ${permission} result:`, result);
        
        if (result === RESULTS.GRANTED) {
          partiallyGranted = true;
        } else if (result === RESULTS.LIMITED) {
          partiallyGranted = true;
          allGranted = false;
        } else {
          allGranted = false;
          
          if (config.critical) {
            await displayPermissionDeniedWarning(config.name);
            return false;
          }
        }
      } catch (error) {
        console.error(`Error requesting iOS permission ${permission}:`, error);
        allGranted = false;
      }
    }
  }
  
  // For special case of Android notification access
  if (featureKey === PermissionFeatures.NOTIFICATIONS && Platform.OS === 'android') {
    const notificationAccess = await checkNotificationAccessSpecialPermission();
    if (!notificationAccess) {
      allGranted = false;
    }
  }
  
  return allGranted || partiallyGranted;
};

// Display appropriate warning messages
export const displayPermissionDeniedWarning = (permissionName: string): Promise<boolean> => {
  return new Promise((resolve) => {
    Alert.alert(
      `${permissionName} Permission Limited`,
      `Some features related to ${permissionName.toLowerCase()} may be limited or unavailable. You can enable full access in your device settings.`,
      [
        {
          text: 'Settings',
          onPress: () => {
            Linking.openSettings();
            resolve(false);
          },
        },
        {
          text: 'Continue Anyway',
          style: 'default',
          onPress: () => resolve(true)
        },
      ]
    );
  });
};

export const displayCriticalPermissionDeniedWarning = (permissionName: string): Promise<boolean> => {
  return new Promise((resolve) => {
    Alert.alert(
      `${permissionName} Required`,
      `AugmentOS needs ${permissionName.toLowerCase()} permissions to function properly. Please grant these permissions to continue.`,
      [
        {
          text: 'Try Again',
          style: 'default',
          onPress: () => resolve(true)
        },
      ]
    );
  });
};

// Request just the basic permissions needed for the app to function
export const requestBasicPermissions = async (): Promise<boolean> => {
  return await requestFeaturePermissions(PermissionFeatures.BASIC);
};

// Check if a feature has the permissions it needs
export const checkFeaturePermissions = async (featureKey: string): Promise<boolean> => {
  const config = PERMISSION_CONFIG[featureKey];
  if (!config) {
    console.error(`Unknown permission feature: ${featureKey}`);
    return false;
  }
  
  // For special permissions
  if (config.specialRequestNeeded) {
    if (featureKey === PermissionFeatures.BACKGROUND_LOCATION) {
      if (Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 29) {
        try {
          return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
        } catch (error) {
          console.error('Error checking background location permission:', error);
          return false;
        }
      }
      return true; // No special handling needed for older Android or iOS
    }
    
    // Battery optimization check disabled
    if (featureKey === PermissionFeatures.BATTERY_OPTIMIZATION) {
      return true; // Always return true for now
      
      // if (Platform.OS === 'android') {
      //   try {
      //     const PowerManager = (Platform as any).NativeModules.PowerManager;
      //     if (!PowerManager) return false;
      //     return await PowerManager.isIgnoringBatteryOptimizations();
      //   } catch (error) {
      //     console.error('Error checking battery optimization:', error);
      //     return false;
      //   }
      // }
      // return true; // Not needed for iOS
    }
  }
  
  // For Android
  if (Platform.OS === 'android' && config.android.length > 0) {
    // Check if we have any required permissions for this feature
    for (const permission of config.android) {
      try {
        const hasPermission = await PermissionsAndroid.check(permission);
        if (hasPermission) {
          return true; // We have at least one permission, feature can work
        }
      } catch (error) {
        console.error(`Error checking Android permission ${permission}:`, error);
      }
    }
  }
  
  // For iOS
  if (Platform.OS === 'ios' && config.ios.length > 0) {
    for (const permission of config.ios) {
      try {
        const status = await check(permission);
        if (status === RESULTS.GRANTED || status === RESULTS.LIMITED) {
          return true; // We have at least one permission, feature can work
        }
      } catch (error) {
        console.error(`Error checking iOS permission ${permission}:`, error);
      }
    }
  }
  
  // Special case for notifications on Android
  if (featureKey === PermissionFeatures.NOTIFICATIONS && Platform.OS === 'android') {
    return await checkNotificationAccessSpecialPermission();
  }
  
  return false;
};

// Required for AugmentOS Core permissions (now handled directly in React Native)
export const requestAugmentOSPermissions = async (): Promise<boolean> => {
  // Request basic permissions first
  const hasBasicPermissions = await requestBasicPermissions();
  if (!hasBasicPermissions) return false;
  
  // Background location permission temporarily disabled
  // const hasBackgroundLocation = await requestFeaturePermissions(PermissionFeatures.BACKGROUND_LOCATION);
  
  // Battery optimization permissions temporarily disabled
  // const hasBatteryOptimization = await requestFeaturePermissions(PermissionFeatures.BATTERY_OPTIMIZATION);
  
  // Return true if we have at least the basic permissions
  return hasBasicPermissions;
};

// For backwards compatibility with existing code
export const requestGrantPermissions = async (): Promise<boolean> => {
  return await requestBasicPermissions();
};

export const doesHaveAllPermissions = async (): Promise<boolean> => {
  // Check basic permissions only for now
  const hasBasic = await checkFeaturePermissions(PermissionFeatures.BASIC);
  return hasBasic;
  
  // Notification listener check temporarily disabled
  /*
  // On Android, also check notification permission (since it's critical for the app)
  if (Platform.OS === 'android') {
    const hasNotifications = await checkFeaturePermissions(PermissionFeatures.NOTIFICATIONS);
    return hasNotifications;
  }
  */
};

// For backwards compatibility
export const getIOSPermissions = () => {
  return []; // This should no longer be used
};

export const getAndroidPermissions = () => {
  return []; // This should no longer be used
};