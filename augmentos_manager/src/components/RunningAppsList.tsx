import React, {useMemo, useState, useRef} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ScrollView} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useStatus} from '../providers/AugmentOSStatusProvider';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import coreCommunicator from '../bridge/CoreCommunicator';
import AppIcon from './AppIcon';
import { useNavigation } from '@react-navigation/native';
import { NavigationProps } from './types';

interface RunningAppsListProps {
  isDarkTheme: boolean;
}

const RunningAppsList: React.FC<RunningAppsListProps> = ({isDarkTheme}) => {
  const {status, updateAppStatus, startAppOperation, endAppOperation, isAppOperationPending} = useStatus();
  const [_isLoading, setIsLoading] = useState(false);
  const textColor = isDarkTheme ? '#FFFFFF' : '#000000';
  const navigation = useNavigation<NavigationProps>();
  const scrollViewRef = useRef<ScrollView>(null);

  const stopApp = async (packageName: string) => {
    console.log('STOP APP');
    
    if (isAppOperationPending(packageName)) {
      console.log(`Cannot stop app ${packageName}: operation already in progress`);
      return;
    }
    
    if (!startAppOperation(packageName, 'stop')) {
      console.log(`Cannot stop app ${packageName}: operation rejected`);
      return;
    }
    
    updateAppStatus(packageName, false, false);
    
    setIsLoading(true);
    try {
      await coreCommunicator.stopAppByPackageName(packageName);
    } catch (error) {
      updateAppStatus(packageName, true, true);
      console.error('Stop app error:', error);
    } finally {
      setIsLoading(false);
      endAppOperation(packageName);
    }
  };

  const openAppSettings = (app: any) => {
    navigation.navigate('AppSettings', {
      packageName: app.packageName,
      appName: app.name
    });
  };

  const runningApps = useMemo(
    () => status.apps.filter(app => app.is_running),
    [status],
  );

  const scrollToBottom = () => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  };

  return (
    <View style={styles.appsContainer}>
      <Text style={[styles.sectionTitle, {color: textColor}]}>
        Running Apps
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
    marginTop: 12,
    marginBottom: 10,
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
    padding: 4,
  },
  noAppsContainer: {
    marginBottom: 8,
  },
  noAppsGradient: {
    borderRadius: 12,
    padding: 12,
    minHeight: 40,
  },
  noAppsContent: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
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
