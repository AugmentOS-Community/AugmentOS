#!/bin/bash

# Clean Watchman
watchman watch-del-all

# Remove caches and node modules
rm -rf node_modules
rm -rf $TMPDIR/metro-cache
rm -rf $TMPDIR/react-*
rm -rf ~/.rncache

# Reinstall dependencies
npm install

# Reset Metro cache and start React Native server
npx react-native start --reset-cache
