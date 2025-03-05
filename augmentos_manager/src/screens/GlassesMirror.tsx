import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import NavigationBar from '../components/NavigationBar.tsx';
import { useStatus } from '../providers/AugmentOSStatusProvider.tsx';
import { useGlassesMirror } from '../providers/GlassesMirrorContext.tsx';

interface GlassesMirrorProps {
  isDarkTheme: boolean;
}

const GlassesMirror: React.FC<GlassesMirrorProps> = ({isDarkTheme}) => {
  const { status } = useStatus();
  const { events } = useGlassesMirror(); // From context
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Helper to check if we have a glasses model name
  const isGlassesConnected = !!status.glasses_info?.model_name;
  
  // Get only the last event
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  
  // Function to toggle fullscreen mode
  const toggleFullScreen = () => {
    if (!isFullScreen) {
      // Enter fullscreen mode and hide status bar
      StatusBar.setHidden(true);
      setIsFullScreen(true);
    } else {
      // Exit fullscreen mode and show status bar
      StatusBar.setHidden(false);
      setIsFullScreen(false);
    }
  };

  return (
    <View
      style={[
        styles.container,
        isFullScreen ? styles.fullscreenContainer : (isDarkTheme ? styles.darkContainer : styles.lightContainer),
      ]}
    >
      {!isFullScreen && (
        <View
          style={[
            styles.titleContainer,
            isDarkTheme ? styles.titleContainerDark : styles.titleContainerLight,
          ]}
        >
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
              onPress={toggleFullScreen}
            >
              <Text style={styles.fullscreenButtonText}>
                Enter Fullscreen
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Fullscreen mode */}
      {isFullScreen && isGlassesConnected && lastEvent ? (
        <View style={styles.fullscreenContainer}>
          {/* Dark background for better contrast */}
          <View style={styles.fullscreenBackground} />
          
          {/* Overlay the glasses display content */}
          <View style={styles.fullscreenOverlay}>
            {lastEvent.layout && lastEvent.layout.layoutType ? (
              renderLayout(lastEvent.layout)
            ) : (
              <Text style={styles.glassesText}>
                Unknown layout data
              </Text>
            )}
          </View>
          
          {/* Fullscreen exit button */}
          <TouchableOpacity
            style={styles.exitFullscreenButton}
            onPress={toggleFullScreen}
          >
            <Text style={styles.exitFullscreenText}>Exit</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* Regular mode - same as before */
        <>
          {isGlassesConnected ? (
            <View style={styles.contentContainer}>
              {lastEvent ? (
                <View style={styles.glassesDisplayContainer}>
                  <View style={styles.glassesScreen}>
                    {lastEvent.layout && lastEvent.layout.layoutType ? (
                      renderLayout(lastEvent.layout)
                    ) : (
                      <Text style={styles.glassesText}>
                        Unknown layout data
                      </Text>
                    )}
                  </View>
                </View>
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
        </>
      )}

      {!isFullScreen && (
        <NavigationBar isDarkTheme={isDarkTheme} toggleTheme={() => {}} />
      )}
    </View>
  );
};

/**
 *  Render logic for each layoutType
 */
function renderLayout(layout: any) {
  const textStyle = styles.glassesText;

  switch (layout.layoutType) {
    case 'reference_card': {
      const { title, text } = layout;
      return (
        <>
          <Text style={[styles.cardTitle, textStyle]}>{title}</Text>
          <Text style={[styles.cardContent, textStyle]}>{text}</Text>
        </>
      );
    }
    case 'text_wall':
    case 'text_line': {
      const { text } = layout;
      // Even if text is empty, show a placeholder message for text_wall layouts
      return (
        <Text style={[styles.cardContent, textStyle]}>
          {text || text === "" ? text : ""}
        </Text>
      );
    }
    case 'double_text_wall': {
      const { topText, bottomText } = layout;
      return (
        <>
          <Text style={[styles.cardContent, textStyle]}>{topText}</Text>
          <Text style={[styles.cardContent, textStyle]}>{bottomText}</Text>
        </>
      );
    }
    case 'text_rows': {
      // layout.text is presumably an array of strings
      const rows = layout.text || [];
      return rows.map((row: string, index: number) => (
        <Text key={index} style={[styles.cardContent, textStyle]}>
          {row}
        </Text>
      ));
    }
    case 'bitmap': {
      // layout.data is a base64 string. We can show an image in RN by creating a data URL
      // e.g. { uri: "data:image/png;base64,<base64string>" }
      const { data } = layout;
      const imageUri = `data:image/png;base64,${data}`;
      return (
        <Image
          source={{ uri: imageUri }}
          style={{ width: 200, height: 200, resizeMode: 'contain', tintColor: '#00FF00' }}
        />
      );
    }
    default:
      return (
        <Text style={[styles.cardContent, textStyle]}>
          Unknown layout type: {layout.layoutType}
        </Text>
      );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  darkContainer: {
    backgroundColor: '#121212',
  },
  lightContainer: {
    backgroundColor: '#f8f9fa',
  },
  fullscreenContainer: {
    flex: 1,
    padding: 0, // No padding in fullscreen mode
    backgroundColor: 'black',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  titleContainer: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginHorizontal: -20,
    marginTop: -20,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleContainerDark: {
    backgroundColor: '#333333',
  },
  titleContainerLight: {
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
    textAlign: 'left',
    marginBottom: 5,
    flex: 1,
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
    marginBottom: 0,
  },
  // Glasses display styling
  glassesDisplayContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  glassesScreen: {
    width: '100%',
    minHeight: 200,
    backgroundColor: '#000000',
    borderRadius: 10,
    padding: 15,
    borderWidth: 2,
    borderColor: '#333333',
  },
  glassesText: {
    color: '#00FF00', // Bright green color for monochrome display
    fontFamily: 'Montserrat-Regular',
    fontSize: 16,
    // Add text shadow for better visibility against any background
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  emptyTextWall: {
    borderWidth: 1,
    borderColor: '#00FF00',
    borderStyle: 'dashed',
    width: '100%',
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: 'Montserrat-Bold',
    marginBottom: 5,
  },
  cardContent: {
    fontSize: 16,
    fontFamily: 'Montserrat-Regular',
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
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-end',
  },
  fullscreenButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Montserrat-Bold',
  },
  fullscreenBackground: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: '#1a1a1a', // Dark background for contrast with green text
  },
  fullscreenOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    padding: 40,
    zIndex: 10,
  },
  exitFullscreenButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
    zIndex: 10,
  },
  exitFullscreenText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Montserrat-Bold',
  },
});

export default GlassesMirror;