import React, { useEffect, useState } from 'react';
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
  PermissionsAndroid,
  Permission,
  AppState,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { displayPermissionDeniedWarning, doesHaveAllPermissions, requestGrantPermissions as requestGrantBasicPermissions } from '../logic/PermissionsUtils';
import Button from '../components/Button';
import { checkNotificationPermission } from '../logic/NotificationServiceUtils';
import { checkAndRequestNotificationAccessSpecialPermission, checkNotificationAccessSpecialPermission } from "../utils/NotificationServiceUtils";
import { openCorePermissionsActivity } from '../bridge/CoreServiceStarter';

interface GrantPermissionsScreenProps {
  isDarkTheme: boolean;
  toggleTheme: () => void;
  navigation: any;
}

const GrantPermissionsScreen: React.FC<GrantPermissionsScreenProps> = ({
  isDarkTheme,
  toggleTheme,
  navigation,
}) => {
  const [appState, setAppState] = useState(AppState.currentState);
  const [isMonitoringAppState, setIsMonitoringAppState] = useState(false);


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

  useEffect(() => {
    (async () => {
      if (await doesHaveAllPermissions()) {
        // Alert, you already have the perms! Why are you even here? Go away!

        navigation.reset({
          index: 0,
          routes: [{ name: 'SplashScreen' }],
        });
        return;
      }
    })();
  }, []);

  useEffect(() => {
    let subscription: any;

    if (isMonitoringAppState) {
      subscription = AppState.addEventListener('change', async (nextAppState) => {
        if (
          appState.match(/inactive|background/) &&
          nextAppState === 'active'
        ) {
          console.log('App has come to foreground!');

          if (await doesHaveAllPermissions()) {
            openCorePermissionsActivity();
            navigation.reset({
              index: 0,
              routes: [{ name: 'SplashScreen' }],
            });
            return;
          }
          else {
            await displayPermissionDeniedWarning();
          }
        }
        setAppState(nextAppState);
      });
    }

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [appState, isMonitoringAppState]);

  const triggerGrantPermissions = async () => {
    let allBasicPermissionsGranted = await requestGrantBasicPermissions();
    console.log("DID WE GET ALL THE BASIC PERMISSIONS???");
    console.log(allBasicPermissionsGranted);

    if ((await doesHaveAllPermissions())) {
      console.log("WE SUPPOSEDLY HAVE ALL THE PERMSSS");
      openCorePermissionsActivity();
      navigation.reset({
        index: 0,
        routes: [{ name: 'SplashScreen' }],
      });
    } else {
      console.log(" WE NEED MOR PERMS ");
      let doesHaveSpecialNotificationPermission = await checkNotificationAccessSpecialPermission();
      if(!doesHaveSpecialNotificationPermission) {
        console.log("WE NEED MORE NOTIFICATION PERMSS");
        checkAndRequestNotificationAccessSpecialPermission();
        setIsMonitoringAppState(true);
      }
    }
  }

  return (
    <View
      style={[
        styles.container,
        isDarkTheme ? styles.darkBackground : styles.lightBackground,
      ]}>
      <ScrollView style={styles.scrollViewContainer}>
        <View style={styles.contentContainer}>
          <View style={styles.iconContainer}>
            <Icon name="shield-check" size={80} color={isDarkTheme ? '#FFFFFF' : '#2196F3'} />
          </View>

          <Text style={[styles.title, isDarkTheme ? styles.lightText : styles.darkText]}>
            Permissions Required
          </Text>

          <Text style={[styles.description, isDarkTheme ? styles.lightSubtext : styles.darkSubtext]}>
            AugmentOS needs permissions to function properly. Please grant access to continue using all features.
          </Text>
          <Button
          disabled={false}
            onPress={() => { triggerGrantPermissions() }}
            isDarkTheme={isDarkTheme}
          >
            Grant Permissions
          </Button>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    marginBottom: 40,
    lineHeight: 24,
    paddingHorizontal: 24,
  },
  button: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    maxWidth: 300,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  buttonText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
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

export default GrantPermissionsScreen;
