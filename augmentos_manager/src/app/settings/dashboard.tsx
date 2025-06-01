import React, {useState, useEffect} from "react"
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Platform,
  Alert,
  Modal,
  ViewStyle,
  TextStyle,
  ScrollView,
} from "react-native"
import Icon from "react-native-vector-icons/FontAwesome"

import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import coreCommunicator from "@/bridge/CoreCommunicator"
import HeadUpAngleComponent from "@/components/misc/HeadUpAngleComponent"
import {Header} from "@/components/ignite"
import {router} from "expo-router"
import {Screen} from "@/components/ignite"
import {spacing, ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import ToggleSetting from "@/components/settings/ToggleSetting"
import {translate} from "@/i18n/translate"
import {Spacer} from "@/components/misc/Spacer"
import RouteButton from "@/components/ui/RouteButton"

export default function DashboardSettingsScreen() {
  const {status} = useStatus()
  const {themed, theme} = useAppTheme()
  const [isContextualDashboardEnabled, setIsContextualDashboardEnabled] = useState(
    status.core_info.contextual_dashboard_enabled,
  )
  const [headUpAngleComponentVisible, setHeadUpAngleComponentVisible] = useState(false)
  const [headUpAngle, setHeadUpAngle] = useState<number | null>(null)
  const [showContentPicker, setShowContentPicker] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isMetricSystemEnabled, setIsMetricSystemEnabled] = useState(status.core_info.metric_system_enabled)

  // -- Handlers --
  const toggleContextualDashboard = async () => {
    const newVal = !isContextualDashboardEnabled
    await coreCommunicator.sendToggleContextualDashboard(newVal)
    setIsContextualDashboardEnabled(newVal)
  }

  const toggleMetricSystem = async () => {
    const newVal = !isMetricSystemEnabled
    try {
      await coreCommunicator.sendSetMetricSystemEnabled(newVal)
      setIsMetricSystemEnabled(newVal)
    } catch (error) {
      console.error("Error toggling metric system:", error)
    }
  }

  const onSaveHeadUpAngle = async (newHeadUpAngle: number) => {
    if (!status.glasses_info) {
      Alert.alert("Glasses not connected", "Please connect your smart glasses first.")
      return
    }
    if (newHeadUpAngle == null) {
      return
    }

    setHeadUpAngleComponentVisible(false)
    await coreCommunicator.setGlassesHeadUpAngle(newHeadUpAngle)
    setHeadUpAngle(newHeadUpAngle)
  }

  const onCancelHeadUpAngle = () => {
    setHeadUpAngleComponentVisible(false)
  }

  // -- Effects --
  // useEffect(() => {
  //   fetchDashboardSettings();
  // }, []);

  // const fetchDashboardSettings = async () => {
  //   try {
  //     setIsLoading(true);
  //     const data = await backendServerComms.getTpaSettings('com.augmentos.dashboard');
  //     setServerSettings(data);
  //     const contentSetting = data.settings?.find((setting: any) => setting.key === 'dashboard_content');
  //     if (contentSetting) {
  //       setDashboardContent(contentSetting.selected);
  //     }
  //   } catch (error) {
  //     console.error('Error fetching dashboard settings:', error);
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  // const handleDashboardContentChange = async (value: string) => {
  //   try {
  //     setIsUpdating(true);
  //     setDashboardContent(value);
  //     await backendServerComms.updateTpaSetting('com.augmentos.dashboard', {
  //       key: 'dashboard_content',
  //       value: value
  //     });
  //   } catch (error) {
  //     console.error('Error updating dashboard content:', error);
  //     Alert.alert('Error', 'Failed to update dashboard content');
  //     setDashboardContent(dashboardContent);
  //   } finally {
  //     setIsUpdating(false);
  //     setShowContentPicker(false);
  //   }
  // };

  useEffect(() => {
    if (status.glasses_settings.head_up_angle != null) {
      setHeadUpAngle(status.glasses_settings.head_up_angle)
    }
  }, [status.glasses_settings.head_up_angle])

  // Update isMetricSystemEnabled when status changes
  useEffect(() => {
    setIsMetricSystemEnabled(status.core_info.metric_system_enabled)
  }, [status.core_info.metric_system_enabled])

  // Update isContextualDashboardEnabled when status changes
  useEffect(() => {
    setIsContextualDashboardEnabled(status.core_info.contextual_dashboard_enabled)
  }, [status.core_info.contextual_dashboard_enabled])

  // Switch track colors
  const switchColors = {
    trackColor: {
      false: "#D1D1D6",
      true: "#2196F3",
    },
    thumbColor: Platform.OS === "ios" ? undefined : "#FFFFFF",
    ios_backgroundColor: "#D1D1D6",
  }

  // ContentPicker Modal
  const renderContentPicker = () => (
    <Modal
      visible={showContentPicker}
      transparent={true}
      animationType="fade"
      onRequestClose={() => !isUpdating && setShowContentPicker(false)}>
      <View style={[themed($modalOverlay)]}>
        <View style={[themed($pickerContainer)]}>
          <View style={themed($pickerHeader)}>
            <Text style={themed($pickerTitle)}>Select Dashboard Content</Text>
            <TouchableOpacity
              onPress={() => !isUpdating && setShowContentPicker(false)}
              style={[styles.closeButton, isUpdating && styles.disabledButton]}
              disabled={isUpdating}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header
        titleTx="settings:dashboardSettings"
        leftIcon="caretLeft"
        onLeftPress={() => router.replace("/(tabs)/settings")}
      />
      <ScrollView>
        {/* <Text style={themed($sectionTitle)}>General Settings</Text> */}
        {/* <View style={themed($settingItem)}>
        <View style={themed($settingTextContainer)}>
          <Text style={themed($label)}>Contextual Dashboard</Text>
          {status.glasses_info?.model_name && (
            <Text style={themed($value)}>
              {`Show a summary of your phone notifications when you ${
                status.glasses_info?.model_name.toLowerCase().includes("even") ? "look up" : "tap your smart glasses"
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
      </View> */}

        <ToggleSetting
          label={translate("settings:contextualDashboardLabel")}
          subtitle={translate("settings:contextualDashboardSubtitle")}
          value={isContextualDashboardEnabled}
          onValueChange={toggleContextualDashboard}
        />

        <Spacer height={theme.spacing.md} />

        <ToggleSetting
          label={translate("settings:metricSystemLabel")}
          subtitle={translate("settings:metricSystemSubtitle")}
          value={isMetricSystemEnabled}
          onValueChange={toggleMetricSystem}
        />

        <Spacer height={theme.spacing.md} />

        {/* Dashboard Content Selection */}
        {/* <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Content Settings
          </Text>
          <TouchableOpacity
            style={[styles.settingItem, styles.elevatedCard]}
            onPress={() => !isLoading && setShowContentPicker(true)}
            disabled={isLoading}
          >
            <View style={styles.settingTextContainer}>
              <Text style={styles.label}>
                Dashboard Content
              </Text>
              <Text style={styles.value}>
                Choose what additional content to display in your dashboard along with your notifications.
              </Text>
            </View>
            <View style={styles.selectedValueContainer}>
              {isLoading ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : (
                <>
                  <Text style={styles.selectedValue}>
                    {dashboardContentOptions.find(opt => opt.value === dashboardContent)?.label}
                  </Text>
                  <Icon name="chevron-right" size={16} color="#000000" />
                </>
              )}
            </View>
            {isUpdating && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="small" color="#007AFF" />
              </View>
            )}
          </TouchableOpacity>
        </View> */}

        <RouteButton
          label={translate("settings:adjustHeadAngleLabel")}
          subtitle={translate("settings:adjustHeadAngleSubtitle")}
          onPress={() => setHeadUpAngleComponentVisible(true)}
        />

        {renderContentPicker()}
        {headUpAngle !== null && (
          <HeadUpAngleComponent
            visible={headUpAngleComponentVisible}
            initialAngle={headUpAngle}
            onCancel={onCancelHeadUpAngle}
            onSave={onSaveHeadUpAngle}
          />
        )}
      </ScrollView>
    </Screen>
  )
}

