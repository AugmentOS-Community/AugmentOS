import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Platform,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { useStatus } from '../providers/AugmentOSStatusProvider.tsx';
import coreCommunicator from '../bridge/CoreCommunicator';
import HeadUpAngleComponent from '../components/HeadUpAngleComponent.tsx';
import NavigationBar from '../components/NavigationBar';
import { Slider } from 'react-native-elements';

interface DashboardSettingsScreenProps {
  isDarkTheme: boolean;
  toggleTheme: () => void;
  navigation: any;
}

const DashboardSettingsScreen: React.FC<DashboardSettingsScreenProps> = ({
  isDarkTheme,
  toggleTheme,
  navigation,
}) => {
  const { status } = useStatus();

  // -- States --
  const [isContextualDashboardEnabled, setIsContextualDashboardEnabled] = useState(
    status.core_info.contextual_dashboard_enabled
  );
  const [headUpAngleComponentVisible, setHeadUpAngleComponentVisible] = useState(false);
  const [headUpAngle, setHeadUpAngle] = useState<number | null>(null);
  const [dashboardHeight, setDashboardHeight] = useState<number | null>(null);


  // -- Handlers --
  const toggleContextualDashboard = async () => {
    const newVal = !isContextualDashboardEnabled;
    await coreCommunicator.sendToggleContextualDashboard(newVal);
    setIsContextualDashboardEnabled(newVal);
  };

  const onSaveHeadUpAngle = async (newHeadUpAngle: number) => {
    if (!status.glasses_info) {
      Alert.alert('Glasses not connected', 'Please connect your smart glasses first.');
      return;
    }
    if (newHeadUpAngle == null) {
      return;
    }

    setHeadUpAngleComponentVisible(false);
    await coreCommunicator.setGlassesHeadUpAngle(newHeadUpAngle);
    setHeadUpAngle(newHeadUpAngle);
  };

  const onCancelHeadUpAngle = () => {
    setHeadUpAngleComponentVisible(false);
  };

  const changeDashboardHeight = async (newDashboardHeight: number) => {
    if (!status.glasses_info) {
      Alert.alert('Glasses not connected', 'Please connect your smart glasses first.');
      return;
    }

    if (newDashboardHeight == null) {
      return;
    }

    // if (status.glasses_info.dashboard_height === -1) { return; } // or handle accordingly
    await coreCommunicator.setGlassesDashboardHeight(newDashboardHeight);
    setDashboardHeight(newDashboardHeight);
  };

  // -- Effects --
  useEffect(() => {
    if (status.glasses_info) {
      if (status.glasses_info?.headUp_angle != null) {
        setHeadUpAngle(status.glasses_info.headUp_angle);
      }
    }
  }, [status.glasses_info?.headUp_angle, status.glasses_info]);

  // Switch track colors
  const switchColors = {
    trackColor: {
      false: isDarkTheme ? '#666666' : '#D1D1D6',
      true: '#2196F3',
    },
    thumbColor:
      Platform.OS === 'ios' ? undefined : isDarkTheme ? '#FFFFFF' : '#FFFFFF',
    ios_backgroundColor: isDarkTheme ? '#666666' : '#D1D1D6',
  };

  // Condition to disable HeadUp Angle setting
  const disableHeadUpAngle =
    !status.glasses_info?.model_name ||
    status.glasses_info?.brightness === '-' ||
    !status.glasses_info.model_name.toLowerCase().includes('even');

  const dashboardHeightSliderProps = {
    disabled: !status.glasses_info?.model_name ||
      !status.glasses_info.model_name.toLowerCase().includes('even'),
    style: styles.slider,
    minimumValue: 0,
    maximumValue: 8,
    step: 1,
    onSlidingComplete: (value: number) => changeDashboardHeight(value),
    value: status.glasses_info?.dashboard_height ?? 4,
    minimumTrackTintColor: styles.minimumTrackTintColor.color,
    maximumTrackTintColor: isDarkTheme
      ? styles.maximumTrackTintColorDark.color
      : styles.maximumTrackTintColorLight.color,
    thumbTintColor: styles.thumbTintColor.color,
    // Using inline objects instead of defaultProps
    thumbTouchSize: { width: 40, height: 40 },
    trackStyle: { height: 5 },
    thumbStyle: { height: 20, width: 20 }
  };

  return (
    <View
      style={[
        styles.container,
        isDarkTheme ? styles.darkBackground : styles.lightBackground,
      ]}
    >
      <ScrollView style={styles.scrollViewContainer}>
        {/* Contextual Dashboard */}
        <View style={styles.settingItem}>
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.label,
                isDarkTheme ? styles.lightText : styles.darkText,
              ]}
            >
              Contextual Dashboard
            </Text>
            {status.glasses_info?.model_name && (
              <Text
                style={[
                  styles.value,
                  isDarkTheme ? styles.lightSubtext : styles.darkSubtext,
                ]}
              >
                {`Show a summary of your phone notifications when you ${status.glasses_info?.model_name
                    .toLowerCase()
                    .includes('even')
                    ? 'look up'
                    : 'tap your smart glasses'
                  }.`}
              </Text>
            )}
          </View>
          <Switch
            value={isContextualDashboardEnabled}
            onValueChange={toggleContextualDashboard}
            trackColor={switchColors.trackColor}
            thumbColor={switchColors.thumbColor}
            ios_backgroundColor={switchColors.ios_backgroundColor}
          />
        </View>

        {/* HEADUP ANGLE SETTING (Button that opens the modal) */}
        <TouchableOpacity
          style={[
            styles.settingItem,
            disableHeadUpAngle && styles.disabledItem,
          ]}
          disabled={disableHeadUpAngle}
          onPress={() => setHeadUpAngleComponentVisible(true)}
        >
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.label,
                isDarkTheme ? styles.lightText : styles.darkText,
              ]}
            >
              Adjust Head-Up Angle
            </Text>
            <Text
              style={[
                styles.value,
                isDarkTheme ? styles.lightSubtext : styles.darkSubtext,
                disableHeadUpAngle && styles.disabledItem,
              ]}
            >
              Adjust the angle at which the contextual dashboard appears when you look up.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Dashboard Height */}
        {/* <View style={styles.settingItem}>
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.label,
                isDarkTheme ? styles.lightText : styles.darkText,
                (!status.core_info.puck_connected || !status.glasses_info?.model_name) &&
                styles.disabledItem,
              ]}
            >
              Dashboard Height
            </Text>
            <Text
              style={[
                styles.value,
                isDarkTheme ? styles.lightSubtext : styles.darkSubtext,
                (!status.core_info.puck_connected || !status.glasses_info?.model_name) &&
                styles.disabledItem,
              ]}
            >
              Adjust the height of the dashboard.
            </Text>
            <Slider
              {...dashboardHeightSliderProps}
            />
          </View>
        </View> */}
      </ScrollView>

      {/* HEADUP ANGLE MODAL */}
      {headUpAngle !== null && (
        <HeadUpAngleComponent
          visible={headUpAngleComponentVisible}
          initialAngle={headUpAngle}
          onCancel={onCancelHeadUpAngle}
          onSave={onSaveHeadUpAngle}
        />
      )}

      {/* Your app's bottom navigation bar */}
      <NavigationBar toggleTheme={toggleTheme} isDarkTheme={isDarkTheme} />
    </View>
  );
};

