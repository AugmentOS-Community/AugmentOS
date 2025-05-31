import React, {useCallback, useEffect, useRef, useState} from "react"
import {View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, ViewStyle, TextStyle} from "react-native"
import {useFocusEffect} from "@react-navigation/native"
import {Button, Icon} from "@/components/ignite"
import coreCommunicator from "@/bridge/CoreCommunicator"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import {getGlassesClosedImage, getGlassesImage, getGlassesOpenImage} from "@/utils/getGlassesImage"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {router} from "expo-router"
import {useAppTheme} from "@/utils/useAppTheme"
import {spacing, ThemedStyle} from "@/theme"
import ConnectedSimulatedGlassesInfo from "./ConnectedSimulatedGlassesInfo"
import SolarLineIconsSet4 from "assets/icons/component/SolarLineIconsSet4"
import ChevronRight from "assets/icons/component/ChevronRight"
import {Circle} from "react-native-svg"
import {AnimatedCircularProgress} from "react-native-circular-progress"
import {getBatteryColor} from "@/utils/getBatteryIcon"
import SunIcon from "assets/icons/component/SunIcon"
// import {} from "assets/icons/"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"

export const ConnectDeviceButton = () => {
  const {status} = useStatus()

  const connectGlasses = async () => {
    if (!status.core_info.default_wearable) {
      router.push("/pairing/select-glasses-model")
      return
    }

    // Check that Bluetooth and Location are enabled/granted
    const requirementsCheck = await coreCommunicator.checkConnectivityRequirements()
    if (!requirementsCheck.isReady) {
      // Show alert about missing requirements
      console.log("Requirements not met, showing banner with message:", requirementsCheck.message)
      GlobalEventEmitter.emit("SHOW_BANNER", {
        message: requirementsCheck.message || "Cannot connect to glasses - check Bluetooth and Location settings",
        type: "error",
      })

      return
    }

    try {
      console.log("Connecting to glasses:", status.core_info.default_wearable)
      if (status.core_info.default_wearable && status.core_info.default_wearable != "") {
        console.log("Connecting to glasses:", status.core_info.default_wearable)
        await coreCommunicator.sendConnectWearable(status.core_info.default_wearable)
      }
    } catch (error) {
      console.error("connect to glasses error:", error)
      GlobalEventEmitter.emit("SHOW_BANNER", {
        message: "Failed to connect to glasses",
        type: "error",
      })
    }
  }

  const sendDisconnectWearable = async () => {
    console.log("Disconnecting wearable")

    try {
      await coreCommunicator.sendDisconnectWearable()
    } catch (error) {}
  }

  // New handler: if already connecting, pressing the button calls disconnect.
  const handleConnectOrDisconnect = async () => {
    if (status.core_info.is_searching) {
      await sendDisconnectWearable()
    } else {
      await connectGlasses()
    }
  }
  if (!status.core_info.default_wearable) {
    return (
      <Button
        textStyle={[{marginLeft: spacing.xxl}]}
        textAlignment="left"
        LeftAccessory={() => <SolarLineIconsSet4 />}
        RightAccessory={() => <ChevronRight />}
        onPress={() => {
          router.push("/pairing/select-glasses-model")
        }}
        tx="home:pairGlasses"
      />
    )
  }

  if (status.core_info.is_searching) {
    return (
      <Button
        textStyle={[{marginLeft: spacing.xxl}]}
        textAlignment="left"
        LeftAccessory={() => <ActivityIndicator size="small" color="#fff" style={{marginLeft: 5}} />}
        onPress={handleConnectOrDisconnect}
        tx="home:connectingGlasses"
      />
    )
  }

  if (!status.glasses_info?.model_name) {
    return (
      <Button
        textStyle={[{marginLeft: spacing.xxl}]}
        textAlignment="left"
        LeftAccessory={() => <SolarLineIconsSet4 />}
        RightAccessory={() => <ChevronRight />}
        onPress={handleConnectOrDisconnect}
        tx="home:connectGlasses"
      />
    )
  }

  return null
}

interface ConnectedGlassesProps {
  showTitle: boolean
}

