import {MOCK_CONNECTION} from "@/consts"

export interface OtaDownloadProgress {
  status: string
  progress: number
  bytes_downloaded: number
  total_bytes: number
  error_message?: string
  timestamp: number
}

export interface OtaInstallationProgress {
  status: string
  apk_path?: string
  error_message?: string
  timestamp: number
}

export interface OtaProgress {
  download?: OtaDownloadProgress
  installation?: OtaInstallationProgress
}

export interface Glasses {
  model_name: string
  battery_level: number
  glasses_use_wifi: boolean
  glasses_wifi_connected: boolean
  glasses_wifi_ssid: string
  glasses_wifi_local_ip: string
  case_removed: boolean
  case_open: boolean
  case_charging: boolean
  case_battery_level: number
  glasses_app_version?: string
  glasses_build_number?: string
  glasses_device_model?: string
  glasses_android_version?: string
  glasses_serial_number?: string
  glasses_style?: string
  glasses_color?: string
}

interface GlassesSettings {
  brightness: number
  auto_brightness: boolean
  head_up_angle: number | null // 0-60
  dashboard_height: number
  dashboard_depth: number
}

interface WifiConnection {
  is_connected: boolean
  ssid: string
  signal_strength: number // 0-100
}

interface GSMConnection {
  is_connected: boolean
  carrier: string
  signal_strength: number // 0-100
}

export interface CoreAuthInfo {
  core_token_owner: string
  core_token_status: string
  last_verification_timestamp: number
}

export interface CoreInfo {
  augmentos_core_version: string | null
  core_token: string | null
  cloud_connection_status: string
  puck_connected: boolean
  puck_battery_life: number | null
  puck_charging_status: boolean
  default_wearable: string | null
  sensing_enabled: boolean
  force_core_onboard_mic: boolean
  preferred_mic: string
  is_mic_enabled_for_frontend: boolean
  contextual_dashboard_enabled: boolean
  bypass_vad_for_debugging: boolean
  bypass_audio_encoding_for_debugging: boolean
  always_on_status_bar_enabled: boolean
  metric_system_enabled: boolean
  is_searching: boolean
}

export interface AugmentOSMainStatus {
  core_info: CoreInfo
  glasses_info: Glasses | null
  glasses_settings: GlassesSettings
  wifi: WifiConnection | null
  gsm: GSMConnection | null
  auth: CoreAuthInfo
  force_update: boolean
  ota_progress?: OtaProgress
}

export class AugmentOSParser {
  static defaultStatus: AugmentOSMainStatus = {
    core_info: {
      augmentos_core_version: null,
      cloud_connection_status: "DISCONNECTED",
      core_token: null,
      puck_connected: false,
      puck_battery_life: null,
      puck_charging_status: false,
      sensing_enabled: false,
      force_core_onboard_mic: false,
      preferred_mic: "glasses",
      is_mic_enabled_for_frontend: false,
      contextual_dashboard_enabled: false,
      bypass_vad_for_debugging: false,
      bypass_audio_encoding_for_debugging: false,
      default_wearable: null,
      always_on_status_bar_enabled: false,
      metric_system_enabled: true,
      is_searching: false,
    },
    glasses_info: null,
    glasses_settings: {
      brightness: 50,
      auto_brightness: false,
      dashboard_height: 4,
      dashboard_depth: 5,
      head_up_angle: 30,
    },
    wifi: {is_connected: false, ssid: "", signal_strength: 0},
    gsm: {is_connected: false, carrier: "", signal_strength: 0},
    auth: {
      core_token_owner: "",
      core_token_status: "",
      last_verification_timestamp: 0,
    },
    force_update: false,
  }

  static mockStatus: AugmentOSMainStatus = {
    core_info: {
      augmentos_core_version: "1.0.0",
      cloud_connection_status: "CONNECTED",
      core_token: "1234567890",
      puck_connected: true,
      puck_battery_life: 88,
      puck_charging_status: true,
      sensing_enabled: true,
      preferred_mic: "glasses",
      force_core_onboard_mic: false,
      is_mic_enabled_for_frontend: false,
      contextual_dashboard_enabled: true,
      bypass_vad_for_debugging: false,
      bypass_audio_encoding_for_debugging: false,
      default_wearable: "evenrealities_g1",
      always_on_status_bar_enabled: false,
      metric_system_enabled: true,
      is_searching: false,
    },
    glasses_info: {
      model_name: "Even Realities G1",
      battery_level: 60,
      glasses_use_wifi: false,
      glasses_wifi_connected: false,
      glasses_wifi_ssid: "",
      glasses_wifi_local_ip: "",
      case_removed: true,
      case_open: true,
      case_charging: false,
      case_battery_level: 0,
      glasses_serial_number: "ER-G1-2024-001234",
      glasses_style: "Round",
      glasses_color: "Green",
    },
    glasses_settings: {
      brightness: 87,
      auto_brightness: false,
      dashboard_height: 4,
      dashboard_depth: 5,
      head_up_angle: 20,
    },
    wifi: {is_connected: true, ssid: "TP-LINK69", signal_strength: 100},
    gsm: {is_connected: false, carrier: "", signal_strength: 0},
    auth: {
      core_token_owner: "",
      core_token_status: "",
      last_verification_timestamp: 0,
    },
    force_update: false,
  }

