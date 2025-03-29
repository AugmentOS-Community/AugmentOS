const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */

const config = {
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
  resolver: {
    assetExts: getDefaultConfig(__dirname).resolver.assetExts.filter(
      (ext) => ext !== 'svg'
    ),
    sourceExts: [
      ...getDefaultConfig(__dirname).resolver.sourceExts,
      'svg',
    ],
    extraNodeModules: {
      // This ensures Supabase packages are resolved correctly
      '@supabase/storage-js': path.resolve(__dirname, 'node_modules/@supabase/storage-js'),
    },
    // Define aliases for problematic files
    resolverMainFields: ['react-native', 'browser', 'main'],
    blacklistRE: [
      /node_modules\/.*\/node_modules\/react-native\/.*/,
    ],
  },
  // Override the watchFolders to include node_modules
  watchFolders: [
    path.resolve(__dirname, 'node_modules/@supabase/storage-js'),
  ],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);