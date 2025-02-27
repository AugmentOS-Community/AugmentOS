import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusProvider } from './providers/AugmentOSStatusProvider.tsx';
import Homepage from './screens/Homepage';
import SettingsPage from './screens/SettingsPage';
// import IntroScreen from './screens/IntroScreen';
import RegisterScreen from './screens/RegisterScreen';
import ProfileSettingsPage from './screens/ProfileSettingsPage';
import GlassesMirror from './screens/GlassesMirror';
import NotificationListener from './components/NotificationListener';
import AppStore from './screens/AppStore';
import AppDetails from './screens/AppDetails';
import Reviews from './screens/ReviewSection.tsx';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { AppStoreItem, RootStackParamList } from './components/types'; // Update path as needed
import MessageBanner from './components/MessageBanner.tsx';
import SimulatedPuckSettings from './screens/SimulatedPuckSettings.tsx';
import SimulatedPuckOnboard from './screens/SimulatedPuckOnboard.tsx';
import SelectGlassesModelScreen from './screens/SelectGlassesModelScreen.tsx';
import GlassesPairingGuideScreen from './screens/GlassesPairingGuideScreen.tsx';
import SelectGlassesBluetoothScreen from './screens/SelectGlassesBluetoothScreen.tsx';
import PhoneNotificationSettings from './screens/PhoneNotificationSettings.tsx';
import { SearchResultsProvider } from './providers/SearchResultsContext.tsx';
import AppSettings from './screens/AppSettings.tsx';
import LoginScreen from './screens/LoginScreen.tsx';
import SplashScreen from './screens/SplashScreen.tsx';
import 'react-native-url-polyfill/auto';
import { AuthProvider } from './AuthContext.tsx';
import VerifyEmailScreen from './screens/VerifyEmail.tsx';
import PrivacySettingsScreen from './screens/PrivacySettingsScreen.tsx';
import GrantPermissionsScreen from './screens/GrantPermissionsScreen.tsx';
import ConnectingToPuckComponent from './components/ConnectingToPuckComponent.tsx';
import VersionUpdateScreen from './screens/VersionUpdateScreen.tsx';
import { GlassesMirrorProvider } from './providers/GlassesMirrorContext.tsx';

const linking = {
  prefixes: ['https://augmentos.org'],
  config: {
    screens: {
      VerifyEmailScreen: 'verify_email',
      Home: 'Home',
      // Add other screens as needed
    },
  },
};

// Assign the RootStackParamList to the navigator
const Stack = createNativeStackNavigator<RootStackParamList>();

