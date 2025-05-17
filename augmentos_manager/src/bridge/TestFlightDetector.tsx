import { NativeModules, Platform } from 'react-native';

interface TestFlightDetectorInterface {
  isTestFlight(): Promise<boolean>;
}

const { TestFlightDetectorModule } = NativeModules;

class TestFlightDetector implements TestFlightDetectorInterface {
  isTestFlight(): Promise<boolean> {
    // Return false for Android or if the module isn't available
    if (Platform.OS !== 'ios' || !TestFlightDetectorModule) {
      return Promise.resolve(false);
    }
    
    return TestFlightDetectorModule.isTestFlight();
  }
}

export default new TestFlightDetector();