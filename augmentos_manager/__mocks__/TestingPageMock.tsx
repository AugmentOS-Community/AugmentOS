import React from 'react';
import { View, Text } from 'react-native';

interface TestingPageProps {
  isDarkTheme: boolean;
  toggleTheme: () => void;
}

// Simple mock implementation of TestingPage component
const TestingPage: React.FC<TestingPageProps> = ({ isDarkTheme }) => {
  return (
    <View>
      <Text>Testing Page Mock Component - {isDarkTheme ? 'Dark Theme' : 'Light Theme'}</Text>
    </View>
  );
};

export default TestingPage; 