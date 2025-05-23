import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Pressable,
} from 'react-native';

type TextSettingNoSaveProps = {
  label: string;
  value: string;
  onChangeTextFn: (text: string) => void;
  theme: any;
  maxLines?: number;
};

const TextSettingNoSave: React.FC<TextSettingNoSaveProps> = ({
  label,
  value,
  onChangeTextFn,
  theme,
  maxLines,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  // Debounce updates to parent
  useEffect(() => {
    const handler = setTimeout(() => {
      onChangeTextFn(tempValue);
    }, 500);
    return () => clearTimeout(handler);
  }, [tempValue]);

  const handleOpenModal = () => {
    setTempValue(value);
    setModalVisible(true);
  };

  const handleCancel = () => {
    setTempValue(value);
    setModalVisible(false);
  };

  const handleDone = () => {
    setModalVisible(false);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, {color: theme.textColor}]}>{label}</Text>

      <Pressable
        style={({pressed}) => [
          styles.button,
          {borderColor: theme.textColor},
          pressed && styles.buttonPressed,
        ]}
        onPress={handleOpenModal}
        android_ripple={{color: 'rgba(0, 0, 0, 0.1)'}}>
        <Text
          style={[styles.buttonText, {color: theme.textColor}]}
          numberOfLines={2}
          ellipsizeMode="tail">
          {value || 'Tap to edit...'}
        </Text>
      </Pressable>

      <Modal
        animationType="slide"
        transparent={false}
        visible={modalVisible}
        onRequestClose={handleCancel}>
        <SafeAreaView
          style={[
            styles.modalContainer,
            {backgroundColor: theme.backgroundColor},
          ]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardAvoidingView}>
            <View style={styles.modalHeader}>
              <Pressable
                onPress={handleCancel}
                style={({pressed}) => [
                  styles.headerButton,
                  Platform.OS === 'ios' && styles.iosCancelButton,
                  pressed && styles.headerButtonPressed,
                ]}
                android_ripple={{color: 'rgba(0, 0, 0, 0.1)'}}>
                <Text
                  style={[
                    styles.headerButtonText,
                    Platform.OS === 'ios' && styles.iosCancelText,
                  ]}>
                  Cancel
                </Text>
              </Pressable>

              <Text style={[styles.modalTitle, {color: theme.textColor}]}>
                {label}
              </Text>

              <Pressable
                onPress={handleDone}
                style={({pressed}) => [
                  styles.headerButton,
                  Platform.OS === 'ios' && styles.iosDoneButton,
                  pressed && styles.headerButtonPressed,
                ]}
                android_ripple={{color: 'rgba(0, 0, 0, 0.1)'}}>
                <Text
                  style={[
                    styles.headerButtonText,
                    Platform.OS === 'ios' && styles.iosDoneText,
                  ]}>
                  Done
                </Text>
              </Pressable>
            </View>

            <TextInput
              style={[
                styles.modalInput,
                {
                  color: theme.textColor,
                  borderColor: Platform.OS === 'ios' ? '#e0e0e0' : theme.textColor,
                  minHeight: maxLines ? 22 * maxLines + 32 : undefined,
                  maxHeight: maxLines ? 22 * maxLines + 32 : undefined,
                },
              ]}
              value={tempValue}
              onChangeText={text => {
                if (maxLines) {
                  const lines = text.split('\n');
                  if (lines.length <= maxLines) {
                    setTempValue(text);
                  }
                } else {
                  setTempValue(text);
                }
              }}
              multiline
              numberOfLines={maxLines || 5}
              maxLength={10000}
              textAlignVertical="top"
              autoFocus
              scrollEnabled={true}
              placeholderTextColor={Platform.OS === 'ios' ? '#999' : '#888'}
            />
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
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
  button: {
    borderWidth: 1,
    borderRadius: Platform.OS === 'ios' ? 8 : 4,
    padding: Platform.OS === 'ios' ? 12 : 10,
    minHeight: Platform.OS === 'ios' ? 44 : 48,
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  buttonPressed: {
    backgroundColor:
      Platform.OS === 'ios' ? 'rgba(0, 0, 0, 0.05)' : 'transparent',
    opacity: Platform.OS === 'ios' ? 0.8 : 1,
  },
  buttonText: {
    fontSize: 16,
  },
  modalContainer: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Platform.OS === 'ios' ? 8 : 16,
    borderBottomWidth: Platform.OS === 'ios' ? 0.5 : 1,
    borderBottomColor: '#e0e0e0',
    height: Platform.OS === 'ios' ? 44 : 56,
  },
  headerButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Platform.OS === 'ios' ? 0 : 4,
    minWidth: Platform.OS === 'ios' ? 70 : 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonPressed: {
    opacity: 0.7,
  },
  headerButtonText: {
    fontSize: Platform.OS === 'ios' ? 17 : 16,
    fontWeight: Platform.OS === 'ios' ? '400' : '500',
  },
  // iOS specific styles
  iosCancelButton: {
    backgroundColor: 'transparent',
  },
  iosCancelText: {
    color: '#007AFF',
  },
  iosDoneButton: {
    backgroundColor: 'transparent',
  },
  iosDoneText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: Platform.OS === 'ios' ? 17 : 18,
    fontWeight: '600',
  },
  modalInput: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 22,
    borderWidth: Platform.OS === 'ios' ? 0.5 : 1,
    borderRadius: Platform.OS === 'ios' ? 10 : 4,
    padding: 16,
    margin: 16,
    textAlignVertical: 'top',
    backgroundColor: Platform.OS === 'ios' ? '#f8f8f8' : 'transparent',
    minHeight: 142,
    maxHeight: 142,
  },
});

export default TextSettingNoSave;
