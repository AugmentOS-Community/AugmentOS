import React, {useEffect, useRef} from "react"
import {View, Text, StyleSheet, Animated, Easing, useWindowDimensions, ViewStyle, TextStyle, Image, Platform} from "react-native"
import {getModelSpecificTips} from "./GlassesTroubleshootingModal"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {Header} from "../ignite/Header"
import {router} from "expo-router"
import {getGlassesImage, getEvenRealitiesG1Image} from "@/utils/getGlassesImage"
import { translate } from "@/i18n"

interface GlassesPairingLoaderProps {
  glassesModelName: string
}

const GlassesPairingLoader: React.FC<GlassesPairingLoaderProps> = ({glassesModelName}) => {
  const {width} = useWindowDimensions()
  const {theme, themed} = useAppTheme()

  // Animation values
  const progressAnim = useRef(new Animated.Value(0)).current
  const connectionBarOpacity = useRef(new Animated.Value(0)).current
  const connectionBarScale = useRef(new Animated.Value(0.8)).current

  const [currentTipIndex, setCurrentTipIndex] = React.useState(0)
  const progressValue = useRef(0)
  const tipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tips = getModelSpecificTips(glassesModelName)

  // Set up animations
  useEffect(() => {
    // Progress bar animation
    Animated.timing(progressAnim, {
      toValue: 85,
      duration: 75000,
      useNativeDriver: false,
      easing: Easing.out(Easing.exp),
    }).start()

    // Connection bar animation - appears after 3 seconds
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(connectionBarOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.spring(connectionBarScale, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start()
    }, 3000)

    // Set up fact rotator
    const rotateTips = () => {
      tipTimerRef.current = setTimeout(() => {
        setCurrentTipIndex(prevIndex => (prevIndex + 1) % tips.length)
        rotateTips()
      }, 8000) // Change tip every 8 seconds
    }

    rotateTips()

    return () => {
      if (tipTimerRef.current) {
        clearTimeout(tipTimerRef.current)
      }
    }
  }, [])

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  })

  // Update progress bar listener
  progressAnim.addListener(({value}) => {
    progressValue.current = value
  })

  // Get images for phone and glasses
  const phoneImage = Platform.OS === "ios" 
    ? require("../../../assets/guide/iphone.png")
    : require("../../../assets/guide/android.png")
  
  // Use dynamic image for Even Realities G1 based on style and color
  let glassesImage = getGlassesImage(glassesModelName)
  if (glassesModelName && (glassesModelName === "Even Realities G1" || glassesModelName === "evenrealities_g1" || glassesModelName === "g1")) {
    // For pairing, we don't have style/color info yet, so use defaults
    // If battery level is available in props or context, pass it; otherwise, pass undefined
    glassesImage = getEvenRealitiesG1Image("Round", "Grey", "folded", "l", theme.isDark, undefined)
  }

  return (
    <View style={{flex: 1}}>
      <View style={themed($container)}>
        <View style={{flex: 1, justifyContent: "center"}}>
          {/* New phone and glasses images layout */}
          <View style={themed($imagesContainer)}>
            <Image source={phoneImage} style={themed($phoneImage)} resizeMode="contain" />
            
            {/* Animated connection bar */}
            <Animated.View 
              style={[
                themed($connectionBar),
                {
                  opacity: connectionBarOpacity,
                  transform: [{scaleX: connectionBarScale}],
                }
              ]}
            >
              <View style={themed($connectionDiamond)} />
              <View style={themed($connectionLine)} />
              <View style={themed($connectionDiamond)} />
            </Animated.View>
            
            <Image source={glassesImage} style={themed($glassesImage)} resizeMode="contain" />
          </View>

          {/* Status text and tips */}
          <View style={themed($textContainer)}>
            <Text style={themed($statusText)}>{translate("pairing:pairing").toLocaleUpperCase()} {glassesModelName.toUpperCase()}...</Text>
            <Text style={themed($tipText)}>{tips[currentTipIndex]}</Text>
          </View>
        </View>

        {/* Progress bar at the bottom */}
        <View style={themed($progressBarWrapper)}>
          <View style={themed($progressBarContainer)}>
            <Animated.View style={[themed($progressBar), {width: progressWidth}]} />
          </View>
        </View>
      </View>
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flex: 1,
})

const $imagesContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  height: 250,
  width: "100%",
  position: "relative",
})

const $phoneImage: ThemedStyle<any> = ({colors}) => ({
  position: "absolute",
  left: -100, // Push left more so only right 2/3 shows
  top: "50%",
  marginTop: -120, // Center vertically (half of height)
  width: 240,
  height: 240,
})

const $glassesImage: ThemedStyle<any> = ({colors}) => ({
  position: "absolute",
  right: -120, // Push right so only left 1/2 shows
  top: "50%",
  marginTop: -90, // Center vertically (half of height)
  width: 240,
  height: 180,
})

const $textContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  marginTop: spacing.xl,
  alignItems: "center",
  paddingHorizontal: spacing.md,
})

const $statusText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 20,
  fontWeight: "700",
  fontFamily: "Montserrat-Bold",
  color: colors.text,
  marginBottom: 16,
  letterSpacing: 1,
})

const $tipText: ThemedStyle<TextStyle> = ({colors}) => ({
  textAlign: "center",
  fontSize: 16,
  lineHeight: 24,
  fontFamily: "Montserrat-Regular",
  color: colors.text,
  opacity: 0.8,
})

const $progressBarWrapper: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  paddingHorizontal: spacing.md,
  marginBottom: 80, // Push up from bottom to match button positioning
})

const $progressBarContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  width: "100%",
  height: 6,
  borderRadius: 3,
  backgroundColor: colors.separator,
  overflow: "hidden",
})

const $progressBar: ThemedStyle<ViewStyle> = ({colors}) => ({
  height: "100%",
  borderRadius: 3,
  backgroundColor: colors.palette.primary300,
})

const $connectionBar: ThemedStyle<ViewStyle> = ({colors}) => ({
  position: "absolute",
  flexDirection: "row",
  alignItems: "center",
  top: "50%",
  marginTop: -22, // Center the 4px bar and raise by 20px
  left: 60, // Extend into phone image
  right: 60, // Extend into glasses image
  zIndex: 10, // Ensure it appears over the images
})

const $connectionLine: ThemedStyle<ViewStyle> = ({colors}) => ({
  flex: 1,
  height: 4,
  backgroundColor: colors.buttonPrimary,
})

const $connectionDiamond: ThemedStyle<ViewStyle> = ({colors}) => ({
  width: 12,
  height: 12,
  backgroundColor: colors.buttonPrimary,
  transform: [{rotate: "45deg"}],
})

const styles = StyleSheet.create({})

export default GlassesPairingLoader
