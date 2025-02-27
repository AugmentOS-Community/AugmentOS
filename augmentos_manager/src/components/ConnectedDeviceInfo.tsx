import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { BluetoothService } from '../BluetoothService';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import { NavigationProps } from '../components/types';
import { useNavigation } from '@react-navigation/native';
import { getGlassesImage } from '../logic/getGlassesImage';
import GlobalEventEmitter from '../logic/GlobalEventEmitter.tsx';


interface ConnectedDeviceInfoProps {
  isDarkTheme: boolean;
}

const ConnectedDeviceInfo: React.FC<ConnectedDeviceInfoProps> = ({ isDarkTheme }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const slideAnim = useRef(new Animated.Value(-50)).current;
  const [connectedGlasses, setConnectedGlasses] = useState('');
  const bluetoothService = BluetoothService.getInstance();
  const { status, isSearchingForPuck, isConnectingToPuck, refreshStatus } = useStatus();
  const navigation = useNavigation<NavigationProps>();
  const [isConnectButtonDisabled, setConnectButtonDisabled] = useState(false);
  const [isDisconnectButtonDisabled, setDisconnectButtonDisabled] = useState(false);

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
      if (status.core_info.default_wearable !== '') {
        setDisconnectButtonDisabled(false);
      }
      // Cleanup function
      return () => {
        fadeAnim.stopAnimation();
        scaleAnim.stopAnimation();
        slideAnim.stopAnimation();
      };
    }, [status.core_info.default_wearable, status.core_info.puck_connected, fadeAnim, scaleAnim, slideAnim])
  );

  const handleConnectToPuck = async () => {
    try {
      await bluetoothService.scanForDevices();
    } catch (error) {
      bluetoothService.emit('SHOW_BANNER', { message: 'Failed to start scanning for devices', type: 'error' });
    }
  };

  const connectGlasses = async () => {
    if (!(await bluetoothService.isBluetoothEnabled() && await bluetoothService.isLocationEnabled())) {
      GlobalEventEmitter.emit('SHOW_BANNER', { message: 'Please enable Bluetooth and Location', type: 'error' });
      return;
    }

    // TODO: iOS hack:
    if (status.core_info.default_wearable === undefined || status.core_info.default_wearable === '' || true) {
      navigation.navigate('SelectGlassesModelScreen');
      return;
    }

    setConnectButtonDisabled(true);
    setDisconnectButtonDisabled(false);

    try {
      if (status.core_info.default_wearable && status.core_info.default_wearable != "") {
        await bluetoothService.sendConnectWearable(status.core_info.default_wearable);
      }
    } catch (error) {
      console.error('connect 2 glasses error:', error);
    }
  };

  const sendDisconnectWearable = async () => {
    setDisconnectButtonDisabled(true);
    setConnectButtonDisabled(false);

    try {
      await bluetoothService.sendDisconnectWearable();
    } catch (error) { }
  };

  // New handler: if already connecting, pressing the button calls disconnect.
  const handleConnectOrDisconnect = async () => {
    if (isConnectButtonDisabled) {
      await sendDisconnectWearable();
    } else {
      await connectGlasses();
    }
  };

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
    return 'battery-full';
  };

  const getBatteryColor = (level: number) => {
    if (level > 60) { return '#4CAF50'; }
    if (level > 20) { return '#ff9a00'; }
    if (level == -1) { return '#000000'; }
    return '#FF5722';
  };

  const formatGlassesTitle = (title: string) =>
    title.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

  const batteryIcon = getBatteryIcon(status.glasses_info?.battery_life ?? 0);
  const batteryColor = getBatteryColor(status.glasses_info?.battery_life ?? 0);

  // Determine the button style for connecting glasses
  const getConnectButtonStyle = () => {
    if (isConnectButtonDisabled) {
      return status.glasses_info?.is_searching ? styles.connectingButton : styles.disabledButton;
    }
    return styles.connectButton;
  };

  const overrideConnectingToPuck = true;
  if (status.core_info.puck_connected || overrideConnectingToPuck) {
    return (
      <View style={[styles.deviceInfoContainer, { backgroundColor: themeStyles.backgroundColor }]}>
        {status.core_info.default_wearable ? (
          <View style={styles.connectedContent}>
            <Animated.Image
              source={getGlassesImage(status.core_info.default_wearable)}
              style={[styles.glassesImage, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}
            />
            <Animated.View style={[styles.connectedStatus, { transform: [{ translateX: slideAnim }] }]}>
              <Text style={[styles.connectedTextTitle, { color: themeStyles.textColor }]}>
                {formatGlassesTitle(connectedGlasses)} {status.core_info.default_wearable}
              </Text>
            </Animated.View>

            {/* Are we connected? */}
            {status.glasses_info?.model_name ? (
              <>
                <Animated.View style={[styles.statusBar, { opacity: fadeAnim }]}>
                  <View style={styles.statusInfo}>
                    {status.glasses_info?.battery_life != null && typeof status.glasses_info?.battery_life === 'number' &&
                      <>
                        <Text style={[styles.statusLabel, { color: themeStyles.statusLabelColor }]}>Battery</Text>
                        <View style={styles.batteryContainer}>
                          {status.glasses_info?.battery_life >= 0 &&
                            <Icon name={batteryIcon} size={16} color={batteryColor} style={styles.batteryIcon} />
                          }
                          <Text style={[styles.batteryValue, { color: batteryColor }]}>
                            {status.glasses_info.battery_life == -1
                              ? "-"
                              : `${status.glasses_info.battery_life}%`}
                          </Text>
                        </View>
                      </>
                    }
                  </View>

                  <View style={styles.statusInfo}>
                    {status.glasses_info?.brightness != null &&
                      <>
                        <Text style={[styles.statusLabel, { color: themeStyles.statusLabelColor }]}>Brightness</Text>
                        <Text style={[styles.statusValue, { color: themeStyles.statusValueColor }]}>
                          {status.glasses_info
                            ? `${status.glasses_info.brightness}`
                            : "-"}
                        </Text>
                      </>
                    }
                  </View>
                  <TouchableOpacity
                    style={[styles.disconnectButton, isDisconnectButtonDisabled && styles.disabledDisconnectButton]}
                    onPress={sendDisconnectWearable}
                    disabled={isDisconnectButtonDisabled}
                  >
                    <Icon name="power-off" size={18} color="white" style={styles.icon} />
                    <Text style={styles.disconnectText}>
                      Disconnect
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              </>
            ) : (
              // Connect button rendering with spinner on right
              <View style={styles.noGlassesContent}>
                <TouchableOpacity
                  style={getConnectButtonStyle()}
                  onPress={handleConnectOrDisconnect}
                  disabled={isConnectButtonDisabled && !status.glasses_info?.is_searching}
                >
                  <Text style={styles.buttonText}>
                    {isConnectButtonDisabled ? 'Connecting Glasses...' : 'Connect Glasses'}
                  </Text>
                  {isConnectButtonDisabled && status.glasses_info?.is_searching && (
                    <ActivityIndicator size="small" color="#fff" style={{ marginLeft: 5 }} />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <>
            {status.glasses_info?.is_searching ? (
              <View style={styles.disconnectedContent}>
                <Text style={[styles.connectText, { color: themeStyles.textColor }]}>
                  Searching for glasses
                </Text>
                <ActivityIndicator size="small" color="#2196F3" />
              </View>
            ) : (
              <View style={styles.noGlassesContent}>
                <Text style={styles.noGlassesText}>{"No Glasses Paired"}</Text>
                <TouchableOpacity style={styles.connectButton} onPress={connectGlasses}>
                  <Text style={styles.buttonText}>{"Connect Glasses"}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>
    );
  } else {
    return (
      <View style={[styles.deviceInfoContainer, { backgroundColor: themeStyles.backgroundColor }]}>
        <View style={styles.disconnectedContent}>
          <Text style={[styles.connectText, { color: themeStyles.textColor }]}>
            {isSearchingForPuck ? 'Searching for Puck...' : isConnectingToPuck ? 'Connecting to Puck...' : 'No device connected'}
          </Text>
          {isSearchingForPuck || isConnectingToPuck ? (
            <ActivityIndicator size="small" color="#2196F3" />
          ) : (
            <TouchableOpacity style={styles.connectButton} onPress={handleConnectToPuck}>
              <Icon name="wifi" size={16} color="white" style={styles.icon} />
              <Text style={styles.buttonText}>Connect Glasses</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }
};

const styles = StyleSheet.create({
  deviceInfoContainer: {
    padding: 10,
    borderRadius: 10,
    width: '100%',
    minHeight: 230,
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
    width: '100%',
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
  statusInfoNotConnected: {
    alignItems: 'center',
    flex: 1,
    width: '100%'
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
    alignSelf: 'center',
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
    marginVertical: 0,
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
    fontSize: 16,
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
  connectingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC107', // Yellow when enabled & searching
    padding: 10,
    borderRadius: 8,
    width: '80%',
  },
  disabledButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#A9A9A9', // Grey when disabled
    padding: 10,
    borderRadius: 8,
    width: '80%',
  },
  disabledDisconnectButton: {
    backgroundColor: '#A9A9A9',
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
    width: '40%',
  },
  disconnectText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'Montserrat-Regular',
  },
});

export default ConnectedDeviceInfo;
