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
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';

import { useStatus } from '../providers/AugmentOSStatusProvider.tsx';
import coreCommunicator from '../bridge/CoreCommunicator';
import HeadUpAngleComponent from '../components/HeadUpAngleComponent.tsx';
import NavigationBar from '../components/NavigationBar';
import BackendServerComms from '../backend_comms/BackendServerComms';

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
  const backendServerComms = BackendServerComms.getInstance();

  // -- States --
  const [isContextualDashboardEnabled, setIsContextualDashboardEnabled] = useState(
    status.core_info.contextual_dashboard_enabled
  );
  const [headUpAngleComponentVisible, setHeadUpAngleComponentVisible] = useState(false);
  const [headUpAngle, setHeadUpAngle] = useState<number | null>(null);
  const [dashboardContent, setDashboardContent] = useState('');
  const [showContentPicker, setShowContentPicker] = useState(false);
  const [serverSettings, setServerSettings] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const dashboardContentOptions = [
    { label: 'Notification Summary', value: 'notification_summary' },
    { label: 'Fun Facts', value: 'fun_facts' },
    { label: 'Famous Quotes', value: 'famous_quotes' },
    { label: "Trash Talk", value: "trash_talk" },
    { label: 'Chinese Words', value: 'chinese_words' },
    { label: 'Gratitude Ping', value: 'gratitude_ping' }
  ];

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

  // -- Effects --
  useEffect(() => {
    fetchDashboardSettings();
  }, []);

  const fetchDashboardSettings = async () => {
    try {
      setIsLoading(true);
      const data = await backendServerComms.getTpaSettings('com.augmentos.dashboard');
      setServerSettings(data);
      // Find the dashboard content setting
      const contentSetting = data.settings?.find((setting: any) => setting.key === 'dashboard_content');
      if (contentSetting) {
        setDashboardContent(contentSetting.selected);
      }
    } catch (error) {
      console.error('Error fetching dashboard settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDashboardContentChange = async (value: string) => {
    try {
      setIsUpdating(true);
      // Update the local state immediately to show loading
      setDashboardContent(value);
      await backendServerComms.updateTpaSetting('com.augmentos.dashboard', {
        key: 'dashboard_content',
        value: value
      });
    } catch (error) {
      console.error('Error updating dashboard content:', error);
      Alert.alert('Error', 'Failed to update dashboard content');
      // Revert the local state on error
      setDashboardContent(dashboardContent);
    } finally {
      setIsUpdating(false);
      setShowContentPicker(false);
    }
  };

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

  const renderContentPicker = () => (
    <Modal
      visible={showContentPicker}
      transparent={true}
      animationType="fade"
      onRequestClose={() => !isUpdating && setShowContentPicker(false)}
    >
      <View style={[styles.modalOverlay, isDarkTheme ? styles.darkBackground : styles.lightBackground]}>
        <View style={[styles.pickerContainer, isDarkTheme ? styles.darkPickerContainer : styles.lightPickerContainer]}>
          <View style={styles.pickerHeader}>
            <Text style={[styles.pickerTitle, isDarkTheme ? styles.lightText : styles.darkText]}>
              Select Dashboard Content
            </Text>
            <TouchableOpacity 
              onPress={() => !isUpdating && setShowContentPicker(false)}
              style={[styles.closeButton, isUpdating && styles.disabledButton]}
              disabled={isUpdating}
            >
              <Text style={[styles.closeButtonText, isDarkTheme ? styles.lightText : styles.darkText]}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.pickerOptionsContainer}>
            {dashboardContentOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.pickerOption,
                  dashboardContent === option.value && styles.selectedOption,
                  isDarkTheme ? styles.darkOption : styles.lightOption,
                  isUpdating && styles.disabledItem
                ]}
                onPress={() => !isUpdating && handleDashboardContentChange(option.value)}
                disabled={isUpdating}
              >
                <View style={styles.optionContent}>
                  <Text style={[
                    styles.pickerOptionText,
                    isDarkTheme ? styles.lightText : styles.darkText,
                    dashboardContent === option.value && styles.selectedOptionText
                  ]}>
                    {option.label}
                  </Text>
                  {dashboardContent === option.value && (
                    isUpdating ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Icon name="check" size={20} color="#FFFFFF" />
                    )
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={[styles.safeArea, isDarkTheme ? styles.darkBackground : styles.lightBackground]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, isDarkTheme ? styles.lightText : styles.darkText]}>
          Dashboard Settings
        </Text>
      </View>
      <ScrollView 
        style={styles.scrollViewContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Contextual Dashboard */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDarkTheme ? styles.lightText : styles.darkText]}>
            General Settings
          </Text>
          <View style={[styles.settingItem, styles.elevatedCard, isDarkTheme ? styles.darkCard : styles.lightCard]}>
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
                  {`Show a summary of your phone notifications when you ${
                    status.glasses_info?.model_name
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
        </View>

        {/* Dashboard Content Selection */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDarkTheme ? styles.lightText : styles.darkText]}>
            Content Settings
          </Text>
          <TouchableOpacity
            style={[styles.settingItem, styles.elevatedCard, isDarkTheme ? styles.darkCard : styles.lightCard]}
            onPress={() => !isLoading && setShowContentPicker(true)}
            disabled={isLoading}
          >
            <View style={styles.settingTextContainer}>
              <Text
                style={[
                  styles.label,
                  isDarkTheme ? styles.lightText : styles.darkText,
                ]}
              >
                Dashboard Content
              </Text>
              <Text
                style={[
                  styles.value,
                  isDarkTheme ? styles.lightSubtext : styles.darkSubtext,
                ]}
              >
                Choose what to display in your dashboard
              </Text>
            </View>
            <View style={styles.selectedValueContainer}>
              {isLoading ? (
                <ActivityIndicator size="small" color={isDarkTheme ? '#FFFFFF' : '#007AFF'} />
              ) : (
                <>
                  <Text
                    style={[
                      styles.selectedValue,
                      isDarkTheme ? styles.lightText : styles.darkText,
                    ]}
                  >
                    {dashboardContentOptions.find(opt => opt.value === dashboardContent)?.label || 'Notification Summary'}
                  </Text>
                  <Icon name="chevron-right" size={16} color={isDarkTheme ? '#FFFFFF' : '#000000'} />
                </>
              )}
            </View>
            {isUpdating && (
              <View style={[styles.loadingOverlay, isDarkTheme ? styles.darkLoadingOverlay : styles.lightLoadingOverlay]}>
                <ActivityIndicator size="small" color={isDarkTheme ? '#FFFFFF' : '#007AFF'} />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Head-Up Angle Setting */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDarkTheme ? styles.lightText : styles.darkText]}>
            Display Settings
          </Text>
          <TouchableOpacity
            style={[
              styles.settingItem,
              styles.elevatedCard,
              isDarkTheme ? styles.darkCard : styles.lightCard,
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
            <Icon name="chevron-right" size={16} color={isDarkTheme ? '#FFFFFF' : '#000000'} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {renderContentPicker()}
      {headUpAngle !== null && (
        <HeadUpAngleComponent
          visible={headUpAngleComponentVisible}
          initialAngle={headUpAngle}
          onCancel={onCancelHeadUpAngle}
          onSave={onSaveHeadUpAngle}
        />
      )}

      <NavigationBar toggleTheme={toggleTheme} isDarkTheme={isDarkTheme} />
    </SafeAreaView>
  );
};

export default DashboardSettingsScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
  },
  scrollViewContainer: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    marginLeft: 4,
  },
  elevatedCard: {
    borderRadius: 12,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  darkCard: {
    backgroundColor: '#2C2C2C',
  },
  lightCard: {
    backgroundColor: '#FFFFFF',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  settingTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  value: {
    fontSize: 14,
    lineHeight: 20,
  },
  selectedValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedValue: {
    fontSize: 16,
    marginRight: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  pickerContainer: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  pickerOptionsContainer: {
    maxHeight: 400,
  },
  pickerOption: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  optionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerOptionText: {
    fontSize: 16,
    flex: 1,
  },
  selectedOption: {
    backgroundColor: '#007AFF',
  },
  selectedOptionText: {
    color: '#007AFF',
  },
  disabledItem: {
    opacity: 0.5,
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
  darkPickerContainer: {
    backgroundColor: '#2C2C2C',
  },
  lightPickerContainer: {
    backgroundColor: '#FFFFFF',
  },
  pickerTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  darkOption: {
    backgroundColor: '#3C3C3C',
  },
  lightOption: {
    backgroundColor: '#F5F5F5',
  },
  disabledButton: {
    opacity: 0.5,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  darkLoadingOverlay: {
    backgroundColor: 'rgba(44, 44, 44, 0.7)',
  },
  lightLoadingOverlay: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
});