export const ConnectedGlasses: React.FC<ConnectedGlassesProps> = ({showTitle}) => {
  const {status} = useStatus()
  const fadeAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.8)).current
  const {themed, theme} = useAppTheme()

  const [glassesImage, setGlassesImage] = useState(getGlassesImage(status.core_info.default_wearable))

  useFocusEffect(
    useCallback(() => {
      // Reset animations to initial values
      fadeAnim.setValue(0)
      scaleAnim.setValue(0.8)

      // Start animations if device is connected
      if (status.core_info.puck_connected) {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]).start()
      }
      // Cleanup function
      return () => {
        fadeAnim.stopAnimation()
      }
    }, [status.core_info.default_wearable, status.core_info.puck_connected, fadeAnim]),
  )

  useEffect(() => {
    let wearable = status.core_info.default_wearable
    let image = getGlassesImage(wearable)

    // if the glasses have not been removed from the case, show the case open or closed image
    if (!status.glasses_info?.case_removed) {
      if (status.glasses_info?.case_open) {
        image = getGlassesOpenImage(wearable)
      } else {
        image = getGlassesClosedImage(wearable)
      }
    }

    setGlassesImage(image)
  }, [status.glasses_info])

  // no glasses paired
  if (!status.core_info.default_wearable) {
    return null
  }

  if (status.glasses_info?.model_name && status.glasses_info.model_name.toLowerCase().includes("simulated")) {
    return <ConnectedSimulatedGlassesInfo />
  }

  return (
    <View style={styles.connectedContent}>
      <Animated.Image source={glassesImage} style={[styles.glassesImage, {opacity: fadeAnim}]} />
    </View>
  )
}

export function DeviceToolbar() {
  const {status} = useStatus()
  const {themed, theme} = useAppTheme()

  if (!status.glasses_info?.model_name) {
    return null
  }

  let autoBrightness = status.glasses_settings.auto_brightness

  return (
    <View style={themed($deviceToolbar)}>
      {/* battery */}
      <View style={{flexDirection: "row", alignItems: "center", gap: 6}}>
        {status.glasses_info?.battery_life != -1 ? (
          <>
            <Icon icon="battery" size={18} color={theme.colors.text} />
            <Text style={{color: theme.colors.text}}>{status.glasses_info?.battery_life}%</Text>
          </>
        ) : (
          // <Text style={{color: theme.colors.text}}>No battery</Text>
          <ActivityIndicator size="small" color={theme.colors.text} />
        )}
      </View>

      {/* brightness */}
      <View style={{flexDirection: "row", alignItems: "center", gap: 6}}>
        <SunIcon size={18} color={theme.colors.text} />
        {autoBrightness ? (
          <Text style={{color: theme.colors.text}}>Auto</Text>
        ) : (
          <>
            <Text style={{color: theme.colors.text, fontSize: 16, marginLeft: 4, fontFamily: "Inter-Regular"}}>
              {status.glasses_settings.brightness}%
            </Text>
          </>
        )}
      </View>

      {/* wifi connection */}
      <View style={{flexDirection: "row", alignItems: "center", gap: 4}}>
        {/* <WifiIcon size={24} color={theme.colors.text} /> */}
        <Text style={{color: theme.colors.text, fontSize: 16, marginLeft: 4, fontFamily: "Inter-Regular"}}>
          {status.glasses_info?.glasses_wifi_ssid}
        </Text>
      </View>

      {/* mira button */}
      {/* <View style={{flexDirection: "row", alignItems: "center", gap: 4}}> */}
      {/* <Button
        text="Mira"
        style={{minWidth: 110}}
        LeftAccessory={() => <Text style={{fontSize: 16}}>✨</Text>}
        onPress={() => {}}
      /> */}
      {/* </View> */}

      {/* volume */}
      <View style={{}}></View>
    </View>
  )
}

const $deviceToolbar: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  // backgroundColor: colors.palette.neutral200,
  borderRadius: spacing.md,
  paddingHorizontal: spacing.md,
  marginTop: spacing.md,
})

