import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Alert, PermissionsAndroid, Platform, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { BluetoothService } from '../BluetoothService';
import { useStatus } from '../AugmentOSStatusProvider';
import { NavigationProps } from './types';
import { useNavigation } from '@react-navigation/native';
import { getGlassesImage } from '../logic/getGlassesImage';


interface PairingDeviceInfoProps {
  isDarkTheme: boolean;
  glassesModelName: string;
}

const PairingDeviceInfo: React.FC<PairingDeviceInfoProps> = ({ isDarkTheme, glassesModelName }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const slideAnim = useRef(new Animated.Value(-50)).current;
  const [connectedGlasses, setConnectedGlasses] = useState('');
  const bluetoothService = BluetoothService.getInstance();
  const { status, isSearchingForPuck, isConnectingToPuck, refreshStatus } = useStatus();
  const navigation = useNavigation<NavigationProps>();

  useFocusEffect(
    React.useCallback(() => {
      // Reset animations to initial values
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.8);
      slideAnim.setValue(-50);

      // Start animations if device is connected
      if (status.core_info.puck_connected) {
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
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 700,
            useNativeDriver: true,
          }),
        ]).start();
      }


      // Cleanup function
      return () => {
        fadeAnim.stopAnimation();
        scaleAnim.stopAnimation();
        slideAnim.stopAnimation();
      };
    }, [status.core_info.puck_connected, fadeAnim, scaleAnim, slideAnim])
  );


  const themeStyles = {
    backgroundColor: isDarkTheme ? '#333333' : '#F2F2F7',
    textColor: isDarkTheme ? '#FFFFFF' : '#333333',
    statusLabelColor: isDarkTheme ? '#CCCCCC' : '#666666',
    statusValueColor: isDarkTheme ? '#FFFFFF' : '#333333',
    connectedDotColor: '#28a745',
    separatorColor: isDarkTheme ? '#666666' : '#999999',
  };

  const getBatteryIcon = (level: number) => {
    if (level > 75) { return 'battery-full'; }
    if (level > 50) { return 'battery-three-quarters'; }
    if (level > 25) { return 'battery-half'; }
    if (level > 10) { return 'battery-quarter'; }
    return 'battery-empty';
  };

  const getBatteryColor = (level: number) => {
    if (level > 60) { return '#4CAF50'; }
    if (level > 20) { return '#FFB300'; }
    return '#FF5722';
  };

  const formatGlassesTitle = (title: string) =>
    title.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

  const batteryIcon = getBatteryIcon(status.glasses_info?.battery_life ?? 0);
  const batteryColor = getBatteryColor(status.glasses_info?.battery_life ?? 0);



  return (
    <View style={[styles.deviceInfoContainer, { backgroundColor: themeStyles.backgroundColor }]}>
      {status.glasses_info?.model_name ? (
        <View>
          <Text>Navigating to homepage...</Text>
        </View>
      ) : (
        <>
          <View style={styles.disconnectedContent}>
            <Image
              source={getGlassesImage(glassesModelName)}
              style={styles.glassesImage}
            />
            <Text style={[styles.connectText, { color: themeStyles.textColor }]}>
              {`Searching for ${glassesModelName}`}
            </Text>
            {status.glasses_info?.is_searching && (
              <ActivityIndicator size="small" color="#2196F3" />
            )}
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  deviceInfoContainer: {
    padding: 10,
    borderRadius: 10,
    width: '100%',
    minHeight: 250,
    justifyContent: 'center',
    marginTop: 15,
  },
  connectedContent: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noGlassesContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disconnectedContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassesImage: {
    width: '80%',
    height: '50%',
    resizeMode: 'contain',
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    padding: 10,
    width: '100%',
    backgroundColor: '#6750A414',
    flexWrap: 'wrap',
  },
  statusInfo: {
    alignItems: 'center',
    flex: 1,
    marginRight: 20,
  },
  batteryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  batteryIcon: {
    marginRight: 4,
  },
  batteryValue: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
  },
  connectedStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  connectedDot: {
    fontSize: 14,
    marginRight: 2,
    fontFamily: 'Montserrat-Bold',
  },
  separator: {
    marginHorizontal: 10,
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
  },
  connectedTextGreen: {
    color: '#28a745',
    marginLeft: 4,
    marginRight: 2,
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
  },
  connectedTextTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
  },
  statusLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: -0.08,
    fontFamily: 'SF Pro',
  },
  connectText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
    fontFamily: 'Montserrat-Bold',
  },
  noGlassesText: {
    color: 'black',
    textAlign: 'center',
    fontSize: 14,
    marginBottom: 10,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    padding: 10,
    borderRadius: 8,
    width: '80%',
  },
  icon: {
    marginRight: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
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
    marginRight: 5,
    width: '35%',
  },
  disconnectText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'Montserrat-Regular',
  },
});

export default PairingDeviceInfo;