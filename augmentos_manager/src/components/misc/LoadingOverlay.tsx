import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

interface LoadingOverlayProps {
  message?: string;
  isDarkTheme: boolean;
}

/**
 * A consistent loading overlay component to be used across the app
 * for loading states, especially during transitions between screens.
 */
const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ 
  message = 'Loading...', 
  isDarkTheme 
}) => {
  // Theme-based colors
  const theme = {
    backgroundColor: isDarkTheme ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.85)',
    textColor: isDarkTheme ? '#FFFFFF' : '#333333',
    primaryColor: '#0088FF'
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      <View style={styles.contentContainer}>
        <ActivityIndicator 
          size="large" 
          color={theme.primaryColor} 
          style={styles.spinner}
        />
        <Text style={[styles.message, { color: theme.textColor }]}>
          {message}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  contentContainer: {
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'Montserrat-Regular',
    textAlign: 'center',
  }
});

export default LoadingOverlay;