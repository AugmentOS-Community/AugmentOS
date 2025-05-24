import React, {useRef, useState, useCallback, useEffect} from "react"
import {View, StyleSheet, Text, ActivityIndicator, BackHandler} from "react-native"
import {WebView} from "react-native-webview"
import Config from "react-native-config"
import InternetConnectionFallbackComponent from "@/components/misc/InternetConnectionFallbackComponent"
import {SafeAreaView} from "react-native-safe-area-context"
import {RouteProp, useFocusEffect} from "@react-navigation/native"
import {RootStackParamList} from "@/components/misc/types"
import {useAppStatus} from "@/contexts/AppStatusProvider"
import {useAppStoreWebviewPrefetch} from "@/contexts/AppStoreWebviewPrefetchProvider"
import {useAppTheme} from "@/utils/useAppTheme"
import {useLocalSearchParams} from "expo-router"

// Define package name for the store webview
const STORE_PACKAGE_NAME = "org.augmentos.store"

export default function AppStoreWeb() {
  const [webviewLoading, setWebviewLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  // const packageName = route?.params?.packageName;
  const {packageName} = useLocalSearchParams()
  const [canGoBack, setCanGoBack] = useState(false)
  const {
    appStoreUrl,
    webviewLoading: prefetchedWebviewLoading,
    webViewRef: prefetchedWebviewRef,
  } = useAppStoreWebviewPrefetch()
  const {refreshAppStatus} = useAppStatus()
  const {theme, themed} = useAppTheme()
  const isDarkTheme = theme.isDark

  // Theme colors
  const theme2 = {
    backgroundColor: isDarkTheme ? "#1c1c1c" : "#f9f9f9",
    headerBg: isDarkTheme ? "#333333" : "#fff",
    textColor: isDarkTheme ? "#FFFFFF" : "#333333",
    secondaryTextColor: isDarkTheme ? "#aaaaaa" : "#777777",
    borderColor: isDarkTheme ? "#444444" : "#e0e0e0",
    buttonBg: isDarkTheme ? "#444444" : "#eeeeee",
    buttonTextColor: isDarkTheme ? "#ffffff" : "#333333",
    primaryColor: "#0088FF",
  }

  // Handle WebView loading events
  const handleLoadStart = () => setWebviewLoading(true)
  const handleLoadEnd = () => setWebviewLoading(false)
  const handleError = () => {
    setWebviewLoading(false)
    setHasError(true)
  }

  // Handle Android back button press
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (prefetchedWebviewRef.current && canGoBack) {
          prefetchedWebviewRef.current.goBack()
          return true // Prevent default back action
        }
        return false // Allow default back action (close screen)
      }

      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress)

      return () => subscription.remove() // Cleanup listener on blur
    }, [canGoBack, prefetchedWebviewRef]), // Re-run effect if canGoBack or ref changes
  )

  // propagate any changes in app lists when this screen is unmounted:
  useFocusEffect(
    useCallback(() => {
      return async () => {
        await refreshAppStatus()
      }
    }, []),
  )

  // Show loading state while getting the URL
  if (!appStoreUrl) {
    return (
      <View style={[styles.loadingOverlay, {backgroundColor: "#fff"}]}>
        <ActivityIndicator size="large" color={theme2.primaryColor} />
        <Text style={[styles.loadingText, {color: theme2.textColor}]}>Preparing App Store...</Text>
      </View>
    )
  }

  // If the prefetched WebView is ready, show it in the correct style
  return (
    <SafeAreaView style={{flex: 1}}>
      {hasError ? (
        <InternetConnectionFallbackComponent retry={() => setHasError(false)} />
      ) : (
        <View style={styles.webViewContainer}>
          {/* Show the prefetched WebView, but now visible and full size */}
          <WebView
            ref={prefetchedWebviewRef}
            source={{uri: appStoreUrl}}
            style={styles.webView}
            onLoadStart={() => setWebviewLoading(true)}
            onLoadEnd={() => setWebviewLoading(false)}
            onError={handleError}
            onNavigationStateChange={navState => setCanGoBack(navState.canGoBack)}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            renderLoading={() => (
              <View style={[styles.loadingOverlay, {backgroundColor: "#fff"}]}>
                <ActivityIndicator size="large" color={theme2.primaryColor} />
                <Text style={[styles.loadingText, {color: theme2.textColor}]}>Loading App Store...</Text>
              </View>
            )}
          />
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    fontFamily: "Montserrat-Regular",
  },
})
