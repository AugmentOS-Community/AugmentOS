import React, {useState, useEffect} from "react"
import {View, Text, StyleSheet, Switch, ScrollView, Alert, Platform, Button, ViewStyle, TextStyle} from "react-native"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import coreCommunicator from "@/bridge/CoreCommunicator"
import {Slider} from "react-native-elements"
import {Header, Screen} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {router} from "expo-router"

const parseBrightness = (brightnessStr: string | null | undefined): number => {
  if (typeof brightnessStr === "number") {
    return brightnessStr
  }
  if (!brightnessStr || brightnessStr.includes("-")) {
    return 50
  }
  const parsed = parseInt(brightnessStr.replace("%", ""), 10)
  return isNaN(parsed) ? 50 : parsed
}

export default function ScreenSettingsScreen() {
  const {status} = useStatus()

  // -- States --
  const [brightness, setBrightness] = useState<number | null>(null)
  const [isAutoBrightnessEnabled, setIsAutoBrightnessEnabled] = useState(status.glasses_settings.auto_brightness)
  const [depth, setDepth] = useState<number | null>(null)
  const [height, setHeight] = useState<number | null>(null)
  const {themed} = useAppTheme()

  // -- Effects --
  useEffect(() => {
    setBrightness(status.glasses_settings.brightness)
  }, [status.glasses_settings.brightness])

  useEffect(() => {
    setIsAutoBrightnessEnabled(status.glasses_settings.auto_brightness)
  }, [status.glasses_settings.auto_brightness])

  useEffect(() => {
    setDepth(status.glasses_settings.depth)
  }, [status.glasses_settings.depth])

  useEffect(() => {
    setHeight(status.glasses_settings.dashboard_height)
  }, [status.glasses_settings.dashboard_height])

  // -- Handlers --
  const changeBrightness = async (newBrightness: number) => {
    // if (!status.glasses_info) {
    //   showAlert('Glasses not connected', 'Please connect your smart glasses first.');
    //   return;
    // }

    if (newBrightness == null) {
      return
    }

    // if (status.glasses_settings.brightness === '-') { return; } // or handle accordingly
    await coreCommunicator.setGlassesBrightnessMode(newBrightness, false)
    setBrightness(newBrightness)
  }

  const changeDepth = async (newDepth: number) => {
    await coreCommunicator.setGlassesDepth(newDepth)
    setDepth(newDepth)
  }

  const changeHeight = async (newHeight: number) => {
    await coreCommunicator.setGlassesDashboardHeight(newHeight)
    setHeight(newHeight)
  }

  const toggleAutoBrightness = async () => {
    const newVal = !isAutoBrightnessEnabled
    await coreCommunicator.setGlassesBrightnessMode(brightness ?? 50, newVal)
    setIsAutoBrightnessEnabled(newVal)
  }

  // Switch track colors
  const switchColors = {
    trackColor: {
      false: "#666666",
      true: "#2196F3",
    },
    thumbColor: Platform.OS === "ios" ? undefined : "#FFFFFF",
    ios_backgroundColor: "#666666",
  }

  // Fixed slider props to avoid warning
  const sliderProps = {
    style: [styles.slider],
    minimumValue: 0,
    maximumValue: 100,
    step: 1,
    onSlidingComplete: (value: number) => changeBrightness(value),
    value: brightness ?? 50,
    minimumTrackTintColor: styles.minimumTrackTintColor.color,
    maximumTrackTintColor: styles.maximumTrackTintColorDark.color,
    thumbTintColor: styles.thumbTintColor.color,
    // Using inline objects instead of defaultProps
    thumbTouchSize: {width: 40, height: 40},
    trackStyle: {height: 5},
    thumbStyle: {height: 20, width: 20},
  }

  const depthSliderProps = {
    style: [styles.slider],
    minimumValue: 1,
    maximumValue: 5,
    step: 1,
    onSlidingComplete: (value: number) => changeDepth(value),
    value: depth ?? 5,
    minimumTrackTintColor: styles.minimumTrackTintColor.color,
    maximumTrackTintColor: styles.maximumTrackTintColorDark.color,
    thumbTintColor: styles.thumbTintColor.color,
    // Using inline objects instead of defaultProps
    thumbTouchSize: {width: 40, height: 40},
    trackStyle: {height: 5},
    thumbStyle: {height: 20, width: 20},
  }

  const heightSliderProps = {
    style: [styles.slider],
    minimumValue: 1,
    maximumValue: 8,
    step: 1,
    onSlidingComplete: (value: number) => changeHeight(value),
    value: height ?? 4,
    minimumTrackTintColor: styles.minimumTrackTintColor.color,
    maximumTrackTintColor: styles.maximumTrackTintColorDark.color,
    thumbTintColor: styles.thumbTintColor.color,
    // Using inline objects instead of defaultProps
    thumbTouchSize: {width: 40, height: 40},
    trackStyle: {height: 5},
    thumbStyle: {height: 20, width: 20},
  }

  return (
    <Screen preset="scroll" style={{paddingHorizontal: 16}}>
      <Header titleTx="screenSettings:title" leftIcon="caretLeft" onLeftPress={() => router.back()} />
      {/* Auto Brightness */}
      <View style={styles.settingItem}>
        <View style={styles.settingTextContainer}>
          <Text style={themed($label)}>Auto Brightness</Text>
          {status.glasses_info?.model_name && (
            <Text style={[styles.value, styles.darkSubtext]}>
              Automatically adjust the brightness of your smart glasses based on the ambient light.
            </Text>
          )}
        </View>
        <Switch
          value={isAutoBrightnessEnabled}
          onValueChange={toggleAutoBrightness}
          trackColor={switchColors.trackColor}
          thumbColor={switchColors.thumbColor}
          ios_backgroundColor={switchColors.ios_backgroundColor}
        />
      </View>

      {/* Brightness Slider */}
      {!isAutoBrightnessEnabled && (
        <View style={styles.settingItem}>
          <View style={styles.settingTextContainer}>
            <Text style={themed($label)}>Brightness</Text>
            <Text style={[styles.value, styles.darkSubtext]}>
              {"Adjust the brightness level of your smart glasses."}
            </Text>
            <Slider {...sliderProps} />
          </View>
        </View>
      )}

      <View style={styles.settingItem}>
        <View style={styles.settingTextContainer}>
          <Text style={themed($label)}>Depth</Text>
          <Text style={[styles.value, styles.darkSubtext]}>{"Adjust the depth of the contextual dashboard."}</Text>
          <Slider {...depthSliderProps} />
        </View>
      </View>

      <View style={styles.settingItem}>
        <View style={styles.settingTextContainer}>
          <Text style={themed($label)}>Dashboard Height</Text>
          <Text style={[styles.value, styles.darkSubtext]}>{"Adjust the height of the contextual dashboard."}</Text>
          <Slider {...heightSliderProps} />
        </View>
      </View>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.background,
})

