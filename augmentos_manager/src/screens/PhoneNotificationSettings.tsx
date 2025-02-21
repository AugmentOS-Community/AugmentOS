import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Platform,
  Linking,
  Alert,
  BackHandler,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import BluetoothService from '../BluetoothService';
import { loadSetting, saveSetting } from '../augmentos_core_comms/SettingsHelper';
import { ENABLE_PHONE_NOTIFICATIONS_DEFAULT, SETTINGS_KEYS } from '../consts';
import ManagerCoreCommsService from '../augmentos_core_comms/ManagerCoreCommsService';
import { openCorePermissionsActivity, stopExternalService } from '../augmentos_core_comms/CoreServiceStarter';
import { ScrollView } from 'react-native-gesture-handler';
import { checkNotificationPermission, NotificationService, requestNotificationPermission, } from '../augmentos_core_comms/NotificationServiceUtils';
import GlobalEventEmitter from '../logic/GlobalEventEmitter';

interface PhoneNotificationSettingsProps {
  isDarkTheme: boolean;
  toggleTheme: () => void;
  navigation: any;
}

const PhoneNotificationSettings: React.FC<PhoneNotificationSettingsProps> = ({
  isDarkTheme,
  toggleTheme,
  navigation,
}) => {
  const [isEnablePhoneNotification, setIsEnablePhoneNotification] = React.useState(false);
  const { status } = useStatus();
  let n = navigation;
  const bluetoothService = BluetoothService.getInstance();

  const switchColors = {
    trackColor: {
      false: isDarkTheme ? '#666666' : '#D1D1D6',
      true: '#2196F3',
    },
    thumbColor:
      Platform.OS === 'ios' ? undefined : isDarkTheme ? '#FFFFFF' : '#FFFFFF',
    ios_backgroundColor: isDarkTheme ? '#666666' : '#D1D1D6',
  };

  const toggleEnablePhoneNotification = async () => {
    let newEnablePhoneNotification = !isEnablePhoneNotification;
    if (newEnablePhoneNotification) {
      if ((await checkNotificationPermission()) && (await requestNotificationPermission())) {
        console.log("We have notification perms!!!")
        if (await NotificationService.isNotificationListenerEnabled()) {
          console.log('Notification listener already enabled');
        } else {
          await NotificationService.startNotificationListenerService();
        }
      } else {
        console.log("Don't have permissions oh well sad")
        GlobalEventEmitter.emit('SHOW_BANNER', { message: 'Lacking permissions to display notifications', type: 'error' });
        newEnablePhoneNotification = false;
        return;
      }
    } else {
      await NotificationService.stopNotificationListenerService();
    }

    await saveSetting(SETTINGS_KEYS.ENABLE_PHONE_NOTIFICATIONS, newEnablePhoneNotification);
    setIsEnablePhoneNotification(newEnablePhoneNotification);
  };

  React.useEffect(() => {
    const loadEnablePhoneNotificationSetting = async () => {
      const enablePhoneNotification = await loadSetting(
        SETTINGS_KEYS.ENABLE_PHONE_NOTIFICATIONS,
        ENABLE_PHONE_NOTIFICATIONS_DEFAULT,
      );
      setIsEnablePhoneNotification(enablePhoneNotification);
    };

    loadEnablePhoneNotificationSetting();
  }, []);

  return (
    <ScrollView
      style={[
        styles.container,
        isDarkTheme ? styles.darkBackground : styles.lightBackground,
      ]}>
      <View style={{ marginTop: 20 }}>
        <Text
          style={[
            styles.title,
            isDarkTheme ? styles.lightText : styles.darkText,
          ]}>
          Notifications
        </Text>
        <Text
          style={[
            styles.description,
            isDarkTheme ? styles.lightSubtext : styles.darkSubtext,
          ]}>
          View your phone's notifications on your smart glasses.
        </Text>
        <Text
          style={[
            styles.notice,
            isDarkTheme ? styles.lightSubtext : styles.darkSubtext,
          ]}>
        </Text>

        <View style={styles.settingItem}>
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.label,
                isDarkTheme ? styles.lightText : styles.darkText,
              ]}>
              Enable Notifications
            </Text>
          </View>
          <Switch
            disabled={false}
            value={isEnablePhoneNotification}
            onValueChange={() => toggleEnablePhoneNotification()}
            trackColor={switchColors.trackColor}
            thumbColor={switchColors.thumbColor}
            ios_backgroundColor={switchColors.ios_backgroundColor}
          />
        </View>
      </View>
      {isEnablePhoneNotification && (
        <View style={{ marginTop: 20 }}>
          <Text style={[
            styles.stepNumber,
            isDarkTheme ? styles.lightText : styles.darkText,
          ]}>Coming soon: Edit notification settings for individual apps here</Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  link: {
    fontSize: 16,
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  notice: {
    fontSize: 14,
    textAlign: 'center',
    color: '#888',
    marginBottom: 30,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 15,
  },
  stepNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 10,
  },
  stepText: {
    fontSize: 16,
    flex: 1,
  },
  darkBackground: {
    backgroundColor: '#1c1c1c',
  },
  lightBackground: {
    backgroundColor: '#f0f0f0',
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
    borderBottomColor: '#333',
    borderBottomWidth: 1,
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
});

export default PhoneNotificationSettings;
