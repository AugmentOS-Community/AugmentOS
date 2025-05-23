/**
 * @format
 */

import { AugmentOSParser } from '../src/AugmentOSStatusParser';

// Mock the constants to control the test environment
jest.mock('../src/consts', () => ({
  MOCK_CONNECTION: false,
}));

describe('AugmentOSStatusParser', () => {
  it('returns default status when input is empty', () => {
    const result = AugmentOSParser.parseStatus({});
    expect(result).toEqual(AugmentOSParser.defaultStatus);
  });

  it('returns default status when input is null', () => {
    const result = AugmentOSParser.parseStatus(null);
    expect(result).toEqual(AugmentOSParser.defaultStatus);
  });

  it('parses core info correctly', () => {
    const mockData = {
      status: {
        core_info: {
          augmentos_core_version: '1.2.3',
          core_token: 'test-token',
          cloud_connection_status: 'CONNECTED',
          puck_battery_life: 85,
          charging_status: true,
          sensing_enabled: true,
          force_core_onboard_mic: true,
          contextual_dashboard_enabled: true,
          bypass_vad_for_debugging: false,
          bypass_audio_encoding_for_debugging: false,
          default_wearable: 'test-glasses',
          is_mic_enabled_for_frontend: true,
          always_on_status_bar_enabled: true,
        },
        connected_glasses: null,
        glasses_settings: {
          brightness: 50,
          auto_brightness: false,
          dashboard_height: 4,
          dashboard_depth: 5,
          head_up_angle: 30,
        },
        wifi: null,
        gsm: null,
        auth: {},
      },
    };

    const result = AugmentOSParser.parseStatus(mockData);

    expect(result.core_info.augmentos_core_version).toBe('1.2.3');
    expect(result.core_info.core_token).toBe('test-token');
    expect(result.core_info.cloud_connection_status).toBe('CONNECTED');
    expect(result.core_info.puck_battery_life).toBe(85);
    expect(result.core_info.puck_charging_status).toBe(true);
    expect(result.core_info.sensing_enabled).toBe(true);
    expect(result.core_info.force_core_onboard_mic).toBe(true);
    expect(result.core_info.contextual_dashboard_enabled).toBe(true);
    expect(result.core_info.bypass_vad_for_debugging).toBe(false);
    expect(result.core_info.bypass_audio_encoding_for_debugging).toBe(false);
    expect(result.core_info.default_wearable).toBe('test-glasses');
    expect(result.core_info.is_mic_enabled_for_frontend).toBe(true);
    expect(result.core_info.always_on_status_bar_enabled).toBe(true);
  });

  it('parses glasses info correctly when connected', () => {
    const mockData = {
      status: {
        core_info: {
          puck_battery_life: 90,
          charging_status: false,
        },
        connected_glasses: {
          model_name: 'Test Glasses',
          battery_life: 75,
          is_searching: false,
          brightness: '80',
          auto_brightness: true,
          headUp_angle: 15,
          dashboard_height: 5,
          dashboard_distance: 10,
          dashboard_x_offset: 0.5,
        },
        glasses_settings: {
          brightness: 80,
          auto_brightness: true,
          dashboard_height: 5,
          dashboard_depth: 10,
          head_up_angle: 15,
        },
        wifi: null,
        gsm: null,
        auth: {},
      },
    };

    const result = AugmentOSParser.parseStatus(mockData);

    expect(result.glasses_info).not.toBeNull();
    expect(result.glasses_info?.model_name).toBe('Test Glasses');
    expect(result.glasses_info?.battery_life).toBe(75);
    expect(result.glasses_settings.brightness).toBe(80);
    expect(result.glasses_settings.auto_brightness).toBe(true);
    expect(result.glasses_settings.dashboard_height).toBe(5);
    expect(result.glasses_settings.dashboard_depth).toBe(10);
    expect(result.glasses_settings.head_up_angle).toBe(15);
  });

  it('returns null for glasses info when not connected', () => {
    const mockData = {
      status: {
        core_info: {
          puck_battery_life: 90,
          charging_status: false,
        },
        connected_glasses: null,
        glasses_settings: {
          brightness: 50,
          auto_brightness: false,
          dashboard_height: 4,
          dashboard_depth: 5,
          head_up_angle: 30,
        },
        wifi: null,
        gsm: null,
        auth: {},
      },
    };

    const result = AugmentOSParser.parseStatus(mockData);

    expect(result.glasses_info).toBeNull();
  });

  it('parses wifi and gsm info correctly', () => {
    const mockData = {
      status: {
        core_info: {
          puck_battery_life: 90,
          charging_status: false,
        },
        connected_glasses: null,
        glasses_settings: {
          brightness: 50,
          auto_brightness: false,
          dashboard_height: 4,
          dashboard_depth: 5,
          head_up_angle: 30,
        },
        wifi: {
          is_connected: true,
          ssid: 'TestWifi',
          signal_strength: 80,
        },
        gsm: {
          is_connected: true,
          carrier: 'Test Carrier',
          signal_strength: 70,
        },
        auth: {},
      },
    };

    const result = AugmentOSParser.parseStatus(mockData);

    expect(result.wifi?.is_connected).toBe(true);
    expect(result.wifi?.ssid).toBe('TestWifi');
    expect(result.wifi?.signal_strength).toBe(80);

    expect(result.gsm?.is_connected).toBe(true);
    expect(result.gsm?.carrier).toBe('Test Carrier');
    expect(result.gsm?.signal_strength).toBe(70);
  });

  it('parses auth info correctly', () => {
    const mockData = {
      status: {
        core_info: {
          puck_battery_life: 90,
          charging_status: false,
        },
        connected_glasses: null,
        glasses_settings: {
          brightness: 50,
          auto_brightness: false,
          dashboard_height: 4,
          dashboard_depth: 5,
          head_up_angle: 30,
        },
        wifi: null,
        gsm: null,
        auth: {
          core_token_owner: 'test-owner',
          core_token_status: 'VALID',
          last_verification_timestamp: 1234567890,
        },
      },
    };

    const result = AugmentOSParser.parseStatus(mockData);

    expect(result.auth.core_token_owner).toBe('test-owner');
    expect(result.auth.core_token_status).toBe('VALID');
    expect(result.auth.last_verification_timestamp).toBe(1234567890);
  });

  it('handles force_update flag correctly', () => {
    const mockData = {
      status: {
        core_info: {
          puck_battery_life: 90,
          charging_status: false,
        },
        connected_glasses: null,
        glasses_settings: {
          brightness: 50,
          auto_brightness: false,
          dashboard_height: 4,
          dashboard_depth: 5,
          head_up_angle: 30,
        },
        wifi: null,
        gsm: null,
        auth: {},
        force_update: true,
      },
    };

    const result = AugmentOSParser.parseStatus(mockData);

    expect(result.force_update).toBe(false);
  });
});
