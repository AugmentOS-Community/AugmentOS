import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Button from '@/components/misc/Button';
import {saveSetting} from '@/utils/SettingsHelper';
import {SETTINGS_KEYS} from '@/consts';
import {useAppStatus} from '@/contexts/AppStatusProvider';
import BackendServerComms from '@/backend_comms/BackendServerComms';
import { router } from 'expo-router';
import { useAppTheme } from '@/utils/useAppTheme';
import { useNavigationHistory } from '@/contexts/NavigationHistoryContext';

export default function OnboardingWelcome() {
  const {appStatus, optimisticallyStopApp, clearPendingOperation, refreshAppStatus} = useAppStatus();
  const {theme, themed} = useAppTheme();
  const isDarkTheme = theme.isDark;
  const {goBack, push, replace} = useNavigationHistory()
  const backendComms = BackendServerComms.getInstance();

  const stopAllApps = async () => {
    const runningApps = appStatus.filter(app => app.is_running);
    for (const runningApp of runningApps) {
      optimisticallyStopApp(runningApp.packageName);
      try {
        await backendComms.stopApp(runningApp.packageName);
        clearPendingOperation(runningApp.packageName);
      } catch (error) {
        console.error('stop app error:', error);
        refreshAppStatus();
      }
    }
  };

  // Skip onboarding and go directly to home
  const handleSkip = () => {
    // Mark onboarding as completed when skipped
    saveSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true);
    replace('/(tabs)/home');
  };

  // Continue to glasses selection screen
  const handleContinue = async () => {
    // Mark that onboarding should be shown on Home screen
    saveSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, false);

    // deactivate all running apps:
    await stopAllApps();

    router.push('/pairing/select-glasses-model');
  };

  return (
    <View style={[styles.container, isDarkTheme ? styles.darkBackground : styles.lightBackground]}>
      <View style={styles.mainContainer}>
        {/* <View style={styles.logoContainer}>
          <Icon
            name="augmented-reality"
            size={100}
            color={isDarkTheme ? '#FFFFFF' : '#2196F3'}
          />
        </View> */}

        <View style={styles.infoContainer}>
          <Text style={[styles.title, isDarkTheme ? styles.lightText : styles.darkText]}>Welcome to AugmentOS</Text>

          <Text style={[styles.description, isDarkTheme ? styles.lightSubtext : styles.darkSubtext]}>
            Let's go through a quick tutorial to get you started with AugmentOS.
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <Button onPress={handleContinue} isDarkTheme={isDarkTheme} iconName="arrow-right" disabled={false}>
            Continue
          </Button>

          <View style={styles.skipButtonContainer}>
            <Button onPress={handleSkip} isDarkTheme={isDarkTheme} iconName="skip-next" disabled={false}>
              Skip Onboarding
            </Button>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mainContainer: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    padding: 24,
  },
  logoContainer: {
    flex: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 40,
  },
  infoContainer: {
    flex: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  description: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 26,
    paddingHorizontal: 24,
  },
  buttonContainer: {
    flex: 0,
    justifyContent: 'flex-end',
    paddingBottom: 40,
    width: '100%',
    alignItems: 'center',
  },
  skipButtonContainer: {
    marginTop: 16,
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
