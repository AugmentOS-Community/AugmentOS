import React, {
  useRef,
  useCallback,
  PropsWithChildren,
  useState,
  useEffect,
} from 'react';
import { View, StyleSheet, Animated, Text, Button, Switch } from 'react-native';
import Slider from '@react-native-community/slider';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import Header from '../components/Header';
import ConnectedDeviceInfo from '../components/ConnectedDeviceInfo';
import RunningAppsList from '../components/RunningAppsList';
import YourAppsList from '../components/YourAppsList';
import NavigationBar from '../components/NavigationBar';
import { useStatus } from '../providers/AugmentOSStatusProvider.tsx';
import { ScrollView } from 'react-native-gesture-handler';
import BackendServerComms from '../backend_comms/BackendServerComms.tsx';
import semver from 'semver';
import { Config } from 'react-native-config';
import CloudConnection from '../components/CloudConnection.tsx';
import { loadSetting, saveSetting } from '../logic/SettingsHelper';

import { NativeModules, NativeEventEmitter } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface HomepageProps {
  isDarkTheme: boolean;
  toggleTheme: () => void;
}

interface AnimatedSectionProps extends PropsWithChildren {
  delay?: number;
}

const Homepage: React.FC<HomepageProps> = ({ isDarkTheme, toggleTheme }) => {
  const navigation = useNavigation<NavigationProp<any>>();
  const { status, startBluetoothAndCore } = useStatus();
  const [isSimulatedPuck, setIsSimulatedPuck] = React.useState(false);
  const [isCheckingVersion, setIsCheckingVersion] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-50)).current;

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

  // Check cloud version and navigate if needed
  const checkCloudVersion = async () => {
    if (isCheckingVersion) return;
    setIsCheckingVersion(true);

    try {
      // Check if version checks are being ignored this session
      const ignoreCheck = await loadSetting('ignoreVersionCheck', false);
      if (ignoreCheck) {
        console.log('Version check skipped due to user preference');
        setIsCheckingVersion(false);
        return;
      }

      const backendComms = BackendServerComms.getInstance();
      const localVer = getLocalVersion();

      if (!localVer) {
        console.error('Failed to get local version from env file');
        // Navigate to update screen with connection error
        navigation.navigate('VersionUpdateScreen', {
          isDarkTheme,
          connectionError: true
        });
        setIsCheckingVersion(false);
        return;
      }

      // Call the endpoint to get cloud version
      await backendComms.restRequest('/apps/version', null, {
        onSuccess: (data) => {
          const cloudVer = data.version;
          console.log(`Comparing local version (${localVer}) with cloud version (${cloudVer})`);

          // Compare versions using semver
          if (semver.lt(localVer, cloudVer)) {
            console.log('A new version is available. Navigate to update screen.');
            // Navigate to update screen with version mismatch
            navigation.navigate('VersionUpdateScreen', {
              isDarkTheme,
              localVersion: localVer,
              cloudVersion: cloudVer
            });
          } else {
            console.log('Local version is up-to-date.');
            // Stay on homepage, no navigation needed
          }
          setIsCheckingVersion(false);
        },
        onFailure: (errorCode) => {
          console.error('Failed to fetch cloud version:', errorCode);
          // Navigate to update screen with connection error
          navigation.navigate('VersionUpdateScreen', {
            isDarkTheme,
            connectionError: true
          });
          setIsCheckingVersion(false);
        }
      });
    } catch (error) {
      console.error('Error checking cloud version:', error);
      // Navigate to update screen with connection error
      navigation.navigate('VersionUpdateScreen', {
        isDarkTheme,
        connectionError: true
      });
      setIsCheckingVersion(false);
    }
  };

  // Check version once on mount
  useEffect(() => {
    checkCloudVersion();
  }, []);

  // Simple animated wrapper so we do not duplicate logic
  const AnimatedSection: React.FC<AnimatedSectionProps> = useCallback(
    ({ children }) => (
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        {children}
      </Animated.View>
    ),
    [fadeAnim, slideAnim],
  );

  useFocusEffect(
    useCallback(() => {
      // Reset animations when screen is about to focus
      fadeAnim.setValue(0);
      slideAnim.setValue(-50);

      // Start animations after a short delay
      const animationTimeout = setTimeout(() => {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ]).start();
      }, 50);

      return () => {
        clearTimeout(animationTimeout);
        fadeAnim.setValue(0);
        slideAnim.setValue(-50);
      };
    }, [fadeAnim, slideAnim]),
  );

  const currentThemeStyles = isDarkTheme ? darkThemeStyles : lightThemeStyles;

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={currentThemeStyles.container}>
        <ScrollView style={currentThemeStyles.contentContainer}>
          <AnimatedSection>
            <Header isDarkTheme={isDarkTheme} navigation={navigation} />
          </AnimatedSection>

          {status.core_info.cloud_connection_status !== 'CONNECTED' &&
            <AnimatedSection>
              <CloudConnection isDarkTheme={isDarkTheme} />
            </AnimatedSection>
          }

          <AnimatedSection>
            <ConnectedDeviceInfo isDarkTheme={isDarkTheme} />
          </AnimatedSection>

          {status.core_info.puck_connected && (
            <>
              {status.apps.length > 0 ? (
                <>
                  <AnimatedSection>
                    <RunningAppsList isDarkTheme={isDarkTheme} />
                  </AnimatedSection>

                  <AnimatedSection>
                    <YourAppsList
                      isDarkTheme={isDarkTheme}
                      key={`apps-list-${status.apps.length}`}
                    />
                  </AnimatedSection>
                </>
              ) : (
                <AnimatedSection>
                  <Text style={currentThemeStyles.noAppsText}>
                    No apps found. Visit the AugmentOS App Store to explore and
                    download apps for your device.
                  </Text>
                </AnimatedSection>
              )}
            </>
          )}
        </ScrollView>
      </View>
      <NavigationBar toggleTheme={toggleTheme} isDarkTheme={isDarkTheme} />
    </SafeAreaView>
  );
};

const lightThemeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 55,
  },
  noAppsText: {
    marginTop: 10,
    color: '#000000',
    fontFamily: 'Montserrat-Regular',
  },
  brightnessContainer: {
    marginTop: 15,
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  brightnessText: {
    color: '#000000',
    marginBottom: 5,
    fontFamily: 'Montserrat-Regular',
  },
  brightnessRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

const darkThemeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 55,
  },
  noAppsText: {
    color: '#ffffff',
    fontFamily: 'Montserrat-Regular',
  },
  brightnessContainer: {
    marginTop: 15,
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#222222',
    borderRadius: 8,
  },
  brightnessText: {
    color: '#ffffff',
    marginBottom: 5,
    fontFamily: 'Montserrat-Regular',
  },
  brightnessRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default Homepage;