export default DashboardSettingsScreen;

const styles = StyleSheet.create({
  scrollViewContainer: {
    marginBottom: 55,
  },
  container: {
    flex: 1,
    padding: 20,
  },
  titleContainer: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginHorizontal: -20,
    marginTop: -20,
    marginBottom: 10,
  },
  titleContainerDark: {
    backgroundColor: '#333333',
  },
  titleContainerLight: {
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
    textAlign: 'left',
    color: '#FFFFFF',
    marginBottom: 5,
  },
  darkBackground: {
    backgroundColor: '#1c1c1c',
  },
  lightBackground: {
    backgroundColor: '#f0f0f0',
  },
  darkText: {
    color: 'black',
  },
  lightText: {
    color: 'white',
  },
  darkSubtext: {
    color: '#666666',
  },
  lightSubtext: {
    color: '#999999',
  },
  darkIcon: {
    color: '#333333',
  },
  lightIcon: {
    color: '#666666',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    borderBottomColor: '#333',
    borderBottomWidth: 1,
  },
  settingTextContainer: {
    flex: 1,
    paddingRight: 10,
  },
  label: {
    fontSize: 16,
    flexWrap: 'wrap',
  },
  value: {
    fontSize: 12,
    marginTop: 5,
    flexWrap: 'wrap',
  },
  disabledItem: {
    opacity: 0.4,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  thumbTouchSize: {
    width: 40,
    height: 40,
  },
  trackStyle: {
    height: 5,
  },
  thumbStyle: {
    height: 20,
    width: 20,
  },
  minimumTrackTintColor: {
    color: '#2196F3',
  },
  maximumTrackTintColorDark: {
    color: '#666666',
  },
  maximumTrackTintColorLight: {
    color: '#D1D1D6',
  },
  thumbTintColor: {
    color: '#FFFFFF',
  },
});
