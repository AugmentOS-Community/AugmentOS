import { MOCK_CONNECTION } from './consts';

interface Glasses {
  model_name: string;
  battery_life: number;
  is_searching: boolean;
  brightness: string;
  auto_brightness: boolean;
  headUp_angle: number | null; // 0-60
  dashboard_height: number | null; // 0-8
  dashboard_distance: number | null; // ???
  dashboard_x_offset: number | null; // 0-1
}

interface WifiConnection {
  is_connected: boolean;
  ssid: string;
  signal_strength: number; // 0-100
}

interface GSMConnection {
  is_connected: boolean;
  carrier: string;
  signal_strength: number; // 0-100
}

export interface AppInfo {
  packageName: string;
  icon?: string | null;
}

export interface CoreAuthInfo {
  core_token_owner: string;
  core_token_status: string;
  last_verification_timestamp: number;
}

export interface CoreInfo {
  augmentos_core_version: string | null;
  core_token: string | null;
  cloud_connection_status: string;
  puck_connected: boolean;
  puck_battery_life: number | null;
  puck_charging_status: boolean;
  default_wearable: string | null,
  sensing_enabled: boolean;
  force_core_onboard_mic: boolean;
  is_mic_enabled_for_frontend: boolean;
  contextual_dashboard_enabled: boolean;
  bypass_vad_for_debugging: boolean;
  bypass_audio_encoding_for_debugging: boolean;
  always_on_status_bar_enabled: boolean;
}

export interface AugmentOSMainStatus {
  core_info: CoreInfo;
  glasses_info: Glasses | null;
  wifi: WifiConnection | null;
  gsm: GSMConnection | null;
  auth: CoreAuthInfo;
  force_update: boolean;
}

export class AugmentOSParser {
  static defaultStatus: AugmentOSMainStatus = {
    core_info: {
      augmentos_core_version: null,
      cloud_connection_status: 'DISCONNECTED',
      core_token: null,
      puck_connected: false,
      puck_battery_life: null,
      puck_charging_status: false,
      sensing_enabled: false,
      force_core_onboard_mic: false,
      is_mic_enabled_for_frontend: false,
      contextual_dashboard_enabled: false,
      bypass_vad_for_debugging: false,
      bypass_audio_encoding_for_debugging: false,
      default_wearable: null,
      always_on_status_bar_enabled: false,
    },
    glasses_info: null,
    wifi: { is_connected: false, ssid: '', signal_strength: 0 },
    gsm: { is_connected: false, carrier: '', signal_strength: 0 },
    auth: {
      core_token_owner: '',
      core_token_status: '',
      last_verification_timestamp: 0
    },
    force_update: false,
  };

  static mockStatus: AugmentOSMainStatus = {
    core_info: {
      augmentos_core_version: '1.0.0',
      cloud_connection_status: 'CONNECTED',
      core_token: '1234567890',
      puck_connected: true,
      puck_battery_life: 88,
      puck_charging_status: true,
      sensing_enabled: true,
      force_core_onboard_mic: false,
      is_mic_enabled_for_frontend: false,
      contextual_dashboard_enabled: true,
      bypass_vad_for_debugging: false,
      bypass_audio_encoding_for_debugging: false,
      default_wearable: 'evenrealities_g1',
      always_on_status_bar_enabled: false,
    },
    glasses_info: {
      model_name: 'Even Realities G1',
      battery_life: 60,
      is_searching: false,
      brightness: '87',
      auto_brightness: false,
      headUp_angle: 20,
      dashboard_height: null,
      dashboard_distance: null,
      dashboard_x_offset: null,
    },
    wifi: { is_connected: true, ssid: 'TP-LINK69', signal_strength: 100 },
    gsm: { is_connected: false, carrier: '', signal_strength: 0 },
    auth: {
      core_token_owner: '',
      core_token_status: '',
      last_verification_timestamp: 0,
    },
    force_update: false,
  };

  static parseStatus(data: any): AugmentOSMainStatus {
    if (MOCK_CONNECTION) {return AugmentOSParser.mockStatus;}
    if (data && 'status' in data) {
      let status = data.status;
      let coreInfo = status.core_info ?? {};
      let glassesInfo = status.connected_glasses ?? {};
      let authInfo = status.auth ?? {};
      
      // First determine if we have connected glasses in the status
      const hasConnectedGlasses = status.connected_glasses && status.connected_glasses.model_name;
      
      return {
        core_info: {
          augmentos_core_version: coreInfo.augmentos_core_version ?? null,
          core_token: coreInfo.core_token ?? null,
          cloud_connection_status: coreInfo.cloud_connection_status ?? 'DISCONNECTED',
          puck_connected: true,
          puck_battery_life: status.core_info.puck_battery_life ?? null,
          puck_charging_status: status.core_info.charging_status ?? false,
          sensing_enabled: status.core_info.sensing_enabled ?? false,
          force_core_onboard_mic: status.core_info.force_core_onboard_mic ?? false,
          contextual_dashboard_enabled: status.core_info.contextual_dashboard_enabled ?? true,
          bypass_vad_for_debugging: status.core_info.bypass_vad_for_debugging ?? false,
          bypass_audio_encoding_for_debugging: status.core_info.bypass_audio_encoding_for_debugging ?? false,
          default_wearable: hasConnectedGlasses && !status.core_info.default_wearable 
            ? status.connected_glasses.model_name 
            : (status.core_info.default_wearable ?? null),
          is_mic_enabled_for_frontend: status.core_info.is_mic_enabled_for_frontend ?? false,
          always_on_status_bar_enabled: status.core_info.always_on_status_bar_enabled ?? false,
        },
        glasses_info: status.connected_glasses
          ? {
            model_name: glassesInfo.model_name,
            battery_life: glassesInfo.battery_life,
            is_searching: glassesInfo.is_searching ?? false,
            brightness: glassesInfo.brightness,
            auto_brightness: glassesInfo.auto_brightness ?? false,
            headUp_angle: glassesInfo.headUp_angle,
            dashboard_height: glassesInfo.dashboard_height,
            dashboard_distance: glassesInfo.dashboard_distance,
            dashboard_x_offset: glassesInfo.dashboard_x_offset,
          }
          : null,
        wifi: status.wifi ?? AugmentOSParser.defaultStatus.wifi,
        gsm: status.gsm ?? AugmentOSParser.defaultStatus.gsm,
        auth: {
          core_token_owner: authInfo.core_token_owner,
          core_token_status: authInfo.core_token_status,
          last_verification_timestamp: authInfo.last_verification_timestamp,
        },
        force_update: status.force_update ?? false,
      };
    }
    return AugmentOSParser.defaultStatus;
  }
}

export default AugmentOSParser;
