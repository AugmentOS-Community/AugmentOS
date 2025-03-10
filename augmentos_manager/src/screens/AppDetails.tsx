import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  SafeAreaView,
  ActivityIndicator,Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, AppStoreItem } from '../components/types';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import NavigationBar from '../components/NavigationBar';
import BluetoothService from '../BluetoothService.tsx';
import semver from 'semver';
import { NativeModules } from 'react-native';
const { FetchConfigHelperModule, TpaHelpers } = NativeModules;
import GlobalEventEmitter from '../logic/GlobalEventEmitter';
type AppDetailsProps = NativeStackScreenProps<
  RootStackParamList,
  'AppDetails'
> & {
  isDarkTheme: boolean;
  toggleTheme: () => void;
};
import { useStatus } from '../providers/AugmentOSStatusProvider.tsx';
import appStore from "./AppStore.tsx";
import InstallApkModule from '../bridge/InstallApkModule.tsx';
import { AUGMENTOS_MANAGER_PACKAGE_NAME, AUGMENTOS_CORE_PACKAGE_NAME } from '../consts.tsx';

const AppDetails: React.FC<AppDetailsProps> = ({
  route,
  navigation,
  isDarkTheme,
  toggleTheme, // Use toggleTheme from props
}) => {
  const { app } = route.params as { app: AppStoreItem };
  const [installState, setInstallState] = useState<
    'Install' | 'Update' | 'Downloading...' | 'Installing...' | 'Start'
  >('Install');
  const { status } = useStatus();

  const fetchConfig = async (packageName: string): Promise<string | null> => {
    try {
      const configJson = await FetchConfigHelperModule.fetchConfig(packageName);
      const parsedConfig = JSON.parse(configJson);
      const version = parsedConfig.version;
      console.log('Local App Version:', version);
      return version;
    } catch (error) {
      console.error(
        'Failed to load config for package name ' + packageName,
        error,
      );
      return '0.0.0';
    }
  };

  const fetchVersionFromStatus = (): string | null => {
    console.log('AugmentOS Core Version:', status?.core_info?.augmentos_core_version);
    return status?.core_info?.augmentos_core_version ?? '0.0.0';
  };

  const checkVersionAndSetState = useCallback(async () => {
    if (!status || !status.apps) {
      return; // Status not loaded yet; keep default or show fallback
    }

    const installedApp = status.apps.find(
      (a) => a.packageName === app.packageName
    );

    if (installState === 'Downloading...') {
      return;
    }

    let installedVersion: string | null;

    if (app.packageName === AUGMENTOS_MANAGER_PACKAGE_NAME) {
      // Await the promise here
      installedVersion = await fetchConfig(AUGMENTOS_MANAGER_PACKAGE_NAME);
    } else if (app.packageName === AUGMENTOS_CORE_PACKAGE_NAME) {
      installedVersion = fetchVersionFromStatus();
      console.log('Installed Version:', installedVersion);
    } else {
      if (!installedApp) {
        setInstallState('Install');
        return;
      }
      installedVersion = installedApp.version || '0.0.0';
    }

    const storeVersion = app.version || '0.0.0';

    // Check that installedVersion is not null before passing to semver
    if (
      installedVersion &&
      semver.valid(installedVersion) &&
      semver.valid(storeVersion)
    ) {
      if (semver.lt(installedVersion, storeVersion)) {
        setInstallState('Update');
      } else {
        setInstallState('Start');
      }
    }
  }, [status, installState, app.version, app.packageName]);

  useEffect(() => {
    checkVersionAndSetState();
  }, [checkVersionAndSetState]);

  useEffect(() => {
    const handleAppDownloaded = (data: { appIsDownloaded: any }) => {
//         console.log('App is downloaded:', data.appIsDownloaded);
        // Show the alert to inform the user about the redirection
        Alert.alert(
          'Install the App',
          `You will be redirected to the downloads folder. Please press on ${app.name} to install it.`,
          [
            {
              text: 'OK, Take Me There',
              onPress: () => {
                // Proceed with installing the APK after user acknowledges
                setInstallState('Installing...');
                InstallApkModule.installApk(data.appIsDownloaded.packageName)
                  .then((result: any) => {
                    console.log('Success:', result);
                    setInstallState('Start');
                  })
                  .catch((error: any) => {
                    console.error('Error:', error);
                  });
              },
            },
            {
              text: 'Cancel',
              style: 'cancel',
            },
          ],
          { cancelable: true },
        );
    };

    GlobalEventEmitter.on('APP_IS_DOWNLOADED_RESULT', handleAppDownloaded);

    // Cleanup listener on unmount
    return () => {
      GlobalEventEmitter.off('APP_IS_DOWNLOADED_RESULT', handleAppDownloaded);
    };
  }, []);

  const bluetoothService = BluetoothService.getInstance();

  // Theme colors
  const theme = {
    backgroundColor: isDarkTheme ? '#1c1c1c' : '#f9f9f9',
    textColor: isDarkTheme ? '#FFFFFF' : '#333333',
    subTextColor: isDarkTheme ? '#999999' : '#666666',
    borderColor: isDarkTheme ? '#444444' : '#dddddd',
    cardBg: isDarkTheme ? '#333333' : '#f0f0f0',
    iconBorder: isDarkTheme ? '#444444' : '#dddddd',
    metaTextColor: isDarkTheme ? '#CCCCCC' : '#555555',
    requirementBg: isDarkTheme ? '#444444' : '#f0f0f0',
    requirementText: isDarkTheme ? '#FFFFFF' : '#444444',
  };

  const sendInstallAppFromStore = (packageName: string) => {
    if (installState === 'Install' || installState === 'Update') {
      setInstallState('Downloading...');
      console.log(`Installing app with package name: ${packageName}`);

      bluetoothService.installAppByPackageName(packageName);
    } else if (installState === 'Start') {
      console.log(`Starting app with package name: ${packageName}`);
    }
  };

  const launchTargetApp = (packageName: string) => {
    TpaHelpers.launchTargetApp(packageName);
  };

  // const navigateToReviews = () => {
  //   navigation.navigate('Reviews', {
  //     appId: app.identifierCode,
  //     appName: app.name,
  //   });
  // };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.backgroundColor }]}
    >
      <View style={styles.mainContainer}>
        <ScrollView
          style={[styles.scrollContainer, { backgroundColor: theme.backgroundColor }]}
          contentContainerStyle={styles.scrollContentContainer}
        >
          <View style={styles.contentContainer}>
            {/* Removed TouchableOpacity around the icon */}
            <Image
              source={{ uri: app.iconImageUrl }}
              style={[
                styles.icon,
                {
                  borderColor: theme.iconBorder,
                },
              ]}
            />

            <Text
              style={[
                styles.appName,
                { color: theme.textColor },
              ]}
            >
              {app.name}
            </Text>

            <Text
              style={[
                styles.packageName,
                { color: theme.subTextColor },
              ]}
            >
              {app.packageName}
            </Text>

            {/*<View
              style={[
                styles.metaContainer,
              ]}
            >
              <View style={styles.metaItem}>
                <MaterialCommunityIcons name="star" size={16} color="#FFD700" />
                <Text style={[styles.rating, { color: theme.metaTextColor }]}>
                  {app.rating.toFixed(1)}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <MaterialCommunityIcons
                  name="download"
                  size={16}
                  color={isDarkTheme ? '#FFFFFF' : '#444444'}
                />
                <Text style={[styles.downloads, { color: theme.metaTextColor }]}>
                  {app.downloads.toLocaleString()} Downloads
                </Text>
              </View>
              <TouchableOpacity
                style={styles.reviewsIcon}
                onPress={navigateToReviews}
              >
                <MaterialCommunityIcons
                  name="comment-text"
                  size={24}
                  color="#3a86ff"
                />
                <Text style={styles.reviewsText}>Reviews</Text>
              </TouchableOpacity>
            </View>*/}

            <Text
              style={[
                styles.description,
                { color: theme.subTextColor },
              ]}
            >
              {app.description}
            </Text>

            {/*{app.screenshots && app.screenshots.length > 0 && (*/}
            {/*  <View*/}
            {/*    style={[*/}
            {/*      styles.screenshotsContainer,*/}
            {/*    ]}*/}
            {/*  >*/}
            {/*    <Text style={[styles.sectionHeader, { color: theme.textColor }]}>*/}
            {/*      Screenshots*/}
            {/*    </Text>*/}
            {/*    <ScrollView horizontal showsHorizontalScrollIndicator={false}>*/}
            {/*      <View style={styles.screenshotsList}>*/}
            {/*        {app.screenshots.map((screenshotUrl, index) => (*/}
            {/*          <Image*/}
            {/*            key={index}*/}
            {/*            source={{ uri: screenshotUrl }}*/}
            {/*            style={[*/}
            {/*              styles.screenshot,*/}
            {/*              { borderColor: theme.borderColor },*/}
            {/*            ]}*/}
            {/*          />*/}
            {/*        ))}*/}
            {/*      </View>*/}
            {/*    </ScrollView>*/}
            {/*  </View>*/}
            {/*)}*/}

            {/*<Text style={[styles.sectionHeader, { color: theme.textColor }]}>*/}
            {/*  Requirements*/}
            {/*</Text>*/}
            {/*<View style={styles.requirementsGrid}>*/}
            {/*  {app.requirements.map((requirement: string, index: number) => (*/}
            {/*    <View*/}
            {/*      key={index}*/}
            {/*      style={[*/}
            {/*        styles.requirementItem,*/}
            {/*        { backgroundColor: theme.requirementBg },*/}
            {/*      ]}*/}
            {/*    >*/}
            {/*      <Text*/}
            {/*        style={[*/}
            {/*          styles.requirementText,*/}
            {/*          { color: theme.requirementText },*/}
            {/*        ]}*/}
            {/*      >*/}
            {/*        {requirement}*/}
            {/*      </Text>*/}
            {/*    </View>*/}
            {/*  ))}*/}
            {/*</View>*/}

            <View
              style={[
                styles.buttonContainer,
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.installButton,
                  (installState === 'Installing...' || installState === 'Downloading...') && styles.disabledButton,
                ]}
                onPress={() => {
                  if (installState === 'Install' || installState === 'Update') {
                    sendInstallAppFromStore(app.packageName);
                  } else if (installState === 'Start') {
                    launchTargetApp(app.packageName);
                  }
                }}
                disabled={installState === 'Installing...' || installState === 'Downloading...'}
              >
                {installState === 'Installing...' || installState === 'Downloading...' ? (
                  <View style={styles.spinnerContainer}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.installButtonText}>{installState}</Text>
                  </View>
                ) : (
                  <Text style={styles.installButtonText}>{installState}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
      <NavigationBar isDarkTheme={isDarkTheme} toggleTheme={toggleTheme} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  mainContainer: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
    //paddingBottom:55,
  },
  scrollContentContainer: {
    paddingBottom: 55,
  },
  contentContainer: {
    paddingTop: 16,
    alignItems: 'center',
  },
  buttonContainer: {
    width: '100%',
    padding: 16,
  },
  icon: {
    width: 100,
    height: 100,
    borderRadius: 28,
    marginBottom: 10,
    borderWidth: 2,
    alignSelf: 'center',
  },
  appName: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 5,
    fontFamily: 'Montserrat-Bold',
  },
  packageName: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    fontFamily: 'Montserrat-Regular',
  },
  metaContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 15,
    paddingHorizontal: 36,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewsIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
  },
  reviewsText: {
    fontSize: 14,
    color: '#3a86ff',
    marginLeft: 5,
    fontFamily: 'Montserrat-Medium',
  },
  rating: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginLeft: 5,
    fontFamily: 'Montserrat-SemiBold',
  },
  downloads: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginLeft: 5,
    fontFamily: 'Montserrat-SemiBold',
  },
  description: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    marginHorizontal: 16,
    lineHeight: 20,
    fontFamily: 'Montserrat-Regular',
  },
  screenshotsContainer: {
    width: '100%',
    marginBottom: 20,
    alignItems: 'center',
  },
  screenshotsList: {
    flexDirection: 'row',
    gap: 8,
  },
  screenshot: {
    width: 250,
    height: 150,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 2,
    color: '#333',
    fontFamily: 'Montserrat-SemiBold',
  },
  requirementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
    marginHorizontal: 16,
  },
  requirementItem: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  requirementText: {
    fontSize: 14,
    color: '#444',
    textAlign: 'center',
    fontFamily: 'Montserrat-Regular',
  },
  installButton: {
    width: '100%',
    paddingVertical: 12,
    backgroundColor: '#3a86ff',
    borderRadius: 10,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    alignSelf: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  installButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Montserrat-Bold',
  },
  disabledButton: {
    backgroundColor: '#ccc',
    elevation: 0,
    shadowColor: 'transparent',
  },
  spinnerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AppDetails;
