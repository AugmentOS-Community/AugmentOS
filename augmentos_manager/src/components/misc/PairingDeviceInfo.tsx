import React, {useCallback, useRef, useState} from "react"
import {View, Text, ActivityIndicator, Animated, Image, ViewStyle, TextStyle, ImageStyle} from "react-native"
import {useFocusEffect} from "@react-navigation/native"
import {Button} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import {getGlassesImage, getGlassesOpenImage} from "@/utils/getGlassesImage"
import {translate} from "@/i18n"
import {Spacer} from "@/components/misc/Spacer"

interface PairingDeviceInfoProps {
  glassesModelName: string
}

const PairingDeviceInfo: React.FC<PairingDeviceInfoProps> = ({glassesModelName}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.8)).current
  const slideAnim = useRef(new Animated.Value(-50)).current
  const {themed, theme} = useAppTheme()

  useFocusEffect(
    useCallback(() => {
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
      <Text style={themed($connectText)}>{translate("pairing:scanningForGlassesModel", {model: glassesModelName})}</Text>
      <Spacer height={theme.spacing.md} />
      <Text style={themed($subText)}>{translate("pairing:scanningForGlasses2")}</Text>
      <Spacer height={theme.spacing.lg} />
      <ActivityIndicator size="large" color={theme.colors.text} />
      <Spacer height={theme.spacing.lg} />
      <Image source={getGlassesOpenImage(glassesModelName)} style={themed($glassesImage)} />
    </View>
  )
}

// Define themed styles using ThemedStyle type
const $deviceInfoContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  flex: 1,
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
})

const $glassesImage: ThemedStyle<ImageStyle> = () => ({
  // width: "100%",
  // height: "40%",
  // maxWidth: 300,
  maxHeight: 160,
  width: "100%",
  resizeMode: "contain",
})

const $connectText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 17,
  fontWeight: "bold",
  fontFamily: "Montserrat-Bold",
  color: colors.text,
})

const $subText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 15,
  fontWeight: "normal",
  fontFamily: "Montserrat-Regular",
  color: colors.text,
})

export default PairingDeviceInfo
