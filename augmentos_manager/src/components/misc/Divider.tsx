import * as React from "react"
import {View, ViewStyle} from "react-native"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"

interface DividerProps {
  variant?: 'full' | 'inset'
  color?: string
  thickness?: number
}

const Divider = ({variant = 'full', color, thickness = 1}: DividerProps) => {
  const {themed} = useAppTheme()

  const style = variant === 'full' ? $dividerFull : $dividerInset

  return (
    <View 
      style={[
        themed(style),
        color && {backgroundColor: color},
        {height: thickness}
      ]}
    />
  )
}

const $dividerFull: ThemedStyle<ViewStyle> = ({colors}) => ({
  height: 1,
  backgroundColor: colors.separator || '#E5E5E7',
  width: '100%',
})

const $dividerInset: ThemedStyle<ViewStyle> = ({colors}) => ({
  height: 1,
  backgroundColor: colors.separator || '#E5E5E7',
  width: '90%',
  alignSelf: 'center',
})

export default Divider