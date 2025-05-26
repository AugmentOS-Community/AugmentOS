import {useEffect, useState} from "react"
import {Slot, SplashScreen} from "expo-router"

import {useFonts} from "@expo-google-fonts/space-grotesk"
import {customFontsToLoad, ThemedStyle} from "@/theme"
import {initI18n} from "@/i18n"
import {loadDateFnsLocale} from "@/utils/formatDate"
import {useAppTheme, useThemeProvider} from "@/utils/useAppTheme"
import {AllProviders} from "@/utils/allProviders"
import CoreCommunicator from "@/bridge/CoreCommunicator"
import {View, ViewStyle} from "react-native"
import {LinearGradient} from "expo-linear-gradient"

SplashScreen.preventAutoHideAsync()

if (__DEV__) {
  // Load Reactotron configuration in development. We don't want to
  // include this in our production bundle, so we are using `if (__DEV__)`
  // to only execute this in development.
  require("src/devtools/ReactotronConfig.ts")
}

export {ErrorBoundary} from "@/components/ErrorBoundary/ErrorBoundary"

export default function Root() {
  const [fontsLoaded, fontError] = useFonts(customFontsToLoad)
  const [isI18nInitialized, setIsI18nInitialized] = useState(false)
  const {themeScheme, setThemeContextOverride, ThemeProvider} = useThemeProvider()
  const {themed, theme} = useAppTheme()
  
  useEffect(() => {
    initI18n()
      .then(() => setIsI18nInitialized(true))
      .then(() => loadDateFnsLocale())
  }, [])

  const loaded = fontsLoaded && isI18nInitialized

  useEffect(() => {
    if (fontError) throw fontError
  }, [fontError])

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync()
    }
  }, [loaded])


  if (!loaded) {
    return null
  }


  return (
    <ThemeProvider value={{themeScheme, setThemeContextOverride}}>
      <AllProviders>
        <View style={{flex: 1}}>
          <LinearGradient
            colors={theme.isDark ? ["#090A14", "#080D33"] : ["#FFA500", "#FFF5E6"]}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
            }}
            start={{x: 0, y: 1}}
            end={{x: 0, y: 0}}
          >
            <Slot />
          </LinearGradient>
        </View>
      </AllProviders>
    </ThemeProvider>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors}) => ({
  flex: 1,
  backgroundColor: colors.background,
})
