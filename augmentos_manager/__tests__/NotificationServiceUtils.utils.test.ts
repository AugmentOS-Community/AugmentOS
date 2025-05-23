import { NativeModules, Platform } from 'react-native';
import showAlert from '../src/utils/AlertUtils';
import {
  checkNotificationAccessSpecialPermission,
  checkAndRequestNotificationAccessSpecialPermission,
} from '../src/utils/NotificationServiceUtils';

// Mock AlertUtils showAlert
jest.mock('../src/utils/AlertUtils', () => jest.fn());

describe('utils/NotificationServiceUtils', () => {
  const originalPlatformOS = Platform.OS;

  // Create mock functions for native module
  const mockHasNotificationAccess = jest.fn();
  const mockRequestNotificationAccess = jest.fn().mockResolvedValue(undefined);
  
  // Add spies for console methods
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeAll(() => {
    // Attach mocks to NativeModules
    (NativeModules as any).NotificationAccess = {
      hasNotificationAccess: mockHasNotificationAccess,
      requestNotificationAccess: mockRequestNotificationAccess,
    };
  });

  afterAll(() => {
    // Restore original platform
    (Platform as any).OS = originalPlatformOS;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console methods before each test
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  
  afterEach(() => {
    // Restore console methods after each test
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('checkNotificationAccessSpecialPermission', () => {
    it('returns false on non-Android platforms', async () => {
      (Platform as any).OS = 'ios';
      const result = await checkNotificationAccessSpecialPermission();
      expect(result).toBe(false);
      expect(mockHasNotificationAccess).not.toHaveBeenCalled();
    });

    it('calls native hasNotificationAccess and returns its result on Android', async () => {
      (Platform as any).OS = 'android';
      mockHasNotificationAccess.mockResolvedValue(true);

      const granted = await checkNotificationAccessSpecialPermission();
      expect(mockHasNotificationAccess).toHaveBeenCalled();
      expect(granted).toBe(true);

      mockHasNotificationAccess.mockResolvedValue(false);
      const denied = await checkNotificationAccessSpecialPermission();
      expect(denied).toBe(false);
    });
  });

  describe('checkAndRequestNotificationAccessSpecialPermission', () => {
    it('does nothing and returns undefined on non-Android platforms', async () => {
      (Platform as any).OS = 'ios';
      const result = await checkAndRequestNotificationAccessSpecialPermission();
      expect(result).toBeUndefined();
      expect(showAlert).not.toHaveBeenCalled();
      expect(mockRequestNotificationAccess).not.toHaveBeenCalled();
    });

    it('shows alert and triggers requestNotificationAccess when access is not granted', async () => {
      (Platform as any).OS = 'android';
      mockHasNotificationAccess.mockResolvedValue(false);

      const result = await checkAndRequestNotificationAccessSpecialPermission();
      expect(result).toBe(false);
      expect(showAlert).toHaveBeenCalled();

      // Extract the alert buttons argument
      const alertArgs = (showAlert as jest.Mock).mock.calls[0];
      const buttons = alertArgs[2];
      const goToSettings = buttons.find((btn: any) => btn.text === 'Go to Settings');
      // Call the onPress handler
      expect(typeof goToSettings.onPress).toBe('function');
      await goToSettings.onPress();
      expect(mockRequestNotificationAccess).toHaveBeenCalled();
      
      // Verify console.log was called
      expect(consoleLogSpy).toHaveBeenCalledWith('Notification access settings opened successfully');
    });

    it('returns true and does not alert when access is already granted', async () => {
      (Platform as any).OS = 'android';
      mockHasNotificationAccess.mockResolvedValue(true);

      const result = await checkAndRequestNotificationAccessSpecialPermission();
      expect(result).toBe(true);
      expect(showAlert).not.toHaveBeenCalled();
      expect(mockRequestNotificationAccess).not.toHaveBeenCalled();
      
      // Verify console.log was called
      expect(consoleLogSpy).toHaveBeenCalledWith('Notification access already granted');
    });

    it('catches errors and shows error alert', async () => {
      (Platform as any).OS = 'android';
      const error = new Error('native error');
      mockHasNotificationAccess.mockRejectedValue(error);

      const result = await checkAndRequestNotificationAccessSpecialPermission();
      expect(result).toBe(false);
      expect(showAlert).toHaveBeenCalled();
      // The first call is for enable notification request; second is for error handling
      const lastAlert = (showAlert as jest.Mock).mock.calls.slice(-1)[0];
      expect(lastAlert[0]).toBe('Error');
      
      // Verify console.error was called with the expected message
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to check notification listener permission:',
        error
      );
    });
  });
});
