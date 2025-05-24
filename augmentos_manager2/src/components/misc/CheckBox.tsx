// CheckBox.tsx

import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';

interface CheckBoxProps {
  checked: boolean;
  onChange: (newValue: boolean) => void;
  label?: string;
  disabled?: boolean;
  containerStyle?: object;
  boxStyle?: object;
  labelStyle?: object;
}

const CheckBox: React.FC<CheckBoxProps> = ({
  checked,
  onChange,
  label,
  disabled,
  containerStyle,
  boxStyle,
  labelStyle,
}) => {
  return (
    <Pressable
      style={[styles.container, containerStyle]}
      onPress={() => !disabled && onChange(!checked)}
      disabled={disabled}
    >
      <View style={[styles.box, boxStyle, checked && styles.boxChecked]}>
        {checked && <Text style={styles.checkMark}>✓</Text>}
      </View>
      {label ? <Text style={[styles.label, labelStyle]}>{label}</Text> : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  box: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#999',
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  boxChecked: {
    backgroundColor: '#1EB1FC',
    borderColor: '#1EB1FC',
  },
  checkMark: {
    color: '#fff',
    fontWeight: 'bold',
  },
  label: {
    fontSize: 16,
  },
});

export default CheckBox;
