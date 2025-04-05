import React, {useEffect, useRef} from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import coreCommunicator from '../bridge/CoreCommunicator';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import { useGlassesMirror } from '../providers/GlassesMirrorContext';
import GlassesDisplayMirror from './GlassesDisplayMirror';

interface ConnectedSimulatedGlassesInfoProps {
  isDarkTheme: boolean;
}

const ConnectedSimulatedGlassesInfo: React.FC<ConnectedSimulatedGlassesInfoProps> = ({ isDarkTheme }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const { status } = useStatus();
  const { events } = useGlassesMirror();
  
  // Get the last event to display in the mirror
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;

  useEffect(() => {
    // Start animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start();

    // Cleanup function
    return () => {
      fadeAnim.stopAnimation();
      scaleAnim.stopAnimation();
    };
  }, []);

  const sendDisconnectWearable = async () => {
    console.log('Disconnecting simulated wearable');
    try {
      await coreCommunicator.sendDisconnectWearable();
      await coreCommunicator.sendForgetSmartGlasses();
    } catch (error) {
      console.error('Error disconnecting simulated wearable:', error);
    }
  };

  const themeStyles = {
    backgroundColor: isDarkTheme ? '#333333' : '#F2F2F7',
    textColor: isDarkTheme ? '#FFFFFF' : '#333333',
  };

  return (
    <View style={[styles.deviceInfoContainer, { backgroundColor: themeStyles.backgroundColor }]}>
      <View style={styles.connectedContent}>
        {/* Mirror Display Area - Takes up all available space above bottom bar */}
        <Animated.View 
          style={[
            styles.mirrorWrapper, 
            { 
              opacity: fadeAnim, 
              transform: [{ scale: scaleAnim }] 
            }
          ]}
        >
          <GlassesDisplayMirror 
            layout={lastEvent?.layout}
            fallbackMessage="Simulated Glasses Display"
            containerStyle={styles.mirrorContainer}
          />
        </Animated.View>
      </View>
      
      {/* Bottom Bar with "Simulated Glasses" text and disconnect button */}
      <View style={styles.bottomBar}>
        <Text style={[styles.simulatedGlassesText, { color: themeStyles.textColor }]}>
          Simulated Glasses
        </Text>
        
        <TouchableOpacity
          style={styles.disconnectButton}
          onPress={sendDisconnectWearable}
        >
          <Text style={styles.disconnectText}>
            Disconnect
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  deviceInfoContainer: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 0,
    borderRadius: 10,
    width: '100%',
    height: 230,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  connectedContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 0,
  },
  mirrorWrapper: {
    width: '100%',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 0,
  },
  mirrorContainer: {
    padding: 0,
    height: '100%',
    width: '100%',
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#6750A414',
    width: '100%',
    padding: 10,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  simulatedGlassesText: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
  },
  disconnectButton: {
    flexDirection: 'row',
    backgroundColor: '#E24A24',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    justifyContent: 'center',
  },
  disconnectText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'Montserrat-Regular',
  },
});

export default ConnectedSimulatedGlassesInfo;