import React, {useState} from "react"
import {View, Text, TouchableOpacity, ScrollView, ViewStyle, TextStyle} from "react-native"
import {FontAwesome} from "@expo/vector-icons"
import {Screen, Header, Icon} from "@/components/ignite"
import {router} from "expo-router"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"

import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import coreCommunicator from "@/bridge/CoreCommunicator"
import {requestFeaturePermissions, PermissionFeatures} from "@/utils/PermissionsUtils"
import showAlert from "@/utils/AlertUtils"
import {useAuth} from "@/contexts/AuthContext"

const parseBrightness = (brightnessStr: string | null | undefined): number => {
  if (typeof brightnessStr === "number") {
    return brightnessStr
  }
  if (!brightnessStr || brightnessStr.includes("-")) {
    return 50
  }
  const parsed = parseInt(brightnessStr.replace("%", ""), 10)
  return isNaN(parsed) ? 50 : parsed
}

export default function SettingsPage() {
  const {status} = useStatus()
  const {logout} = useAuth()
  const {themed, theme} = useAppTheme()

  // -- Basic states from your original code --
  const [isDoNotDisturbEnabled, setDoNotDisturbEnabled] = useState(false)
  const [isSensingEnabled, setIsSensingEnabled] = useState(status.core_info.sensing_enabled)
  const [forceCoreOnboardMic, setForceCoreOnboardMic] = useState(status.core_info.force_core_onboard_mic)
  const [isAlwaysOnStatusBarEnabled, setIsAlwaysOnStatusBarEnabled] = useState(
    status.core_info.always_on_status_bar_enabled,
  )
  const [preferredMic, setPreferredMic] = useState(status.core_info.preferred_mic)

  const preferredMicOptions = [
    {label: "Phone / Headset", value: "phone"},
    {label: "Glasses", value: "glasses"},
  ]

  // -- Handlers for toggles, etc. --
  const toggleSensing = async () => {
    const newSensing = !isSensingEnabled
    await coreCommunicator.sendToggleSensing(newSensing)
    setIsSensingEnabled(newSensing)
  }

  const toggleForceCoreOnboardMic = async () => {
    // First request microphone permission if we're enabling the mic
    if (!forceCoreOnboardMic) {
      // We're about to enable the mic, so request permission
      const hasMicPermission = await requestFeaturePermissions(PermissionFeatures.MICROPHONE)
      if (!hasMicPermission) {
        // Permission denied, don't toggle the setting
        console.log("Microphone permission denied, cannot enable phone microphone")
        showAlert(
          "Microphone Permission Required",
          "Microphone permission is required to use the phone microphone feature. Please grant microphone permission in settings.",
          [{text: "OK"}],
          {
            isDarkTheme: theme.isDark,
            iconName: "microphone",
            iconColor: theme.colors.palette.primary100,
          },
        )
        return
      }
    }
    // Continue with toggling the setting if permission granted or turning off
    const newVal = !forceCoreOnboardMic
    await coreCommunicator.sendToggleForceCoreOnboardMic(newVal)
    setForceCoreOnboardMic(newVal)
  }

  const setMic = async (val: string) => {
    if (val === "phone") {
      // We're potentially about to enable the mic, so request permission
      const hasMicPermission = await requestFeaturePermissions(PermissionFeatures.MICROPHONE)
      if (!hasMicPermission) {
        // Permission denied, don't toggle the setting
        console.log("Microphone permission denied, cannot enable phone microphone")
        showAlert(
          "Microphone Permission Required",
          "Microphone permission is required to use the phone microphone feature. Please grant microphone permission in settings.",
          [{text: "OK"}],
          {
            iconName: "microphone",
            iconColor: theme.colors.palette.primary100,
          },
        )
        return
      }
    }

    setPreferredMic(val)
    await coreCommunicator.sendSetPreferredMic(val)
  }

  const toggleAlwaysOnStatusBar = async () => {
    const newVal = !isAlwaysOnStatusBarEnabled
    await coreCommunicator.sendToggleAlwaysOnStatusBar(newVal)
    setIsAlwaysOnStatusBarEnabled(newVal)
  }

  const forgetGlasses = async () => {
    await coreCommunicator.sendForgetSmartGlasses()
  }

  const confirmForgetGlasses = () => {
    showAlert(
      "Forget Glasses",
      "Are you sure you want to forget your glasses?",
      [
        {text: "Cancel", style: "cancel"},
        {text: "Yes", onPress: forgetGlasses},
      ],
      {
        cancelable: false,
      },
    )
  }

  const handleSignOut = async () => {
    try {
      await logout()

      // Navigate to Login screen directly instead of SplashScreen
      // This ensures we skip the SplashScreen logic that might detect stale user data
      router.replace("/")
    } catch (err) {
      console.error("Error during sign-out:", err)
      // Even if there's an error, still try to navigate away to login
      router.replace("/")
    }
  }

  const confirmSignOut = () => {
    showAlert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        {text: "Cancel", style: "cancel"},
        {text: "Yes", onPress: handleSignOut},
      ],
      {cancelable: false},
    )
  }

  // Switch track colors
  const switchColors = {
    // trackColor: {
    //   false: themed($switchTrackInactive),
    //   true: colors.primary,
    // },
    // thumbColor: Platform.OS === "ios" ? undefined : colors.background,
    // ios_backgroundColor: themed($switchTrackInactive),
  }

  const navigateTo = (screen: string, params = {}) => {
    router.push(`/${screen.toLowerCase()}` as any, params)
  }

  return (
    <Screen preset="scroll" style={{paddingHorizontal: 20}}>
      <Header titleTx="settings:title" />
        <View style={themed($settingItem2)}>
          {/* <SelectSetting
            theme={'dark' as any}
            label={"Preferred Microphone"}
            value={preferredMic}
            description={"Select which microphone to use"}
            options={preferredMicOptions}
            onValueChange={val => setMic(val)}
          /> */}
          {status.glasses_info?.model_name === "Simulated Glasses" && (
            <View style={themed($flagContainer)}>
              <Text style={themed($flagText)}>This setting has no effect when using Simulated Glasses</Text>
            </View>
          )}
        </View>

        {/* Proofile Settings */}
        <TouchableOpacity
          style={themed($settingItem)}
          onPress={() => {
            router.push("/settings/profile")
          }}>
          <View style={themed($settingTextContainer)}>
            <Text style={[themed($label)]}>Profile Settings</Text>
          </View>
          <Icon name="angle-right" size={20} color={themed($iconColor)} />
        </TouchableOpacity>

        {/* Privacy Settings */}
        <TouchableOpacity style={themed($settingItem)} onPress={() => router.push("/settings/privacy")}>
          <View style={themed($settingTextContainer)}>
            <Text style={themed($label)}>Privacy Settings</Text>
          </View>
          <FontAwesome name="angle-right" size={20} color={themed($iconColor)} />
        </TouchableOpacity>

        {/* Dashboard Settings */}
        <TouchableOpacity style={themed($settingItem)} onPress={() => router.push("/settings/dashboard")}>
          <View style={themed($settingTextContainer)}>
            <Text style={themed($label)}>Dashboard Settings</Text>
            <Text style={themed($value)}>Configure the contextual dashboard and HeadUp settings</Text>
          </View>
          <FontAwesome name="angle-right" size={20} color={themed($iconColor)} />
        </TouchableOpacity>

        {/* Screen Settings */}
        <TouchableOpacity style={themed($settingItem)} onPress={() => router.push("/settings/screen")}>
          <View style={themed($settingTextContainer)}>
            <Text style={themed($label)}>Screen Settings</Text>
            <Text style={themed($value)}>Adjust brightness, auto-brightness, and other display settings.</Text>
          </View>
          <Icon name="angle-right" size={20} color={themed($iconColor)} />
        </TouchableOpacity>

        {/* Glasses Wifi Settings */}
        <TouchableOpacity
          style={themed($settingItem)}
          onPress={() => {
            // Check if connected glasses support WiFi
            const supportsWifi = status.glasses_info && status.glasses_info.glasses_use_wifi === true

            if (supportsWifi) {
              navigateTo("glasseswifisetup", {
                deviceModel: status.glasses_info?.model_name || "Glasses",
              })
            } else {
              showAlert(
                "Not Available",
                "WiFi configuration is only available for glasses that support WiFi connectivity.",
                [{text: "OK"}],
                {
                  iconName: "wifi",
                  iconColor: theme.colors.palette.primary100,
                },
              )
            }
          }}>
          <View style={themed($settingTextContainer)}>
            <Text
              style={[
                themed($label),
                (!status.glasses_info || status.glasses_info.glasses_use_wifi !== true) && themed($disabledItem),
              ]}>
              Glasses WiFi Settings
            </Text>
            <Text
              style={[
                themed($value),
                (!status.glasses_info || status.glasses_info.glasses_use_wifi !== true) && themed($disabledItem),
              ]}>
              Configure WiFi settings for your smart glasses.
            </Text>
          </View>
          <FontAwesome name="angle-right" size={20} color={themed($iconColor)} />
        </TouchableOpacity>

        {/* Developer Settings */}
        <TouchableOpacity style={themed($settingItem)} onPress={() => router.push("/settings/developer")}>
          <View style={themed($settingTextContainer)}>
            <Text style={themed($label)}>Developer Settings</Text>
          </View>
          <FontAwesome name="angle-right" size={20} color={themed($iconColor)} />
        </TouchableOpacity>

        {/* Forget Glasses */}
        <TouchableOpacity
          style={themed($settingItem)}
          disabled={!status.core_info.puck_connected || status.core_info.default_wearable === ""}
          onPress={confirmForgetGlasses}>
          <View style={themed($settingTextContainer)}>
            <Text
              style={[
                themed($dangerLabel),
                (!status.core_info.puck_connected || status.core_info.default_wearable === "") && themed($disabledItem),
              ]}>
              Forget Glasses
            </Text>
          </View>
        </TouchableOpacity>

        {/* Sign Out */}
        <TouchableOpacity style={themed($settingItem)} onPress={confirmSignOut}>
          <View style={themed($settingTextContainer)}>
            <Text style={themed($dangerLabel)}>Sign Out</Text>
          </View>
        </TouchableOpacity>
    </Screen>
  )
}

