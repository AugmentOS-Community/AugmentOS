import React, {useCallback, useEffect, useRef, useState} from "react"
import {View, Text, ActivityIndicator, Image, ViewStyle, TextStyle, ImageStyle} from "react-native"
import {useFocusEffect} from "@react-navigation/native"
import {Button} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import {getGlassesImage, getGlassesOpenImage, getEvenRealitiesG1Image} from "@/utils/getGlassesImage"
import {translate} from "@/i18n"
import {Spacer} from "@/components/misc/Spacer"
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated"

interface PairingDeviceInfoProps {
  glassesModelName: string
}

const PairingDeviceInfo: React.FC<PairingDeviceInfoProps> = ({glassesModelName}) => {
  const {themed, theme} = useAppTheme()

  // glasses start big and to the left, then scale down and move to the neutral position

  const glassesTranslateX = useSharedValue(-200)
  const glassesScale = useSharedValue(2)

  useEffect(() => {
    glassesTranslateX.value = -280
    glassesScale.value = 2.4
    glassesTranslateX.value = withTiming(0, {duration: 2000})
    glassesScale.value = withTiming(1, {duration: 2000})
  }, [])

  const animatedGlassesStyle = useAnimatedStyle(() => ({
    transform: [{translateX: glassesTranslateX.value}, {translateY: -140}, {scale: glassesScale.value}],
  }))

  return (
    <View style={themed($deviceInfoContainer)}>
      <Text style={themed($connectText)}>
        {translate("pairing:scanningForGlassesModel", {model: glassesModelName})}
      </Text>
      <Spacer height={theme.spacing.md} />
      <Text style={themed($subText)}>{translate("pairing:scanningForGlasses2")}</Text>
      <Spacer height={theme.spacing.lg} />
      <ActivityIndicator size="large" color={theme.colors.text} />
      <Spacer height={theme.spacing.lg} />
      <View style={{width: "100%", height: 160}}>
        <Animated.View
          style={[
            animatedGlassesStyle,
            {
              width: "100%",
              position: "absolute",
            },
          ]}>
          <Image source={getGlassesOpenImage(glassesModelName)} style={themed($glassesImage)} />
        </Animated.View>
      </View>
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
  // maxHeight: 160,
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
