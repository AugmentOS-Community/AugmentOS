import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import CheckBox from '../CheckBox';

type Option = {
  label: string;
  value: string;
};

type MultiSelectSettingProps = {
  label: string;
  values: string[];
  options: Option[];
  onValueChange: (selectedValues: string[]) => void;
  theme: any;
};

const MultiSelectSetting: React.FC<MultiSelectSettingProps> = ({ label, values =[], options, onValueChange, theme }) => {
  const toggleValue = (value: string) => {
    if (values.includes(value)) {
      onValueChange(values.filter((v) => v !== value));
    } else {
      onValueChange([...values, value]);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textColor }]}>{label}</Text>
      {options.map((opt) => (
        <TouchableOpacity key={opt.value} style={styles.option} onPress={() => toggleValue(opt.value)}>
          <CheckBox
            checked={values.includes(opt.value)}
            onChange={() => toggleValue(opt.value)}
            //tintColors={{ true: '#1EB1FC', false: theme.textColor }}
          />
          <Text style={[styles.optionLabel, { color: theme.textColor }]}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    width: '100%',
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 5,
  },
  optionLabel: {
    marginLeft: 8,
    fontSize: 16,
  },
});

export default MultiSelectSetting;
