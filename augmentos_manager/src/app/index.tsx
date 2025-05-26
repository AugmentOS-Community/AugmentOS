// app/index.js

import {router} from "expo-router"
import {useEffect} from "react"
import {supabase} from "@/supabase/supabaseClient"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import {useAuth} from "@/contexts/AuthContext"

// useEffect(() => {
//   console.log('Initializing CoreCommunicator2');
//   CoreCommunicator.initialize();
// }, []);

export default function IndexPage() {
  const {user, loading} = useAuth()
  const {status, initializeCoreConnection} = useStatus()

  useEffect(() => {
    const initializeApp = async () => {

      /*
      The purpose of SplashScreen is to route the user wherever the user needs to be
      If they're not logged in => login screen
      If they're logged in, but no perms => perm screen
      If they're logged in + perms => SimulatedPucK setup
      */
      if (!user) {
        router.replace("/(auth)/login")
        return
      }

      // We're now skipping the Grant Permissions screen completely
      // Optional permissions will be handled via the Additional Permissions screen
      // accessed through the alert icon on the homepage

      initializeCoreConnection()

      // router.replace("/(tabs)/home")

      router.replace('/(auth)/core-token-exchange');
    }

    if (!loading) {
      initializeApp()
    }
  }, [user, loading, status, initializeCoreConnection])

  // this component doesn't render anything, it's just used to initialize the app
  return null
}
