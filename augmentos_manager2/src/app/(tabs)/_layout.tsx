import React from "react"
import {Tabs} from "expo-router/tabs"
import {Icon} from "@/components/ignite"
import {translate} from "@/i18n"
import {colors, spacing, ThemedStyle, typography} from "@/theme"
import {TextStyle, View, ViewStyle} from "react-native"
import {useSafeAreaInsets} from "react-native-safe-area-context"
import {FontAwesome, MaterialCommunityIcons} from "@expo/vector-icons"
import {useAppTheme, useThemeProvider} from "@/utils/useAppTheme"
import {LinearGradient} from "expo-linear-gradient"

export default function Layout() {
  const {bottom} = useSafeAreaInsets()

  const {themeScheme} = useThemeProvider()
  const {theme, themed} = useAppTheme()

  const showLabel = false

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: [
          themed($tabBar),
          {
            paddingBottom: bottom + 48,
          },
        ],
        // tabBarActiveTintColor: themed(({ colors }) => colors.text),
        // tabBarInactiveTintColor: themed(({ colors }) => "#000"),
        tabBarLabelStyle: themed($tabBarLabel),
        tabBarItemStyle: themed($tabBarItem),
        tabBarLabelPosition: "below-icon",
        // tabBarPosition: 'left',
        // animation: 'shift',
        // tabBarBackground: () => <View />,
        tabBarBackground: () => (
          <LinearGradient
            colors={theme.isDark ? ["#090A14", "#080D33"] : ["#FFA500", "#FFF5E6"]}
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
        ),
      }}>
      <Tabs.Screen
        name="home"
        options={{
          href: "/home",
          headerShown: false,
          tabBarIcon: ({focused, color}) => <FontAwesome name="home" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="glasses"
        options={{
          href: "/glasses",
          headerShown: false,
          tabBarIcon: ({focused, color}) => <MaterialCommunityIcons name="glasses" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="mirror"
        options={{
          href: "/mirror",
          headerShown: false,
          tabBarIcon: ({focused, color}) => <MaterialCommunityIcons name="mirror" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="store"
        options={{
          href: "/store",
          headerShown: false,
          tabBarIcon: ({focused, color}) => <MaterialCommunityIcons name={"apps"} size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: "/settings",
          headerShown: false,
          tabBarIcon: ({focused, color}) => <FontAwesome name="cog" size={28} color={color} />,
        }}
      />
    </Tabs>
  )
}

const $tabBar: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.palette.neutral200,
  // borderTopColor: colors.transparent,
  // borderTopWidth: 1,
  paddingTop: 4,
  height: 64,
  borderTopWidth: 0,
})

const $tabBarItem: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  paddingTop: spacing.md,
})

const $tabBarLabel: ThemedStyle<TextStyle> = ({colors, typography}) => ({
  fontSize: 12,
  fontFamily: typography.primary.medium,
  lineHeight: 16,
  flex: 1,
})
