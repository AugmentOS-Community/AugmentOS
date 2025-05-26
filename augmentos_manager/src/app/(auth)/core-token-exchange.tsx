import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Animated
} from 'react-native';
import { useStatus } from "@/contexts/AugmentOSStatusProvider";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from '@/contexts/AuthContext';
import coreCommunicator from '@/bridge/CoreCommunicator';
import BackendServerComms from '@/backend_comms/BackendServerComms';
import Config from 'react-native-config';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Button from '@/components/misc/Button';
import { loadSetting } from '@/utils/SettingsHelper';
import { SETTINGS_KEYS } from '@/consts';
import { router } from 'expo-router';
import { useAppTheme } from '@/utils/useAppTheme';


export default function CoreTokenExchange() {
  const { status } = useStatus();
  const { user, session, loading: authLoading } = useAuth();
  const [connectionError, setConnectionError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('Connection to AugmentOS failed. Please check your connection and try again.');
  const hasAttemptedConnection = useRef(false);
  const loadingOverlayOpacity = useRef(new Animated.Value(1)).current;
  const {theme, themed} = useAppTheme();

  const handleTokenExchange = async () => {
    if (isLoading) return;

    setIsLoading(true);

    try {
      const supabaseToken = session?.access_token;
      if (!supabaseToken) {
        setErrorMessage('Unable to authenticate. Please sign in again.');
        setIsLoading(false);
        return;
      }

      // Exchange token with backend
      const backend = BackendServerComms.getInstance();
      const coreToken = await backend.exchangeToken(supabaseToken)
        .catch(err => {
          // Hide console.error output
          // Log only if needed for debugging
          // console.error('Token exchange failed:', err);
          throw err;
        });

      let uid = user.email || user.id;
      coreCommunicator.setAuthenticationSecretKey(uid, coreToken);
      BackendServerComms.getInstance().setCoreToken(coreToken);

      // Navigate
      // Check if the user has completed onboarding
      const onboardingCompleted = await loadSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, false);
      if (onboardingCompleted) {
        // If onboarding is completed, go directly to Home
        router.replace('/(tabs)/home');
      } else {
        // If onboarding is not completed, go to WelcomePage
        router.replace('/onboarding/welcome');
      }
    } catch (err) {
      // Don't log the error to console
      setErrorMessage('Connection to AugmentOS failed. Please check your connection and try again.');
      setConnectionError(true);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    console.log("STATUS", status);
    
    console.log("puck_connected", status.core_info.puck_connected);
    // Don't show the error UI for initial load attempts and avoid repeating failed attempts
    if (connectionError || hasAttemptedConnection.current) return;

    // We only proceed once the core is connected, the user is loaded, etc.
    if (/*TODO2.0: status.core_info.puck_connected && */!authLoading && user) {
      // Track that we've attempted a connection
      hasAttemptedConnection.current = true;

      // 1) Get the Supabase token from your AuthContext
      const supabaseToken = session?.access_token;
      if (!supabaseToken) {
        console.log('No Supabase token found');
        setErrorMessage('Unable to authenticate. Please sign in again.');
        setConnectionError(true);
        return;
      }

      // 2) Check if we need to do the exchange
      if (!status.auth.core_token_owner || status.auth.core_token_owner !== user.email) {
        console.log("OWNER IS NULL CALLING VERIFY (TOKEN EXCHANGE)");

        // Don't try automatic retry if we're already loading or had an error
        if (!isLoading) {
          handleTokenExchange();
        }
      } else {
        // If we already have a token, go straight to Home
        BackendServerComms.getInstance().setCoreToken(status.core_info.core_token);
        router.replace('/home');
      }
    }
  }, [status.core_info.puck_connected, authLoading, user]);

  // Loading screen
  if (!connectionError) {
    return (
      <View
        style={[
          styles.container,
          theme.isDark ? styles.darkBackground : styles.lightBackground
        ]}
      >
        <Animated.View 
          style={[
            styles.authLoadingOverlay,
            { opacity: loadingOverlayOpacity }
          ]}
        >
          <View style={styles.authLoadingContent}>
            {/* Logo placeholder instead of image */}
            <View style={styles.authLoadingLogoPlaceholder} />
            <ActivityIndicator size="large" color="#2196F3" style={styles.authLoadingIndicator} />
            <Text style={styles.authLoadingText}>Connecting to AugmentOS...</Text>
          </View>
        </Animated.View>
      </View>
    );
  }

  // Error screen (similar to VersionUpdateScreen)
  return (
    <View
      style={[
        styles.container,
        styles.darkBackground,
      ]}
    >
      <View style={styles.mainContainer}>
        <View style={styles.infoContainer}>
          <View style={styles.iconContainer}>
            <Icon
              name="wifi-off"
              size={80}
              color={theme.isDark ? '#ff6b6b' : '#ff0000'}
            />
          </View>

          <Text
            style={[
              styles.title,
              theme.isDark ? styles.lightText : styles.darkText,
            ]}
          >
            Connection Error
          </Text>

          <Text
            style={[
              styles.description,
              theme.isDark ? styles.lightSubtext : styles.darkSubtext,
            ]}
          >
            {errorMessage}
          </Text>
        </View>

        <View style={styles.setupContainer}>
          <Button
            onPress={handleTokenExchange}
            isDarkTheme={theme.isDark}
            disabled={isLoading}
            iconName="reload"
          >
            {isLoading ? "Connecting..." : "Retry Connection"}
          </Button>
        </View>
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
  authLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authLoadingContent: {
    alignItems: 'center',
    padding: 20,
  },
  authLoadingLogoPlaceholder: {
    width: 100,
    height: 100,
    marginBottom: 20,
  },
  authLoadingIndicator: {
    marginBottom: 16,
  },
  authLoadingText: {
    fontSize: 16,
    fontFamily: 'Montserrat-Medium',
    color: '#333',
    textAlign: 'center',
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
    marginBottom: 28,
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