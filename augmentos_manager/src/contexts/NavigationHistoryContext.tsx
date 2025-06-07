import React, {createContext, useCallback, useContext, useEffect, useRef} from "react"
import {useFocusEffect, usePathname, useSegments} from "expo-router"
import {router} from "expo-router"
import {BackHandler} from "react-native"

interface NavigationHistoryContextType {
  goBack: () => void
  getHistory: () => string[]
  clearHistory: () => void
  push: (path: string) => void
  replace: (path: string, params?: any) => void
}

const NavigationHistoryContext = createContext<NavigationHistoryContextType | undefined>(undefined)

export function NavigationHistoryProvider({children}: {children: React.ReactNode}) {
  const historyRef = useRef<string[]>([])
  const pathname = usePathname()
  const segments = useSegments()

  useEffect(() => {
    // Add current path to history if it's different from the last entry
    const lastPath = historyRef.current[historyRef.current.length - 1]
    if (pathname !== lastPath) {
      historyRef.current.push(pathname)

      // Keep history limited to prevent memory issues (keep last 20 entries)
      if (historyRef.current.length > 20) {
        historyRef.current = historyRef.current.slice(-20)
      }
    }
  }, [pathname])

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (segments.length > 0 && segments[0] != "(tabs)") {
          goBack()
        }
        return true
      }

      BackHandler.addEventListener("hardwareBackPress", onBackPress)

      return () => BackHandler.removeEventListener("hardwareBackPress", onBackPress)
    }, [pathname, segments]),
  )

  const goBack = () => {
    const history = historyRef.current

    // Remove current path
    history.pop()

    // Get previous path
    const previousPath = history[history.length - 1]

    if (previousPath) {
      // Fallback to direct navigation if router.back() fails
      router.replace(previousPath as any)
    } else if (router.canGoBack()) {
      router.back()
    } else {
      // Ultimate fallback to home tab
      router.replace("/(tabs)/home")
    }
  }

  const push = (path: string) => {
    historyRef.current.push(path)

    router.push(path as any)
  }

  const replace = (path: string, params?: any) => {
    historyRef.current.pop()
    historyRef.current.push(path)
    router.replace({pathname: path as any, params: params as any})
  }

  const getHistory = () => {
    return [...historyRef.current]
  }

  const clearHistory = () => {
    historyRef.current = []
  }

  return (
    <NavigationHistoryContext.Provider value={{goBack, getHistory, clearHistory, push, replace}}>
      {children}
    </NavigationHistoryContext.Provider>
  )
}

export function useNavigationHistory() {
  const context = useContext(NavigationHistoryContext)
  if (context === undefined) {
    throw new Error("useNavigationHistory must be used within a NavigationHistoryProvider")
  }
  return context
}
