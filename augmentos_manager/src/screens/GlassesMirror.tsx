import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlassesDisplayMirror from '../components/GlassesDisplayMirror';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import { useGlassesMirror } from '../providers/GlassesMirrorContext';
import { NavigationProps } from '../components/types';

interface GlassesMirrorProps {
  isDarkTheme: boolean;
}

const GlassesMirror: React.FC<GlassesMirrorProps> = ({ isDarkTheme }) => {
  const { status } = useStatus();
  const { events } = useGlassesMirror(); // From context
  const navigation = useNavigation<NavigationProps>();

  // Helper to check if we have a glasses model name
  const isGlassesConnected = !!status.glasses_info?.model_name;
  
  // Get only the last event
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  
  // Function to navigate to fullscreen mode
  const navigateToFullScreen = () => {
    navigation.navigate('GlassesMirrorFullscreen');
  };

  // Create style object mirroring Homepage approach
  const currentThemeStyles = {
    container: { flex: 1 },
    contentContainer: {
      flex: 1, 
      paddingBottom: isDarkTheme ? 55 : 0  // Key difference! Homepage has 55px padding in dark mode
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View
        style={[
          currentThemeStyles.container,
          isDarkTheme ? styles.darkContainer : styles.lightContainer,
        ]}>
        {/* Header */}
        <View style={styles.titleContainer}>
          <Text
            style={[
              styles.title,
              isDarkTheme ? styles.titleTextDark : styles.titleTextLight,
            ]}
          >
            Glasses Mirror
          </Text>
          
          {isGlassesConnected && lastEvent && (
            <TouchableOpacity
              style={styles.fullscreenButton}
              onPress={navigateToFullScreen}
            >
              <Text style={styles.fullscreenButtonText}>
                Enter Fullscreen
              </Text>
            </TouchableOpacity>
          )}
        </View>
        
        {/* Content */}
        <View style={[styles.contentWrapper, currentThemeStyles.contentContainer]}>
          {isGlassesConnected ? (
            <View style={styles.contentContainer}>
              {lastEvent ? (
                <GlassesDisplayMirror 
                  layout={lastEvent.layout} 
                  fallbackMessage="Unknown layout data"
                />
              ) : (
                <View style={styles.fallbackContainer}>
                  <Text style={[isDarkTheme ? styles.darkText : styles.lightText, styles.fallbackText]}>
                    No display events available
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.fallbackContainer}>
              <Text style={[isDarkTheme ? styles.darkText : styles.lightText, styles.fallbackText]}>
                Connect glasses to use the Glasses Mirror
              </Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 0,
  },
  darkContainer: {
    backgroundColor: '#000000', // Match Homepage dark theme
  },
  lightContainer: {
    backgroundColor: '#f0f0f0', // Match Settings light theme
  },
  // Removed navBarOuterContainer
  // Regular layout container with proper stacking
  regularContainer: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  titleContainer: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  // No separate background colors for title container
  titleContainerDark: {},
  titleContainerLight: {},
  contentWrapper: {
    flex: 1,
    marginBottom: 10,
  },
  // This wrapper is no longer used
  navbarWrapper: {
    width: '100%',
    height: 64, // Fixed height for the navbar
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
    textAlign: 'left',
    flex: 1,
    marginBottom: 5,
  },
  titleTextDark: {
    color: '#ffffff',
    fontFamily: 'Montserrat-Bold',
  },
  titleTextLight: {
    color: '#000000',
    fontFamily: 'Montserrat-Bold',
  },
  darkText: {
    color: '#ffffff',
    fontFamily: 'Montserrat-Regular',
  },
  lightText: {
    color: '#000000',
    fontFamily: 'Montserrat-Regular',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenDisplayContainer: {
    padding: 0,
    backgroundColor: 'transparent',
  },
  // Fallback
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    fontSize: 16,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  // Fullscreen mode styles
  fullscreenButton: {
    backgroundColor: '#4c8bf5',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignSelf: 'center',
  },
  fullscreenButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Montserrat-Bold',
  },
});

export default GlassesMirror;