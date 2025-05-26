import { ThemedStyle } from '@/theme';
import { useAppTheme } from '@/utils/useAppTheme';
import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Slider } from 'react-native-elements';

type Theme = {
  backgroundColor: string;
  textColor: string;
};

type SliderSettingProps = {
  label: string;
  value: number | undefined; // Allow undefined if value might not always be set
  min: number;
  max: number;
  onValueChange: (value: number) => void; // For immediate feedback, e.g., UI updates
  onValueSet: (value: number) => void; // For BLE requests or final actions
};

const SliderSetting: React.FC<SliderSettingProps> = ({
  label,
  value = 0, // Default value if not provided
  min,
  max,
  onValueChange,
  onValueSet,
}) => {

  const handleValueChange = (val: number) => {
    const roundedValue = Math.round(val);
    onValueChange(roundedValue); // Emit only integer values
  };

  const handleValueSet = (val: number) => {
    const roundedValue = Math.round(val);
    onValueSet(roundedValue); // Emit only integer values
  };

  const {theme, themed} = useAppTheme();

  return (
    <View style={themed($container)}>
      <Text style={themed($label)}>
        {label}
      </Text>
      <Slider
        style={themed($slider)}
        value={value || 0} // Fallback to 0 if undefined
        onValueChange={handleValueChange} // Wrap the callback to round values
        onSlidingComplete={handleValueSet} // Wrap the callback to round values
        minimumValue={min}
        maximumValue={max}
        minimumTrackTintColor={theme.colors.palette.primary300}
        maximumTrackTintColor={theme.colors.palette.neutral300}
        thumbStyle={{
          width: 24,
          height: 24,
          backgroundColor: theme.colors.text,
        }}
      />
    </View>
  );
};

const $container: ThemedStyle<ViewStyle> = ({colors}) => ({
  width: '100%',
  borderRadius: 8,
  marginTop: 16,
})

const $label: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.text,
  paddingBottom: 4,
})

const $slider: ThemedStyle<ViewStyle> = ({colors}) => ({
  width: '100%',
  height: 40,
})

export default SliderSetting;
