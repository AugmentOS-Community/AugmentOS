import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  GestureResponderEvent,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import { BluetoothService } from '../BluetoothService';
import { loadSetting, saveSetting } from '../logic/SettingsHelper';
import { SETTINGS_KEYS } from '../consts';
import { NavigationProps } from '../components/types';
import { getGlassesImage } from '../logic/getGlassesImage';
import PairingDeviceInfo from '../components/PairingDeviceInfo';
import { EvenRealitiesG1PairingGuide, MentraLivePairingGuide, VuzixZ100PairingGuide } from '../components/GlassesPairingGuides';
import Button from '../components/Button';
interface GlassesPairingGuidePreparationScreenProps {
  isDarkTheme: boolean;
  toggleTheme: () => void;
}

const GlassesPairingGuidePreparationScreen: React.FC<GlassesPairingGuidePreparationScreenProps> = ({
  isDarkTheme,
  toggleTheme,
}) => {
  const { status } = useStatus();
  const route = useRoute();
  const bluetoothService = BluetoothService.getInstance();
  const { glassesModelName } = route.params as { glassesModelName: string };
  const navigation = useNavigation<NavigationProps>();

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      const actionType = e.data?.action?.type;
    });

    return unsubscribe;
  }, [navigation]);

  React.useEffect(() => {
  }, [glassesModelName]);

  const getPairingGuide = (glassesModelName: string) => {
    switch (glassesModelName) {
      case 'Even Realities G1':
        return <EvenRealitiesG1PairingGuide isDarkTheme={isDarkTheme} />;
      case 'Vuzix Z100':
        return <VuzixZ100PairingGuide isDarkTheme={isDarkTheme} />;
      case 'Mentra Live':
        return <MentraLivePairingGuide isDarkTheme={isDarkTheme} />;
      default:
        return <View />;
    }
  };

  const advanceToPairing = () => {
    if (glassesModelName == null || glassesModelName == "") {
      console.log("SOME WEIRD ERROR HERE");
      return;
    }

    navigation.navigate('SelectGlassesBluetoothScreen', {
      glassesModelName: glassesModelName,
    });
  }

  return (
    <View style={[styles.container, isDarkTheme ? styles.darkBackground : styles.lightBackground]}>
      <ScrollView style={styles.scrollViewContainer}>
        <View style={styles.contentContainer}>
          <PairingDeviceInfo glassesModelName={glassesModelName} isDarkTheme={isDarkTheme} />
          {getPairingGuide(glassesModelName)}
        </View>
      </ScrollView>
      <View style={styles.buttonContainer}>
        <Button onPress={advanceToPairing} disabled={false}>
          <Text>Continue</Text>
        </Button>
      </View>
    </View>
  );
};

export default GlassesPairingGuidePreparationScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollViewContainer: {
    flex: 1,
  },
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContainer: {
    alignItems: 'center',
    marginBottom: 65,
  },
  text: {
    fontSize: 16,
    marginBottom: 10,
  },
  glassesImage: {
    width: 100,
    height: 60,
    resizeMode: 'contain',
    marginTop: 20,
  },
  darkBackground: {
    backgroundColor: '#1c1c1c',
  },
  lightBackground: {
    backgroundColor: '#f0f0f0',
  },
  darkText: {
    color: '#FFFFFF',
  },
  lightText: {
    color: '#333333',
  },
});
