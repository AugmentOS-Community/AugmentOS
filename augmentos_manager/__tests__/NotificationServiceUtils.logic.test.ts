/**
 * Simple test for NotificationServiceUtils
 */

// Mock react-native
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    Version: 33,
  },
  PermissionsAndroid: {
    PERMISSIONS: {
      POST_NOTIFICATIONS: 'POST_NOTIFICATIONS',
    },
    RESULTS: {
      GRANTED: 'granted',
      DENIED: 'denied',
      NEVER_ASK_AGAIN: 'never_ask_again',
    },
    request: jest.fn(),
    check: jest.fn(),
  },
  NativeModules: {
    NotificationServiceUtils: {
      isNotificationListenerEnabled: jest.fn(),
      startNotificationListenerService: jest.fn(),
      stopNotificationListenerService: jest.fn(),
    },
  },
  NativeEventEmitter: jest.fn(() => ({
    addListener: jest.fn(),
    removeAllListeners: jest.fn(),
  })),
}));

// Skip actual tests for now, just check that we can load the module
describe('NotificationServiceUtils module', () => {
  it('can load the module without errors', () => {
    jest.isolateModules(() => {
      // This should not throw
      const module = require('../src/logic/NotificationServiceUtils');
      expect(module).toBeDefined();
    });
  });
});
