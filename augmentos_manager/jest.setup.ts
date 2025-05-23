import 'react-native-gesture-handler/jestSetup';
import React from 'react';
import { TextEncoder, TextDecoder } from 'util';

jest.mock('react-native-ble-manager', () => ({
    start: jest.fn(),
    scan: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    checkState: jest.fn(),
    getConnectedPeripherals: jest.fn(),
    getDiscoveredPeripherals: jest.fn(),
    stopScan: jest.fn(),
    enableBluetooth: jest.fn(),
}));

jest.mock('react-native-image-picker', () => ({
    launchImageLibrary: jest.fn(),
    launchCamera: jest.fn(),
}));

jest.mock('react-native-bluetooth-classic', () => ({
    requestEnable: jest.fn(),
    isEnabled: jest.fn(),
    startDiscovery: jest.fn(),
    cancelDiscovery: jest.fn(),
    connectToDevice: jest.fn(),
    disconnectFromDevice: jest.fn(),
    writeToDevice: jest.fn(),
    onDeviceDisconnected: jest.fn(),
}));

jest.mock('react-native-camera', () => ({
    RNCamera: 'RNCamera',
}));

jest.mock('react-native-linear-gradient', () => 'LinearGradient');

jest.mock('react-native-webview', () => 'WebView');

jest.mock('react-native-safe-area-context', () => ({
    SafeAreaProvider: 'SafeAreaProvider',
    SafeAreaView: 'SafeAreaView',
    useSafeAreaInsets: jest.fn(() => ({
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
    })),
}));

// Mock react-native-config
jest.mock('react-native-config', () => ({
    Config: {
        API_URL: 'https://test-api.example.com',
        SUPABASE_URL: 'https://test-supabase.example.com',
        SUPABASE_KEY: 'test-key',
    },
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve(null)),
    removeItem: jest.fn(() => Promise.resolve(null)),
    multiGet: jest.fn(() => Promise.resolve([])),
    multiSet: jest.fn(() => Promise.resolve(null)),
    multiRemove: jest.fn(() => Promise.resolve(null)),
    getAllKeys: jest.fn(() => Promise.resolve([])),
}));

// Mock react-native-permissions
jest.mock('react-native-permissions', () => {
    const PERMISSIONS = {
        ANDROID: {
            ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
            CAMERA: 'android.permission.CAMERA',
        },
        IOS: {
            LOCATION_WHEN_IN_USE: 'ios.permission.LOCATION_WHEN_IN_USE',
            CAMERA: 'ios.permission.CAMERA',
        },
    };
    
    const RESULTS = {
        UNAVAILABLE: 'unavailable',
        DENIED: 'denied',
        GRANTED: 'granted',
        BLOCKED: 'blocked',
    };
    
    return {
        PERMISSIONS,
        RESULTS,
        check: jest.fn(() => Promise.resolve(RESULTS.GRANTED)),
        request: jest.fn(() => Promise.resolve(RESULTS.GRANTED)),
        checkMultiple: jest.fn(() => Promise.resolve({})),
        requestMultiple: jest.fn(() => Promise.resolve({})),
    };
});

// Create a mock communicator object to be used in all mocks
const mockCommunicator = {
    initialize: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    emit: jest.fn(),
    cleanup: jest.fn(),
    sendRequestStatus: jest.fn(),
    sendHeartbeat: jest.fn(),
    sendSearchForCompatibleDeviceNames: jest.fn(),
    sendConnectWearable: jest.fn(),
    sendPhoneNotification: jest.fn(),
    sendDisconnectWearable: jest.fn(),
    sendForgetSmartGlasses: jest.fn(),
    sendToggleVirtualWearable: jest.fn(),
    sendToggleSensing: jest.fn(),
    sendToggleForceCoreOnboardMic: jest.fn(),
    sendToggleContextualDashboard: jest.fn(),
    sendToggleBypassVadForDebugging: jest.fn(),
    sendToggleBypassAudioEncodingForDebugging: jest.fn(),
    sendToggleAlwaysOnStatusBar: jest.fn(),
    setGlassesBrightnessMode: jest.fn(),
    setGlassesHeadUpAngle: jest.fn(),
    setGlassesDashboardHeight: jest.fn(),
    startAppByPackageName: jest.fn(),
    installAppByPackageName: jest.fn(),
    sendRequestAppDetails: jest.fn(),
    sendUpdateAppSetting: jest.fn(),
    sendUninstallApp: jest.fn(),
    startService: jest.fn(),
    stopService: jest.fn(),
};

