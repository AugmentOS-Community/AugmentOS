import React from 'react';
import {View, StyleSheet, TouchableOpacity} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {NavigationProps} from '../components/types';

interface NavigationBarProps {
  toggleTheme: () => void;
  isDarkTheme: boolean;
  // Add variant prop to switch between different icon sets
  variant?: 'v1' | 'v2' | 'v3' | 'v4';
}

const NavigationBar: React.FC<NavigationBarProps> = ({
  isDarkTheme,
  variant = 'v1',
}) => {
  const navigation = useNavigation<NavigationProps>();
  const iconColor = isDarkTheme ? '#FFFFFF' : '#000000';
  const backgroundColor = isDarkTheme ? '#000000' : '#F2F2F7';
  const disabledColor = isDarkTheme ? '#666666' : '#CCCCCC';
  const iconSize = 24;

  // Different icon sets
  const iconSets = {
    v1: {
      home: 'home-variant-outline',
      mirror: 'cast-variant',
      apps: 'grid',
      settings: 'cog-outline',
    },
    v2: {
      home: 'home-minus-outline',
      mirror: 'monitor-screenshot',
      apps: 'apps',
      settings: 'settings-helper',
    },
    v3: {
      home: 'home-outline',
      mirror: 'glasses',
      apps: 'view-grid-outline',
      settings: 'tune-variant',
    },
    v4: {
      home: 'home-modern',
      mirror: 'mirror',
      apps: 'grid-large',
      settings: 'dots-horizontal',
    },
  };

  // Get current icon set
  const icons = iconSets[variant];

  return (
    <View style={[styles.navBarContainer, {backgroundColor}]}>
      {/* Home Icon */}
      <TouchableOpacity
        onPress={() => navigation.navigate('Home')}
        style={styles.iconWrapper}>
        <MaterialCommunityIcons
          name={icons.home}
          size={iconSize}
          color={iconColor}
        />
      </TouchableOpacity>

      {/* Glasses Mirror Icon */}
      <TouchableOpacity
        onPress={() => navigation.navigate('GlassesMirror')}
        disabled={true}
        style={styles.iconWrapper}>
        <MaterialCommunityIcons
          name={icons.mirror}
          size={iconSize}
          color={disabledColor}
        />
      </TouchableOpacity>

      {/* App Store Icon */}
      <TouchableOpacity
        onPress={() => navigation.navigate('AppStore')}
        disabled={true}
        style={styles.iconWrapper}>
        <MaterialCommunityIcons
          name={icons.apps}
          size={iconSize}
          color={disabledColor}
        />
      </TouchableOpacity>

      {/* Settings Icon */}
      <TouchableOpacity
        onPress={() => navigation.navigate('SettingsPage')}
        style={styles.iconWrapper}>
        <MaterialCommunityIcons
          name={icons.settings}
          size={iconSize}
          color={iconColor}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  navBarContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 8,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 55,
    borderTopWidth: 0.5,
    borderTopColor: '#E5E5EA',
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
  },
});

export default NavigationBar;
