import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  SafeAreaView,
  Pressable,
} from 'react-native';

export type PickerItem = {
  label: string;
  value: string;
};

type PickerSelectProps = {
  items: PickerItem[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: PickerItem; // Optional placeholder like { label: 'Select...', value: '' }
  style?: {
    /** Styles for the main touchable that shows the currently selected value */
    touchable?: object;
    /** Styles for the text inside the main touchable */
    touchableText?: object;
    /** Styles for the entire modal background container (when open) */
    modalContainer?: object;
    /** Styles for the individual item touchable */
    itemTouchable?: object;
    /** Styles for the item text */
    itemText?: object;
    /** Styles for the selected item text */
    selectedItemText?: object;
  };
  /** Choose between 'none', 'fade', or 'slide' to control modal animation */
  modalAnimationType?: 'none' | 'fade' | 'slide';
};

const PickerSelect: React.FC<PickerSelectProps> = ({
  items,
  value,
  onValueChange,
  placeholder,
  style = {},
  modalAnimationType = 'none', // default: no animation
}) => {
  const [modalVisible, setModalVisible] = useState(false);

  // Find the currently selected item.
  const selectedItem = items.find((item) => item.value === value);

  // If you are using a placeholder item, you can insert it into the items array
  // or handle the logic however you want. Here’s a simple approach:
  const data = placeholder ? [placeholder, ...items] : items;

  const handleItemPress = (itemValue: string) => {
    onValueChange(itemValue);
    setModalVisible(false);
  };

  return (
    <View>
      {/* The main touchable that shows the selected value and opens the modal */}
      <TouchableOpacity
        style={[styles.touchable, style.touchable]}
        onPress={() => setModalVisible(true)}
      >
        <Text style={[styles.touchableText, style.touchableText]}>
          {selectedItem ? selectedItem.label : placeholder?.label ?? 'Select...'}
        </Text>
      </TouchableOpacity>

      {/* Modal to show all the items */}
      <Modal
        visible={modalVisible}
        transparent
        animationType={modalAnimationType} // 'none' | 'fade' | 'slide'
        onRequestClose={() => setModalVisible(false)}
      >
        {/* A semi-transparent background so tapping outside also closes the menu */}
        <Pressable
          style={[styles.modalContainer, style.modalContainer]}
          onPress={() => setModalVisible(false)}
        >
          {/* Use SafeAreaView or another container to prevent touches from closing the modal */}
          <SafeAreaView style={{ backgroundColor: '#fff', borderRadius: 8 }}>
            <FlatList
              data={data}
              keyExtractor={(item, index) => `${item.value}-${index}`}
              renderItem={({ item }) => {
                const isSelected = item.value === value;
                return (
                  <TouchableOpacity
                    style={[styles.itemTouchable, style.itemTouchable]}
                    onPress={() => handleItemPress(item.value)}
                  >
                    <Text
                      style={[
                        styles.itemText,
                        style.itemText,
                        isSelected && (style.selectedItemText || styles.selectedItemText),
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </SafeAreaView>
        </Pressable>
      </Modal>
    </View>
  );
};

export default PickerSelect;

const styles = StyleSheet.create({
  touchable: {
    padding: 12,
   // borderWidth: 1,
   // borderRadius: 4,
    borderColor: '#888',
    backgroundColor: '#fff',
  },
  touchableText: {
    fontSize: 16,
    color: '#333',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 16,
  },
  itemTouchable: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  itemText: {
    fontSize: 16,
    color: '#333',
  },
  selectedItemText: {
    fontWeight: 'bold',
    color: '#007AFF', // highlight color for selected
  },
});