// Mock the main CoreCommunicator module
jest.mock('./src/bridge/CoreCommunicator', () => {
    return {
        __esModule: true,
        default: mockCommunicator
    };
});

// Mock the platform-specific CoreCommunicator implementations with direct objects
// instead of requiring the other mock
jest.mock('./src/bridge/CoreCommunicator.ios', () => {
    return {
        __esModule: true,
        default: mockCommunicator,
        CoreCommunicator: class {
            static getInstance() {
                return mockCommunicator;
            }
        }
    };
});

jest.mock('./src/bridge/CoreCommunicator.android', () => {
    return {
        __esModule: true,
        default: mockCommunicator,
        CoreCommunicator: class {
            static getInstance() {
                return mockCommunicator;
            }
        }
    };
});

// Mock NotificationServiceUtils
jest.mock('./src/logic/NotificationServiceUtils', () => {
    return {
        NotificationService: {
            isNotificationListenerEnabled: jest.fn(() => Promise.resolve(true)),
            startNotificationListenerService: jest.fn(() => Promise.resolve('success')),
            stopNotificationListenerService: jest.fn(() => Promise.resolve('success')),
        },
        NotificationEventEmitter: {
            addListener: jest.fn(() => ({ remove: jest.fn() })),
            removeAllListeners: jest.fn(),
        },
        requestNotificationPermission: jest.fn(() => Promise.resolve(true)),
        checkNotificationPermission: jest.fn(() => Promise.resolve(true)),
    };
});

// Mock PermissionsUtils to prevent import-time use of PermissionsAndroid and stub feature checks
jest.mock('./src/logic/PermissionsUtils', () => ({
    checkFeaturePermissions: jest.fn(() => Promise.resolve(true)),
    PermissionFeatures: {
        CALENDAR: 'calendar',
    },
}));

// Mock NotificationListener with proper type for children
jest.mock('./src/components/NotificationListener', () => {
    return {
        __esModule: true,
        default: ({ children }: { children: React.ReactNode }) => children
    };
});

// Mock NativeModules used in TestingPage.tsx
jest.mock('react-native', () => {
    // Create a more controlled mock
    return {
        NativeModules: {
            AOSModule: {
                startScan: jest.fn(),
                connectGlasses: jest.fn(),
                sendText: jest.fn(),
                sendCommand: jest.fn(),
                getBatteryStatus: jest.fn(),
                sendWhitelist: jest.fn(),
                setBrightness: jest.fn(),
                setMicEnabled: jest.fn(),
                connectServer: jest.fn(),
            },
            CoreCommsService: {
                addListener: jest.fn(),
                removeListeners: jest.fn(),
            },
            StatusBarManager: {
                HEIGHT: 42,
                setColor: jest.fn(),
                setStyle: jest.fn(),
                setHidden: jest.fn(),
            },
            PlatformConstants: {
                isTesting: true,
            },
            I18nManager: {
                localeIdentifier: 'en_US',
            },
            SettingsManager: {
                settings: {
                    AppleLocale: 'en_US',
                    AppleLanguages: ['en-US'],
                },
            },
        },
        NativeEventEmitter: jest.fn(() => ({
            addListener: jest.fn(() => ({ remove: jest.fn() })),
            removeAllListeners: jest.fn(),
        })),
        Platform: {
            OS: 'ios',
            Version: 14,
            select: jest.fn(obj => obj.ios || obj.default),
        },
        StyleSheet: {
            create: (styles: Record<string, any>) => styles,
            flatten: jest.fn(),
        },
        Dimensions: {
            get: jest.fn(() => ({ width: 375, height: 812 })),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
        },
        Settings: {
            get: jest.fn(),
            set: jest.fn(),
        },
        Animated: {
            Value: jest.fn(() => ({
                setValue: jest.fn(),
                interpolate: jest.fn(() => ({})),
                _startListeningToNativeValueUpdates: jest.fn(),
            })),
            timing: jest.fn(() => ({ start: jest.fn() })),
            parallel: jest.fn(() => ({ start: jest.fn() })),
        },
        View: 'View',
        Text: 'Text',
        TouchableOpacity: 'TouchableOpacity',
        ScrollView: 'ScrollView',
        Image: 'Image',
        TextInput: 'TextInput',
        AppState: {
            addEventListener: jest.fn(() => ({ remove: jest.fn() })),
            removeEventListener: jest.fn(),
            currentState: 'active',
        },
        UIManager: {
            getViewManagerConfig: jest.fn(),
        },
        // Provide stub for Touchable to support react-native-svg
        Touchable: { Mixin: {} },
        // Mock PermissionsAndroid for tests
        PermissionsAndroid: {
            PERMISSIONS: {
                CAMERA: 'CAMERA',
                RECORD_AUDIO: 'RECORD_AUDIO',
                POST_NOTIFICATIONS: 'POST_NOTIFICATIONS',
                READ_CALENDAR: 'READ_CALENDAR',
                WRITE_CALENDAR: 'WRITE_CALENDAR',
                ACCESS_FINE_LOCATION: 'ACCESS_FINE_LOCATION',
                ACCESS_BACKGROUND_LOCATION: 'ACCESS_BACKGROUND_LOCATION',
                READ_PHONE_STATE: 'READ_PHONE_STATE',
            },
            request: jest.fn(() => Promise.resolve('granted')),
            check: jest.fn(() => Promise.resolve('granted')),
        },
    };
});

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
    const View = require('react-native').View;
    
    return {
        GestureHandlerRootView: jest.fn(props => props.children),
        createNativeWrapper: jest.fn(component => component),
        RectButton: jest.fn(props => props.children),
        BaseButton: jest.fn(props => props.children),
        Swipeable: jest.fn(props => props.children),
        DrawerLayout: jest.fn(props => props.children),
        State: {
            BEGAN: 'BEGAN',
            ACTIVE: 'ACTIVE',
            END: 'END',
        },
        gestureHandlerRootHOC: jest.fn(component => component),
        PanGestureHandler: View,
        TapGestureHandler: View,
        ScrollView: View,
        Slider: View,
        genericDirectEventTypes: { something: { registrationName: 'on' } },
    };
});