const $sectionTitle: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  fontSize: 18,
  marginBottom: 8,
  marginTop: 20,
})

const $modalOverlay: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.background,
})

const $pickerContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.background,
})

const $pickerHeader: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.background,
})

const $pickerTitle: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
})

const $label: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
})

const $value: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.textDim,
})

// settingItem: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     padding: 16,
//   },
//   settingTextContainer: {
//     flex: 1,
//     paddingRight: 12,
//   },

const $settingItem: ThemedStyle<ViewStyle> = ({colors}) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  padding: 16,
  borderRadius: 12,
  marginBottom: 12,
  backgroundColor: colors.background,
})

const $settingTextContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  paddingRight: 12,
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#f9f9f9",
  },
  header: {
    padding: 20,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.1)",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    fontFamily: "Montserrat-Bold",
    color: "#333333",
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
    fontWeight: "600",
    marginBottom: 12,
    marginLeft: 4,
    color: "#333333",
  },
  elevatedCard: {
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  settingTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
    color: "#333333",
  },
  value: {
    fontSize: 14,
    lineHeight: 20,
    color: "#666666",
  },
  selectedValueContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectedValue: {
    fontSize: 16,
    marginRight: 4,
    color: "#333333",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  pickerContainer: {
    width: "90%",
    maxHeight: "80%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.1)",
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333333",
  },
  pickerOptionsContainer: {
    maxHeight: 400,
  },
  pickerOption: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.1)",
  },
  optionContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pickerOptionText: {
    fontSize: 16,
    flex: 1,
    color: "#333333",
  },
  selectedOption: {
    backgroundColor: "#007AFF",
  },
  selectedOptionText: {
    color: "#FFFFFF",
  },
  disabledItem: {
    opacity: 0.5,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
  },
  pickerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333333",
  },
  disabledButton: {
    opacity: 0.5,
  },
})
