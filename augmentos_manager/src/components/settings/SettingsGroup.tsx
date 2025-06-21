import React, {PropsWithChildren} from "react"
import {View, ViewStyle} from "react-native"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"

interface SettingsGroupProps extends PropsWithChildren {
  style?: ViewStyle
}

export function SettingsGroup({children, style}: SettingsGroupProps) {
  const {themed} = useAppTheme()

  return <View style={[themed($container), style]}>{children}</View>
}

const $container: ThemedStyle<ViewStyle> = ({colors, spacing, borderRadius}) => ({
  backgroundColor: colors.background,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.md,
  borderRadius: borderRadius.md,
  borderWidth: spacing.xxxs,
  borderColor: colors.border,
})
