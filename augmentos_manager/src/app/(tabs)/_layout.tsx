import React, {useRef} from "react"
import {Tabs} from "expo-router/tabs"
import {translate} from "@/i18n"
import {colors, spacing, ThemedStyle, typography} from "@/theme"
import {TextStyle, TouchableOpacity, View, ViewStyle} from "react-native"
import {useSafeAreaInsets} from "react-native-safe-area-context"
import {useAppTheme, useThemeProvider} from "@/utils/useAppTheme"
import {LinearGradient} from "expo-linear-gradient"
import SolarLineIconsSet4 from "assets/icons/component/SolarLineIconsSet4"
import HomeIcon from "assets/icons/navbar/HomeIcon"
import MirrorIcon from "assets/icons/navbar/MirrorIcon"
import StoreIcon from "assets/icons/navbar/StoreIcon"
import UserIcon from "assets/icons/navbar/UserIcon"
import showAlert from "@/utils/AlertUtils"
import Toast from "react-native-toast-message"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {SETTINGS_KEYS} from "@/consts"
import {saveSetting} from "@/utils/SettingsHelper"

export default function Layout() {
  const {bottom} = useSafeAreaInsets()

  const {themeScheme} = useThemeProvider()
  const {theme, themed} = useAppTheme()
  const {push, replace} = useNavigationHistory()

  const showLabel = false
  const iconFocusedColor = theme.isDark ? "white" : theme.colors.palette.primary300
  const whiteColor = "#fff"

  const pressCount = useRef(0)
  const lastPressTime = useRef(0)
  const pressTimeout = useRef<NodeJS.Timeout | null>(null)

  const handleQuickPress = () => {
    push("/settings")

    const currentTime = Date.now()
    const timeDiff = currentTime - lastPressTime.current
    const maxTimeDiff = 2000
    const maxPressCount = 10
    const showAlertAtPressCount = 5

    // Reset counter if too much time has passed (more than 500ms between presses)
    if (timeDiff > maxTimeDiff) {
      pressCount.current = 1
    } else {
      pressCount.current += 1
    }

    lastPressTime.current = currentTime

    // Clear existing timeout
    if (pressTimeout.current) {
      clearTimeout(pressTimeout.current)
    }

    // Handle different press counts
    if (pressCount.current === maxPressCount) {
      // Show alert on 8th press
      showAlert("Developer Mode", "You are now a developer!", [{text: translate("common:ok")}])
      saveSetting(SETTINGS_KEYS.DEV_MODE, true)
      pressCount.current = 0
    } else if (pressCount.current >= showAlertAtPressCount) {
      const remaining = maxPressCount - pressCount.current
      Toast.show({
        type: "info",
        text1: "Developer Mode",
        text2: `${remaining} more taps to enable developer mode`,
        position: "top",
        topOffset: 80,
        visibilityTime: 1000,
      })
    }

    // Reset counter after 2 seconds of no activity
    pressTimeout.current = setTimeout(() => {
      pressCount.current = 0
    }, maxTimeDiff)
  }

  const userIcon = (focused: boolean) => {
    return (
      <TouchableOpacity onPress={handleQuickPress}>
        <UserIcon size={28} color={focused ? iconFocusedColor : theme.colors.textDim} />
      </TouchableOpacity>
    )
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: true,
        tabBarStyle: [
          themed($tabBar),
          {
            paddingBottom: bottom + 8,
            // borderTopColor moved to View wrapping LinearGradient
            borderTopWidth: 0,
            backgroundColor: "transparent",
          },
        ],
        tabBarActiveTintColor: theme.isDark ? whiteColor : theme.colors.text,
        tabBarInactiveTintColor: theme.colors.textDim,
        tabBarLabelStyle: themed($tabBarLabel),
        tabBarItemStyle: themed($tabBarItem),
        tabBarLabelPosition: "below-icon",
        // tabBarPosition: 'left',
        // animation: 'shift',
        // tabBarBackground: () => <View />,
        tabBarBackground: () => (
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              borderTopColor: theme.colors.separator,
              borderTopWidth: 2,
              overflow: "hidden",
            }}>
            <LinearGradient
              colors={
                theme.isDark
                  ? [theme.colors.tabBarGradientStart, theme.colors.tabBarGradientEnd]
                  : [whiteColor, whiteColor]
              }
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
              }}
              start={{x: 0, y: 0}}
              end={{x: 0, y: 2}}
            />
          </View>
        ),
      }}>
      <Tabs.Screen
        name="home"
        options={{
          href: "/home",
          headerShown: false,
          tabBarIcon: ({focused, color}) => (
            <HomeIcon size={28} color={focused ? iconFocusedColor : theme.colors.textDim} />
          ),
          tabBarLabel: translate("navigation:home"),
        }}
      />
      <Tabs.Screen
        name="glasses"
        options={{
          href: "/glasses",
          headerShown: false,
          tabBarIcon: ({focused, color}) => (
            <SolarLineIconsSet4 size={28} color={focused ? iconFocusedColor : theme.colors.textDim} />
          ),
          tabBarLabel: translate("navigation:glasses"),
        }}
      />
      {/* <Tabs.Screen
        name="mirror"
        options={{
          href: "/mirror",
          headerShown: false,
          tabBarIcon: ({focused, color}) => (
            <MirrorIcon size={28} color={focused ? iconFocusedColor : theme.colors.textDim} />
          ),
          tabBarLabel: translate("navigation:mirror"),
        }}
      /> */}
      <Tabs.Screen
        name="store"
        options={{
          href: "/store",
          headerShown: false,
          tabBarIcon: ({focused, color}) => (
            <StoreIcon size={28} color={focused ? iconFocusedColor : theme.colors.textDim} />
          ),
          tabBarLabel: translate("navigation:store"),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: "/settings",
          headerShown: false,
          tabBarIcon: ({focused, color}) => userIcon(focused),
          tabBarLabel: translate("navigation:account"),
          // tabBarButton: ({, color}) => userIcon(focused),
        }}
      />
    </Tabs>
  )
}

const $tabBar: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  borderTopColor: colors.separator,
  borderTopWidth: 1,
  paddingTop: 8,
  height: 90,
})

const $tabBarItem: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  paddingTop: spacing.sm,
  paddingBottom: spacing.xs,
})

const $tabBarLabel: ThemedStyle<TextStyle> = ({colors, typography}) => ({
  fontSize: 12,
  fontFamily: typography.primary.medium,
  lineHeight: 16,
  marginTop: 4,
})