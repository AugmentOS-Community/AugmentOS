import React from 'react';
import { View } from 'react-native';
import { 
  AudioWearablePairingGuide,
  EvenRealitiesG1PairingGuide, 
  MentraLivePairingGuide, 
  VirtualWearablePairingGuide,
  VuzixZ100PairingGuide 
} from '../components/GlassesPairingGuides';

/**
 * Returns the appropriate pairing guide component based on the glasses model name
 * @param glassesModelName The name of the glasses model
 * @param isDarkTheme Whether the app is in dark theme mode
 * @returns The corresponding pairing guide component
 */
export const getPairingGuide = (glassesModelName: string, isDarkTheme: boolean) => {
  switch (glassesModelName) {
    case 'Even Realities G1':
      return <EvenRealitiesG1PairingGuide isDarkTheme={isDarkTheme} />;
    case 'Vuzix Z100':
      return <VuzixZ100PairingGuide isDarkTheme={isDarkTheme} />;
    case 'Mentra Live':
      return <MentraLivePairingGuide isDarkTheme={isDarkTheme} />;
    case 'Audio Wearable':
      return <AudioWearablePairingGuide isDarkTheme={isDarkTheme} />;
    case 'Simulated Glasses':
      return <VirtualWearablePairingGuide isDarkTheme={isDarkTheme} />;
    default:
      return <View />;
  }
};