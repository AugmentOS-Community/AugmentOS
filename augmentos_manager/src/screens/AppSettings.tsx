// src/AppSettings.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Image, ImageBackground, TouchableOpacity, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../components/types';
import NavigationBar from '../components/NavigationBar';
import coreCommunicator from '../bridge/CoreCommunicator';
import { MOCK_CONNECTION } from '../consts';
import GroupTitle from '../components/settings/GroupTitle';
import ToggleSetting from '../components/settings/ToggleSetting';
import TextSetting from '../components/settings/TextSetting';
import SliderSetting from '../components/settings/SliderSetting';
import SelectSetting from '../components/settings/SelectSetting';
import MultiSelectSetting from '../components/settings/MultiSelectSetting';
import TitleValueSetting from '../components/settings/TitleValueSetting';
import LoadingComponent from '../components/LoadingComponent';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import BackendServerComms from '../backend_comms/BackendServerComms';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import { getAppImage } from '../logic/getAppImage';
import GlobalEventEmitter from '../logic/GlobalEventEmitter';

type AppSettingsProps = NativeStackScreenProps<RootStackParamList, 'AppSettings'> & {
  isDarkTheme: boolean;
  toggleTheme: () => void;
};

const AppSettings: React.FC<AppSettingsProps> = ({ route, navigation, isDarkTheme, toggleTheme }) => {
  const { packageName, appName } = route.params;
  const backendServerComms = BackendServerComms.getInstance();

  // State to hold the complete configuration from the server.
  const [serverAppInfo, setServerAppInfo] = useState<any>(null);
  // Local state to track current values for each setting.
  const [settingsState, setSettingsState] = useState<{ [key: string]: any }>({});
  // Get app info from status
  const { status } = useStatus();
  const appInfo = useMemo(() => {
    return status.apps.find(app => app.packageName === packageName) || null;
  }, [status.apps, packageName]);

  // Placeholder functions for app actions
  const handleStartStopApp = () => {
    console.log(`${appInfo?.is_running ? 'Stopping' : 'Starting'} app: ${packageName}`);
    if (appInfo?.packageName && appInfo?.is_running) {
      BackendServerComms.getInstance().stopApp(appInfo?.packageName);
    } else if (appInfo?.packageName && !appInfo?.is_running) {
      BackendServerComms.getInstance().startApp(appInfo?.packageName);
    }
  };

  const handleUninstallApp = () => {
    console.log(`Uninstalling app: ${packageName}`);
    
    Alert.alert(
      "Uninstall App",
      `Are you sure you want to uninstall ${appInfo?.name || appName}?`,
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        { 
          text: "Uninstall", 
          style: "destructive",
          onPress: async () => {
            try {
              // First stop the app if it's running
              if (appInfo?.is_running) {
                await backendServerComms.stopApp(packageName);
              }
              
              // Then uninstall it
              await backendServerComms.uninstallApp(packageName);
              
              // Show success message
              GlobalEventEmitter.emit('SHOW_BANNER', { 
                message: `${appInfo?.name || appName} has been uninstalled successfully`, 
                type: "success" 
              });
              
              // Navigate back to the previous screen
              navigation.goBack();
            } catch (error: any) {
              console.error('Error uninstalling app:', error);
              GlobalEventEmitter.emit('SHOW_BANNER', { 
                message: `Error uninstalling app: ${error.message || 'Unknown error'}`, 
                type: "error" 
              });
            }
          }
        }
      ]
    );
  };

  // Fetch TPA settings on mount or when packageName/status change.
  useEffect(() => {
    (async () => {
      await fetchUpdatedSettingsInfo();
    })();
  }, [packageName]);

  const fetchUpdatedSettingsInfo = async () => {
    try {
      const data = await backendServerComms.getTpaSettings(packageName);
      console.log("\n\n\nGOT TPA SETTING INFO:");
      console.log(JSON.stringify(data));
      console.log("\n\n\n");
      setServerAppInfo(data);
      // Initialize local state using the "selected" property.
      if (data.settings && Array.isArray(data.settings)) {
        const initialState: { [key: string]: any } = {};
        data.settings.forEach((setting: any) => {
          if (setting.type !== 'group') {
            initialState[setting.key] = setting.selected;
          }
        });
        setSettingsState(initialState);
      }
    } catch (err) {
      console.error('Error fetching TPA settings:', err);
    }
  }

  // When a setting changes, update local state and send the full updated settings payload.
  const handleSettingChange = (key: string, value: any) => {
    console.log(`Changing ${key} to ${value}`);
    setSettingsState((prevState) => ({
      ...prevState,
      [key]: value,
    }));

    // Build an array of settings to send.
    const updatedPayload = Object.keys(settingsState).map((settingKey) => ({
      key: settingKey,
      value: settingKey === key ? value : settingsState[settingKey],
    }));

    backendServerComms.updateTpaSetting(packageName, { key, value })
      .then((data) => {
        console.log('Server update response:', data);
      })
      .catch((error) => {
        console.error('Error updating setting on server:', error);
      });
  };

  // Theme colors.
  const theme = {
    backgroundColor: isDarkTheme ? '#1c1c1c' : '#f9f9f9',
    textColor: isDarkTheme ? '#FFFFFF' : '#333333',
    cardBackground: isDarkTheme ? '#2c2c2c' : '#ffffff',
    borderColor: isDarkTheme ? '#444444' : '#e0e0e0',
    secondaryTextColor: isDarkTheme ? '#cccccc' : '#666666',
    separatorColor: isDarkTheme ? '#444444' : '#e0e0e0',
  };

  // Render each setting.
  const renderSetting = (setting: any, index: number) => {
    switch (setting.type) {
      case 'group':
        return <GroupTitle key={`group-${index}`} title={setting.title} theme={theme} />;
      case 'toggle':
        return (
          <ToggleSetting
            key={index}
            label={setting.label}
            value={settingsState[setting.key]}
            onValueChange={(val) => handleSettingChange(setting.key, val)}
            theme={theme}
          />
        );
      case 'text':
        return (
          <TextSetting
            key={index}
            label={setting.label}
            value={settingsState[setting.key]}
            onChangeText={(text) => handleSettingChange(setting.key, text)}
            theme={theme}
          />
        );
      case 'slider':
        return (
          <SliderSetting
            key={index}
            label={setting.label}
            value={settingsState[setting.key]}
            min={setting.min}
            max={setting.max}
            onValueChange={(val) =>
              setSettingsState((prevState) => ({
                ...prevState,
                [setting.key]: val,
              }))
            }
            onValueSet={(val) => handleSettingChange(setting.key, val)}
            theme={theme}
          />
        );
      case 'select':
        return (
          <SelectSetting
            key={index}
            label={setting.label}
            value={settingsState[setting.key]}
            options={setting.options}
            onValueChange={(val) => handleSettingChange(setting.key, val)}
            theme={theme}
          />
        );
      case 'multiselect':
        return (
          <MultiSelectSetting
            key={index}
            label={setting.label}
            values={settingsState[setting.key]}
            options={setting.options}
            onValueChange={(vals) => handleSettingChange(setting.key, vals)}
            theme={theme}
          />
        );
      case 'titleValue':
        return (
          <TitleValueSetting
            key={index}
            label={setting.label}
            value={setting.value}
            theme={theme}
          />
        );
      default:
        return null;
    }
  };

  if (!serverAppInfo || !appInfo) {
    return <LoadingComponent message="Loading App Settings..." theme={theme} />;
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.backgroundColor }]}>
      <ScrollView contentContainerStyle={styles.mainContainer}>
        {/* App Info Header Section */}
        <View style={[styles.appInfoHeader, { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
          <View style={styles.appIconRow}>
            <View style={styles.appIconContainer}>
              <View style={styles.iconWrapper}>
                <ImageBackground
                  source={getAppImage(appInfo)}
                  style={styles.appIconLarge}
                  imageStyle={styles.appIconRounded}
                />
              </View>
            </View>

            <View style={styles.appInfoTextContainer}>
              <Text style={[styles.appName, { color: theme.textColor }]}>{appInfo.name}</Text>
              <View style={styles.appMetaInfoContainer}>
                <Text style={[styles.appMetaInfo, { color: theme.secondaryTextColor }]}>
                  Version {appInfo.version || '1.0.0'}
                </Text>
                <Text style={[styles.appMetaInfo, { color: theme.secondaryTextColor }]}>
                  Package: {packageName}
                </Text>
                {appInfo.is_foreground && (
                  <Text style={[styles.appMetaInfo, { color: '#2196F3' }]}>
                    Foreground App
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* Description within the main card */}
          <View style={[styles.descriptionContainer, { borderTopColor: theme.separatorColor }]}>
            <Text style={[styles.descriptionText, { color: theme.textColor }]}>
              {serverAppInfo.description || 'No description available.'}
            </Text>
          </View>
        </View>

        {/* App Action Buttons Section */}
        <View style={[styles.sectionContainer, { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                { borderColor: theme.borderColor, backgroundColor: theme.backgroundColor }
              ]}
              onPress={handleStartStopApp}
              activeOpacity={0.7}
            >
              <FontAwesome
                name={appInfo.is_running ? "stop" : "play"}
                size={16}
                style={[styles.buttonIcon, { color: theme.secondaryTextColor }]}
              />
              <Text style={[styles.buttonText, { color: theme.secondaryTextColor }]}>
                {appInfo.is_running ? "Stop" : "Start"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.disabledButton,
                { borderColor: theme.borderColor, backgroundColor: theme.backgroundColor }
              ]}
              activeOpacity={0.7}
              disabled={true}
            >
              <FontAwesome
                name="trash"
                size={16}
                style={[styles.buttonIcon, { color: theme.secondaryTextColor }]}
              />
              <Text style={[styles.buttonText, { color: theme.secondaryTextColor }]}>Uninstall</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* App Instructions Section */}
        {(serverAppInfo.instructions || appInfo.instructions) && (
          <View style={[styles.sectionContainer, { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
            <Text style={[styles.sectionTitle, { color: theme.textColor }]}>About this App</Text>
            <Text style={[styles.instructionsText, { color: theme.textColor }]}>
              {serverAppInfo.instructions || appInfo.instructions}
            </Text>
          </View>
        )}

        {/* App Settings Section */}
        <View style={[styles.sectionContainer, { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
          <Text style={[styles.sectionTitle, { color: theme.textColor }]}>App Settings</Text>
          <View style={styles.settingsContainer}>
            {serverAppInfo.settings && serverAppInfo.settings.length > 0 ? (
              serverAppInfo.settings.map((setting: any, index: number) =>
                renderSetting({ ...setting, uniqueKey: `${setting.key}-${index}` }, index)
              )
            ) : (
              <Text style={[styles.noSettingsText, { color: theme.secondaryTextColor }]}>
                No settings available for this app
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1
  },
  mainContainer: {
    flexGrow: 1,
    padding: 16,
    alignItems: 'stretch',
    gap: 16,
  },
  appInfoHeader: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  appIconRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  appIconContainer: {
    marginRight: 16,
  },
  descriptionContainer: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  iconGradient: {
    borderRadius: 24,
    padding: 3,
  },
  iconWrapper: {
    width: 100,
    height: 100,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'white',
  },
  appIconLarge: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  appIconRounded: {
    borderRadius: 18,
  },
  appInfoTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
    marginBottom: 4,
  },
  descriptionText: {
    fontSize: 16,
    fontFamily: 'Montserrat-Regular',
    lineHeight: 22,
  },
  appMetaInfoContainer: {
    marginTop: 4,
  },
  appMetaInfo: {
    fontSize: 12,
    fontFamily: 'Montserrat-Regular',
    marginVertical: 1,
  },
  sectionContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
    marginBottom: 12,
  },
  instructionsText: {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'Montserrat-Regular',
  },
  settingsContainer: {
    gap: 8,
  },
  noSettingsText: {
    fontSize: 14,
    fontFamily: 'Montserrat-Regular',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 20
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  startButton: {
    // Light background for Android-style
  },
  stopButton: {
    // Same styling as start for consistency
  },
  uninstallButton: {
    // Same styling as other buttons
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonIcon: {
    marginRight: 8,
    color: '#5c5c5c',
  },
  buttonText: {
    color: '#5c5c5c',
    fontWeight: '600',
    fontSize: 14,
    fontFamily: 'Montserrat-Bold',
  },
});

export default AppSettings;
