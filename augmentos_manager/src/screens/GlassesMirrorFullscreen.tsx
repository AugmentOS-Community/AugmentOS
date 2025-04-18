import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  BackHandler,
  Image,
} from 'react-native';
import { RNCamera } from 'react-native-camera';
import { useNavigation } from '@react-navigation/native';
import GlassesDisplayMirrorFullscreen from '../components/GlassesDisplayMirrorFullscreen';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import { useGlassesMirror } from '../providers/GlassesMirrorContext';
import { requestFeaturePermissions, PermissionFeatures } from '../logic/PermissionsUtils';
import { NavigationProps } from '../components/types';

interface GlassesMirrorFullscreenProps {
  isDarkTheme: boolean;
}

// Request camera permission when needed
const requestCameraPermission = async () => {
  return await requestFeaturePermissions(PermissionFeatures.CAMERA);
};

const GlassesMirrorFullscreen: React.FC<GlassesMirrorFullscreenProps> = ({ isDarkTheme }) => {
  const { status } = useStatus();
  const { events } = useGlassesMirror(); // From context
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [cameraType, setCameraType] = useState(RNCamera.Constants.Type.front);
  const cameraRef = useRef<RNCamera | null>(null);
  const navigation = useNavigation<NavigationProps>();

  // Helper to check if we have a glasses model name
  const isGlassesConnected = !!status.glasses_info?.model_name;
  
  // Get only the last event
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  
  // Check camera permission on component mount
  useEffect(() => {
    checkCameraPermission();
    // Hide status bar in fullscreen mode
    StatusBar.setHidden(true);
    
    return () => {
      // Show status bar when exiting
      StatusBar.setHidden(false);
    };
  }, []);
  
  // Check camera permission
  const checkCameraPermission = async () => {
    const hasPermission = await requestCameraPermission();
    setHasCameraPermission(hasPermission);
    return hasPermission;
  };
  
  // Back button handler
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleExitFullscreen();
      return true;
    });

    return () => backHandler.remove();
  }, []);
  
  // Handle exiting fullscreen mode
  const handleExitFullscreen = () => {
    StatusBar.setHidden(false);
    navigation.goBack();
  };
  
  // Toggle camera between front and back
  const toggleCamera = () => {
    setCameraType(
      cameraType === RNCamera.Constants.Type.front
        ? RNCamera.Constants.Type.back
        : RNCamera.Constants.Type.front
    );
  };

  return (
    <View style={styles.fullscreenContainer}>
      {isGlassesConnected && lastEvent ? (
        <>
          {/* Camera feed */}
          {hasCameraPermission ? (
            <RNCamera
              ref={cameraRef}
              style={styles.cameraBackground}
              type={cameraType}
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
            <GlassesDisplayMirrorFullscreen 
              layout={lastEvent.layout}
              fallbackMessage="Unknown layout data"
            />
          </View>
          
          {/* Fullscreen exit button */}
          <TouchableOpacity
            style={styles.exitFullscreenButton}
            onPress={handleExitFullscreen}
          >
            <Text style={styles.exitFullscreenText}>Exit</Text>
          </TouchableOpacity>
          
          {/* Camera flip button */}
          {hasCameraPermission && (
            <TouchableOpacity
              style={styles.flipCameraButton}
              onPress={toggleCamera}
            >
              <Text style={styles.flipCameraText}>
                {cameraType === RNCamera.Constants.Type.front ? 'Flip to Back' : 'Flip to Front'}
              </Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <View style={styles.fallbackContainer}>
          <Text style={styles.fallbackText}>
            {!isGlassesConnected 
              ? "Connect glasses to use the Glasses Mirror" 
              : "No display events available"}
          </Text>
          <TouchableOpacity
            style={styles.exitFullscreenButton}
            onPress={handleExitFullscreen}
          >
            <Text style={styles.exitFullscreenText}>Back</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
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
  fullscreenDisplayContainer: {
    padding: 0,
    backgroundColor: 'transparent',
  },
  exitFullscreenButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
    zIndex: 20,
  },
  exitFullscreenText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Montserrat-Bold',
  },
  flipCameraButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
    zIndex: 20,
  },
  flipCameraText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Montserrat-Bold',
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  fallbackText: {
    color: 'white',
    fontSize: 18,
    fontFamily: 'Montserrat-Regular',
    textAlign: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
  },
});

export default GlassesMirrorFullscreen;