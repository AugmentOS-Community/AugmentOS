import React, {useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Platform,
  ScrollView,
  AppState,
  NativeModules,
  Linking,
  ViewStyle,
  TextStyle,
} from 'react-native';
import {useStatus} from '@/contexts/AugmentOSStatusProvider';
import coreCommunicator from '@/bridge/CoreCommunicator';
import {
  requestFeaturePermissions,
  PermissionFeatures,
  checkFeaturePermissions,
} from '@/utils/PermissionsUtils';
import {
  checkNotificationAccessSpecialPermission,
  checkAndRequestNotificationAccessSpecialPermission,
} from '@/utils/NotificationServiceUtils';
// import {NotificationService} from '@/utils/NotificationServiceUtils';
import showAlert from '@/utils/AlertUtils';
import { Header, Screen } from '@/components/ignite';
import { ThemedStyle } from '@/theme';
import { useAppTheme } from '@/utils/useAppTheme';
import { router } from 'expo-router';

export default function PrivacySettingsScreen() {
  const {status} = useStatus();
  const [isSensingEnabled, setIsSensingEnabled] = React.useState(status.core_info.sensing_enabled);
  const [forceCoreOnboardMic, setForceCoreOnboardMic] = React.useState(status.core_info.force_core_onboard_mic);
  const [isContextualDashboardEnabled, setIsContextualDashboardEnabled] = React.useState(
    status.core_info.contextual_dashboard_enabled,
  );
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const [calendarEnabled, setCalendarEnabled] = React.useState(true);
  const [calendarPermissionPending, setCalendarPermissionPending] = React.useState(false);
  const [appState, setAppState] = React.useState(AppState.currentState);
  const {themed} = useAppTheme();

  // Check permissions when screen loads
  useEffect(() => {
    const checkPermissions = async () => {
      console.log('Checking permissions in PrivacySettingsScreen');
      // Check notification permissions
      if (Platform.OS === 'android') {
        const hasNotificationAccess = await checkNotificationAccessSpecialPermission();
        setNotificationsEnabled(hasNotificationAccess);
      } else {
        const hasNotifications = await checkFeaturePermissions(PermissionFeatures.NOTIFICATIONS);
        setNotificationsEnabled(hasNotifications);
      }

      // Check calendar permissions
      const hasCalendar = await checkFeaturePermissions(PermissionFeatures.CALENDAR);
      setCalendarEnabled(hasCalendar);
    };

    checkPermissions();
  }, []);

  useEffect(() => {
    console.log('Calendar enabled:', calendarEnabled);
  }, [calendarEnabled]);

  // Monitor app state to detect when user returns from settings
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to the foreground - recheck permissions
        console.log('App returned to foreground, rechecking notification permissions');
        (async () => {
          if (Platform.OS === 'android') {
            const hasNotificationAccess = await checkNotificationAccessSpecialPermission();

            // If permission was granted while away, enable notifications and start service
            if (hasNotificationAccess && !notificationsEnabled) {
              console.log('Notification permission was granted while away, enabling notifications');
              setNotificationsEnabled(true);

              // Start notification listener service
              try {
                // await NotificationService.startNotificationListenerService();
              } catch (error) {
                console.error('Error starting notification service:', error);
              }
            }
          } else {
            const hasNotifications = await checkFeaturePermissions(PermissionFeatures.NOTIFICATIONS);
            if (hasNotifications && !notificationsEnabled) {
              setNotificationsEnabled(true);
            }
          }

          if (Platform.OS === 'ios') {
            console.log('Adding delay before checking iOS calendar permissions');
            await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 second delay
          }

          // Also recheck calendar permissions
          const hasCalendar = await checkFeaturePermissions(PermissionFeatures.CALENDAR);
          if (Platform.OS === 'ios' && calendarPermissionPending) {
            // If we're in the middle of requesting permissions, don't flip back to false
            if (hasCalendar) {
              setCalendarEnabled(true);
            }
            // Don't set to false even if hasCalendar is false temporarily
          } else {
            // Normal case - update if different
            if (hasCalendar !== calendarEnabled) {
              setCalendarEnabled(hasCalendar);
            }
          }
        })();
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
          [{text: 'OK'}],
        );
        return;
      }
    }

    // Continue with toggling the setting if permission granted or turning off
    let newForceCoreOnboardMic = !forceCoreOnboardMic;
    await coreCommunicator.sendToggleForceCoreOnboardMic(newForceCoreOnboardMic);
    setForceCoreOnboardMic(newForceCoreOnboardMic);
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
        //   await NotificationService.startNotificationListenerService();
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
      // If turning off, show alert and navigate to settings instead of just toggling off
      if (Platform.OS === 'android') {
        showAlert(
          'Revoke Notification Access',
          'To revoke notification access, please go to your device settings and disable notification access for AugmentOS Manager.',
          [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Go to Settings',
              onPress: () => {
                if (NativeModules.NotificationAccess && NativeModules.NotificationAccess.requestNotificationAccess) {
                  NativeModules.NotificationAccess.requestNotificationAccess();
                }
              },
            },
          ],
        );
      } else {
        // iOS: open app settings
        showAlert(
          'Revoke Notification Access',
          'To revoke notification access, please go to your device settings and disable notifications for AugmentOS Manager.',
          [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Go to Settings',
              onPress: () => {
                Linking.openSettings();
              },
            },
          ],
        );
      }
      // Do not immediately setNotificationsEnabled(false) or stop the service
    }
  };

  const handleToggleCalendar = async () => {
    if (calendarEnabled) {
      // We can't revoke the permission, but we can provide info and a way to open settings
      showAlert(
        'Permission Management',
        'To revoke calendar permission, please go to your device settings and modify app permissions.',
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Go to Settings',
            onPress: () => {
              Linking.openSettings();
            },
          },
        ],
      );
      return;
    }

    if (!calendarEnabled) {
      // Immediately set pending state to prevent toggle flicker
      setCalendarPermissionPending(true);
      try {
        const granted = await requestFeaturePermissions(PermissionFeatures.CALENDAR);
        console.log(`Calendar permission request result:`, granted);
        if (granted) {
          setCalendarEnabled(true);
        } else {
          setCalendarEnabled(false);
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
    }
  };

  // React.useEffect(() => {
  //   setIsSensingEnabled(status.core_info.sensing_enabled);
  // }, [status]);

  const switchColors = {
    trackColor: {
      false: '#666666',
      true: '#2196F3',
    },
    thumbColor: Platform.OS === 'ios' ? undefined : '#FFFFFF',
    ios_backgroundColor: '#666666',
  };

  // Theme colors
  const theme = {
    backgroundColor: '#1c1c1c',
    headerBg: '#333333',
    textColor: '#FFFFFF',
    subTextColor: '#999999',
    cardBg: '#333333',
    borderColor: '#444444',
    searchBg: '#2c2c2c',
    categoryChipBg: '#444444',
    categoryChipText: '#FFFFFF',
    selectedChipBg: '#666666',
    selectedChipText: '#FFFFFF',
  };

  return (
    <Screen preset="scroll" style={{paddingHorizontal: 16}}>
        <Header titleTx="privacySettings:title" leftIcon="caretLeft" onLeftPress={() => router.back()} />
        {/* ADDITIONAL PERMISSIONS SECTION */}
        <Text style={themed($sectionHeader)}>
          Additional Permissions
        </Text>

        {/* Notification Permission - Android Only */}
        {Platform.OS === 'android' && (
          <View
            style={[
              styles.settingItem,
              // Add a border at the bottom of the notifications item since it's not the last item
              styles.settingItemWithBorder,
              {borderBottomColor: themed($borderColor)},
            ]}>
            <View style={styles.settingTextContainer}>
              <Text style={themed($label)}>Notification Access</Text>
              <Text style={themed($value)}>
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
            <Text style={themed($label)}>Calendar Access</Text>
            <Text style={themed($value)}>
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
        <Text
          style={[
            styles.sectionHeader,
            styles.sectionHeaderWithMargin,
            themed($label),
          ]}>
          Privacy Options
        </Text>

        <View style={[styles.settingItem, styles.lastItemInSection]}>
          <View style={styles.settingTextContainer}>
            <Text style={themed($label)}>Sensing</Text>
            <Text style={themed($value)}>
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
    </Screen>
  );
};

const $container: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.background,
})

const $label: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
})

const $value: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.textDim,
})

const $sectionHeader: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
})

const $borderColor: ThemedStyle<string> = ({colors}) => colors.border;


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