const App: React.FC = () => {
  const [isDarkTheme, setIsDarkTheme] = useState(false);

  const toggleTheme = () => {
    setIsDarkTheme(prevTheme => !prevTheme);
  };

  const navigationRef = useNavigationContainerRef();


  return (
    <GestureHandlerRootView style={styles.container}>
      {/* <NotificationListener> TODO: ios */}
        <AuthProvider>
        <StatusProvider>
          <SearchResultsProvider>
            <GlassesMirrorProvider>
            <MessageBanner />
            <NavigationContainer linking={linking}>
              <Stack.Navigator initialRouteName="Home">
                <Stack.Screen
                  name="SplashScreen"
                  component={SplashScreen}
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="Login"
                  component={LoginScreen}
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="VerifyEmailScreen"
                  component={VerifyEmailScreen}
                  options={{ headerShown: false }}
                />

                <Stack.Screen
                  name="VersionUpdateScreen"
                  component={VersionUpdateScreen}
                  options={{
                    headerShown: false,
                    // Optional: prevent going back with hardware back button on Android
                    gestureEnabled: false,
                  }}
                />

                <Stack.Screen name="Home" options={{ headerShown: false }}>
                  {() => (
                    <Homepage
                      isDarkTheme={isDarkTheme}
                      toggleTheme={toggleTheme}
                    />
                  )}
                </Stack.Screen>

              <Stack.Screen name="ConnectingToPuck" options={{ headerShown: false }}>
                {() => (
                  <ConnectingToPuckComponent
                    isDarkTheme={isDarkTheme}
                    toggleTheme={toggleTheme}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen
                name="Register"
                component={RegisterScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen name="SettingsPage" options={{ headerShown: false }}>
                {props => (
                  <SettingsPage
                    {...props}
                    isDarkTheme={isDarkTheme}
                    toggleTheme={toggleTheme}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="PrivacySettingsScreen"
                options={{ title: 'Privacy Settings' }}
              >
                {props => (
                  <PrivacySettingsScreen
                    {...props}
                    toggleTheme={toggleTheme}
                    isDarkTheme={isDarkTheme}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="GrantPermissionsScreen"
                options={{ title: 'Grant Permissions' }}
              >
                {props => (
                  <GrantPermissionsScreen
                    {...props}
                    toggleTheme={toggleTheme}
                    isDarkTheme={isDarkTheme}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="AppStore"
                options={{ title: 'App Store', headerShown: false }}>
                {props => <AppStore {...props} isDarkTheme={isDarkTheme} />}
              </Stack.Screen>
              <Stack.Screen
                name="Reviews"
                options={({ route }) => ({
                  headerShown: false,

                  title: route.params.appName
                    ? `Reviews for ${route.params.appName}`
                    : 'Reviews',
                  headerStyle: {
                    backgroundColor: isDarkTheme ? '#333333' : '#FFFFFF',
                  },
                  headerTintColor: isDarkTheme ? '#FFFFFF' : '#000000',
                })}>
                {props => <Reviews {...props} isDarkTheme={isDarkTheme} />}
              </Stack.Screen>

                <Stack.Screen
                  name="AppDetails"
                  options={({ route }) => ({
                    headerShown: false,
                    title: route.params.app.name || 'App Details',
                    headerStyle: {
                      backgroundColor: isDarkTheme ? '#333333' : '#FFFFFF',
                    },
                    headerTintColor: isDarkTheme ? '#FFFFFF' : '#000000',
                    headerTitleStyle: {
                      color: isDarkTheme ? '#FFFFFF' : '#000000',
                    },
                  })}>
                  {props => <AppDetails toggleTheme={function (): void {
                    throw new Error('Function not implemented.');
                  }} {...props} isDarkTheme={isDarkTheme} />}
                </Stack.Screen>
                <Stack.Screen
                  name="ProfileSettings"
                  options={{
                    headerShown: false,
                    title: 'Profile Settings',
                    headerStyle: {
                      backgroundColor: isDarkTheme ? '#000000' : '#ffffff',
                    },
                    headerTintColor: isDarkTheme ? '#ffffff' : '#000000',
                  }}>
                  {props => (
                    <ProfileSettingsPage {...props} isDarkTheme={isDarkTheme} />
                  )}
                </Stack.Screen>
                <Stack.Screen
                  name="GlassesMirror"
                  options={{
                    headerShown: false,
                    title: 'Glasses Mirror',
                    headerStyle: {
                      backgroundColor: isDarkTheme ? '#000000' : '#ffffff',
                    },
                    headerTintColor: isDarkTheme ? '#ffffff' : '#000000',
                  }}>
                  {() => <GlassesMirror isDarkTheme={isDarkTheme} />}
                </Stack.Screen>
                <Stack.Screen name="SimulatedPuckSettings"
                  options={{
                    title: 'Simulated Puck',
                    headerStyle: {
                      backgroundColor: isDarkTheme ? '#000000' : '#ffffff',
                    },
                    headerTintColor: isDarkTheme ? '#ffffff' : '#000000',
                  }}>
                  {props => (
                    <SimulatedPuckSettings
                      {...props}
                      toggleTheme={toggleTheme}
                      isDarkTheme={isDarkTheme}
                    />
                  )}
                </Stack.Screen>
                <Stack.Screen name="SimulatedPuckOnboard"
                  options={{
                    title: 'Simulated Puck',
                    headerShown: false,
                    headerStyle: {
                      backgroundColor: isDarkTheme ? '#000000' : '#ffffff',
                    },
                    headerTintColor: isDarkTheme ? '#ffffff' : '#000000',
                  }}>
                  {props => (
                    <SimulatedPuckOnboard
                      {...props}
                      toggleTheme={toggleTheme}
                      isDarkTheme={isDarkTheme}
                    />
                  )}
                </Stack.Screen>
                <Stack.Screen name="AppSettings"
                  options={({ route }) => ({
                    title: route.params?.appName + ' Settings',
                    headerStyle: {
                      backgroundColor: isDarkTheme ? '#000000' : '#ffffff',
                    },
                    headerTintColor: isDarkTheme ? '#ffffff' : '#000000',
                  })}>
                  {props => (
                    <AppSettings
                      {...props}
                      toggleTheme={toggleTheme}
                      isDarkTheme={isDarkTheme}
                    />
                  )}
                </Stack.Screen>
                <Stack.Screen name="PhoneNotificationSettings"
                  options={{
                    title: 'Notifications',
                    headerStyle: {
                      backgroundColor: isDarkTheme ? '#000000' : '#ffffff',
                    },
                    headerTintColor: isDarkTheme ? '#ffffff' : '#000000',
                  }}>
                  {props => (
                    <PhoneNotificationSettings
                      {...props}
                      toggleTheme={toggleTheme}
                      isDarkTheme={isDarkTheme}
                    />
                  )}
                </Stack.Screen>
                <Stack.Screen name="SelectGlassesModelScreen"
                  options={{ title: 'Select Glasses' }}
                >
                  {props => (
                    <SelectGlassesModelScreen
                      {...props}
                      toggleTheme={toggleTheme}
                      isDarkTheme={isDarkTheme}
                    />
                  )}
                </Stack.Screen>
                <Stack.Screen name="GlassesPairingGuideScreen"
                  options={{ title: 'Pairing Guide' }}
                >
                  {props => (
                    <GlassesPairingGuideScreen
                      {...props}
                      toggleTheme={toggleTheme}
                      isDarkTheme={isDarkTheme}
                    />
                  )}
                </Stack.Screen>
                <Stack.Screen name="SelectGlassesBluetoothScreen"
                  options={{ title: 'Finding Glasses' }}
                >
                  {props => (
                    <SelectGlassesBluetoothScreen
                      {...props}
                      toggleTheme={toggleTheme}
                      isDarkTheme={isDarkTheme}
                    />
                  )}
                </Stack.Screen>

              </Stack.Navigator>
            </NavigationContainer>
            </GlassesMirrorProvider>
          </SearchResultsProvider>
        </StatusProvider>
        </AuthProvider>
      {/* </NotificationListener> */}
    </GestureHandlerRootView>
  )
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;