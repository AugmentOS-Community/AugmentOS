
import { NativeModule, NativeModules } from 'react-native';

const { AOSModule } = NativeModules;


interface ManagerCoreCommsServiceInterface {
    sendCommandToCore: (jsonString: string) => void;
    addListener: (eventName: string) => void,
    removeListeners: (count: number) => void,
    startService: () => void;
    stopService: () => void;
  }
  
  const ManagerCoreCommsService: ManagerCoreCommsServiceInterface = {
    sendCommandToCore: (jsonString: string) => {
      console.log('sendCommandToCore: ' + jsonString);
      AOSModule.sendCommand(jsonString);
    },
    addListener: (eventName: string) => {
      console.warn("ManagerCoreCommsService is not available on iOS");
    },
    removeListeners: (count: number) => {
      console.warn("ManagerCoreCommsService is not available on iOS");
    },
    startService: () => {},
    stopService: () => {}
  };
  
  export default ManagerCoreCommsService;