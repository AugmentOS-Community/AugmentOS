import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Platform,
  ScrollView,
  Animated,
  Alert,
  AppState,
  NativeModules,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { Slider } from 'react-native-elements';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import coreCommunicator from '../bridge/CoreCommunicator';
import { loadSetting, saveSetting } from '../logic/SettingsHelper';
import { SETTINGS_KEYS } from '../consts';
import NavigationBar from '../components/NavigationBar';
import { supabase } from '../supabaseClient';
import { requestFeaturePermissions, PermissionFeatures, checkFeaturePermissions, PermissionRequestResult } from '../logic/PermissionsUtils';
import { checkNotificationAccessSpecialPermission, checkAndRequestNotificationAccessSpecialPermission } from "../utils/NotificationServiceUtils";
import { NotificationService } from '../logic/NotificationServiceUtils';
import showAlert from '../utils/AlertUtils';

interface PrivacySettingsScreenProps {
  isDarkTheme: boolean;
  toggleTheme: () => void;
  navigation: any;
}

const PrivacySettingsScreen: React.FC<PrivacySettingsScreenProps> = ({
  isDarkTheme,
  toggleTheme,
  navigation,
}) => {
  const { status } = useStatus();
  const [isSensingEnabled, setIsSensingEnabled] = React.useState(
    status.core_info.sensing_enabled,
  );
  const [forceCoreOnboardMic, setForceCoreOnboardMic] = React.useState(status.core_info.force_core_onboard_mic);
  const [isContextualDashboardEnabled, setIsContextualDashboardEnabled] = React.useState(
    status.core_info.contextual_dashboard_enabled,
  );
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(false);
  const [calendarEnabled, setCalendarEnabled] = React.useState(false);
  const [calendarPermissionPending, setCalendarPermissionPending] = React.useState(false);
  const [appState, setAppState] = React.useState(AppState.currentState);


  const checkPermissions = async () => {
    console.log('Checking permissions in PrivacySettingsScreen');
    // Check notification permissions
    if (Platform.OS === 'android') {
      const hasNotificationAccess = await checkNotificationAccessSpecialPermission();
      setNotificationsEnabled(hasNotificationAccess);
    } else {
      // const hasNotifications = await checkFeaturePermissions(PermissionFeatures.NOTIFICATIONS);
      // setNotificationsEnabled(hasNotifications);
      // the permissions doesn't do anything for us on iOS:
      setNotificationsEnabled(true);
    }

    // Check calendar permissions
    const hasCalendar = await checkFeaturePermissions(PermissionFeatures.CALENDAR);
    setCalendarEnabled(hasCalendar);
  };

  // Check permissions when screen loads
  React.useEffect(() => {
    checkPermissions();
  }, []);

  // Monitor app state to detect when user returns from settings
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to the foreground - recheck permissions
        console.log('App returned to foreground, rechecking notification permissions');
        await checkPermissions();
      }
      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
    };
  }, [appState, notificationsEnabled, calendarEnabled]);

  const toggleSensing = async () => {
    let newSensing = !isSensingEnabled;
    await coreCommunicator.sendToggleSensing(newSensing);
    setIsSensingEnabled(newSensing);
  };

  const toggleForceCoreOnboardMic = async () => {
    // First request microphone permission if we're enabling the mic
    if (!forceCoreOnboardMic) {
      // We're about to enable the mic, so request permission
      const hasMicPermission = await requestFeaturePermissions(PermissionFeatures.MICROPHONE);
      if (!hasMicPermission) {
        // Permission denied, don't toggle the setting
        console.log('Microphone permission denied, cannot enable onboard mic');
        showAlert(
          'Microphone Permission Required',
          'Microphone permission is required to use the onboard microphone feature. Please grant microphone permission in settings.',
          [{ text: 'OK' }]
        );
        return;
      }
    }

    // Continue with toggling the setting if permission granted or turning off
    let newForceCoreOnboardMic = !forceCoreOnboardMic;
    await coreCommunicator.sendToggleForceCoreOnboardMic(newForceCoreOnboardMic);
    setForceCoreOnboardMic(newForceCoreOnboardMic);
  };

  const toggleContextualDashboard = async () => {
    let newContextualDashboardSetting = !isContextualDashboardEnabled;
    await coreCommunicator.sendToggleContextualDashboard(newContextualDashboardSetting);
    setIsContextualDashboardEnabled(newContextualDashboardSetting);
  };

  const changeBrightness = async (newBrightness: number) => {
    if (status.glasses_info?.brightness === '-') { return; }
    await coreCommunicator.setGlassesBrightnessMode(newBrightness, false);

    console.log(`Brightness set to: ${newBrightness}`);
  };

  const handleToggleNotifications = async () => {
    if (!notificationsEnabled) {
      if (Platform.OS === 'android') {
        // Try to request notification access
        await checkAndRequestNotificationAccessSpecialPermission();

        // Re-check permissions after the request
        const hasAccess = await checkNotificationAccessSpecialPermission();
        if (hasAccess) {
          // Start notification listener service if permission granted
          await NotificationService.startNotificationListenerService();
          setNotificationsEnabled(true);
        }
      } else {
        // iOS notification permissions
        const granted = await requestFeaturePermissions(PermissionFeatures.NOTIFICATIONS);
        if (granted) {
          setNotificationsEnabled(true);
        }
      }
    } else {
      // If turning off, stop notification service on Android
      if (Platform.OS === 'android') {
        await NotificationService.stopNotificationListenerService();
      }
      setNotificationsEnabled(false);
    }
  };

  const handleToggleCalendar = async () => {
    if (!calendarEnabled) {
      // Immediately set pending state to prevent toggle flicker
      setCalendarPermissionPending(true);

      try {
        // For iOS specifically, we need to handle permission granting with special care
        if (Platform.OS === 'ios') {
          // Keep the toggle enabled during the permission request
          // Wait a short time before requesting to ensure the UI updates first
          setCalendarEnabled(true);
          await new Promise(resolve => setTimeout(resolve, 100));

          // Request permission
          const granted = await requestFeaturePermissions(PermissionFeatures.CALENDAR);

          console.log(`Calendar permission request result:`, granted);

          if (!granted) {
            // Permission was denied (either first time or previously)
            // We'll check when they come back from Settings with the AppState change listener
            console.log('Calendar permission denied or previously denied');
            setCalendarEnabled(false);
          } else {
            // Permission was granted, make sure toggle stays ON
            setCalendarEnabled(true);

            // Wait a moment to ensure UI updates before calendar sync
            await new Promise(resolve => setTimeout(resolve, 100));

            // Try to trigger calendar sync
            try {
              if (Platform.OS === 'ios' && NativeModules.AOSModule) {
                // Use a synchronous pattern to prevent state changes during the promise
                try {
                  const result = await NativeModules.AOSModule.syncCalendarEvents();
                  console.log('Explicitly triggered iOS calendar sync after permission granted', result);
                } catch (syncErr) {
                  console.error('Error syncing calendar:', syncErr);
                }
              } else {
                console.log('Calendar sync not available for this platform');
              }
            } catch (error) {
              console.error('Failed to trigger calendar sync:', error);
            }
          }
        } else {
          // For Android, keep original flow
          const granted = await requestFeaturePermissions(PermissionFeatures.CALENDAR);
          if (granted === true) {
            setCalendarEnabled(true);
          } else {
            setCalendarEnabled(false);
          }
        }
      } catch (error) {
        console.error('Error requesting calendar permissions:', error);
        setCalendarEnabled(false);
      } finally {
        // Make sure we're setting pending to false after everything else is done
        setTimeout(() => {
          setCalendarPermissionPending(false);
        }, 300);
      }
    } else {
      // We can't revoke the permission, but we can provide info
      showAlert(
        'Permission Management',
        'To revoke calendar permission, please go to your device settings and modify app permissions.',
        [{ text: 'OK' }]
      );
    }
  };


  // React.useEffect(() => {
  //   setIsSensingEnabled(status.core_info.sensing_enabled);
  // }, [status]);

  const switchColors = {
    trackColor: {
      false: isDarkTheme ? '#666666' : '#D1D1D6',
      true: '#2196F3',
    },
    thumbColor:
      Platform.OS === 'ios' ? undefined : isDarkTheme ? '#FFFFFF' : '#FFFFFF',
    ios_backgroundColor: isDarkTheme ? '#666666' : '#D1D1D6',
  };

  // Theme colors
  const theme = {
    backgroundColor: isDarkTheme ? '#1c1c1c' : '#f9f9f9',
    headerBg: isDarkTheme ? '#333333' : '#fff',
    textColor: isDarkTheme ? '#FFFFFF' : '#333333',
    subTextColor: isDarkTheme ? '#999999' : '#666666',
    cardBg: isDarkTheme ? '#333333' : '#fff',
    borderColor: isDarkTheme ? '#444444' : '#e0e0e0',
    searchBg: isDarkTheme ? '#2c2c2c' : '#f5f5f5',
    categoryChipBg: isDarkTheme ? '#444444' : '#e9e9e9',
    categoryChipText: isDarkTheme ? '#FFFFFF' : '#555555',
    selectedChipBg: isDarkTheme ? '#666666' : '#333333',
    selectedChipText: isDarkTheme ? '#FFFFFF' : '#FFFFFF',
  };

  return (
    <View
      style={[
        styles.container,
        isDarkTheme ? styles.darkBackground : styles.lightBackground,
      ]}>
      <ScrollView style={styles.scrollViewContainer}>

        {/* ADDITIONAL PERMISSIONS SECTION */}
        <Text style={[
          styles.sectionHeader,
          isDarkTheme ? styles.lightText : styles.darkText
        ]}>
          Additional Permissions
        </Text>

        {/* Notification Permission - Android Only */}
        {Platform.OS === 'android' && (
          <View style={[
            styles.settingItem,
            // Add a border at the bottom of the notifications item since it's not the last item
            styles.settingItemWithBorder,
            { borderBottomColor: isDarkTheme ? '#444444' : '#e0e0e0' }
          ]}>
            <View style={styles.settingTextContainer}>
              <Text
                style={[
                  styles.label,
                  isDarkTheme ? styles.lightText : styles.darkText
                ]}>
                Notification Access
              </Text>
              <Text
                style={[
                  styles.value,
                  isDarkTheme ? styles.lightSubtext : styles.darkSubtext
                ]}>
                Allow AugmentOS to forward your phone notifications to your smart glasses.
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleToggleNotifications}
              trackColor={switchColors.trackColor}
              thumbColor={switchColors.thumbColor}
              ios_backgroundColor={switchColors.ios_backgroundColor}
            />
          </View>
        )}

        {/* Calendar Permission - last item in this section so no border */}
        <View style={[styles.settingItem, styles.lastItemInSection]}>
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.label,
                isDarkTheme ? styles.lightText : styles.darkText
              ]}>
              Calendar Access
            </Text>
            <Text
              style={[
                styles.value,
                isDarkTheme ? styles.lightSubtext : styles.darkSubtext
              ]}>
              Allow AugmentOS to display your calendar events on your smart glasses.
            </Text>
          </View>
          <Switch
            value={calendarEnabled}
            onValueChange={handleToggleCalendar}
            disabled={calendarPermissionPending}
            trackColor={switchColors.trackColor}
            thumbColor={switchColors.thumbColor}
            ios_backgroundColor={switchColors.ios_backgroundColor}
          />
        </View>

        {/* PRIVACY OPTIONS SECTION */}
        <Text style={[
          styles.sectionHeader,
          styles.sectionHeaderWithMargin,
          isDarkTheme ? styles.lightText : styles.darkText
        ]}>
          Privacy Options
        </Text>

        <View style={[styles.settingItem, styles.lastItemInSection]}>
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.label,
                isDarkTheme ? styles.lightText : styles.darkText
              ]}>
              Sensing
            </Text>
            <Text
              style={[
                styles.value,
                isDarkTheme ? styles.lightSubtext : styles.darkSubtext
              ]}>
              Enable microphones & cameras.
            </Text>
          </View>
          <Switch
            value={isSensingEnabled}
            onValueChange={toggleSensing}
            trackColor={switchColors.trackColor}
            thumbColor={switchColors.thumbColor}
            ios_backgroundColor={switchColors.ios_backgroundColor}
          />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  scrollViewContainer: {
    marginBottom: 55,
  },
  container: {
    flex: 1,
    padding: 20,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 8,
    fontFamily: 'Montserrat-Bold',
  },
  sectionHeaderWithMargin: {
    marginTop: 30, // Add space between sections
  },
  titleContainer: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginHorizontal: -20,
    marginTop: -20,
    marginBottom: 10,
  },
  titleContainerDark: {
    backgroundColor: '#333333',
  },
  titleContainerLight: {
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
    textAlign: 'left',
    color: '#FFFFFF',
    marginBottom: 5,
  },
  darkBackground: {
    backgroundColor: '#1c1c1c',
  },
  lightBackground: {
    backgroundColor: '#f0f0f0',
  },
  redText: {
    color: '#FF0F0F', // Using orange as a warning color
  },
  darkText: {
    color: 'black',
  },
  lightText: {
    color: 'white',
  },
  darkSubtext: {
    color: '#666666',
  },
  lightSubtext: {
    color: '#999999',
  },
  darkIcon: {
    color: '#333333',
  },
  lightIcon: {
    color: '#666666',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButtonText: {
    marginLeft: 10,
    fontSize: 18,
    fontWeight: 'bold',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
  },
  settingItemWithBorder: {
    borderBottomWidth: 1,
    // Border color will be set dynamically based on theme
  },
  lastItemInSection: {
    // No bottom border for the last item in a section
    borderBottomWidth: 0,
  },
  settingTextContainer: {
    flex: 1,
    paddingRight: 10,
  },
  label: {
    fontSize: 16,
    flexWrap: 'wrap',
  },
  value: {
    fontSize: 12,
    marginTop: 5,
    flexWrap: 'wrap',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  disabledItem: {
    opacity: 0.4,
  },
});

export default PrivacySettingsScreen;
