# AugmentOS Setup Guide

## Getting Started

1. Configure Environment
   - Copy `.env.example` to create your `.env` file
   - Configure server settings in `.env` (default: localhost)

2. Install & Start: `npm start`

3. Launch the backend:

From the augmentos_cloud folder: `./run.sh`

4. If you're running the backend on localhost and want to access it from your connected phone:

`adb reverse tcp:8002 tcp:8002`



## iOS Setup

1. Install dependencies: `npm install`
2. Install pods: `cd ios && pod install && cd ..`
3. Open the workspace: `open ios/AugmentOS_Manager.xcworkspace`
4. Run the app: `Product -> Run`

### Debugging

- Make sure `ios/.xcode.env.local` contains the correct path to your node install
   - if you're using brew, this file might look like: `export NODE_BINARY=/opt/homebrew/bin/node`
- Try deleting the `ios/build`, `ios/Podfile.lock`, and `ios/Pods` folders and then re-running `pod install`
- Try deleting XCode's derived data: `rm -rf ~/Library/Developer/Xcode/DerivedData`
