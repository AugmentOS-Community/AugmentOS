import { ThemedStyle } from '@/theme';
import { useAppTheme } from '@/utils/useAppTheme';
import React from 'react';
import { View, Text, Switch, StyleSheet, Platform, ViewStyle, TextStyle } from 'react-native';

type ToggleSettingProps = {
  label: string;
  value: boolean;
  onValueChange: (newValue: boolean) => void;
};

const ToggleSetting: React.FC<ToggleSettingProps> = ({ label, value, onValueChange }) => {

  const {theme, themed} = useAppTheme();

  const switchColors = {
    trackColor: {
      false: theme.isDark ? theme.colors.palette.neutral200 : theme.colors.palette.neutral900,
      true: theme.colors.palette.primary300,
    },
    thumbColor:
      Platform.OS === 'ios' ? undefined : theme.isDark ? theme.colors.palette.neutral200 : theme.colors.palette.neutral900,
    ios_backgroundColor: theme.isDark ? theme.colors.palette.neutral200 : theme.colors.palette.neutral900,
  };

  return (
    <View style={styles.container}>
      <Text style={themed($label)}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={switchColors.trackColor}
        thumbColor={switchColors.thumbColor}
        ios_backgroundColor={switchColors.ios_backgroundColor}
      />
    </View>
  );
};

const $label: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.text,
})

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  label: {
    fontSize: 16,
  },
});


const SettingsSwitch = () => {
  const {themed} = useAppTheme();
  return (
      <View style={themed($switchContainer)}>
          <Text>Settings</Text>
          <Switch
              value={true}
              onValueChange={() => {}}
          />
      </View>
  )
}

const $switchContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: 10,
  backgroundColor: colors.palette.neutral100,
  borderRadius: 12,
})

export default ToggleSetting;
