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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { Slider } from 'react-native-elements';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import { BluetoothService } from '../BluetoothService';
import { loadSetting, saveSetting } from '../augmentos_core_comms/SettingsHelper';
import { SETTINGS_KEYS } from '../consts';
import NavigationBar from '../components/NavigationBar';
import { supabase } from '../supabaseClient';

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

  React.useEffect(() => {
    const loadInitialSettings = async () => { };

    loadInitialSettings();
  }, []);

  const toggleSensing = async () => {
    let newSensing = !isSensingEnabled;
    await BluetoothService.getInstance().sendToggleSensing(newSensing);
    setIsSensingEnabled(newSensing);
  };

  const toggleForceCoreOnboardMic = async () => {
    let newForceCoreOnboardMic = !forceCoreOnboardMic;
    await BluetoothService.getInstance().sendToggleForceCoreOnboardMic(newForceCoreOnboardMic);
    setForceCoreOnboardMic(newForceCoreOnboardMic);
  };

  const toggleContextualDashboard = async () => {
    let newContextualDashboardSetting = !isContextualDashboardEnabled;
    await BluetoothService.getInstance().sendToggleContextualDashboard(newContextualDashboardSetting);
    setIsContextualDashboardEnabled(newContextualDashboardSetting);
  };

  const changeBrightness = async (newBrightness: number) => {
    if (status.glasses_info?.brightness === '-') {return;}
    await BluetoothService.getInstance().setGlassesBrightnessMode(newBrightness, false);

    console.log(`Brightness set to: ${newBrightness}`);
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

        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => {
            navigation.navigate('PhoneNotificationSettings');
          }}>
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.label,
                isDarkTheme ? styles.lightText : styles.darkText,
              ]}>
              Notifications
            </Text>
          </View>
          <Icon
            name="angle-right"
            size={20}
            color={isDarkTheme ? styles.lightIcon.color : styles.darkIcon.color}
          />
        </TouchableOpacity>

        <View style={styles.settingItem}>
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.label,
                isDarkTheme ? styles.lightText : styles.darkText,
                (!status.core_info.puck_connected || !status.glasses_info?.model_name) &&
                  styles.disabledItem,
              ]}>
              Sensing
            </Text>
            <Text
              style={[
                styles.value,
                isDarkTheme ? styles.lightSubtext : styles.darkSubtext,
                (!status.core_info.puck_connected || !status.glasses_info?.model_name) &&
                  styles.disabledItem,
              ]}>
              Enable microphones & cameras.
            </Text>
          </View>
          <Switch
            disabled={!status.glasses_info?.model_name}
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
  headerContainer: {
    backgroundColor: '#fff',
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  header: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
  },
  disabledItem: {
    opacity: 0.4,
  },
  disabledText: {
    color: '#aaaaaa',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  thumbTouchSize: {
    width: 40,
    height: 40,
  },
  trackStyle: {
    height: 5,
  },
  thumbStyle: {
    height: 20,
    width: 20,
  },
  minimumTrackTintColor: {
    color: '#2196F3',
  },
  maximumTrackTintColorDark: {
    color: '#666666',
  },
  maximumTrackTintColorLight: {
    color: '#D1D1D6',
  },
  thumbTintColor: {
    color: '#FFFFFF',
  },
});

export default PrivacySettingsScreen;
