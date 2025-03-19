import { Alert, Platform } from "react-native";
import { request, check, PERMISSIONS, Permission, RESULTS } from 'react-native-permissions';
import { Permission as RNPermission } from 'react-native';
import { PermissionsAndroid } from 'react-native';
import { checkNotificationAccessSpecialPermission } from "../utils/NotificationServiceUtils";

export const displayPermissionDeniedWarning = () => {
  return new Promise((resolve) => {
    Alert.alert(
      'Permissions Required',
      'Some permissions were denied. Please go to Settings and enable all required permissions for the app to function properly.',
      [
        {
          text: 'OK',
          style: 'default',
          onPress: () => resolve(true)
        },
      ]
    );
  });
};

export const requestGrantPermissions = async () => {

  let allGranted = true;

  if (Platform.OS === 'android' && Platform.Version >= 23) {
    return PermissionsAndroid.requestMultiple(getAndroidPermissions()).then(async (result) => {
      console.log('Permissions granted:', result);

      const allGranted = Object.values(result).every(
        (value) => value === PermissionsAndroid.RESULTS.GRANTED
      );

      if (!allGranted) {
        console.warn('Some permissions were denied:', result);
        // Optionally handle partial denial here
        await displayPermissionDeniedWarning();
      }
      return allGranted;
    })
      .catch((error) => {
        console.error('Error requesting permissions:', error);
        return false;
      });
  }

  if (Platform.OS === 'ios') {

    let perms = getIOSPermissions();
    for (let i = 0; i < perms.length; i++) {
      let status = await request(perms[i]);
      if (status !== RESULTS.GRANTED) {
        allGranted = false;
      }
    }
    if (!allGranted) {
      await displayPermissionDeniedWarning();
    }
  }



  return allGranted;
};

export const doesHaveAllPermissions = async () => {
  let allGranted = true;
  
  if (Platform.OS === 'ios') {
    let perms = getIOSPermissions();
    for (let i = 0; i < perms.length; i++) {
      console.log('Checking permission:', perms[i]);
      let status = await check(perms[i]);
      // TODO: ios skip checking calendars because somehow it's bugged:
      if (perms[i] === PERMISSIONS.IOS.CALENDARS) {
        continue;
      }
      if (status !== RESULTS.GRANTED && status !== RESULTS.LIMITED) {
        allGranted = false;
        console.log('Permission not granted:', perms[i]);
      }
      console.log('Permission status:', status);
    }
  }

  if (Platform.OS === 'android') {
    let perms = getAndroidPermissions();
    let allGranted = true;
    for (let i = 0; i < perms.length; i++) {
      if (!await PermissionsAndroid.check(perms[i])) {
        allGranted = false;
      }
    }

    let notificationPerms = await checkNotificationAccessSpecialPermission();
    if (!notificationPerms) allGranted = false;
    return allGranted;
  }

  return allGranted;
};

export const getIOSPermissions = (): Permission[] => {

  let list = [];

  list = [PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
  PERMISSIONS.IOS.CALENDARS,
  PERMISSIONS.IOS.MICROPHONE,
  PERMISSIONS.IOS.LOCATION_ALWAYS,
  PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
  ];

  return list as Permission[];
}


export const getAndroidPermissions = (): RNPermission[] => {
  const list = [];
  if (Platform.OS === 'android') {
    if (Platform.Version < 29) {
      list.push(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
    }

    if (Platform.Version >= 23) {
      list.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }
    // Android 11 (API 30) needs legacy Bluetooth permissions
    if (Platform.Version >= 30 && Platform.Version < 31) {
      list.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH);
      list.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADMIN);
    }
    if (Platform.Version >= 31) {
      list.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
      list.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      list.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE);
    }
    if (Platform.Version >= 33) {
      list.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    } else {
      list.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
    }

    list.push(PermissionsAndroid.PERMISSIONS.READ_CALENDAR);
    list.push(PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR);
    list.push(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  }
  return list.filter(permission => permission != null) as RNPermission[];
}