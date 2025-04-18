# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
AugmentOS is an open source operating system, app store, and development framework for smart glasses. 

- Architecture: Smart glasses connect to user's phone via BLE; phone connects to backend; backend connects to third-party app servers running the AugmentOS SDK
- Mobile app: `augmentos_manager` (React Native with native modules)
- Android logic: `augmentos_core` 
- iOS native module: `augmentos_manager/ios`
- Backend & web portals: `augmentos_cloud` (includes developer portal & app store)
- Android-based smart glasses client: `augmentos_asg_client` (uses `augmentos_core` as a library)

## Build Commands
- Android Core: `./gradlew build`, `./gradlew assembleDebug`
- Android tests: `./gradlew test`, `./gradlew androidTest`
- React Native: `npm start`, `npm run android`, `npm run ios`
- Build Android: `npm run build-android`, `npm run build-android-release`
- Run tests: `npm test`, `npm test -- -t "test name"` (single test)
- Lint code: `npm run lint`

## Code Style Guidelines
- Java/Android: Java SDK 17 required
  - Classes: PascalCase
  - Methods: camelCase
  - Constants: UPPER_SNAKE_CASE
  - Member variables: mCamelCase (with m prefix)
  - Javadoc for public methods and classes
  - 2-space indentation
  - EventBus for component communication

- TypeScript/React Native:
  - Functional components with React hooks
  - Imports: Group by external/internal, alphabetize within groups
  - Formatting: Prettier with single quotes, no bracket spacing, trailing commas
  - Navigation: React Navigation with typed params
  - Context API for app-wide state
  - Feature-based organization under src/
  - Use try/catch with meaningful error messages