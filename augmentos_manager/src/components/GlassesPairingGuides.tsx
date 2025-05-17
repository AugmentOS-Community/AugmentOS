// GlassesPairingGuides.tsx

import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import FontAwesome5Icon from 'react-native-vector-icons/FontAwesome5';

// 1) Create an interface for the props
interface GlassesPairingGuideProps {
  isDarkTheme: boolean;
}

// 2) Declare each guide component with the correct prop type
export const EvenRealitiesG1PairingGuide: React.FC<GlassesPairingGuideProps> = ({
  isDarkTheme,
}) => {
  const textColor = isDarkTheme ? 'white' : 'black';

  return (
    <View style={styles.guideContainer}>
      <Text style={[styles.guideTitle, { color: textColor }]}>
        Even Realities G1
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        1. Disconnect your G1 from within the Even Realities app, or uninstall the Even Realities app
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        2. Place your G1 in the charging case with the lid open.
      </Text>

      <Image source={require('../assets/glasses/g1.png')} style={{...styles.guideImage, width: '60%', alignSelf: 'center'}} />

      {/* arrow downwards */}
      <FontAwesome name="arrow-down" size={48} color={textColor} style={{alignSelf: 'center', marginTop: -48}} />

      <Image source={require('../assets/guide/image_g1_pair.png')} style={styles.guideImage} />
    </View>
  );
};

export const VuzixZ100PairingGuide: React.FC<GlassesPairingGuideProps> = ({
  isDarkTheme,
}) => {
  const textColor = isDarkTheme ? 'white' : 'black';

  return (
    <View style={styles.guideContainer}>
      <Text style={[styles.guideTitle, { color: textColor }]}>
        Vuzix Z100
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        1. Make sure your Z100 is fully charged and turned on.
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        2. Pair your Z100 with your device using the Vuzix Connect app.
      </Text>
    </View>
  );
};

export const MentraMach1PairingGuide: React.FC<GlassesPairingGuideProps> = ({
  isDarkTheme,
}) => {
  const textColor = isDarkTheme ? 'white' : 'black';

  return (
    <View style={styles.guideContainer}>
      <Text style={[styles.guideTitle, { color: textColor }]}>
        Mentra Mach1
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        1. Make sure your Mach1 is fully charged and turned on.
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        2. Pair your Mach1 with your device using the Vuzix Connect app.
      </Text>
    </View>
  );
};

export const MentraLivePairingGuide: React.FC<GlassesPairingGuideProps> = ({
  isDarkTheme,
}) => {
  const textColor = isDarkTheme ? 'white' : 'black';

  return (
    <View style={styles.guideContainer}>
      <Text style={[styles.guideTitle, { color: textColor }]}>
        Mentra Live
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        1. Make sure your Mentra Live is fully charged and turned on.
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        2. Make sure your Mentra Live is not already paired to a different device.
      </Text>
    </View>
  );
};

export const AudioWearablePairingGuide: React.FC<GlassesPairingGuideProps> = ({
  isDarkTheme,
}) => {
  const textColor = isDarkTheme ? 'white' : 'black';

  return (
    <View style={styles.guideContainer}>
      <Text style={[styles.guideTitle, { color: textColor }]}>
        Audio Wearable
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        1. Make sure your Audio Wearable is fully charged and turned on.
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        2. Enable Bluetooth pairing mode on your Audio Wearable.
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        3. Note: Audio Wearables don't have displays. All visual information will be converted to speech.
      </Text>
      <Text style={[styles.guideDescription, { color: textColor }]}>
        Audio Wearables are smart glasses without displays. They use text-to-speech to provide information 
        that would normally be shown visually. This makes them ideal for audio-only applications or for users
        who prefer auditory feedback.
      </Text>
    </View>
  );
};

export const VirtualWearablePairingGuide: React.FC<GlassesPairingGuideProps> = ({
  isDarkTheme,
}) => {
  const textColor = isDarkTheme ? 'white' : 'black';

  return (
    <View style={styles.guideContainer}>
      <Text style={[styles.guideTitle, { color: textColor }]}>
        Simulated Glasses
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        The Simulated Glasses allows you to run AugmentOS without physical smart glasses. 
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  guideContainer: {
    marginTop: 20,
    width: '90%',
  },
  guideTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  guideStep: {
    fontSize: 16,
    marginBottom: 8,
  },
  guideDescription: {
    fontSize: 14,
    marginTop: 12,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  guideImage: {
    width: '100%',
    height: 200, // Adjust height as needed
    resizeMode: 'contain',
    marginVertical: 10,
  },
});