// Add TextEncoder and TextDecoder to fix "TextEncoder is not defined" error
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Fix "Request is not defined" error
global.Request = class {} as any;

// Mock TestingPage.tsx
jest.mock('./src/screens/TestingPage.tsx', () => {
    const React = require('react');
    return {
        __esModule: true,
        default: jest.fn(({ isDarkTheme }) => 
            React.createElement('div', { 'data-testid': 'mock-testing-page' }, 
                `Testing Page Mock - ${isDarkTheme ? 'Dark' : 'Light'} Theme`
            )
        )
    };
});

// Mock supabaseClient
jest.mock('./src/supabaseClient', () => {
    return {
        supabase: {
            auth: {
                signInWithPassword: jest.fn(),
                signUp: jest.fn(),
                signOut: jest.fn(),
                getSession: jest.fn(),
                onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
                startAutoRefresh: jest.fn(),
                stopAutoRefresh: jest.fn(),
            },
            from: jest.fn(() => ({
                select: jest.fn(() => ({
                    eq: jest.fn(() => ({
                        single: jest.fn(),
                        data: [],
                        error: null,
                    })),
                })),
                insert: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
            })),
        },
        SUPABASE_URL: 'https://test-supabase.example.com',
        SUPABASE_KEY: 'test-key',
    };
});

// Mock @react-navigation/native-stack
jest.mock('@react-navigation/native-stack', () => {
    return {
        createNativeStackNavigator: jest.fn(() => ({
            Navigator: jest.fn(({ children }) => children),
            Screen: jest.fn(({ children }) => children),
        })),
    };
});

// Mock for @react-navigation/elements
jest.mock('@react-navigation/elements', () => {
    return {
        Header: 'Header',
        HeaderBackButton: 'HeaderBackButton',
        HeaderBackground: 'HeaderBackground',
        HeaderTitle: 'HeaderTitle',
        getDefaultHeaderHeight: jest.fn(),
        getHeaderTitle: jest.fn(),
        useHeaderHeight: jest.fn(() => 60),
        MaskedView: 'MaskedView',
    };
});

// Add mock for react-native-vector-icons modules to stub Icon components
jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('react-native-vector-icons/FontAwesome', () => 'FontAwesome');
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'MaterialCommunityIcons');
jest.mock('react-native-vector-icons/FontAwesome5', () => 'FontAwesome5');

// Mock react-native-svg to stub Svg elements for tests
jest.mock('react-native-svg', () => {
    const React = require('react');
    const { View } = require('react-native');
    // Stub Svg and Path elements with explicit prop typing
    const SvgMock = (props: any) => React.createElement(View, props, props.children);
    // Assign Path property with explicit prop typing
    (SvgMock as any).Path = (props: any) => React.createElement(View, props, props.children);
    return {
        __esModule: true,
        default: SvgMock,
        Path: SvgMock,
    };
});
