import React, { useState } from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import Config from 'react-native-config';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import NavigationBar from '../components/NavigationBar';
import LoadingComponent from '../components/LoadingComponent';
import InternetConnectionFallbackComponent from '../components/InternetConnectionFallbackComponent';

interface AppStoreWebProps {
  isDarkTheme: boolean;
}

const AppStoreWeb: React.FC<AppStoreWebProps> = ({ isDarkTheme }) => {
  const { status } = useStatus();
  const coreToken = status.core_info.core_token;
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Theme colors
  const theme = {
    backgroundColor: isDarkTheme ? '#1c1c1c' : '#f9f9f9',
    headerBg: isDarkTheme ? '#333333' : '#fff',
    textColor: isDarkTheme ? '#FFFFFF' : '#333333',
    secondaryTextColor: isDarkTheme ? '#aaaaaa' : '#777777',
    borderColor: isDarkTheme ? '#444444' : '#e0e0e0',
    buttonBg: isDarkTheme ? '#444444' : '#eeeeee',
    buttonTextColor: isDarkTheme ? '#ffffff' : '#333333',
    primaryColor: '#0088FF'
  };

  // Get the app store URL from environment variable or use a fallback
  const appStoreUrl = Config.AUGMENTOS_APPSTORE_URL || 'https://store.augmentos.org';

  // Handle WebView loading events
  const handleLoadStart = () => setIsLoading(true);
  const handleLoadEnd = () => setIsLoading(false);
  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  // Set up headers with the authentication token
  const headers = {
    'Authorization': `Bearer ${coreToken}`,
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      {hasError ? (
        <InternetConnectionFallbackComponent 
          retry={() => setHasError(false)} isDarkTheme={false}         />
      ) : (
        <View style={styles.webViewContainer}>
          <WebView
            source={{ 
              uri: appStoreUrl,
              headers: headers
            }}
            style={styles.webView}
            onLoadStart={handleLoadStart}
            onLoadEnd={handleLoadEnd}
            onError={handleError}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            renderLoading={() => (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={theme.primaryColor} />
                <Text style={[styles.loadingText, { color: theme.textColor }]}>
                  Loading App Store...
                </Text>
              </View>
            )}
          />
        </View>
      )}

      {/* Navigation Bar remains visible */}
      <View
        style={[
          styles.navigationBarContainer,
          {
            backgroundColor: theme.headerBg,
            borderTopColor: theme.borderColor,
          },
        ]}
      >
        <NavigationBar toggleTheme={() => {}} isDarkTheme={isDarkTheme} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webViewContainer: {
    flex: 1,
    marginBottom: 55, // Space for the navigation bar
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    fontFamily: 'Montserrat-Regular',
  },
  navigationBarContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    borderTopWidth: 1,
    paddingBottom: 20,
  },
});

export default AppStoreWeb;