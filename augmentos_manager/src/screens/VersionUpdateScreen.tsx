import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { Config } from 'react-native-config';
import semver from 'semver';
import BackendServerComms from '../backend_comms/BackendServerComms';
import { ScrollView } from 'react-native-gesture-handler';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Button from '../components/Button';
import InstallApkModule from '../bridge/InstallApkModule';
import { saveSetting } from '../logic/SettingsHelper';

interface VersionUpdateScreenProps {
  route: {
    params: {
      isDarkTheme: boolean;
      connectionError?: boolean;
      localVersion?: string;
      cloudVersion?: string;
    }
  };
}

const VersionUpdateScreen: React.FC<VersionUpdateScreenProps> = ({
                                                                   route
                                                                 }) => {
  const { isDarkTheme, connectionError: initialConnectionError, localVersion: initialLocalVersion, cloudVersion: initialCloudVersion } = route.params;
  const navigation = useNavigation<NavigationProp<any>>();
  const [isLoading, setIsLoading] = useState(!initialLocalVersion && !initialConnectionError);
  const [isUpdating, setIsUpdating] = useState(false);
  const [connectionError, setConnectionError] = useState(initialConnectionError || false);
  const [isVersionMismatch, setIsVersionMismatch] = useState(!!initialLocalVersion && !!initialCloudVersion);
  const [localVersion, setLocalVersion] = useState<string | null>(initialLocalVersion || null);
  const [cloudVersion, setCloudVersion] = useState<string | null>(initialCloudVersion || null);

  // Get local version from env file
  const getLocalVersion = () => {
    try {
      const version = Config.AUGMENTOS_VERSION;
      console.log('Local version from env:', version);
      return version || null;
    } catch (error) {
      console.error('Error getting local version:', error);
      return null;
    }
  };

  // Check the cloud version against local version
  const checkCloudVersion = async () => {
    setIsLoading(true);
    setConnectionError(false);

    try {
      const backendComms = BackendServerComms.getInstance();
      const localVer = getLocalVersion();
      setLocalVersion(localVer);

      if (!localVer) {
        console.error('Failed to get local version from env file');
        setConnectionError(true);
        setIsLoading(false);
        return;
      }

      // Call the endpoint to get cloud version
      await backendComms.restRequest('/apps/version', null, {
        onSuccess: (data) => {
          const cloudVer = data.version;
          setCloudVersion(cloudVer);
          console.log(`Comparing local version (${localVer}) with cloud version (${cloudVer})`);

          // Compare versions using semver
          if (semver.lt(localVer, cloudVer)) {
            console.log('A new version is available. Please update the app.');
            setIsVersionMismatch(true);
          } else {
            console.log('Local version is up-to-date.');
            setIsVersionMismatch(false);
            // Navigate back to home since no update is needed
            setTimeout(() => {
              navigation.navigate('Home');
            }, 1000);
          }
          setIsLoading(false);
        },
        onFailure: (errorCode) => {
          console.error('Failed to fetch cloud version:', errorCode);
          setConnectionError(true);
          setIsLoading(false);
        }
      });
    } catch (error) {
      console.error('Error checking cloud version:', error);
      setConnectionError(true);
      setIsLoading(false);
    }
  };

  // Start the update process
  const handleUpdate = () => {
    setIsUpdating(true);
    InstallApkModule.downloadCoreApk()
      .then(() => {
      })
      .finally(() => {
          setIsUpdating(false);
      });
  };

  // Only check cloud version on mount if we don't have initial data
  useEffect(() => {
    if (!initialLocalVersion && !initialConnectionError) {
      checkCloudVersion();
    } else {
      setIsLoading(false);
    }
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <View style={[
        styles.container,
        styles.loadingContainer,
        isDarkTheme ? styles.darkBackground : styles.lightBackground
      ]}>
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
          Checking for updates...
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        isDarkTheme ? styles.darkBackground : styles.lightBackground,
      ]}
    >
      <View style={styles.mainContainer}>
        <View style={styles.infoContainer}>
          <View style={styles.iconContainer}>
            {connectionError ? (
              <Icon
                name="wifi-off"
                size={80}
                color={isDarkTheme ? '#ff6b6b' : '#ff0000'}
              />
            ) : isVersionMismatch ? (
              <Icon
                name="update"
                size={80}
                color={isDarkTheme ? '#FFFFFF' : '#2196F3'}
              />
            ) : (
              <Icon
                name="check-circle"
                size={80}
                color={isDarkTheme ? '#4CAF50' : '#4CAF50'}
              />
            )}
          </View>

          <Text
            style={[
              styles.title,
              isDarkTheme ? styles.lightText : styles.darkText,
            ]}
          >
            {connectionError
              ? 'Connection Error'
              : isVersionMismatch
                ? 'Update Required'
                : 'Up to Date'}
          </Text>

          <Text
            style={[
              styles.description,
              isDarkTheme ? styles.lightSubtext : styles.darkSubtext,
            ]}
          >
            {connectionError
              ? 'Could not connect to the server. Please check your connection and try again.'
              : isVersionMismatch
                ? 'Your AugmentOS is outdated. Please update to continue.'
                : 'Your AugmentOS is up to date. Returning to home...'}
          </Text>
        </View>

        {(connectionError || isVersionMismatch) && (
          <View style={styles.setupContainer}>
            <Button
              onPress={connectionError ? checkCloudVersion : handleUpdate}
              isDarkTheme={isDarkTheme}
              disabled={isUpdating}
              iconName={connectionError ? 'reload' : 'download'}
            >
              {isUpdating
                ? 'Updating...'
                : connectionError
                  ? 'Retry Connection'
                  : 'Update AugmentOS'}
            </Button>
            
            <View style={styles.skipButtonContainer}>
              <Button
                onPress={() => {
                  // Save setting to ignore version checks until next app restart
                  saveSetting('ignoreVersionCheck', true);
                  console.log('Version check skipped until next app restart');
                  // Skip directly to Home screen
                  navigation.reset({
                    index: 0,
                    routes: [{ name: 'Home' }],
                  });
                }}
                isDarkTheme={isDarkTheme}
                iconName="skip-next"
                disabled={false}>
                Skip Update
              </Button>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  mainContainer: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: 24,
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
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
    marginBottom: 32,
    lineHeight: 24,
    paddingHorizontal: 24,
  },
  setupContainer: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 40,
  },
  skipButtonContainer: {
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
  },
  skipButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#666',
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

export default VersionUpdateScreen;