export function ConnectedDeviceInfo() {
  const {status, refreshStatus} = useStatus()
  const {theme, themed} = useAppTheme()
  const [microphoneActive, setMicrophoneActive] = useState(status.core_info.is_mic_enabled_for_frontend)

  useEffect(() => {
    setMicrophoneActive(status.core_info.is_mic_enabled_for_frontend)
  }, [status.core_info.is_mic_enabled_for_frontend])

  if (!status.glasses_info?.model_name) {
    return null
  }

  return (
    <View style={themed($statusBar)}>
      {/* <View style={styles.statusInfo}>
            {status.glasses_info?.battery_life != null && typeof status.glasses_info?.battery_life === "number" && (
              <>
                <Text style={themed($statusLabel)}>Battery</Text>
                <View style={styles.batteryContainer}>
                  {status.glasses_info?.battery_life >= 0 && (
                    <Icon
                      name={getBatteryIcon(status.glasses_info?.battery_life ?? 0)}
                      size={16}
                      color={getBatteryColor(status.glasses_info?.battery_life ?? 0)}
                    />
                  )}
                  <Text style={themed($batteryValue)}>
                    {status.glasses_info.battery_life == -1 ? "-" : `${status.glasses_info.battery_life}%`}
                  </Text>
                </View>
              </>
            )}
          </View> */}

      {/* battery circular progress bar */}
      {status.glasses_info?.battery_life != -1 ? (
        <AnimatedCircularProgress
          size={36}
          width={3}
          lineCap="round"
          fillLineCap="round"
          fill={status.glasses_info?.battery_life}
          tintColor={getBatteryColor(status.glasses_info?.battery_life ?? 0)}
          backgroundColor={theme.colors.palette.neutral300}
          children={() => <Text style={themed($batteryValue)}>{status.glasses_info?.battery_life}</Text>}
          rotation={0}
        />
      ) : (
        <ActivityIndicator size="small" color={theme.colors.text} />
      )}

      {/* disconnect button */}
      <TouchableOpacity
        style={[styles.disconnectButton, status.core_info.is_searching && styles.disabledDisconnectButton]}
        onPress={() => {
          coreCommunicator.sendDisconnectWearable()
        }}
        disabled={status.core_info.is_searching}>
        <Icon name="power-off" size={18} color="white" style={styles.icon} />
        <Text style={styles.disconnectText}>Disconnect</Text>
      </TouchableOpacity>
    </View>
  )
}

const $deviceInfoContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  // padding: 16,
  // borderRadius: 12,
  // width: "100%",
  // minHeight: 240,
  // justifyContent: "center",
  marginTop: 16,
  // paddingHorizontal: 24,
  // backgroundColor: colors.palette.neutral200,
})

const $statusLabel: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  lineHeight: 16,
  fontWeight: "500",
  letterSpacing: -0.08,
  fontFamily: "SF Pro",
})

const $batteryValue: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  fontWeight: "bold",
  fontFamily: "Montserrat-Bold",
  color: colors.text,
})

const $statusBar: ThemedStyle<ViewStyle> = ({colors}) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  borderRadius: 12,
  padding: 10,
})

const styles = StyleSheet.create({
  deviceInfoContainer: {
    padding: 16,
    borderRadius: 12,
    width: "100%",
    minHeight: 240,
    justifyContent: "center",
    marginTop: 16, // Increased space above component
    backgroundColor: "#E5E5EA",
  },
  connectedContent: {
    flex: 1,
    flexShrink: 1,
    justifyContent: "space-between",
    alignItems: "center",
  },
  disconnectedContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  glassesImage: {
    width: "80%",
    height: 120,
    resizeMode: "contain",
  },
  statusInfoNotConnected: {
    alignItems: "center",
    flex: 1,
    width: "100%",
  },
  statusInfo: {
    alignItems: "center",
    flex: 1,
    marginRight: 20,
  },
  batteryContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  batteryIcon: {
    marginRight: 4,
    alignSelf: "center",
  },
  statusValue: {
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: "Montserrat-Bold",
  },
  connectedStatus: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  connectedDot: {
    fontSize: 14,
    marginRight: 2,
    fontFamily: "Montserrat-Bold",
  },
  separator: {
    marginHorizontal: 10,
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "Montserrat-Bold",
  },
  connectedTextGreen: {
    color: "#28a745",
    marginLeft: 4,
    marginRight: 2,
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "Montserrat-Bold",
  },
  connectedTextTitle: {
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "Montserrat-Bold",
  },
  statusLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    letterSpacing: -0.08,
    fontFamily: "SF Pro",
  },
  connectText: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 10,
    fontFamily: "Montserrat-Bold",
  },
  noGlassesText: {
    color: "black",
    textAlign: "center",
    fontSize: 16,
    marginBottom: 10,
  },
  disabledButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#A9A9A9", // Grey when disabled
    padding: 10,
    borderRadius: 8,
    width: "80%",
  },
  disabledDisconnectButton: {
    backgroundColor: "#A9A9A9",
  },
  icon: {
    marginRight: 4,
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: "Montserrat-Bold",
  },
  disconnectButton: {
    flexDirection: "row",
    backgroundColor: "#E24A24",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    justifyContent: "center",
    marginRight: 5,
    width: "40%",
  },
  disconnectText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
    fontFamily: "Montserrat-Regular",
  },
  statusIndicatorsRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    //height: 30,
  },
  iconContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  wifiContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 18,
  },
  wifiSsidText: {
    fontSize: 12,
    color: "#4CAF50",
    fontWeight: "bold",
    marginRight: 5,
    maxWidth: 120,
  },
})
