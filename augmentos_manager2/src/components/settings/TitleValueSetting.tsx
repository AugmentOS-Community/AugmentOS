import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type TitleValueSettingProps = {
  label: string;
  value: string;
  theme: any;
};

const TitleValueSetting: React.FC<TitleValueSettingProps> = ({ label, value, theme }) => {
  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textColor }]}>{label}</Text>
      <Text style={[styles.value, { color: theme.textColor }]}>{value}</Text>
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
    fontWeight: 'bold',
  },
  value: {
    fontSize: 16,
    marginTop: 5,
  },
});

export default TitleValueSetting;
