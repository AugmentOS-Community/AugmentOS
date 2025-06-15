import React, {useState, useEffect} from "react"
import {View, TouchableOpacity, ScrollView, ViewStyle, TextStyle, Platform, Modal, ActivityIndicator} from "react-native"
import {FontAwesome} from "@expo/vector-icons"
import {Screen, Header, Icon, Text} from "@/components/ignite"
import {router} from "expo-router"
import {spacing, ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {translate} from "@/i18n"

import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import coreCommunicator from "@/bridge/CoreCommunicator"
import showAlert from "@/utils/AlertUtils"
import {useAuth} from "@/contexts/AuthContext"
import RouteButton from "@/components/ui/RouteButton"
import ActionButton from "@/components/ui/ActionButton"
import {Spacer} from "@/components/misc/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {isMentraUser} from "@/utils/isMentraUser"

export default function SettingsPage() {
  const {status} = useStatus()
  const {logout, user} = useAuth()
  const {theme} = useAppTheme()
  const {push, replace} = useNavigationHistory()
  const [showDeveloperSettings, setShowDeveloperSettings] = useState(true)
  const [isSigningOut, setIsSigningOut] = useState(false)
  
  // Check if user is from Mentra to show theme settings
  const isUserFromMentra = isMentraUser(user?.email)

  useEffect(() => {
    // Show developer settings on Android, or on iOS if it's TestFlight/Dev build
    if (Platform.OS === 'android') {
      setShowDeveloperSettings(true)
    } else {
      setShowDeveloperSettings(__DEV__)
    }
  }, [])

  const handleSignOut = async () => {
    try {
      console.log("Settings: Starting sign-out process")
      setIsSigningOut(true)
      
      await logout()

      console.log("Settings: Logout completed, navigating to login")
      
      // Navigate to Login screen directly instead of SplashScreen
      // This ensures we skip the SplashScreen logic that might detect stale user data
      replace("/")
    } catch (err) {
      console.error("Settings: Error during sign-out:", err)
      setIsSigningOut(false)
      
      // Show user-friendly error but still navigate to login to prevent stuck state
      showAlert(
        translate("common:error"),
        translate("settings:signOutError"),
        [
          {
            text: translate("common:ok"),
            onPress: () => replace("/")
          }
        ]
      )
    }
  }

  const confirmSignOut = () => {
    showAlert(
      translate("settings:signOut"),
      translate("settings:signOutConfirm"),
      [
        {text: translate("common:cancel"), style: "cancel"},
        {text: translate("common:yes"), onPress: handleSignOut},
      ],
      {cancelable: false},
    )
  }

  return (
    <Screen preset="scroll" style={{paddingHorizontal: theme.spacing.lg}}>
      <Header leftTx="settings:title" />

      <Spacer height={theme.spacing.xl} />

      <RouteButton label={translate("settings:profileSettings")} onPress={() => push("/settings/profile")} />

      <Spacer height={theme.spacing.md} />

      <RouteButton label={translate("settings:privacySettings")} onPress={() => push("/settings/privacy")} />

      {isUserFromMentra && (
        <>
          <Spacer height={theme.spacing.md} />
          
          <RouteButton
            label="Theme Settings"
            onPress={() => push("/settings/theme")}
          />
        </>
      )}

      {showDeveloperSettings && (
        <>
          <Spacer height={theme.spacing.md} />
          
          <RouteButton
            label={translate("settings:developerSettings")}
            // subtitle={translate("settings:developerSettingsSubtitle")}
            onPress={() => push("/settings/developer")}
          />
        </>
      )}

      <Spacer height={theme.spacing.md} />

      <ActionButton
        label={translate("settings:signOut")}
        variant="destructive"
        onPress={confirmSignOut}
      />

      {/* Loading overlay for sign out */}
      <Modal
        visible={isSigningOut}
        transparent={true}
        animationType="fade"
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <View style={{
            backgroundColor: theme.colors.background,
            padding: theme.spacing.xl,
            borderRadius: theme.spacing.md,
            alignItems: 'center',
            minWidth: 200
          }}>
            <ActivityIndicator
              size="large"
              color={theme.colors.primary}
              style={{marginBottom: theme.spacing.md}}
            />
            <Text
              preset="bold"
              style={{color: theme.colors.text}}
            >
              We're logging you out...
            </Text>
          </View>
        </View>
      </Modal>
    </Screen>
  )
}