const $label: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  fontSize: 16,
  flexWrap: "wrap",
})

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
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
    backgroundColor: "#333333",
  },
  titleContainerLight: {
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    fontFamily: "Montserrat-Bold",
    textAlign: "left",
    color: "#FFFFFF",
    marginBottom: 5,
  },
  darkBackground: {
    backgroundColor: "#1c1c1c",
  },
  lightBackground: {
    backgroundColor: "#f0f0f0",
  },
  darkText: {
    color: "black",
  },
  lightText: {
    color: "white",
  },
  darkSubtext: {
    color: "#666666",
  },
  lightSubtext: {
    color: "#999999",
  },
  darkIcon: {
    color: "#333333",
  },
  lightIcon: {
    color: "#666666",
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 20,
    borderBottomColor: "#333",
    borderBottomWidth: 1,
  },
  settingTextContainer: {
    flex: 1,
    paddingRight: 10,
  },
  value: {
    fontSize: 12,
    marginTop: 5,
    flexWrap: "wrap",
  },
  disabledItem: {
    opacity: 0.4,
  },
  slider: {
    width: "100%",
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
    color: "#2196F3",
  },
  maximumTrackTintColorDark: {
    color: "#666666",
  },
  maximumTrackTintColorLight: {
    color: "#D1D1D6",
  },
  thumbTintColor: {
    color: "#FFFFFF",
  },
})
