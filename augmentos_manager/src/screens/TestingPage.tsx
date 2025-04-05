import React, {
  useRef,
  useCallback,
  PropsWithChildren,
  useState,
  useEffect,
} from 'react';
import { View, StyleSheet, Animated, Text, Button, Switch } from 'react-native';
import { Slider } from 'react-native-elements';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import Header from '../components/Header';
import RunningAppsList from '../components/RunningAppsList';
import YourAppsList from '../components/YourAppsList';
import NavigationBar from '../components/NavigationBar';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import { ScrollView } from 'react-native-gesture-handler';

import { NativeModules, NativeEventEmitter } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
const { AOSModule, CoreCommsService } = NativeModules;
const AOSEventEmitter = new NativeEventEmitter(CoreCommsService);

interface TestingPageProps {
  isDarkTheme: boolean;
  toggleTheme: () => void;
}

interface AnimatedSectionProps extends PropsWithChildren {
  delay?: number;
}

// Listen for connection state changes
const connectionStateListener = AOSEventEmitter.addListener(
  'onConnectionStateChanged',
  (event: any) => {
    console.log('Connection state changed:', event);
    // Update UI based on connection state
  }
);

// // Listen for disconnection events
// const disconnectListener = ERG1EventEmitter.addListener(
//   'onGlassesDisconnected',
//   (event: any) => {
//     console.log('Glasses disconnected:', event);
//     // Show disconnected UI
//   }
// );

