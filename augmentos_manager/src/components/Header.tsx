import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';

interface HeaderProps {
  isDarkTheme: boolean;
  navigation: any;
}

const Header: React.FC<HeaderProps> = ({ isDarkTheme, navigation }) => {
  const [isDropdownVisible, setDropdownVisible] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(true);

  const handleLogout = () => {
    setIsLoggedIn(false);
    setDropdownVisible(false);
    if (navigation) {
      navigation.navigate('Intro');
    } else {
      console.error('Navigation prop is undefined');
    }
  };

  const handleProfileSettings = () => {
    if (navigation) {
      navigation.navigate('ProfileSettings');
    } else {
      console.error('Navigation prop is undefined');
    }
  };

  const textColor = isDarkTheme ? '#FFFFFF' : '#000000';
  const dropdownBackgroundColor = isDarkTheme ? '#333333' : '#FFFFFF';
  const shadowColor = isDarkTheme ? '#FFFFFF' : '#000000';

  return (
    <View style={styles.headerContainer}>
      <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
        AugmentOS
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginLeft: 8,
    zIndex: 1,
    minHeight: 60,
    ...Platform.select({
      ios: {
        paddingTop: 16,
      },
      android: {
        paddingTop: 16,
      },
    }),
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
  },
  dropdown: {
    position: 'absolute',
    top: 70,
    right: 16,
    borderRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
    padding: 8,
    zIndex: 2,
  },
  dropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  dropdownItemText: {
    fontSize: 16,
    fontFamily: 'Montserrat-Regular',
  },
});

export default Header;
