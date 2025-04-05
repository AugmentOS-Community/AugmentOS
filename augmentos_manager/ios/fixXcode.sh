#!/bin/bash

echo "🛑 Killing Xcode and stuck PIF processes..."
pkill -9 -f Xcode
pkill -9 -f pif || echo "No PIF processes found."

echo "🧹 Clearing Xcode DerivedData..."
rm -rf ~/Library/Developer/Xcode/DerivedData/*

echo "🚀 Reopening Xcode with AugmentOS_Manager.xcworkspace..."
open -a Xcode "AugmentOS_Manager.xcworkspace"

echo "✅ Fix complete. Xcode rebooted and ready."