const $screenContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  flex: 1,
  backgroundColor: colors.background,
})

const $scrollContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.md,
})

const $settingItem: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: spacing.md,
  borderBottomColor: colors.border,
  borderBottomWidth: 1,
})

const $settingItem2: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  paddingVertical: spacing.md,
  borderBottomColor: colors.border,
  borderBottomWidth: 1,
})

const $settingTextContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  paddingRight: spacing.sm,
})

const $label: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  flexWrap: "wrap",
  color: colors.text,
})

const $dangerLabel: ThemedStyle<TextStyle> = () => ({
  fontSize: 16,
  flexWrap: "wrap",
  color: "#FF0F0F",
})

const $value: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  marginTop: 5,
  flexWrap: "wrap",
  color: colors.textDim,
})

const $disabledItem: ThemedStyle<TextStyle> = () => ({
  opacity: 0.4,
})

const $iconColor: ThemedStyle<string> = ({colors}) => colors.textDim

const $flagContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginTop: spacing.xs,
  paddingHorizontal: spacing.sm,
  paddingVertical: 2,
  borderRadius: 4,
  backgroundColor: "rgba(255, 107, 107, 0.1)",
  alignSelf: "flex-start",
})

const $flagText: ThemedStyle<TextStyle> = () => ({
  fontSize: 12,
  fontWeight: "500",
  color: "#ff6b6b",
})
