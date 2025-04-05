// GlassesPairingGuides.tsx

import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

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
        Even Realities G1 Pairing Instructions
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        1. Disconnect your G1 from within the Even Realities app, or uninstall the Even Realities app
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        2. Place your G1 in the charging case with the lid open.
      </Text>

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
        Vuzix Z100 Pairing Instructions
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

export const MentraLivePairingGuide: React.FC<GlassesPairingGuideProps> = ({
  isDarkTheme,
}) => {
  const textColor = isDarkTheme ? 'white' : 'black';

  return (
    <View style={styles.guideContainer}>
      <Text style={[styles.guideTitle, { color: textColor }]}>
        Mentra Live Pairing Instructions
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        1. Make sure your Mentra Live is fully charged and turned on.
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        2. TBD
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        3. TBD
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
        Audio Wearable Pairing Instructions
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
        Simulated Glasses Pairing Instructions
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        No smart glasses required!
      </Text>
      <Text style={[styles.guideStep, { color: textColor }]}>
        Continue to automatically connect to the simulated glasses.
      </Text>
      <Text style={[styles.guideDescription, { color: textColor }]}>
        The Simulated Glasses allows you to test and develop with AugmentOS without physical smart glasses. 
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
