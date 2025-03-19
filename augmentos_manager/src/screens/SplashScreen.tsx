import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProps } from '../components/types';
import { useAuth } from '../AuthContext';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import { doesHaveAllPermissions } from '../logic/PermissionsUtils';
import { loadSetting } from '../logic/SettingsHelper';
import { SETTINGS_KEYS } from '../consts';

interface SplashScreenProps {
  //navigation: any;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ }) => {
  const navigation = useNavigation<NavigationProps>();
  const { user, loading } = useAuth();
  const { status, startBluetoothAndCore } = useStatus();

  useEffect(() => {
    const initializeApp = async () => {

      /*
      The purpose of SplashScreen is to route the user wherever the user needs to be
      If they're not logged in => login screen
      If they're logged in, but no perms => perm screen
      If they're logged in + perms => SimulatedPucK setup
      */
      if (!user) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
        return;
      }

      try {
        if (!(await doesHaveAllPermissions())) {
          console.log(navigation.getState().routes[0].name);
          if (navigation.getState().routes[0].name !== 'GrantPermissionsScreen') {
            navigation.reset({
              index: 0,
              routes: [{ name: 'GrantPermissionsScreen' }],
            });
          }
          return;
        }
      } catch (error) {
        console.error('Error checking permissions:', error);
      }
      
      startBluetoothAndCore();

     // Check if the user has completed onboarding
     const onboardingCompleted = await loadSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, false);

     if (onboardingCompleted) {
       // If onboarding is completed, go directly to Home
       navigation.reset({
         index: 0,
         routes: [{ name: 'ConnectingToPuck' }],
       });
     } else {
       // If onboarding is not completed, go to WelcomePage
       navigation.reset({
         index: 0,
         routes: [{ name: 'WelcomePage' }],
       });
     }
    };

    if (!loading) {
      initializeApp();
    }
  }, [navigation, user, loading, status, startBluetoothAndCore]);

  return (
    <View style={styles.container}>
      {loading ? (
        <View>
          <Text style={styles.text}>Loading...</Text>
          <Text style={styles.subText}>Please wait while we authenticate</Text>
        </View>
      ) : user ? (
        <View>
          <Text style={styles.text}>Welcome Back!</Text>
          <Text style={styles.subText}>{user.email}</Text>
        </View>
      ) : (
        <View>
          <Text style={styles.text}>AugmentOS</Text>
          <Text style={styles.subText}>Please log in to continue</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  subText: {  // Add this new style
    fontSize: 16,
    marginTop: 8,
  },
});

export default SplashScreen;
