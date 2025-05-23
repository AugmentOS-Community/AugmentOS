// Mock for react-native-elements
import React from 'react';
import { View } from 'react-native';

// Create a simple mock for Slider component
const Slider: React.FC<any> = (props) => {
  return React.createElement(View, { testID: 'slider-mock', ...props });
};

// Export other components that might be used
export {
  Slider,
  // Add other components as needed
};

// Default export for the library
export default {
  Slider
}; 