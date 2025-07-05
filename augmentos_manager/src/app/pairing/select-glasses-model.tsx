import React, {useState, useEffect} from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  Image,
  ViewStyle,
  BackHandler,
  ImageStyle,
} from "react-native"
import {useFocusEffect} from "@react-navigation/native"
import Icon from "react-native-vector-icons/FontAwesome"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import {loadSetting} from "@/utils/SettingsHelper"
import {SETTINGS_KEYS} from "@/consts"
import {getGlassesImage, getEvenRealitiesG1Image} from "@/utils/getGlassesImage"
import {useAppTheme} from "@/utils/useAppTheme"
import {router} from "expo-router"
import {Screen} from "@/components/ignite/Screen"
import {Header} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import Svg, {Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop} from "react-native-svg"

export default function SelectGlassesModelScreen() {
  const {status} = useStatus()
  const [glassesModelNameToPair, setGlassesModelNameToPair] = useState<string | null>(null)
  const [isOnboarding, setIsOnboarding] = useState(false)
  const {theme, themed} = useAppTheme()
  const isDarkTheme = theme.isDark
  const {goBack, push} = useNavigationHistory()

  // Platform-specific glasses options
  // For iOS, conditionally include Simulated Glasses based on TestFlight status
  const glassesOptions =
    Platform.OS === "ios"
      ? [
          {modelName: "Simulated Glasses", key: "Simulated Glasses"},
          {modelName: "Even Realities G1", key: "evenrealities_g1"},
          {modelName: "Mentra Live", key: "mentra_live"},
        ]
      : [
          // Android supports all options (unchanged)
          {modelName: "Simulated Glasses", key: "Simulated Glasses"},
          {modelName: "Vuzix Z100", key: "vuzix-z100"},
          {modelName: "Mentra Mach1", key: "mentra_mach1"},
          {modelName: "Mentra Live", key: "mentra_live"},
          {modelName: "Even Realities G1", key: "evenrealities_g1"},
          {modelName: "Audio Wearable", key: "Audio Wearable"},
        ]

  // Check onboarding status when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      const checkOnboardingStatus = async () => {
        const onboardingCompleted = await loadSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true)
        console.log("ONBOARDING COMPLETED IN SELECTGLASSESMODELSCREEN???: " + onboardingCompleted)
        setIsOnboarding(!onboardingCompleted)
      }

      checkOnboardingStatus()

      // Handle Android back button
      const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
        // If in onboarding, prevent going back
        if (isOnboarding) {
          return true // This prevents the default back action
        }
        return false // Allow default back action
      })

      return () => backHandler.remove()
    }, [isOnboarding]),
  )

  useEffect(() => {}, [status])

  const triggerGlassesPairingGuide = async (glassesModelName: string) => {
    // No need for Bluetooth permissions anymore as we're using direct communication

    setGlassesModelNameToPair(glassesModelName)
    console.log("TRIGGERING SEARCH SCREEN FOR: " + glassesModelName)
    router.push({pathname: "/pairing/prep", params: {glassesModelName: glassesModelName}})
  }

  const radialGradient = (size: number, rotation: number) => {
    const strokeWidth = theme.spacing.xxxs;
    const halfStroke = strokeWidth / 2;
    return (
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient
            id="grad"
            cx="0.0762"
            cy="0.9529"
            rx="1.0228"
            ry="0.9978"
            gradientUnits="objectBoundingBox"
            gradientTransform={`rotate(${rotation} 10 10)`}>
            <Stop offset="0" stopColor={theme.isDark ? theme.colors.palette.primary500 : theme.colors.palette.primary300} />
            <Stop offset="1" stopColor={theme.isDark ? theme.colors.palette.primary200 : theme.colors.palette.primary100} />
          </RadialGradient>
        </Defs>
        <Rect x={halfStroke} y={halfStroke} width={size - strokeWidth} height={size - strokeWidth} rx={theme.borderRadius.md - 2} ry={theme.borderRadius.md - 2} fill="url(#grad)" stroke={theme.colors.border} strokeWidth={strokeWidth} />
      </Svg>
    )
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}} safeAreaEdges={["bottom"]}>
      <Header
        titleTx="pairing:selectModel"
        leftIcon={isOnboarding ? undefined : "caretLeft"}
        onLeftPress={
          isOnboarding
            ? undefined
            : () => {
                router.replace({pathname: "/(tabs)/home"})
              }
        }
      />
      <ScrollView style={{marginRight: -theme.spacing.md, paddingRight: theme.spacing.md}}>
        {isOnboarding && (
          <View
            style={[
              styles.onboardingBanner,
              {backgroundColor: theme.colors.statusInfo, borderColor: theme.colors.buttonPrimary},
            ]}>
            <Icon name="info-circle" size={20} color={theme.colors.icon} style={{marginRight: 8}} />

            <Text
              style={{
                color: "white",
                fontWeight: "bold",
                textAlign: "center",
                fontSize: 16,
                flex: 1,
              }}>
              {"If you don't have smart glasses yet, you can select 'Simulated Glasses'."}
            </Text>
          </View>
        )}
        {/** RENDER EACH GLASSES OPTION */}
        {glassesOptions.map(glasses => (
          <TouchableOpacity
            key={glasses.key}
            style={themed($settingItem)}
            onPress={() => {
              triggerGlassesPairingGuide(glasses.modelName)
            }}>
            <View style={{position: "relative", marginLeft: -theme.spacing.xxxs, marginTop: -theme.spacing.xxxs, marginBottom: -theme.spacing.xxxs}}>
              {radialGradient(100 + theme.spacing.xxxs * 2, Math.round(Math.random() * 360))}
              <Image source={getGlassesImage(glasses.modelName)} style={themed($glassesImage)} />
            </View>
            <View style={styles.settingTextContainer}>
              <Text
                style={[
                  styles.label,
                  {
                    color:
                      isOnboarding && glasses.modelName === "Simulated Glasses"
                        ? theme.colors.buttonPrimary
                        : theme.colors.text,
                    fontWeight: isOnboarding && glasses.modelName === "Simulated Glasses" ? "800" : "600",
                  },
                ]}>
                {glasses.modelName}
              </Text>
            </View>
            {isOnboarding && glasses.modelName === "Simulated Glasses" ? (
              <View style={{flexDirection: "row", alignItems: "center"}}>
                <Text style={{color: theme.colors.buttonPrimary, marginRight: 5, fontWeight: "bold"}}>Select</Text>
                <Icon name="angle-right" size={24} color={theme.colors.buttonPrimary} />
              </View>
            ) : (
              <Icon name="angle-right" size={24} color={theme.colors.text} />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Screen>
  )
}

const $settingItem: ThemedStyle<ViewStyle> = ({colors, spacing, borderRadius}) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingRight: spacing.lg,

  // Larger margin to separate each card
  marginVertical: 8,

  // Rounded corners
  borderRadius: borderRadius.md,

  borderWidth: spacing.xxxs,
  borderColor: colors.border,

  // More subtle shadow for iOS
  shadowColor: "#000",
  shadowOpacity: 0.08,
  shadowRadius: 3,
  shadowOffset: {width: 0, height: 1},

  // More subtle elevation for Android
  elevation: 2,

  backgroundColor: colors.background,
})

const $glassesImage: ThemedStyle<ImageStyle> = ({colors, spacing}) => ({
  width: 80,
  height: 80,
  resizeMode: "contain",
  marginRight: 10,
  position: "absolute",
  padding: spacing.sm,
  top: 10,
  left: 10,
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20, // Increased top padding for more consistent spacing
    overflow: "hidden", // Prevent content from creating visual lines
  },
  onboardingBanner: {
    paddingVertical: 15,
    paddingHorizontal: 15,
    marginBottom: 20,
    borderRadius: 8,
    elevation: 5,
    shadowColor: "#000", // Universal shadow color
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    // backgroundColor and borderColor moved to dynamic styling
  },
  titleContainer: {
    marginBottom: 10,
    marginHorizontal: -20,
    marginTop: -20,
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  // Removed hardcoded theme colors - using dynamic styling
  // titleContainerDark and titleContainerLight removed - use dynamic styling
  title: {
    fontFamily: "Montserrat-Bold",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 5,
    textAlign: "left",
    // color moved to dynamic styling
  },
  // Removed hardcoded theme colors - using dynamic styling
  // darkBackground, lightBackground, darkText, lightText, darkSubtext, lightSubtext, darkIcon, lightIcon removed
  backButton: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 20,
  },
  backButtonText: {
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 10,
  },
  settingTextContainer: {
    flex: 1,
    paddingLeft: 20,
    paddingRight: 10,
  },
  label: {
    fontSize: 18, // bigger text size
    fontWeight: "600",
    flexWrap: "wrap",
  },
  value: {
    flexWrap: "wrap",
    fontSize: 12,
    marginTop: 5,
  },
  headerContainer: {
    borderBottomWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 15,
    // backgroundColor and borderBottomColor moved to dynamic styling
  },
  header: {
    fontSize: 24,
    fontWeight: "600",
    // color moved to dynamic styling
  },
})
