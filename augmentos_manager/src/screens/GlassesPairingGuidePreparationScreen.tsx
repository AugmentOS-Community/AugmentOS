import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import coreCommunicator from '../bridge/CoreCommunicator';
import { loadSetting, saveSetting } from '../logic/SettingsHelper';
import { SETTINGS_KEYS } from '../consts';
import { NavigationProps } from '../components/types';
import { getGlassesImage } from '../logic/getGlassesImage';
import PairingDeviceInfo from '../components/PairingDeviceInfo';
import Button from '../components/Button';
import { getPairingGuide } from '../logic/getPairingGuide';
import GlobalEventEmitter from '../logic/GlobalEventEmitter';
import { PermissionsAndroid } from 'react-native';
import { requestFeaturePermissions, PermissionFeatures } from '../logic/PermissionsUtils';
interface GlassesPairingGuidePreparationScreenProps {
  isDarkTheme: boolean;
  toggleTheme: () => void;
}

const GlassesPairingGuidePreparationScreen: React.FC<GlassesPairingGuidePreparationScreenProps> = ({
  isDarkTheme,
  toggleTheme,
}) => {
  const { status } = useStatus();
  const route = useRoute();
  const { glassesModelName } = route.params as { glassesModelName: string };
  const navigation = useNavigation<NavigationProps>();

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      const actionType = e.data?.action?.type;
    });

    return unsubscribe;
  }, [navigation]);

  React.useEffect(() => {
  }, [glassesModelName]);


  const advanceToPairing = async () => {
    if (glassesModelName == null || glassesModelName == "") {
      console.log("SOME WEIRD ERROR HERE");
      return;
    }
    
    // For Simulated Glasses, we still need critical permissions but can skip Bluetooth
    const needsBluetoothPermissions = glassesModelName !== 'Simulated Glasses';
    
    // For real glasses, we need to check and request Bluetooth and Microphone permissions
    if (Platform.OS === 'android') {
      try {
        const bluetoothPermissions: any[] = [];
        
        // Bluetooth permissions based on Android version
        if (typeof Platform.Version === 'number' && Platform.Version >= 30 && Platform.Version < 31) {
          bluetoothPermissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH);
          bluetoothPermissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADMIN);
        }
        if (typeof Platform.Version === 'number' && Platform.Version >= 31) {
          bluetoothPermissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
          bluetoothPermissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
          bluetoothPermissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE);
          
          // Add NEARBY_DEVICES permission for Android 12+ (API 31+)
          if (PermissionsAndroid.PERMISSIONS.NEARBY_DEVICES) {
            bluetoothPermissions.push(PermissionsAndroid.PERMISSIONS.NEARBY_DEVICES);
          }
        }
        
        // Request Bluetooth permissions if needed (only for real glasses)
        if (needsBluetoothPermissions && bluetoothPermissions.length > 0) {
          const results = await PermissionsAndroid.requestMultiple(bluetoothPermissions);
          const allGranted = Object.values(results).every(
            (value) => value === PermissionsAndroid.RESULTS.GRANTED
          );
          
          if (!allGranted) {
            GlobalEventEmitter.emit('SHOW_BANNER', { 
              message: 'Bluetooth permissions are required to connect to glasses',
              type: 'error'
            });
            return;
          }
        }
        
        // Request microphone and phone state permissions
        const hasMicPermission = await requestFeaturePermissions(PermissionFeatures.MICROPHONE);
        if (!hasMicPermission) {
          GlobalEventEmitter.emit('SHOW_BANNER', { 
            message: 'Microphone permission is required for voice commands',
            type: 'error'
          });
          return;
        }
        
        // Request phone state permission
        console.log("Requesting PHONE_STATE permission...");
        const hasPhoneStatePermission = await requestFeaturePermissions(PermissionFeatures.PHONE_STATE);
        console.log("PHONE_STATE permission result:", hasPhoneStatePermission);
        
        if (!hasPhoneStatePermission) {
          GlobalEventEmitter.emit('SHOW_BANNER', { 
            message: 'Phone state permission is required to connect to glasses',
            type: 'error'
          });
          return;
        }
        
        // Request location permission
        const hasLocationPermission = await requestFeaturePermissions(PermissionFeatures.LOCATION);
        if (!hasLocationPermission) {
          GlobalEventEmitter.emit('SHOW_BANNER', { 
            message: 'Location permission is required for Bluetooth scanning on Android',
            type: 'error'
          });
          return;
        }
      } catch (error) {
        console.error('Error requesting permissions:', error);
      }
    }

    // Check that Bluetooth and Location are enabled/granted (skip for simulated glasses)
    if (needsBluetoothPermissions) {
      const requirementsCheck = await coreCommunicator.checkConnectivityRequirements();
      if (!requirementsCheck.isReady) {
        // Show alert about missing requirements
        GlobalEventEmitter.emit('SHOW_BANNER', { 
          message: requirementsCheck.message || 'Cannot connect to glasses - check Bluetooth and Location settings',
          type: 'error'
        });
        
        return;
      }
    }

    navigation.navigate('SelectGlassesBluetoothScreen', {
      glassesModelName: glassesModelName,
    });
  }

  return (
    <View style={[styles.container, isDarkTheme ? styles.darkBackground : styles.lightBackground]}>
      <ScrollView style={styles.scrollViewContainer}>
        <View style={styles.contentContainer}>
          {getPairingGuide(glassesModelName, isDarkTheme)}
        </View>
      </ScrollView>
      <View style={styles.buttonContainer}>
        <Button onPress={advanceToPairing} disabled={false}>
          <Text>Continue</Text>
        </Button>
      </View>
    </View>
  );
};

export default GlassesPairingGuidePreparationScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollViewContainer: {
    flex: 1,
  },
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContainer: {
    alignItems: 'center',
    marginBottom: 65,
  },
  text: {
    fontSize: 16,
    marginBottom: 10,
  },
  glassesImage: {
    width: 100,
    height: 60,
    resizeMode: 'contain',
    marginTop: 20,
  },
  darkBackground: {
    backgroundColor: '#1c1c1c',
  },
  lightBackground: {
    backgroundColor: '#f0f0f0',
  },
  darkText: {
    color: '#FFFFFF',
  },
  lightText: {
    color: '#333333',
  },
});
