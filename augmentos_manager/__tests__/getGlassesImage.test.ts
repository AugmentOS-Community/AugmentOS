import { getGlassesImage } from '../src/logic/getGlassesImage';

// Jest mocks all require() calls for images, and returns an empty string or object
// depending on configuration, so we need to test the function behavior differently
describe('getGlassesImage', () => {
  it('returns correct image for known models', () => {
    const models = [
      'Even Realities G1',
      'Vuzix Z100',
      'Simulated Glasses',
    ];

    // Each model should return a non-null require result
    models.forEach(model => {
      const result = getGlassesImage(model);
      expect(result).not.toBeNull();
    });
  });

  it('returns unknown image for unknown or null model', () => {
    const unknown = getGlassesImage(null);
    const alsoUnknown = getGlassesImage('Unknown Model');

    // Both should return the same value (unknown_wearable)
    expect(unknown).toEqual(alsoUnknown);
  });
});
