import { View } from 'react-native';
import renderer from 'react-test-renderer';
import { getPairingGuide } from '../src/logic/getPairingGuide';

// Note: Jest requires variables used in mock factories to be prefixed with 'mock'
// or be declared within the factory function itself

// Mock pairing guide components to render a simple View with a testID
jest.mock('../src/components/GlassesPairingGuides', () => {
  // Import View inside the factory function to avoid the out-of-scope error
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const { View } = require('react-native');

  return {
    __esModule: true,
    AudioWearablePairingGuide: () => React.createElement(View, { testID: 'AudioWearablePairingGuide' }),
    EvenRealitiesG1PairingGuide: () => React.createElement(View, { testID: 'EvenRealitiesG1PairingGuide' }),
    MentraLivePairingGuide: () => React.createElement(View, { testID: 'MentraLivePairingGuide' }),
    MentraMach1PairingGuide: () => React.createElement(View, { testID: 'MentraMach1PairingGuide' }),
    VirtualWearablePairingGuide: () => React.createElement(View, { testID: 'VirtualWearablePairingGuide' }),
    VuzixZ100PairingGuide: () => React.createElement(View, { testID: 'VuzixZ100PairingGuide' }),
  };
});

describe('getPairingGuide', () => {
  it('returns EvenRealitiesG1PairingGuide for "Even Realities G1" model', () => {
    const tree = renderer.create(getPairingGuide('Even Realities G1', true)).root;
    expect(tree.findByProps({ testID: 'EvenRealitiesG1PairingGuide' })).toBeTruthy();
  });

  it('returns VuzixZ100PairingGuide for "Vuzix Z100" model', () => {
    const tree = renderer.create(getPairingGuide('Vuzix Z100', false)).root;
    expect(tree.findByProps({ testID: 'VuzixZ100PairingGuide' })).toBeTruthy();
  });

  it('returns MentraLivePairingGuide for "Mentra Live" model', () => {
    const tree = renderer.create(getPairingGuide('Mentra Live', true)).root;
    expect(tree.findByProps({ testID: 'MentraLivePairingGuide' })).toBeTruthy();
  });

  it('returns MentraMach1PairingGuide for "Mentra Mach1" model', () => {
    const tree = renderer.create(getPairingGuide('Mentra Mach1', false)).root;
    expect(tree.findByProps({ testID: 'MentraMach1PairingGuide' })).toBeTruthy();
  });

  it('returns AudioWearablePairingGuide for "Audio Wearable" model', () => {
    const tree = renderer.create(getPairingGuide('Audio Wearable', true)).root;
    expect(tree.findByProps({ testID: 'AudioWearablePairingGuide' })).toBeTruthy();
  });

  it('returns VirtualWearablePairingGuide for "Simulated Glasses" model', () => {
    const tree = renderer.create(getPairingGuide('Simulated Glasses', false)).root;
    expect(tree.findByProps({ testID: 'VirtualWearablePairingGuide' })).toBeTruthy();
  });

  it('returns a plain View for unknown model names', () => {
    const tree = renderer.create(getPairingGuide('Unknown Model', true)).root;
    // The root itself should be a View with no testID
    expect(tree.type).toBe(View);
    // It should not have any child pairing guide testIDs
    expect(() => tree.findByProps({ testID: 'EvenRealitiesG1PairingGuide' })).toThrow();
  });
});
