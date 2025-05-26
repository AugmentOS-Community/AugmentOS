import React, {useMemo, useState, useRef} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ScrollView} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useAppStatus } from '@/contexts/AppStatusProvider';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import coreCommunicator from '@/bridge/CoreCommunicator';
import AppIcon from './AppIcon';
import { useNavigation } from '@react-navigation/native';
import { NavigationProps } from './types';
import BackendServerComms from '@/backend_comms/BackendServerComms';

interface RunningAppsListProps {
  isDarkTheme: boolean;
}

const RunningAppsList: React.FC<RunningAppsListProps> = ({isDarkTheme}) => {
  const { appStatus, refreshAppStatus, optimisticallyStopApp, clearPendingOperation } = useAppStatus();
  const backendComms = BackendServerComms.getInstance();
  const [_isLoading, setIsLoading] = useState(false);
  const textColor = isDarkTheme ? '#FFFFFF' : '#000000';
  const navigation = useNavigation<NavigationProps>();
  const scrollViewRef = useRef<ScrollView>(null);

  const stopApp = async (packageName: string) => {
    console.log('STOP APP');

    // Optimistically update UI first
    optimisticallyStopApp(packageName);

    setIsLoading(true);
    try {
      await backendComms.stopApp(packageName);
      // Clear the pending operation since it completed successfully
      clearPendingOperation(packageName);
    } catch (error) {
      // On error, refresh from the server to get the accurate state
      refreshAppStatus();
      console.error('Stop app error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const openAppSettings = (app: any) => {
    navigation.navigate('AppSettings', {
      packageName: app.packageName,
      appName: app.name
    });
  };

  const runningApps = useMemo(
    () => appStatus.filter(app => app.is_running),
    [appStatus],
  );

  const scrollToBottom = () => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  };

  return (
    <View style={styles.appsContainer}>
      <Text style={[styles.sectionTitle, {color: textColor}]}>
        Active Apps
      </Text>
      <View style={styles.listContainer}>
        {runningApps.length > 0 ? (
          runningApps.map((app, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => stopApp(app.packageName)}
              onLongPress={() => openAppSettings(app)}
              delayLongPress={500}
              style={styles.appItemWrapper}>
              <LinearGradient
                colors={['#56CCFE', '#FF8DF6', '#FFD04E']}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 0}}
                style={styles.appItem}>
                <View style={styles.appContent}>
                  <AppIcon
                    app={app}
                    isDarkTheme={isDarkTheme}
                    isForegroundApp={app.is_foreground}
                    style={styles.appIcon}
                  />
                  <Text style={styles.appName}>{app.name || 'Convoscope'}</Text>
                  <TouchableOpacity 
                    onPress={() => openAppSettings(app)}
                    style={styles.settingsButton}>
                    <Icon name="cog-outline" size={24} color="#000000" />
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.noAppsContainer}>
            <LinearGradient
              colors={['#56CCFE', '#FF8DF6', '#FFD04E']}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 0}}
              style={styles.noAppsGradient}
            >
              <View style={styles.noAppsContent}>
                <Text style={[styles.noAppsText, {color: '#000000'}]}>
                  Tap on an app below to start it.
                </Text>
              </View>
            </LinearGradient>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  appsContainer: {
    justifyContent: 'flex-start',
    marginTop: 14,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Montserrat-Bold',
    lineHeight: 22,
    letterSpacing: 0.38,
    marginBottom: 10,
  },
  listContainer: {
    gap: 10,
  },
  appItemWrapper: {
    marginBottom: 0.5,
    borderRadius: 12,
  },
  appItem: {
    borderRadius: 12,
    padding: 11,
    overflow: 'hidden',
  },
  appContent: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
  },
  appName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
    color: '#000000',
    marginLeft: 8,
  },
  settingsButton: {
    padding: 50,
    margin: -46,
  },
  noAppsContainer: {
    // marginBottom: 8, // Removing this to maintain consistent spacing
  },
  noAppsGradient: {
    borderRadius: 12,
    padding: 11, // Match padding with regular app items
    minHeight: 40,
  },
  noAppsContent: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50, // Added 2 more pixels for perfect height match
  },
  noAppsTitle: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 8,
  },
  noAppsText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  appIcon: {
    width: 50,
    height: 50,
  },
});

export default RunningAppsList;
