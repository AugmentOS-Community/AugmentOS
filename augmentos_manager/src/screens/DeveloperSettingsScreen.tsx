import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Platform,
  ScrollView,
} from 'react-native';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import coreCommunicator from '../bridge/CoreCommunicator';

interface DeveloperSettingsScreenProps {
  isDarkTheme: boolean;
  toggleTheme: () => void;
  navigation: any;
}

const DeveloperSettingsScreen: React.FC<DeveloperSettingsScreenProps> = ({
  isDarkTheme,
  toggleTheme,
  navigation,
}) => {
  const { status } = useStatus();
  const [isBypassVADForDebuggingEnabled, setIsBypassVADForDebuggingEnabled] = React.useState(
    status.core_info.bypass_vad_for_debugging,
  );
  const [isBypassAudioEncodingForDebuggingEnabled, setIsBypassAudioEncodingForDebuggingEnabled] = React.useState(
    status.core_info.bypass_audio_encoding_for_debugging,
  );

  React.useEffect(() => {
    const loadInitialSettings = async () => { };

    loadInitialSettings();
  }, []);

  React.useEffect(() => {
    setIsBypassVADForDebuggingEnabled(status.core_info.bypass_vad_for_debugging);
  }, [status.core_info.bypass_vad_for_debugging]);

  const toggleBypassVadForDebugging = async () => {
    let newSetting = !isBypassVADForDebuggingEnabled;
    await coreCommunicator.sendToggleBypassVadForDebugging(newSetting);
    setIsBypassVADForDebuggingEnabled(newSetting);
  };

  const toggleBypassAudioEncodingForDebugging = async () => {
    let newSetting = !isBypassAudioEncodingForDebuggingEnabled;
    await coreCommunicator.sendToggleBypassAudioEncodingForDebugging(newSetting);
    setIsBypassAudioEncodingForDebuggingEnabled(newSetting);
  };

  const switchColors = {
    trackColor: {
      false: isDarkTheme ? '#666666' : '#D1D1D6',
      true: '#2196F3',
    },
    thumbColor:
      Platform.OS === 'ios' ? undefined : isDarkTheme ? '#FFFFFF' : '#FFFFFF',
    ios_backgroundColor: isDarkTheme ? '#666666' : '#D1D1D6',
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Bypass VAD for Debugging Toggle */}
        <View style={styles.settingItem}>
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.label,
                isDarkTheme ? styles.lightText : styles.darkText
              ]}>
              Bypass VAD for Debugging
            </Text>
            <Text
              style={[
                styles.value,
                isDarkTheme ? styles.lightSubtext : styles.darkSubtext
              ]}>
              Bypass Voice Activity Detection in case transcription stops working.
            </Text>
          </View>
          <Switch
            value={isBypassVADForDebuggingEnabled}
            onValueChange={toggleBypassVadForDebugging}
            trackColor={switchColors.trackColor}
            thumbColor={switchColors.thumbColor}
            ios_backgroundColor={switchColors.ios_backgroundColor}
          />
        </View>

        {/* Bypass Audio Encoding for Debugging Toggle
        <View style={styles.settingItem}>
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.label,
                isDarkTheme ? styles.lightText : styles.darkText
              ]}>
              Bypass Audio Encoding for Debugging
            </Text>
            <Text
              style={[
                styles.value,
                isDarkTheme ? styles.lightSubtext : styles.darkSubtext
              ]}>
              Bypass audio encoding processing for debugging purposes.
            </Text>
          </View>
          <Switch
            value={isBypassAudioEncodingForDebuggingEnabled}
            onValueChange={toggleBypassAudioEncodingForDebugging}
            trackColor={switchColors.trackColor}
            thumbColor={switchColors.thumbColor}
            ios_backgroundColor={switchColors.ios_backgroundColor}
          />
        </View> */}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    marginBottom: 55,
  },
  container: {
    flex: 1,
    padding: 20,
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
  disabledItem: {
    opacity: 0.4,
  },
});

export default DeveloperSettingsScreen; 