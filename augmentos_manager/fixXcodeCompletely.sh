#!/bin/bash

set -e

echo "🛑 Killing Xcode and stuck PIF processes..."
pkill -9 -f Xcode || true
pkill -9 -f pif || true

echo "🛡️ Clearing special flags on node_modules (macOS fix)..."
chflags -R nouchg node_modules || true

echo "🧹 Fixing node_modules permissions if needed..."
chmod -R 777 node_modules || true

echo "🧹 Deleting DerivedData, node_modules, and Pods..."
rm -rf ~/Library/Developer/Xcode/DerivedData/*
rm -rf node_modules ios/build ios/Pods ios/Podfile.lock

echo "📦 Reinstalling npm dependencies..."
npm install

echo "📦 Reinstalling CocoaPods..."
cd ios
pod install
cd ..

echo "🚀 Reopening Xcode workspace..."
open ios/AugmentOS_Manager.xcworkspace

echo "✅ All done. Clean rebuild ready."
