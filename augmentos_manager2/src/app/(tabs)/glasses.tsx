import React, {useRef, useCallback, PropsWithChildren, useState, useEffect} from "react"
import {View, StyleSheet, Animated, Platform, ActivityIndicator, ViewStyle, TextStyle} from "react-native"
import {useNavigation, useFocusEffect, useRoute} from "@react-navigation/native"
import type {NavigationProp} from "@react-navigation/native"
import {Header, Text, Screen} from "@/components/ignite"
import ConnectedDeviceInfo from "@/components/misc/ConnectedDeviceInfo"
import ConnectedSimulatedGlassesInfo from "@/components/misc/ConnectedSimulatedGlassesInfo"
import RunningAppsList from "@/components/misc/RunningAppsList"
import YourAppsList from "@/components/misc/YourAppsList"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import {useAppStatus} from "@/contexts/AppStatusProvider"
// import {ScrollView} from 'react-native-gesture-handler';
import BackendServerComms from "@/backend_comms/BackendServerComms"
import semver from "semver"
import {Config} from "react-native-config"
import CloudConnection from "@/components/misc/CloudConnection"
import {loadSetting, saveSetting} from "@/utils/SettingsHelper"

import SensingDisabledWarning from "@/components/misc/SensingDisabledWarning"
import {SETTINGS_KEYS} from "@/consts"
import NonProdWarning from "@/components/misc/NonProdWarning"
import {ScrollView} from "react-native-gesture-handler"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import DeviceSettings from "@/components/glasses/DeviceSettings"

interface AnimatedSectionProps extends PropsWithChildren {
  delay?: number
}

export default function Homepage() {
  const navigation = useNavigation<NavigationProp<any>>()
  const {appStatus, refreshAppStatus} = useAppStatus()
  const {status} = useStatus()
  const [isSimulatedPuck, setIsSimulatedPuck] = React.useState(false)
  const [isCheckingVersion, setIsCheckingVersion] = useState(false)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [nonProdBackend, setNonProdBackend] = useState(false)
  const route = useRoute()

  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(-50)).current
  const {themed, theme} = useAppTheme()

  // Reset loading state when connection status changes
  useEffect(() => {
    if (status.core_info.cloud_connection_status === "CONNECTED") {
      setIsInitialLoading(true)
      const timer = setTimeout(() => {
        setIsInitialLoading(false)
      }, 10000)
      return () => clearTimeout(timer)
    }
  }, [status.core_info.cloud_connection_status])

  const checkNonProdBackend = async () => {
    const url = await loadSetting(SETTINGS_KEYS.CUSTOM_BACKEND_URL, null)
    setNonProdBackend(url && !url.includes("prod.augmentos.cloud") && !url.includes("global.augmentos.cloud"))
  }

  // Clear loading state if apps are loaded
  useEffect(() => {
    if (appStatus.length > 0) {
      setIsInitialLoading(false)
    }
  }, [appStatus.length])

  // Get local version from env file
  const getLocalVersion = () => {
    try {
      const version = Config.AUGMENTOS_VERSION
      console.log("Local version from env:", version)
      return version || null
    } catch (error) {
      console.error("Error getting local version:", error)
      return null
    }
  }

  // Check cloud version and navigate if needed
  const checkCloudVersion = async () => {
    if (isCheckingVersion) return
    setIsCheckingVersion(true)

    try {
      // Check if version checks are being ignored this session
      const ignoreCheck = await loadSetting("ignoreVersionCheck", false)
      if (ignoreCheck) {
        console.log("Version check skipped due to user preference")
        setIsCheckingVersion(false)
        return
      }

      const backendComms = BackendServerComms.getInstance()
      const localVer = getLocalVersion()

      if (!localVer) {
        console.error("Failed to get local version from env file")
        // Navigate to update screen with connection error
        // navigation.navigate("VersionUpdateScreen", {
        //   isDarkTheme,
        //   connectionError: true,
        // })
        setIsCheckingVersion(false)
        return
      }

      // Call the endpoint to get cloud version
      await backendComms.restRequest("/apps/version", null, {
        onSuccess: data => {
          const cloudVer = data.version
          console.log(`Comparing local version (${localVer}) with cloud version (${cloudVer})`)

          // Compare versions using semver
          if (semver.lt(localVer, cloudVer)) {
            console.log("A new version is available. Navigate to update screen.")
            // Navigate to update screen with version mismatch
            // navigation.navigate("VersionUpdateScreen", {
            //   isDarkTheme,
            //   localVersion: localVer,
            //   cloudVersion: cloudVer,
            // })
          } else {
            console.log("Local version is up-to-date.")
            // Stay on homepage, no navigation needed
          }
          setIsCheckingVersion(false)
        },
        onFailure: errorCode => {
          console.error("Failed to fetch cloud version:", errorCode)
          // Navigate to update screen with connection error
          // navigation.navigate("VersionUpdateScreen", {
          //   isDarkTheme,
          //   connectionError: true,
          // })
          setIsCheckingVersion(false)
        },
      })
      // console.log('Version check completed');
    } catch (error) {
      console.error("Error checking cloud version:", error)
      // Navigate to update screen with connection error
      // navigation.navigate("VersionUpdateScreen", {
      //   isDarkTheme,
      //   connectionError: true,
      // })
      setIsCheckingVersion(false)
    }
  }

  // Check version once on mount
  useEffect(() => {
    if (Platform.OS == "android") {
      checkCloudVersion()
    }
  }, [])

  // Simple animated wrapper so we do not duplicate logic
  const AnimatedSection: React.FC<AnimatedSectionProps> = useCallback(
    ({children}) => (
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{translateY: slideAnim}],
        }}>
        {children}
      </Animated.View>
    ),
    [fadeAnim, slideAnim],
  )

  useFocusEffect(
    useCallback(() => {
      checkNonProdBackend()

      // Reset animations when screen is about to focus
      fadeAnim.setValue(0)
      slideAnim.setValue(-50)

      // Start animations after a short delay
      const animationTimeout = setTimeout(() => {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ]).start()
      }, 50)

      return () => {
        clearTimeout(animationTimeout)
        fadeAnim.setValue(0)
        slideAnim.setValue(-50)
      }
    }, [fadeAnim, slideAnim]),
  )

  return (
    <Screen preset="auto" style={{paddingHorizontal: 20}}>
      <AnimatedSection>
        <Header leftTx="glasses:title" />
      </AnimatedSection>
      {/* <ScrollView
        style={{flex: 1, paddingHorizontal: 16}}
        contentContainerStyle={{paddingBottom: 0, flexGrow: 1}} // Force content to fill available space
      > */}
      {status.core_info.cloud_connection_status !== "CONNECTED" && (
        <AnimatedSection>
          <CloudConnection />
        </AnimatedSection>
      )}

      <View style={{flex: 1}}>
        <AnimatedSection>
          {/* Use the simulated version if we're connected to simulated glasses */}
          {status.glasses_info?.model_name && status.glasses_info.model_name.toLowerCase().includes("simulated") ? (
            <ConnectedSimulatedGlassesInfo isDarkTheme={theme.isDark} />
          ) : (
            <ConnectedDeviceInfo />
          )}
        </AnimatedSection>
      </View>

      {/* Device Settings */}
      <DeviceSettings />
    </Screen>
  )
}

const $contentContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  paddingBottom: 0,
  flexGrow: 1,
})

const $noAppsContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
})

const $noAppsText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.text,
  textAlign: "center",
})

const $loadingContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
})

const $loadingText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.text,
  textAlign: "center",
})
