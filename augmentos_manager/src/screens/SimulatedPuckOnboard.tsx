import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  AppState,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useStatus } from '../AugmentOSStatusProvider';
import { loadSetting } from '../augmentos_core_comms/SettingsHelper';
import {
  SETTINGS_KEYS,
  SIMULATED_PUCK_DEFAULT,
  AUGMENTOS_CORE_PACKAGE_NAME,
} from '../consts';
import {
  isAugmentOsCoreInstalled,
  openCorePermissionsActivity,
} from '../augmentos_core_comms/CoreServiceStarter';
import { ScrollView } from 'react-native-gesture-handler';
import { NavigationProps } from '../components/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Button from '../components/Button';
import InstallApkModule from '../logic/InstallApkModule';
import { fetchAppStoreData } from '../utils/backendUtils.ts';
import BluetoothService from '../BluetoothService.tsx';

interface SimulatedPuckOnboardProps {
  isDarkTheme: boolean;
  toggleTheme: () => void;
}

const SimulatedPuckOnboard: React.FC<SimulatedPuckOnboardProps> = ({
  isDarkTheme,
  toggleTheme,
}) => {
  const [isSimulatedPuck, setIsSimulatedPuck] = useState(false);
  const [isCoreInstalled, setIsCoreInstalled] = useState(false);
  const [isCoreOutdated, setIsCoreOutdated] = useState(true);
  const [isDownloadingCore, setIsDownloadingCore] = useState(false);
  const [appStoreVersion, setAppStoreVersion] = useState<string | null>(null);
  // Single loading gate
  const [isLoading, setIsLoading] = useState(true);

  const { status } = useStatus();
  const navigation = useNavigation<NavigationProps>();
    const bluetoothService = BluetoothService.getInstance();

  // Use a ref flag to ensure we only fetch the app store data once.
  const didFetchStoreData = useRef(false);

  // ---------------------------------------------------------------
  // 1) On mount or when status changes, initialize:
  //    load settings, (conditionally) fetch store data,
  //    and check installation status.
  // ---------------------------------------------------------------
  useEffect(() => {
    const initialize = async () => {
      try {
        // 1. Load the "simulated puck" setting
        const simulatedPuck = await loadSetting(
          SETTINGS_KEYS.SIMULATED_PUCK,
          SIMULATED_PUCK_DEFAULT
        );
        setIsSimulatedPuck(simulatedPuck);

        // 2. Fetch data from app store only once.
        if (!didFetchStoreData.current) {
          didFetchStoreData.current = true;
          const storeData = await fetchAppStoreData();
          const matchedApp = storeData.find(
            (app) => app.packageName === AUGMENTOS_CORE_PACKAGE_NAME
          );
          const storeVersion = matchedApp?.version ?? null;
          setAppStoreVersion(storeVersion);
        }

        // 3. Check if core is installed
        const installed = await isAugmentOsCoreInstalled();
        setIsCoreInstalled(installed);
      } catch (error) {
        console.error('Error in initialization:', error);
      }

      // 4. Done loading everything we need for the initial screen
      setIsLoading(false);
    };

    initialize();
  }, [status]); // status remains in dependencies

  // ---------------------------------------------------------------
  // 2) When status, appStoreVersion, or isCoreInstalled change,
  //    compare the local core version with the store version.
  // ---------------------------------------------------------------
  useEffect(() => {
    if (isCoreInstalled && appStoreVersion && status?.augmentos_core_version) {
      if (status.augmentos_core_version >= appStoreVersion) {
        setIsCoreOutdated(false);
        // Open permission screen immediately if needed.
        openCorePermissionsActivity();
      } else {
        setIsCoreOutdated(true);
      }
    }
  }, [status, appStoreVersion, isCoreInstalled]);

  // ---------------------------------------------------------------
  // 3) If we detect the puck connected, the core is installed, and it
  //    is not outdated => navigate to Home.
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!isLoading && status?.puck_connected && isCoreInstalled && !isCoreOutdated) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    }
  }, [status, isCoreInstalled, isCoreOutdated, isLoading, navigation]);

  // ---------------------------------------------------------------
  // 4) Listen for app state changes to update installation status,
  //    but do *not* set isLoading to true again.
  // ---------------------------------------------------------------
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') {
        // Re-check installation state quickly (no isLoading flip)
        const installed = await isAugmentOsCoreInstalled();
        setIsCoreInstalled(installed);
        bluetoothService.sendRequestStatus();
        // If installed and no need to update => open permission screen
        if (installed && !isCoreOutdated) {
          openCorePermissionsActivity();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isCoreOutdated]);

  // ---------------------------------------------------------------
  // 5) Handler for installing/updating the core
  // ---------------------------------------------------------------
  const handleInstallLink = () => {
    setIsDownloadingCore(true);
    InstallApkModule.downloadCoreApk()
      .then(() => {
        // Optionally re-check installation/version after download.
      })
      .finally(() => {
        setIsDownloadingCore(false);
      });
  };

  // ---------------------------------------------------------------
  // If "isLoading" is true, show ONE smooth loader
  // ---------------------------------------------------------------
  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator
          size="large"
          color={isDarkTheme ? '#FFFFFF' : '#2196F3'}
        />
        <Text
          style={[
            styles.loadingText,
            isDarkTheme ? styles.lightText : styles.darkText,
          ]}
        >
          Loading...
        </Text>
      </View>
    );
  }

  // ---------------------------------------------------------------
  // Past this point, we show the normal UI
  // ---------------------------------------------------------------
  const instructionText = isCoreInstalled
    ? 'Your AugmentOS Core is outdated. Please update AugmentOS Core to continue.'
    : "To use AugmentOS, you'll need to install AugmentOS Core.";

  const buttonText = isCoreInstalled
    ? 'Update AugmentOS Core'
    : 'Install AugmentOS Core';

  return (
    <View
      style={[
        styles.container,
        isDarkTheme ? styles.darkBackground : styles.lightBackground,
      ]}
    >
      <ScrollView style={styles.scrollViewContainer}>
        <View style={styles.contentContainer}>
          <View style={styles.iconContainer}>
            <Icon
              name="cellphone-link"
              size={80}
              color={isDarkTheme ? '#FFFFFF' : '#2196F3'}
            />
          </View>

          <Text
            style={[
              styles.title,
              isDarkTheme ? styles.lightText : styles.darkText,
            ]}
          >
            AugmentOS Setup
          </Text>

          <Text
            style={[
              styles.description,
              isDarkTheme ? styles.lightSubtext : styles.darkSubtext,
            ]}
          >
            {instructionText}
          </Text>

          {isSimulatedPuck && (
            <View style={styles.setupContainer}>
              <Button
                onPress={handleInstallLink}
                isDarkTheme={isDarkTheme}
                disabled={isDownloadingCore}
                iconName="download"
              >
                {buttonText}
              </Button>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  scrollViewContainer: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100%',
  },
  iconContainer: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 24,
    paddingHorizontal: 24,
  },
  notice: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 20,
    paddingHorizontal: 24,
  },
  setupContainer: {
    width: '100%',
    alignItems: 'center',
  },
  darkBackground: {
    backgroundColor: '#1c1c1c',
  },
  lightBackground: {
    backgroundColor: '#f8f9fa',
  },
  darkText: {
    color: '#1a1a1a',
  },
  lightText: {
    color: '#FFFFFF',
  },
  darkSubtext: {
    color: '#4a4a4a',
  },
  lightSubtext: {
    color: '#e0e0e0',
  },
});

export default SimulatedPuckOnboard;
