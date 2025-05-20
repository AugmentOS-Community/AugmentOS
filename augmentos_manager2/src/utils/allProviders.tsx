import { SplashScreen } from "expo-router"
import "react-native-reanimated"
import { withWrappers, } from "@/utils/with-wrappers"
import { Suspense } from "react"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { StatusProvider } from "@/contexts/AugmentOSStatusProvider"
import { AppStatusProvider } from "@/contexts/AppStatusProvider"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { AuthProvider } from "@/contexts/AuthContext"

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync()


export const AllProviders = withWrappers(
  Suspense,
  KeyboardProvider,
  StatusProvider,
  AuthProvider,
  AppStatusProvider,
  GestureHandlerRootView,
)
