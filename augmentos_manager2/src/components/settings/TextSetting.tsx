import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, LayoutChangeEvent, TouchableOpacity } from 'react-native';

type TextSettingProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  theme: any;
};

const TextSetting: React.FC<TextSettingProps> = ({
  label,
  value,
  onChangeText,
  theme
}) => {
  const [localValue, setLocalValue] = useState(value);
  const [height, setHeight] = useState(100);

  // Whenever the parent's value changes, update localValue
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleContentSizeChange = (event: { nativeEvent: { contentSize: { height: number } } }) => {
    const newHeight = Math.max(100, event.nativeEvent.contentSize.height + 20);
    setHeight(newHeight);
  };

  const handleSubmit = () => {
    onChangeText(localValue);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textColor }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          { 
            color: theme.textColor, 
            borderColor: theme.textColor,
            height
          }
        ]}
        value={localValue}
        onChangeText={setLocalValue}
        multiline
        maxLength={1000}
        numberOfLines={5}
        onContentSizeChange={handleContentSizeChange}
        textAlignVertical="top"
      />
      <TouchableOpacity 
        style={[styles.submitButton, { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}
        onPress={handleSubmit}
      >
        <Text style={[styles.submitButtonText, { color: theme.textColor }]}>Save Changes</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    width: '100%'
  },
  label: {
    fontSize: 16,
    marginBottom: 5
  },
  input: {
    borderWidth: 1,
    borderRadius: 5,
    padding: 10,
    fontSize: 16,
    textAlignVertical: 'top',
    marginBottom: 10
  },
  submitButton: {
    padding: 10,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '600'
  }
});

export default TextSetting;
