import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  Platform,
  BackHandler,
} from 'react-native';
import { RNCamera } from 'react-native-camera';
import NavigationBar from '../components/NavigationBar';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import { useGlassesMirror } from '../providers/GlassesMirrorContext';
import { requestFeaturePermissions, PermissionFeatures } from '../logic/PermissionsUtils';

interface GlassesMirrorProps {
  isDarkTheme: boolean;
}

// Request camera permission when needed
const requestCameraPermission = async () => {
  return await requestFeaturePermissions(PermissionFeatures.CAMERA);
};

const GlassesMirror: React.FC<GlassesMirrorProps> = ({isDarkTheme}) => {
  const { status } = useStatus();
  const { events } = useGlassesMirror(); // From context
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const cameraRef = useRef<RNCamera | null>(null);

  // Helper to check if we have a glasses model name
  const isGlassesConnected = !!status.glasses_info?.model_name;
  
  // Get only the last event
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  
  // Check camera permission when entering fullscreen
  const checkCameraPermission = async () => {
    const hasPermission = await requestCameraPermission();
    setHasCameraPermission(hasPermission);
    return hasPermission;
  };
  
  // Setup back button handling
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isFullScreen) {
        toggleFullScreen();
        return true;
      }
      return false;
    });

    return () => backHandler.remove();
  }, [isFullScreen]);
  
  // Check permission when entering fullscreen
  useEffect(() => {
    if (isFullScreen) {
      checkCameraPermission();
    }
  }, [isFullScreen]);
  
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
      {/* Fullscreen mode */}
      {isFullScreen && isGlassesConnected && lastEvent ? (
        <View style={styles.fullscreenContainer}>
          {/* Camera feed */}
          {hasCameraPermission ? (
            <RNCamera
              ref={cameraRef}
              style={styles.cameraBackground}
              type={RNCamera.Constants.Type.front}
              captureAudio={false}
              androidCameraPermissionOptions={{
                title: 'Camera Permission',
                message: 'This app needs access to your camera for the fullscreen mirror mode.',
                buttonPositive: 'OK',
                buttonNegative: 'Cancel',
              }}
            />
          ) : (
            <View style={styles.fullscreenBackground}>
              <Text style={styles.cameraPermissionText}>
                Camera permission needed for fullscreen mode
              </Text>
            </View>
          )}
          
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
        /* Regular mode - with fixed layout */
        <View style={styles.regularContainer}>
          {/* Header */}
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
          
          {/* Content */}
          <View style={styles.contentWrapper}>
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
          </View>
          
          {/* Navigation bar at the bottom */}
          <View style={styles.navbarWrapper}>
            <NavigationBar isDarkTheme={isDarkTheme} toggleTheme={() => {}} />
          </View>
        </View>
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
    case 'bitmap_view': {
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
    padding: 0,
  },
  darkContainer: {
    backgroundColor: '#121212',
  },
  lightContainer: {
    backgroundColor: '#f8f9fa',
  },
  // Fullscreen layout
  fullscreenContainer: {
    flex: 1,
    padding: 0,
    backgroundColor: 'black',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  cameraBackground: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    aspectRatio: 1,
    alignSelf: 'center',
  },
  // Regular layout container with proper stacking
  regularContainer: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  titleContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 60, // Match the Header.tsx height
    ...Platform.select({
      ios: {
        paddingTop: 16,
      },
      android: {
        paddingTop: 16,
      },
    }),
  },
  titleContainerDark: {
    backgroundColor: '#333333',
  },
  titleContainerLight: {
    backgroundColor: '#ffffff',
  },
  contentWrapper: {
    flex: 1,
    paddingBottom: 0,
  },
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
  // Glasses display styling
  glassesDisplayContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
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
  fullscreenBackground: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: '#1a1a1a', // Dark background for contrast with green text
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraPermissionText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Montserrat-Regular',
    textAlign: 'center',
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