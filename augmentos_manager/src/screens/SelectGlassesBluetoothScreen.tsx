// SelectGlassesBluetoothScreen.tsx

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native'; // <<--- import useRoute
import Icon from 'react-native-vector-icons/FontAwesome';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import { BluetoothService } from '../BluetoothService';
import { loadSetting, saveSetting } from '../logic/SettingsHelper';
import { MOCK_CONNECTION, SETTINGS_KEYS } from '../consts';
import { NavigationProps } from '../components/types';
import { getGlassesImage } from '../logic/getGlassesImage';
import PairingDeviceInfo from '../components/PairingDeviceInfo';
import { EvenRealitiesG1PairingGuide, VuzixZ100PairingGuide } from '../components/GlassesPairingGuides';
import GlobalEventEmitter from '../logic/GlobalEventEmitter';
import { useSearchResults } from '../providers/SearchResultsContext';
// import NavigationBar from '../components/NavigationBar'; // if needed

interface SelectGlassesBluetoothScreenProps {
  isDarkTheme: boolean;
  toggleTheme: () => void;
}

const SelectGlassesBluetoothScreen: React.FC<SelectGlassesBluetoothScreenProps> = ({
  isDarkTheme,
  toggleTheme,
}) => {
  const { status } = useStatus();
  const route = useRoute();
  const bluetoothService = BluetoothService.getInstance();
  const { glassesModelName } = route.params as { glassesModelName: string };
  const navigation = useNavigation<NavigationProps>();
  const { searchResults, setSearchResults } = useSearchResults();

 // Create a ref to track the current state of searchResults
 const searchResultsRef = useRef<string[]>(searchResults);

 // Keep the ref updated whenever searchResults changes
 useEffect(() => {
   searchResultsRef.current = searchResults;
 }, [searchResults]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      const actionType = e.data?.action?.type;
      if (actionType === 'GO_BACK' || actionType === 'POP') {
        bluetoothService.sendForgetSmartGlasses();
        bluetoothService.sendDisconnectWearable();
      } else {
        console.log('Navigation triggered by', actionType, 'so skipping disconnect logic.');
      }
    });

    return unsubscribe;
  }, [navigation]);

  React.useEffect(() => {
    const handleSearchResult = ({ modelName, deviceName }: { modelName: string, deviceName: string }) => {
      // console.log("GOT SOME SEARCH RESULTS:");
      // console.log("ModelName: " + modelName);
      // console.log("DeviceName: " + deviceName);

      if(deviceName === "NOTREQUIREDSKIP") {
        console.log("SKIPPING");

        // Quick hack // bugfix => we get NOTREQUIREDSKIP twice in some cases, so just stop after the initial one
        GlobalEventEmitter.removeListener('COMPATIBLE_GLASSES_SEARCH_RESULT', handleSearchResult);
        
        triggerGlassesPairingGuide(glassesModelName, "");
        return;
      }

      setSearchResults((prevResults) => {
        if (!prevResults.includes(deviceName)) {
          return [...prevResults, deviceName];
        }
        return prevResults;
      });
    };

    const stopSearch = ({ modelName }: { modelName: string }) => {
      console.log("SEARCH RESULTS:")
      console.log(JSON.stringify(searchResults));
      if (searchResultsRef.current.length === 0) {
        Alert.alert(
          "No " + modelName + " found",
          "Retry search?",
          [
            {
              text: "No",
              onPress: () => navigation.goBack(), // Navigate back if user chooses "No"
              style: "cancel",
            },
            {
              text: "Yes",
              onPress: () =>
                BluetoothService.getInstance().sendSearchForCompatibleDeviceNames(glassesModelName), // Retry search
            },
          ],
          { cancelable: false } // Prevent closing the alert by tapping outside
        );
      }
    };
    

    if (!MOCK_CONNECTION) {
      GlobalEventEmitter.on('COMPATIBLE_GLASSES_SEARCH_RESULT', handleSearchResult);
      GlobalEventEmitter.on('COMPATIBLE_GLASSES_SEARCH_STOP', stopSearch);
    }

    return () => {
      if (!MOCK_CONNECTION) {
        GlobalEventEmitter.removeListener('COMPATIBLE_GLASSES_SEARCH_RESULT', handleSearchResult);
        GlobalEventEmitter.removeListener('COMPATIBLE_GLASSES_SEARCH_STOP', stopSearch);
      }
    };
  }, []);


  React.useEffect(() => {
    console.log('Searching for compatible devices for: ', glassesModelName);
    setSearchResults([]);
    BluetoothService.getInstance().sendSearchForCompatibleDeviceNames(glassesModelName);
  }, [glassesModelName]);

  React.useEffect(() => {
    // If puck gets d/c'd here, return to home
    // TODO: iOS hack:
    // if (!status.core_info.puck_connected) {
    //   console.log("RETURN HOME FROM PAIR SCREEN: DISCONNECTED FROM PUCK")
    //   navigation.navigate('Home');
    // }

    // If pairing successful, return to home
    if (status.core_info.puck_connected && status.glasses_info?.model_name) {
      console.log("RETURN HOME FROM PAIR SCREEN: GOT MODEL NAME: " + status.glasses_info?.model_name);
      navigation.navigate('Home');
    }
  }, [status]);

  const triggerGlassesPairingGuide = (glassesModelName: string, deviceName: string) => {
    BluetoothService.getInstance().sendConnectWearable(glassesModelName, deviceName);
    navigation.navigate('GlassesPairingGuideScreen', {
      glassesModelName: glassesModelName,
    });
  }

  const theme = {
    backgroundColor: isDarkTheme ? '#1c1c1c' : '#f9f9f9',
    headerBg: isDarkTheme ? '#333333' : '#fff',
    textColor: isDarkTheme ? '#FFFFFF' : '#333333',
    subTextColor: isDarkTheme ? '#999999' : '#666666',
    cardBg: isDarkTheme ? '#333333' : '#fff',
    borderColor: isDarkTheme ? '#444444' : '#e0e0e0',
    searchBg: isDarkTheme ? '#2c2c2c' : '#f5f5f5',
    categoryChipBg: isDarkTheme ? '#444444' : '#e9e9e9',
    categoryChipText: isDarkTheme ? '#FFFFFF' : '#555555',
    selectedChipBg: isDarkTheme ? '#666666' : '#333333',
    selectedChipText: isDarkTheme ? '#FFFFFF' : '#FFFFFF',
  };

  return (
    <View style={[styles.container, isDarkTheme ? styles.darkBackground : styles.lightBackground]}>
      <ScrollView style={styles.scrollViewContainer}>
        <View style={styles.contentContainer}>
          <PairingDeviceInfo glassesModelName={glassesModelName} isDarkTheme={isDarkTheme} />
        </View>
        <View style={{ flex: 1, marginBottom:20 }}>
          {/* DISPLAY LIST OF BLUETOOTH SEARCH RESULTS */}
          {searchResults && searchResults.length > 0 && (
            <>
              {searchResults.map((deviceName, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.settingItem,
                    { backgroundColor: theme.cardBg, borderColor: theme.borderColor },
                  ]}
                  onPress={() => {
                    triggerGlassesPairingGuide(glassesModelName, deviceName);
                  }}
                >
                  <Image
                    source={getGlassesImage(glassesModelName)}
                    style={styles.glassesImage}
                  />
                  <View style={styles.settingTextContainer}>
                    <Text
                      style={[
                        styles.label,
                        {
                          color: theme.textColor,
                        },
                      ]}
                    >
                      {deviceName}
                    </Text>
                  </View>
                  <Icon
                    name="angle-right"
                    size={24}
                    color={theme.textColor}
                  />
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default SelectGlassesBluetoothScreen;

const styles = StyleSheet.create({
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollViewContainer: {
    flex: 1,
    paddingBottom:0,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 0,
  },
  titleContainer: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginHorizontal: -20,
    marginTop: -20,
    marginBottom: 10,
  },
  titleContainerDark: {
    backgroundColor: '#333333',
  },
  titleContainerLight: {
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
    textAlign: 'left',
    color: '#FFFFFF',
    marginBottom: 5,
  },
  darkBackground: {
    backgroundColor: '#1c1c1c',
  },
  lightBackground: {
    backgroundColor: '#f0f0f0',
  },
  darkText: {
    color: 'black',
  },
  lightText: {
    color: 'white',
  },
  darkSubtext: {
    color: '#666666',
  },
  lightSubtext: {
    color: '#999999',
  },
  darkIcon: {
    color: '#333333',
  },
  lightIcon: {
    color: '#666666',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButtonText: {
    marginLeft: 10,
    fontSize: 18,
    fontWeight: 'bold',
  },
  /**
   * BIG AND SEXY CARD
   */
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Increased padding to give it a "bigger" look
    paddingVertical: 25,
    paddingHorizontal: 15,

    // Larger margin to separate each card
    marginVertical: 8,

    // Rounded corners
    borderRadius: 10,
    borderWidth: 1,

    // Shadow for iOS
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },

    // Elevation for Android
    elevation: 3,
  },
  settingTextContainer: {
    flex: 1,
    paddingHorizontal: 10,
  },
  label: {
    fontSize: 18, // bigger text size
    fontWeight: '600',
    flexWrap: 'wrap',
  },
  value: {
    fontSize: 12,
    marginTop: 5,
    flexWrap: 'wrap',
  },
  headerContainer: {
    backgroundColor: '#fff',
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  header: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
  },
  /**
   * BIGGER, SEXIER IMAGES
   */
  glassesImage: {
    width: 80,    // bigger width
    height: 50,   // bigger height
    resizeMode: 'contain',
    marginRight: 10,
  },
});