const Homepage: React.FC<TestingPageProps> = ({ isDarkTheme, toggleTheme }) => {
  const navigation = useNavigation<NavigationProp<any>>();
  const { status } = useStatus();
  const [isSimulatedPuck, setIsSimulatedPuck] = React.useState(false);
  const [isCheckingVersion, setIsCheckingVersion] = useState(false);
  const [brightness, setBrightness] = useState(50);
  const [autoBrightness, setAutoBrightness] = useState(false);
  const brightnessTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clearScreenTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-50)).current;

  const startScan = () => {
    AOSModule.startScan(
      (result: any) => console.log('Scan result:', result),
      (error: any) => console.error('Scan error:', error)
    );
  };

  const connectGlasses = async () => {
    try {
      await AOSModule.connectGlasses();
      console.log("Glasses are paired, connecting now...");
    } catch (error) {
      console.error('connectGlasses() error:', error);
    }
  };

  const sendText = async () => {
    let sampleText = "";
    // generate random words from some lorem ipsum text:
    const words = "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum";
    const wordArray = words.split(" ");
    for (let i = 0; i < 20; i++) {
      sampleText += wordArray[Math.floor(Math.random() * wordArray.length)] + " ";
    }
    sampleText = sampleText.trim();
    try {
      await AOSModule.sendText(sampleText);
    } catch (error) {
      console.error('sendText() error:', error);
    }

    if (clearScreenTimeoutRef.current) {
      clearTimeout(clearScreenTimeoutRef.current);
    }

    clearScreenTimeoutRef.current = setTimeout(async () => {
      await AOSModule.sendText(" ");
    }, 3000);
  };

  const sendFrames = async (frames: string[]) => {
    for (const frame of frames) {
      await AOSModule.sendText(frame);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };



  const sendLoadingScreen = async () => {
    try {
      await sendFrames([
        "               ____________\n               | 1               |\n               |_____________|",
        "               ____________\n               | 12             |\n               |_____________|",
        "               ____________\n               | 123           |\n               |_____________|",
        "               ____________\n               | 1234         |\n               |_____________|",
        "               ____________\n               | 12345       |\n               |_____________|",
        "               ____________\n               | 123456     |\n               |_____________|",
        "               ____________\n               | 1234567   |\n               |_____________|",
        "               ____________\n               | 12345678 |\n               |_____________|",
      ]);

      await AOSModule.sendText(" ");

    } catch (error) {
      console.error('loading screen error:', error);
    }
  };

  const startLiveCaptions = async () => {
    try {
      await AOSModule.sendCommand(JSON.stringify({
        command: "start_app",
        params: {
          target: "com.augmentos.livecaptions",
        }
      }));
    } catch (error) {
      console.error('startLiveCaptions() error:', error);
    }
  };

  const startMerge = async () => {
    try {
      await AOSModule.sendCommand(JSON.stringify({
        command: "start_app",
        params: {
          target: "com.mentra.merge",
        }
      }));
    } catch (error) {
      console.error('startMerge() error:', error);
    }
  };

  const startMira = async () => {
    try {
      await AOSModule.sendCommand(JSON.stringify({
        command: "start_app",
        params: {
          target: "com.augmentos.miraai",
        }
      }));
    } catch (error) {
      console.error('startMira() error:', error);
    }
  };

  const getBatteryStatus = async () => {
    try {
      const batteryStatus = await AOSModule.getBatteryStatus();
      console.log('Battery Status:', batteryStatus);
    } catch (error) {
      console.error('getBatteryStatus() error:', error);
    }
  };

  const sendWhitelist = async () => {
    try {
      await AOSModule.sendWhitelist(" ");
    } catch (error) {
      console.error('sendWhitelist() error:', error);
    }
  };

  const sendBrightnessSetting = async (value: number, autoBrightness: boolean) => {
    try {
      await AOSModule.setBrightness(value, autoBrightness);
      console.log(`Brightness set to: ${value}`);
    } catch (error) {
      console.error('setBrightness() error:', error);
    }
  };

  const toggleMicEnabled = async (value: boolean) => {
    try {
      await AOSModule.setMicEnabled(value);
      setMicEnabled(value);
      console.log(`Mic state set to: ${value}`);
    } catch (error) {
      console.error('toggleMicEnabled() error:', error);
    }
  };

  const connectServer = async () => {
    try {
      await AOSModule.connectServer();
    } catch (error) {
      console.error('connectServer() error:', error);
    }
  };

  // Debounced function to handle brightness changes
  const handleBrightnessChange = (value: number) => {

    // Clear any existing timer
    if (brightnessTimerRef.current) {
      clearTimeout(brightnessTimerRef.current);
    }

    brightnessTimerRef.current = setTimeout(() => {
      setBrightness(value);
    }, 300); // 300ms debounce time
  };

  useEffect(() => {
    sendBrightnessSetting(brightness, autoBrightness);
  }, [brightness, autoBrightness]);

  // Simple animated wrapper so we do not duplicate logic
  const AnimatedSection: React.FC<AnimatedSectionProps> = useCallback(
    ({ children }) => (
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        {children}
      </Animated.View>
    ),
    [fadeAnim, slideAnim],
  );

  useFocusEffect(
    useCallback(() => {
      // Reset animations when screen is about to focus
      fadeAnim.setValue(0);
      slideAnim.setValue(-50);

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
        ]).start();
      }, 50);

      return () => {
        clearTimeout(animationTimeout);
        fadeAnim.setValue(0);
        slideAnim.setValue(-50);
      };
    }, [fadeAnim, slideAnim]),
  );

  const currentThemeStyles = isDarkTheme ? darkThemeStyles : lightThemeStyles;

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={currentThemeStyles.container}>
        <ScrollView style={currentThemeStyles.contentContainer}>

          <AnimatedSection>
            <Header isDarkTheme={isDarkTheme} navigation={navigation} />
          </AnimatedSection>

          {/* buttons to test ERG1Module */}
          <AnimatedSection>
            <View style={{ flexDirection: 'column', gap: 25 }}>
              <Button title="Start Scan" onPress={startScan} />
              {/* <Button title="Connect Glasses" onPress={connectGlasses} /> */}
              <Button title="Send Text" onPress={sendText} />
              <Button title={`Toggle Mic ${micEnabled ? "Off" : "On"}`} onPress={() => toggleMicEnabled(!micEnabled)} />
              <Button title="Connect Server" onPress={connectServer} />
              <Button title="Start Live Captions" onPress={startLiveCaptions} />
              <Button title="Start Merge" onPress={startMerge} />
              <Button title="Start Mira" onPress={startMira} />
              <Button title="Get Battery Status" onPress={getBatteryStatus} />
              <Button title="Send Whitelist" onPress={sendWhitelist} />
              <Button title="✨✨✨" onPress={sendLoadingScreen} />
            </View>

            <View style={currentThemeStyles.brightnessContainer}>
              <View style={currentThemeStyles.brightnessRow}>
                <Text style={currentThemeStyles.brightnessText}>Brightness: {brightness}%</Text>
                <View style={currentThemeStyles.brightnessRow}>
                  <Text style={currentThemeStyles.brightnessText}>Auto </Text>
                  <Switch
                    value={autoBrightness}
                    onValueChange={(value) => {
                      setAutoBrightness(value);
                      handleBrightnessChange(brightness);
                    }}
                  />
                </View>
              </View>
              <Slider
                style={{ width: '100%', height: 40 }}
                minimumValue={0}
                maximumValue={100}
                step={1}
                value={brightness}
                onValueChange={handleBrightnessChange}
                minimumTrackTintColor={isDarkTheme ? '#FFFFFF' : '#000000'}
                maximumTrackTintColor={isDarkTheme ? '#555555' : '#CCCCCC'}
                thumbTintColor={isDarkTheme ? '#FFFFFF' : '#000000'}
              />
            </View>
          </AnimatedSection>

          {status.core_info.puck_connected && (
            <>
              {status.apps.length > 0 ? (
                <>
                  <AnimatedSection>
                    <RunningAppsList isDarkTheme={isDarkTheme} />
                  </AnimatedSection>

                  <AnimatedSection>
                    <YourAppsList
                      isDarkTheme={isDarkTheme}
                      key={`apps-list-${status.apps.length}`}
                    />
                  </AnimatedSection>
                </>
              ) : (
                <AnimatedSection>
                  <Text style={currentThemeStyles.noAppsText}>
                    No apps found. Visit the AugmentOS App Store to explore and
                    download apps for your device.
                  </Text>
                </AnimatedSection>
              )}
            </>
          )}
        </ScrollView>
      </View>
      <NavigationBar toggleTheme={toggleTheme} isDarkTheme={isDarkTheme} />
    </SafeAreaView>
  );
};

const lightThemeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 55,
  },
  noAppsText: {
    marginTop: 10,
    color: '#000000',
    fontFamily: 'Montserrat-Regular',
  },
  brightnessContainer: {
    marginTop: 15,
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  brightnessText: {
    color: '#000000',
    marginBottom: 5,
    fontFamily: 'Montserrat-Regular',
  },
  brightnessRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

const darkThemeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 55,
  },
  noAppsText: {
    color: '#ffffff',
    fontFamily: 'Montserrat-Regular',
  },
  brightnessContainer: {
    marginTop: 15,
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#222222',
    borderRadius: 8,
  },
  brightnessText: {
    color: '#ffffff',
    marginBottom: 5,
    fontFamily: 'Montserrat-Regular',
  },
  brightnessRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default Homepage;