import { NativeModules } from 'react-native';

const { AOSModule } = NativeModules;

export const startExternalService = () => {
    // ServiceStarter.startService();
};

export const stopExternalService = () => {
    // ServiceStarter.stopService();
};

export const openCorePermissionsActivity = () => {
    // ServiceStarter.openPermissionsActivity();
};

export const isAugmentOsCoreInstalled = async () => {
    // return ServiceStarter.isAugmentOsCoreInstalled();
    return true;
};

export const areAllCorePermissionsGranted = async () => {
    // return ServiceStarter.areAllCorePermissionsGranted();
    // TODO: ios (we check for permissions as they're used on iOS)
    return true;
}
