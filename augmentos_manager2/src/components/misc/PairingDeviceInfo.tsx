import React, {useRef, useState} from "react"
import {
  View,
  Text,
  ActivityIndicator,
  Animated,
  Image,
  ViewStyle,
  TextStyle,
  ImageStyle,
} from "react-native"
import {useFocusEffect} from "@react-navigation/native"
import {Button} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import {getGlassesImage} from "@/utils/getGlassesImage"

interface PairingDeviceInfoProps {
  glassesModelName: string
}

const PairingDeviceInfo: React.FC<PairingDeviceInfoProps> = ({glassesModelName}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.8)).current
  const slideAnim = useRef(new Animated.Value(-50)).current
  const [connectedGlasses, setConnectedGlasses] = useState("")
  const {status, refreshStatus} = useStatus()
  const {themed, theme} = useAppTheme()

  useFocusEffect(
    React.useCallback(() => {
      fadeAnim.setValue(0)
      scaleAnim.setValue(0.8)
      slideAnim.setValue(-50)

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ]).start()

      return () => {
        fadeAnim.stopAnimation()
        scaleAnim.stopAnimation()
        slideAnim.stopAnimation()
      }
    }, [fadeAnim, scaleAnim, slideAnim]),
  )

  return (
    <View style={themed($deviceInfoContainer)}>
      <View style={themed($disconnectedContent)}>
        <Image source={getGlassesImage(glassesModelName)} style={themed($glassesImage)} />
        <Text style={themed($connectText)}>{`Searching for ${glassesModelName}`}</Text>
        {status.core_info.is_searching && <ActivityIndicator size="small" color={theme.colors.palette.primary100} />}
      </View>
    </View>
  )
}

// Define themed styles using ThemedStyle type
const $deviceInfoContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  padding: 10,
  borderRadius: 16,
  width: "100%",
  minHeight: 250,
  justifyContent: "center",
  marginTop: 15,
  backgroundColor: colors.palette.primary100 + '14',
})

const $disconnectedContent: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
})

const $glassesImage: ThemedStyle<ImageStyle> = () => ({
  width: "80%",
  height: "50%",
  resizeMode: "contain",
})

const $connectText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  fontWeight: "bold",
  marginBottom: 10,
  fontFamily: "Montserrat-Bold",
  color: colors.text,
})

// Additional styles for connected state (can be added when implementing that feature)
const $connectedContent: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "space-between",
  alignItems: "center",
})

const $statusBar: ThemedStyle<ViewStyle> = ({colors}) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  borderRadius: 12,
  padding: 10,
  width: "100%",
  backgroundColor: colors.palette.primary100 + '14',
  flexWrap: "wrap",
})

const $statusInfo: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flex: 1,
  marginRight: 20,
})

const $batteryContainer: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
})

const $batteryValue: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  fontWeight: "bold",
  fontFamily: "Montserrat-Bold",
  color: colors.text,
})

const $statusValue: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  fontWeight: "bold",
  fontFamily: "Montserrat-Bold",
  color: colors.text,
})

const $connectedStatus: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  marginVertical: 10,
})

const $connectedTextGreen: ThemedStyle<TextStyle> = () => ({
  color: "#28a745",
  marginLeft: 4,
  marginRight: 2,
  fontSize: 16,
  fontWeight: "bold",
  fontFamily: "Montserrat-Bold",
})

const $connectedTextTitle: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  fontWeight: "bold",
  fontFamily: "Montserrat-Bold",
  color: colors.text,
})

const $statusLabel: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  lineHeight: 16,
  fontWeight: "500",
  letterSpacing: -0.08,
  fontFamily: "SF Pro",
  color: colors.textDim,
})

export default PairingDeviceInfo