  static parseStatus(data: any): AugmentOSMainStatus {
    if (MOCK_CONNECTION) {
      return AugmentOSParser.mockStatus
    }
    if (data && "status" in data) {
      const status = data.status
      const coreInfo = status.core_info ?? {}
      const glassesInfo = status.connected_glasses ?? {}
      const authInfo = status.auth ?? {}
      const otaProgress = status.ota_progress ?? {}

      // First determine if we have connected glasses in the status
      const hasConnectedGlasses = status.connected_glasses && status.connected_glasses.model_name

      return {
        core_info: {
          augmentos_core_version: coreInfo.augmentos_core_version ?? null,
          core_token: coreInfo.core_token ?? null,
          cloud_connection_status: coreInfo.cloud_connection_status ?? "DISCONNECTED",
          puck_connected: true,
          puck_battery_life: status.core_info.puck_battery_life ?? null,
          puck_charging_status: status.core_info.charging_status ?? false,
          sensing_enabled: status.core_info.sensing_enabled ?? false,
          force_core_onboard_mic: status.core_info.force_core_onboard_mic ?? false,
          preferred_mic: status.core_info.preferred_mic ?? "glasses",
          contextual_dashboard_enabled: status.core_info.contextual_dashboard_enabled ?? true,
          bypass_vad_for_debugging: status.core_info.bypass_vad_for_debugging ?? false,
          bypass_audio_encoding_for_debugging: status.core_info.bypass_audio_encoding_for_debugging ?? false,
          default_wearable:
            hasConnectedGlasses && !status.core_info.default_wearable
              ? status.connected_glasses.model_name
              : (status.core_info.default_wearable ?? null),
          is_mic_enabled_for_frontend: status.core_info.is_mic_enabled_for_frontend ?? false,
          always_on_status_bar_enabled: status.core_info.always_on_status_bar_enabled ?? false,
          metric_system_enabled: status.core_info.metric_system_enabled ?? true,
          is_searching: status.core_info.is_searching ?? false,
        },
        glasses_info: status.connected_glasses
          ? {
              model_name: glassesInfo.model_name,
              battery_level: glassesInfo.battery_level,
              glasses_use_wifi: glassesInfo.glasses_use_wifi || false,
              glasses_wifi_connected: glassesInfo.glasses_wifi_connected || false,
              glasses_wifi_ssid: glassesInfo.glasses_wifi_ssid || "",
              glasses_wifi_local_ip: glassesInfo.glasses_wifi_local_ip || "",
              case_removed: glassesInfo.case_removed ?? true,
              case_open: glassesInfo.case_open ?? true,
              case_charging: glassesInfo.case_charging ?? false,
              case_battery_level: glassesInfo.case_battery_level ?? 0,
              glasses_app_version: glassesInfo.glasses_app_version,
              glasses_build_number: glassesInfo.glasses_build_number,
              glasses_device_model: glassesInfo.glasses_device_model,
              glasses_android_version: glassesInfo.glasses_android_version,
              glasses_serial_number: glassesInfo.glasses_serial_number,
              glasses_style: glassesInfo.glasses_style,
              glasses_color: glassesInfo.glasses_color,
            }
          : null,
        glasses_settings: {
          brightness: status.glasses_settings.brightness ?? 50,
          auto_brightness: status.glasses_settings.auto_brightness ?? false,
          dashboard_height: status.glasses_settings.dashboard_height ?? 4,
          dashboard_depth: status.glasses_settings.dashboard_depth ?? 5,
          head_up_angle: status.glasses_settings.head_up_angle ?? 30,
        },
        wifi: status.wifi ?? AugmentOSParser.defaultStatus.wifi,
        gsm: status.gsm ?? AugmentOSParser.defaultStatus.gsm,
        auth: {
          core_token_owner: authInfo.core_token_owner,
          core_token_status: authInfo.core_token_status,
          last_verification_timestamp: authInfo.last_verification_timestamp,
        },
        force_update: false, // status.force_update ?? false
        // TODO: Hardcoding this false fixes a bug that
        // causes us to jump back to the home screen whenever
        // a setting is changed. I don't know why this works.
        // Somebody look at this please.
        ota_progress:
          otaProgress.download || otaProgress.installation
            ? {
                download: otaProgress.download,
                installation: otaProgress.installation,
              }
            : undefined,
      }
    }
    return AugmentOSParser.defaultStatus
  }
}

export default AugmentOSParser
//(350/576)*23
