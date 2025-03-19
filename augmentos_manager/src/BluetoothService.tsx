import { NativeEventEmitter, NativeModules, Alert, Platform } from 'react-native';
import BleManager from 'react-native-ble-manager';
import { EventEmitter } from 'events';
import { TextDecoder } from 'text-encoding';
import { check, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { AppState } from 'react-native';
import { ENABLE_PHONE_NOTIFICATIONS_DEFAULT, INTENSE_LOGGING, MOCK_CONNECTION, SETTINGS_KEYS } from './consts';
import { loadSetting, saveSetting } from './logic/SettingsHelper';
import {isAugmentOsCoreInstalled, openCorePermissionsActivity, startExternalService } from './bridge/CoreServiceStarter';
import ManagerCoreCommsService from './bridge/ManagerCoreCommsService';
import GlobalEventEmitter from './logic/GlobalEventEmitter';
import {
  checkNotificationPermission,
  NotificationEventEmitter,
  NotificationService,
} from './logic/NotificationServiceUtils';
import { time } from 'console';
import { checkNotificationAccessSpecialPermission } from './utils/NotificationServiceUtils';

const eventEmitter = new NativeEventEmitter(ManagerCoreCommsService);

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

export interface Device {
  id: string;
  name: string | null;
  rssi: number;
}

export class BluetoothService extends EventEmitter {
  devices: Device[] = [];
  private validationInProgress: Promise<boolean | void> | null = null;
  connectedDevice: Device | null = null;
  isScanning: boolean = false;
  isConnecting: boolean = false;
  mtuSize = 23;
  chunks: any = {};
  expectedChunks: any = {};

  // Match UUIDs with AugOS
  SERVICE_UUID: string = '12345678-1234-5678-1234-56789abcdef0';
  CHARACTERISTIC_UUID: string = 'abcdef12-3456-789a-bcde-f01234567890';

  isLocked: boolean = false;

  // TODO: Holdover from old code. Core was originally supposed to run off-device.
  simulatedPuck: boolean = true;

  private appStateSubscription: { remove: () => void } | null = null;
  private reconnectionTimer: NodeJS.Timeout | null = null;

  unsubscribePhoneNotifications: any;

  constructor() {
    super();
  }

  async initialize() {
    console.log("initializing bluetooth service [og]");
    if (MOCK_CONNECTION) return;

    console.trace();
    console.log(console.trace());

    if (this.simulatedPuck) {
      if (!(await ManagerCoreCommsService.isServiceRunning()))
        ManagerCoreCommsService.startService();
      startExternalService();
      this.initializeCoreMessageIntentReader();
    } else {
      this.initializeBleManager();
    }

    let enablePhoneNotifications = await loadSetting(SETTINGS_KEYS.ENABLE_PHONE_NOTIFICATIONS, ENABLE_PHONE_NOTIFICATIONS_DEFAULT);
    if (enablePhoneNotifications && await checkNotificationAccessSpecialPermission() && !(await NotificationService.isNotificationListenerEnabled())) {
      await NotificationService.startNotificationListenerService();
    }

    this.unsubscribePhoneNotifications = NotificationEventEmitter.addListener('onNotificationPosted', (data) => {
      console.log('Notification received in TS:', data);
      try {
        let json = JSON.parse(data);
        this.sendPhoneNotification(json.appName, json.title, json.text, json.timestamp, json.id);
      } catch (e) {
        console.log("Error parsing phone notification", e);
      }

    });

    this.stopReconnectionScan();
    this.startReconnectionScan();

    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange.bind(this),
    );
  }

  async initializeBleManager() {
    try {
      await BleManager.start({ showAlert: false });
      console.log('BLE Manager initialized');
      this.addListeners();
    } catch (error) {
      console.error('Failed to initialize BLE Manager:', error);
    }
  }

  initializeCoreMessageIntentReader() {
    eventEmitter.addListener('CoreMessageIntentEvent', jsonString => {
      if (INTENSE_LOGGING)
        console.log('Received message from core:', jsonString);
      try {
        let data = JSON.parse(jsonString);
        if (!this.connectedDevice) {
          this.connectedDevice = {
            id: 'fake-device-id',
            name: 'Fake Device',
            rssi: -50,
          };

          saveSetting(SETTINGS_KEYS.PREVIOUSLY_BONDED_PUCK, true)
            .then()
            .catch();
        }

        this.emit('dataReceived', data);
        this.parseDataFromAugmentOsCore(data);
      } catch (e) {
        console.error('Failed to parse JSON from core message:', e);
      }
    });
  }

  addListeners() {
    console.log('Adding BLE listeners');
    bleManagerEmitter.addListener(
      'BleManagerDiscoverPeripheral',
      this.handleDiscoveredPeripheral.bind(this),
    );
    bleManagerEmitter.addListener(
      'BleManagerStopScan',
      this.handleStopScan.bind(this),
    );
    bleManagerEmitter.addListener(
      'BleManagerDisconnectPeripheral',
      this.handleDisconnectedPeripheral.bind(this),
    );
    bleManagerEmitter.addListener(
      'BleManagerBondedPeripheral',
      this.handleBondedPeripheral.bind(this),
    );
    bleManagerEmitter.addListener(
      'BleManagerDidUpdateValueForCharacteristic',
      this.handleCharacteristicUpdate.bind(this),
    );
  }

  removeListeners() {
    bleManagerEmitter.removeAllListeners('BleManagerDiscoverPeripheral');
    bleManagerEmitter.removeAllListeners('BleManagerStopScan');
    bleManagerEmitter.removeAllListeners('BleManagerDisconnectPeripheral');
    bleManagerEmitter.removeAllListeners('BleManagerBondedPeripheral');
  }

  handleAppStateChange(nextAppState: string) {
    if (nextAppState === 'active') {
      console.log('App became active. Checking connection...');
      if (!this.connectedDevice && !this.simulatedPuck) {
        this.scanForDevices();
      }
    }
  }

  async isBluetoothEnabled(): Promise<boolean> {
    console.log('checking if bluetooth is enabled');
    try {
      // Set a timeout to handle cases where the promise doesn't resolve
      const state = await Promise.race([
        BleManager.checkState(),
        new Promise<string>((_, reject) => {
          setTimeout(() => reject(new Error('Bluetooth check timed out')), 1000);
        })
      ]);

      return state === 'on';
    } catch (error) {
      console.log('Error checking Bluetooth state, attempting to initialize:', error);
      try {
        // If checking state fails, try to initialize BLE
        await BleManager.start({ showAlert: false });
        return true;
        // const state = await BleManager.checkState();
        // return state === 'on';
      } catch (initError) {
        console.error('Failed to initialize Bluetooth:', initError);
        return false;
      }
    }
  }

  async isLocationEnabled(): Promise<boolean> {
    console.log('checking if location is enabled');
    if (Platform.OS === 'android') {
      const result = await check(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
      return result === RESULTS.GRANTED;
    } else if (Platform.OS === 'ios') {
      // TODO: IOS LOCATION PERMISSION CHECK
      // const result = await check(PERMISSIONS.IOS.LOCATION_ALWAYS);
      // return result === RESULTS.GRANTED;
      console.log("TODO: IOS LOCATION PERMISSION CHECK");
      return true;
    }
    console.log("Checking for location on a non-mobile device?");
    return false;
  }

  async scanForDevices() {

    if (this.simulatedPuck) {
      this.sendRequestStatus();
      return;
    }

    if (!(await this.isBluetoothEnabled())) {
      console.log('Bluetooth is not enabled');
      return;
    }

    if (!(await this.isLocationEnabled())) {
      console.log('Location is not enabled');
      return;
    }

    console.log('checking if already scanning');
    if (this.isScanning) {
      console.log('Already scanning for devices');
      return;
    }

    console.log('checking if already connecting to a device');
    if (this.isConnecting) {
      console.log('Already in progress of connecting to a device');
      return;
    }

    console.log('starting scan');

    this.isScanning = true;
    this.devices = [];
    this.emit('scanStarted');

    const MAX_SCAN_SECONDS = 10;
    // Set a timeout to stop the scan regardless
    const scanTimeout = setTimeout(() => {
      if (this.isScanning) {
        //console.log('(scanForDevices) Stoping the scan');
        //this.handleStopScan();
      }
    }, MAX_SCAN_SECONDS * 1000);

    try {
      console.log('Scanning for BLE devices...');
      await BleManager.scan([this.SERVICE_UUID], 0, true);
      console.log('BLE scan started');
    } catch (error) {
      console.error('Error during scanning:', error);
      this.isScanning = false;
      this.emit('scanStopped');
    } finally {
      console.log('Clear the scan timeout');
      clearTimeout(scanTimeout); // Clear the timeout if scan finishes normally
    }
  }

  startReconnectionScan() {
    const performScan = () => {
      if (this.simulatedPuck) {
        this.sendRequestStatus();
        //this.sendHeartbeat();
        this.reconnectionTimer = setTimeout(
          performScan,
          this.connectedDevice ? 4000 : 1000,
        );
      }

      if (!this.simulatedPuck) {
        if (this.connectedDevice) {
          this.sendHeartbeat();
        } else {
          console.log('No device connected. Starting reconnection scan...');
          this.scanForDevices();
        }
        this.reconnectionTimer = setTimeout(performScan, 30000);
      }
    };

    performScan();
  }

  stopReconnectionScan() {
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
      this.reconnectionTimer = null;
      console.log('Reconnection scan stopped.');
    }
  }

  handleStopScan() {
    if (this.isScanning) {
      this.isScanning = false;
      this.emit('scanStopped');
      console.log('Scanning stopped');
    } else {
      console.log('handleStopScan called but scanning was not active');
    }
  }

  handleDisconnectedPeripheral(data: any) {
    if (this.connectedDevice?.id === data.peripheral) {
      GlobalEventEmitter.emit('SHOW_BANNER', { message: 'Puck disconnected', type: 'error' })
      this.isLocked = false;
      console.log('Puck disconnected:', data.peripheral);
      this.connectedDevice = null;
      this.emit('deviceDisconnected');
    }
  }

  // Handle bonded peripherals
  handleBondedPeripheral(data: any) {
    console.log('Bonding successful with:', data);
    // Alert.alert('Bonded', `Successfully bonded with ${data.peripheral}`);
    // GlobalEventEmitter.emit('SHOW_BANNER', { message:  `Successfully bonded with ${data.peripheral}`, type: 'success' })
  }

  handleDiscoveredPeripheral(peripheral: any) {
    console.log('Discovered peripheral:', peripheral); // Log all discovered peripherals
    if (peripheral.name === 'AugOS') {
      if (this.connectedDevice) {
        console.log(
          'HandleDiscoverPeripheral BUT WE ARE ALREADY CONNECTED UHHH??',
        );
      }
      console.log('Found an AugOS device... Stop scan and connect');
      BleManager.stopScan();
      this.connectToDevice(peripheral);
    } else {
      this.devices.push(peripheral);
      this.emit('deviceFound', peripheral);
    }
  }

  async connectToDevice(device: Device) {
    this.isConnecting = true;
    this.emit('connectingStatusChanged', { isConnecting: true });

    try {
      console.log('Connecting to Puck:', device.id);
      await BleManager.connect(device.id);

      let isConnected = await BleManager.isPeripheralConnected(device.id, []);
      for (let i = 0; i < 5 && !isConnected; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        isConnected = await BleManager.isPeripheralConnected(device.id, []);
      }

      if (!isConnected) {
        throw new Error('Failed to connect after retries.');
      }

      console.log('Puck connected successfully:', device.id);

      if (Platform.OS === 'android') {
        const bondedDevices = await BleManager.getBondedPeripherals();
        const isBonded = bondedDevices.some(bonded => bonded.id === device.id);
        if (!isBonded) {
          const randomInt = Math.floor(Math.random() * 1000);

          console.log(`[${randomInt}] Bonding with device...`);
          await BleManager.createBond(device.id);
          console.log(`[${randomInt}] bonding ended`);
        }
      }

      const services = await BleManager.retrieveServices(device.id);
      // console.log('Retrieved services and characteristics:', JSON.stringify(services, null, 2));

      if (Platform.OS === 'android') {
        try {
          this.mtuSize = 23;
          const mtu = await BleManager.requestMTU(device.id, 251);
          this.mtuSize = mtu;
          console.log(`MTU set to ${mtu}`);
        } catch {
          console.warn('MTU negotiation failed. Using default 23.');
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('\n\nENABLING NOTIFICATIONS\n\n');
      await this.enableNotifications(device.id);

      this.connectedDevice = device;
      this.emit('deviceConnected', device);

      await this.sendRequestStatus();
    } catch (error) {
      // console.error('Error connecting to puck:', error);
      GlobalEventEmitter.emit('SHOW_BANNER', { message: 'Error connecting to Puck: ' + error, type: 'error' });
    }

    this.isConnecting = false;
    this.emit('connectingStatusChanged', { isConnecting: false });
  }

  async enableNotifications(deviceId: string) {
    try {
      await BleManager.startNotification(
        deviceId,
        this.SERVICE_UUID,
        this.CHARACTERISTIC_UUID,
      );
      console.log('Notifications enabled');
    } catch (error) {
      // console.error('Failed to enable notifications:', error);
      GlobalEventEmitter.emit('SHOW_BANNER', { message: 'Failed to enable notifications: ' + error, type: 'error' });
    }
  }

  async disconnectFromDevice() {
    if (!this.connectedDevice) {
      console.log('No device connected');
      return;
    }

    this.isLocked = false;
    try {
      if (await BleManager.isPeripheralConnected(this.connectedDevice.id, [])) {
        await BleManager.disconnect(this.connectedDevice.id);
      }
      this.emit('deviceDisconnected');
      this.connectedDevice = null;
    } catch (error) {
      console.error('Error during disconnect:', error);
    }
  }

  async readCharacteristic() {
    if (!this.connectedDevice) {
      console.log('No connected device to read from');
      return;
    }

    try {
      const data = await BleManager.read(
        this.connectedDevice.id,
        this.SERVICE_UUID,
        this.CHARACTERISTIC_UUID,
      );
      this.emit('dataReceived', data);
      console.log('\n\nRECEIVED DATA FROM AUGMENTOS_MAIN:\n' + data + '\n\n');
      return data;
    } catch (error) {
      // console.error('Error reading characteristic:', error);
      // Alert.alert('Read Error', 'Failed to read data from device');
      GlobalEventEmitter.emit('SHOW_BANNER', { message: 'Read Error - Failed to read data from device', type: 'error' })
    }
  }
  //** issue with data being set in this function */
  // handleCharacteristicUpdate(data: any) {
  //   // console.log('Characteristic update received:', data);

  //   if (data.peripheral === this.connectedDevice?.id && data.characteristic === this.CHARACTERISTIC_UUID) {
  //     const deviceId = data.peripheral;
  //     const value = data.value; // This is an array of bytes (number[])

  //     // Convert value array to Uint8Array
  //     const byteArray = Uint8Array.from(value);

  //     // Read sequence number and total chunks
  //     const sequenceNumber = byteArray[0];
  //     const totalChunks = byteArray[1];

  //     const chunkData = byteArray.slice(2);

  //     // Initialize storage for this device if necessary
  //     if (!this.chunks[deviceId]) {
  //       this.chunks[deviceId] = [];
  //       this.expectedChunks[deviceId] = totalChunks;
  //     }

  //     // Store the chunk at the correct position
  //     this.chunks[deviceId][sequenceNumber] = chunkData;

  //     // Check if all chunks have been received
  //     const receivedChunks = this.chunks[deviceId].filter((chunk: any) => chunk !== undefined).length;
  //     if (receivedChunks === this.expectedChunks[deviceId]) {
  //       // All chunks received, reconstruct the data
  //       const completeData = this.concatenateUint8Arrays(this.chunks[deviceId]);

  //       // Decode Uint8Array to string
  //       const textDecoder = new TextDecoder('utf-8');
  //       const jsonString = textDecoder.decode(completeData);

  //       // Process the JSON data
  //       try {
  //         console.log('Received raw data:', jsonString);
  //         const jsonData = JSON.parse(jsonString);
  //         this.emit('dataReceived', jsonData);
  //         this.parseDataFromAugmentOsCore(jsonData);

  //         saveSetting(SETTINGS_KEYS.PREVIOUSLY_BONDED_PUCK, true).then().catch();
  //       } catch (error) {
  //         console.log('(ERROR) RAW DATA RECEIVED:', jsonString);
  //         console.error('Error parsing JSON data:', error);
  //       }

  //       // Clear stored data
  //       delete this.chunks[deviceId];
  //       delete this.expectedChunks[deviceId];
  //     }
  //   }
  // }

  //**** Fix for vitural wearbale****///
  //Updated handleCharacteristicUpdate function
  handleCharacteristicUpdate(data: any) {
    if (
      data.peripheral === this.connectedDevice?.id &&
      data.characteristic === this.CHARACTERISTIC_UUID
    ) {
      const deviceId = data.peripheral;
      const value = data.value; // This is an array of bytes (number[])

      // Convert value array to Uint8Array
      const byteArray = Uint8Array.from(value);

      // Read sequence number and total chunks
      const sequenceNumber = byteArray[0];
      const totalChunks = byteArray[1];
      const chunkData = byteArray.slice(2);

      // Initialize storage for this device if necessary
      if (!this.chunks[deviceId]) {
        this.chunks[deviceId] = [];
        this.expectedChunks[deviceId] = totalChunks;
      }

      // Store the chunk at the correct position
      this.chunks[deviceId][sequenceNumber] = chunkData;

      // Check if all chunks have been received
      const receivedChunks = this.chunks[deviceId].filter(
        (chunk: any) => chunk !== undefined,
      ).length;
      if (receivedChunks === this.expectedChunks[deviceId]) {
        // All chunks received, reconstruct the data
        const completeData = this.concatenateUint8Arrays(this.chunks[deviceId]);

        // Decode Uint8Array to string
        const textDecoder = new TextDecoder('utf-8');
        let jsonString = textDecoder.decode(completeData);

        // // Preprocess JSON to fix known issues
        // jsonString = jsonString
        //   .replace(/"carrier"Unknown"/g, '"carrier":"Unknown"')
        //   .replace(/"is_connected":ue/g, '"is_connected":true');

        try {
          console.log('Received raw data:', jsonString);
          const jsonData = JSON.parse(jsonString);
          this.emit('dataReceived', jsonData);
          this.parseDataFromAugmentOsCore(jsonData);

          saveSetting(SETTINGS_KEYS.PREVIOUSLY_BONDED_PUCK, true)
            .then()
            .catch();
        } catch (error) {
          console.error('(ERROR) RAW DATA RECEIVED:', jsonString);
          console.error('Error parsing JSON data:', error);
        }

        // Clear stored data
        delete this.chunks[deviceId];
        delete this.expectedChunks[deviceId];
      }
    }
  }

  // Helper function to concatenate Uint8Array chunks
  concatenateUint8Arrays(chunks: Uint8Array[]): Uint8Array {
    let totalLength = chunks.reduce((acc, curr) => acc + curr.length, 0);
    let result = new Uint8Array(totalLength);
    let offset = 0;
    for (let chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  parseDataFromAugmentOsCore(jsonData: Object) {
    if (!jsonData) return;
    try {
      if ('status' in jsonData) {
        this.emit('statusUpdateReceived', jsonData);
      } else if ('glasses_display_event' in jsonData) {
        let glasses_display_event = (jsonData as any).glasses_display_event;
        GlobalEventEmitter.emit('GLASSES_DISPLAY_EVENT', glasses_display_event);
      } else if ('ping' in jsonData) {
        // Do nothing?
      } else if ('notify_manager' in jsonData) {
        let notify_manager = (jsonData as any).notify_manager;
        GlobalEventEmitter.emit('SHOW_BANNER', { message: notify_manager.message, type: notify_manager.type })
      } else if ('compatible_glasses_search_result' in jsonData) {
        let compatible_glasses_search_result = (jsonData as any).compatible_glasses_search_result;
        GlobalEventEmitter.emit('COMPATIBLE_GLASSES_SEARCH_RESULT', { modelName: compatible_glasses_search_result.model_name, deviceName: compatible_glasses_search_result.device_name })
      } else if ('compatible_glasses_search_stop' in jsonData) {
        let compatible_glasses_search_stop = (jsonData as any).compatible_glasses_search_stop;
        GlobalEventEmitter.emit('COMPATIBLE_GLASSES_SEARCH_STOP', { modelName: compatible_glasses_search_stop.model_name })
      } else if ('app_info' in jsonData) {
        GlobalEventEmitter.emit('APP_INFO_RESULT', { appInfo: jsonData.app_info });
      } else if ('app_is_downloaded' in jsonData) {
        GlobalEventEmitter.emit('APP_IS_DOWNLOADED_RESULT', { appIsDownloaded: jsonData.app_is_downloaded });
      } else if ('need_permissions' in jsonData) {
        // TODO: Do some nicer UX here
        console.log("GOT 'NEED PERMISSIONS' FROM CORE... OPENING PERMISSIONS ACTIVITY...");
        openCorePermissionsActivity();
      }
    } catch (e) {
      console.log('Some error parsing data from AugmentOS_Core...');
      GlobalEventEmitter.emit('STATUS_PARSE_ERROR');
    }
  }

  async writeCharacteristic(data: number[]) {
    if (!this.connectedDevice) {
      console.log('No connected device to write to');
      return;
    }

    try {
      await BleManager.write(
        this.connectedDevice.id,
        this.SERVICE_UUID,
        this.CHARACTERISTIC_UUID,
        data,
      );
      console.log('Data written successfully');
    } catch (error) {
      // console.error('Error writing characteristic:', error);
      GlobalEventEmitter.emit('SHOW_BANNER', { message: 'Failed to write data to device', type: 'error' })
    }
  }

  async writeWithoutResponse(data: number[]) {
    if (!this.connectedDevice) {
      console.log('No connected device to write to without response');
      return;
    }

    try {
      await BleManager.writeWithoutResponse(
        this.connectedDevice.id,
        this.SERVICE_UUID,
        this.CHARACTERISTIC_UUID,
        data,
      );
      console.log('Data written without response');
    } catch (error) {
      //console.error('Error writing without response:', error);
      //Alert.alert('Write Error', 'Failed to write data without response to device');
      GlobalEventEmitter.emit('SHOW_BANNER', { message: 'Failed to write data without response to device', type: 'error' })
    }
  }

  async sendDataToAugmentOs(dataObj: any) {
    if (this.simulatedPuck) {
      await this.sendDataToSimulatedAugmentOs(dataObj);
    }
    else {
      await this.sendDataToRemoteAugmentOs(dataObj);
    }
  }

  async sendDataToRemoteAugmentOs(dataObj: any) {
    if (!this.connectedDevice) {
      console.log('SendDataToAugmentOs: No connected device to write to');
      this.emit('deviceDisconnected');
      return;
    }

    if (this.isLocked) {
      console.log('Action is locked. Ignoring button press.');
      return;
    }

    this.isLocked = true;

    try {
      // Convert data to byte array
      const data = JSON.stringify(dataObj);
      const byteData = Array.from(data).map(char => char.charCodeAt(0));

      const mtuSize = this.mtuSize || 23; // Use negotiated MTU size, or default to 23
      const maxChunkSize = mtuSize - 3; // Subtract 3 bytes for ATT protocol overhead

      let responseReceived = false;

      // Split data into chunks
      for (let i = 0; i < byteData.length; i += maxChunkSize) {
        const chunk = byteData.slice(i, i + maxChunkSize);

        setTimeout(async () => {
          // Send each chunk
          await BleManager.write(
            //@ts-ignore
            this.connectedDevice.id,
            this.SERVICE_UUID,
            this.CHARACTERISTIC_UUID,
            chunk,
            maxChunkSize,
          );
        }, 250 * i);
      }
    } catch (error) {
      GlobalEventEmitter.emit('SHOW_BANNER', { message: 'Write Error - Failed to write data to device: ' + error, type: 'error' })
      this.disconnectFromDevice();
    }

    //   console.log('Data chunk written, waiting for response...');

    //   // Wait for response or timeout
    //   await new Promise((resolve, reject) => {
    //     const timeout = setTimeout(() => {
    //       if (!responseReceived) {
    //         console.log(
    //           'No response received within timeout. Triggering reconnection...',
    //         );
    //         this.handleDisconnectedPeripheral({
    //           peripheral: this.connectedDevice?.id,
    //         });
    //         reject(
    //           new Error(
    //             'Response timeout for data: ' + JSON.stringify(dataObj),
    //           ),
    //         );
    //       }
    //     }, 6000); // Timeout after 5 seconds

    //     this.once('dataReceived', data => {
    //       /*
    //       TODO: This does not validate that the response we got pertains to the command we sent
    //       But at the same time we're literally only accepting status objects right now
    //       so it doesn't really matter
    //       */
    //       responseReceived = true;
    //       this.isLocked = false;
    //       clearTimeout(timeout);
    //       // console.log('GOT A RESPONSE FROM THE THING SO ALL GOOD CUZ');
    //       resolve(null);
    //     });
    //   });
    // } catch (error) {
    //   // console.error('Error writing data:', error);
    //   // Alert.alert('Write Error', 'Failed to write data to device: ' + error);
    //   GlobalEventEmitter.emit('SHOW_BANNER', { message: 'Write Error - Failed to write data to device: ' + error, type: 'error' })
    //   this.disconnectFromDevice();
    // }
  }

  async sendDataToSimulatedAugmentOs(dataObj: any) {
    if (!this.simulatedPuck) {
      console.log('SendDataToSimulatedAugmentOs: Critical error');
    }

    if (!this.connectedDevice) {
       console.log('SendDataToSimulatedAugmentOs: No connected device to write to');
    }

    if (this.isLocked) {
      console.log('SendDataToSimulatedAugmentOs: Action is locked. Ignoring button press.');
      return;
    }

    try {
      ManagerCoreCommsService.sendCommandToCore(JSON.stringify(dataObj));
    } catch (error) {
      GlobalEventEmitter.emit('SHOW_BANNER', { message: 'Write Error - Failed to write data to device: ' + error, type: 'error' })
      this.disconnectFromDevice();
    }
  }

  async validateResponseFromCore() {
    if (this.validationInProgress || await isAugmentOsCoreInstalled()) {
      return this.validationInProgress;
    }

    if (INTENSE_LOGGING)
      console.log('validateResponseFromCore: Data written, waiting for response...');

    this.validationInProgress = new Promise((resolve, reject) => {
      let responseReceived = false;

      const dataReceivedListener = () => {
        responseReceived = true;
        clearTimeout(timeout);
        if (INTENSE_LOGGING)
          console.log('Core is alive!');
        resolve(true);
      };

      this.once('dataReceived', dataReceivedListener);

      const timeout = setTimeout(() => {
        if (!responseReceived) {
          console.log('validateResponseFromCore: No response. Triggering reconnection...');
          GlobalEventEmitter.emit('PUCK_DISCONNECTED', { message: 'Response timeout.' });
          this.removeListener('dataReceived', dataReceivedListener);
          reject(new Error('Response timeout.'));
        }
      }, 4500);
    }).then(() => {
      return true;
    }).catch((error) => {
      if (this.simulatedPuck) {
        if (!ManagerCoreCommsService.isServiceRunning) {
          ManagerCoreCommsService.startService();
        }
        startExternalService();
      } else {
        this.handleDisconnectedPeripheral({
          peripheral: this.connectedDevice?.id,
        });
        this.disconnectFromDevice();
      }
    }).finally(() => {
      this.validationInProgress = null;
    });

    return this.validationInProgress;
  }


  /* AugmentOS Comms Methods (call these to do things) */

  async sendHeartbeat() {
    console.log('Send Connection Check');
    await this.sendDataToAugmentOs({ command: 'ping' });
    await this.validateResponseFromCore();
  }

  async sendRequestStatus() {
    if (INTENSE_LOGGING)
      console.log('Send Request Status');
    await this.sendDataToAugmentOs({ command: 'request_status' });
    await this.validateResponseFromCore();
  }

  async sendSearchForCompatibleDeviceNames(modelName: string) {
    console.log('sendSearchForCompatibleDeviceNames with modelName: ' + modelName);
    return await this.sendDataToAugmentOs({
      command: 'search_for_compatible_device_names',
      params: {
        model_name: modelName
      }
    });
  }

  async sendConnectWearable(modelName: string, deviceName: string = "") {
    console.log('sendConnectWearable with modelName: ' + modelName);
    return await this.sendDataToAugmentOs({
      command: 'connect_wearable',
      params: {
        model_name: modelName,
        device_name: deviceName
      }
    });
  }

  async sendPhoneNotification(appName: string = "", title: string = "", text: string = "", timestamp: number = -1, uuid: string = "") {
    console.log('sendPhoneNotification');
    return await this.sendDataToAugmentOs({
      command: 'phone_notification',
      params: {
        appName: appName,
        title: title,
        text: text,
        timestamp: timestamp,
        uuid: uuid
      }
    });
  }

  async sendDisconnectWearable() {
    console.log('sendDisconnectWearable');
    return await this.sendDataToAugmentOs({ command: 'disconnect_wearable' });
  }

  async sendForgetSmartGlasses() {
    console.log('sendForgetSmartGlasses');
    return await this.sendDataToAugmentOs({ command: 'forget_smart_glasses' });
  }

  async sendToggleVirtualWearable(enabled: boolean) {
    console.log('sendToggleVirtualWearable');
    return await this.sendDataToAugmentOs({
      command: 'enable_virtual_wearable',
      params: {
        enabled: enabled,
      },
    });
  }

  async sendToggleSensing(enabled: boolean) {
    console.log('sendToggleSensing');
    return await this.sendDataToAugmentOs({
      command: 'enable_sensing',
      params: {
        enabled: enabled,
      },
    });
  }

  async sendToggleForceCoreOnboardMic(enabled: boolean) {
    console.log('sendToggleSensing');
    return await this.sendDataToAugmentOs({
      command: 'force_core_onboard_mic',
      params: {
        enabled: enabled,
      },
    });
  }

  async sendToggleContextualDashboard(enabled: boolean) {
    console.log('sendToggleContextualDashboard');
    return await this.sendDataToAugmentOs({
      command: 'enable_contextual_dashboard',
      params: {
        enabled: enabled,
      },
    });
  }
  
  async setGlassesBrightnessMode(brightness: number, autoLight: boolean) {
    console.log('setGlassesBrightnessMode');
    return await this.sendDataToAugmentOs({
      command: 'update_glasses_brightness',
      params: {
        brightness: brightness,
        autoLight: autoLight,
      },
    });
  }

  async setGlassesHeadUpAngle(headUpAngle: number) {
    console.log('setGlassesHeadUpAngle');
    return await this.sendDataToAugmentOs({
      command: 'update_glasses_headUp_angle',
      params: {
        headUpAngle: headUpAngle,
      },
    });
  }

  async startAppByPackageName(packageName: string) {
    console.log('startAppByPackageName');
    await this.sendDataToAugmentOs({
      command: 'start_app',
      params: {
        target: packageName,
        repository: packageName,
      },
    });
    await this.validateResponseFromCore();
  }

  async stopAppByPackageName(packageName: string) {
    console.log('stopAppByPackageName');
    await this.sendDataToAugmentOs({
      command: 'stop_app',
      params: {
        target: packageName,
      },
    });
    await this.validateResponseFromCore();
  }

  async installAppByPackageName(packageName: string) {
    console.log('installAppByPackageName');
    await this.sendDataToAugmentOs({
      command: 'install_app_from_repository',
      params: {
        target: packageName,
      },
    });
    await this.validateResponseFromCore();
  }

  async setAuthenticationSecretKey(userId: string, authSecretKey: string) {
    return await this.sendDataToAugmentOs({
      command: 'set_auth_secret_key',
      params: {
        userId: userId,
        authSecretKey: authSecretKey,
      },
    });
  }

  async verifyAuthenticationSecretKey() {
    console.log('verifyAuthenticationSecretKey');
    return await this.sendDataToAugmentOs({
      command: 'verify_auth_secret_key',
    });
  }

  async deleteAuthenticationSecretKey() {
    console.log('deleteAuthenticationSecretKey');
    return await this.sendDataToAugmentOs({
      command: 'delete_auth_secret_key',
    });
  }

  async sendRequestAppDetails(packageName: string) {
    return await this.sendDataToAugmentOs({
      command: 'request_app_info',
      params: {
        'target': packageName
      }
    })
  }

  async sendUpdateAppSetting(packageName: string, settingsDeltaObj: any) {
    return await this.sendDataToAugmentOs({
      command: 'update_app_settings',
      params: {
        target: packageName,
        settings: settingsDeltaObj
      }
    })
  }

  //   async sendInstallAppFromRepository(repository: string, packageName: string) {
  //     return await this.sendDataToAugmentOs({
  //       command: 'install_app_from_repository',
  //       params: {
  //         repository: repository,
  //         target: packageName
  //       }
  //     })
  //   }

  async sendUninstallApp(packageName: string) {
    return await this.sendDataToAugmentOs({
      command: 'uninstall_app',
      params: {
        target: packageName
      }
    })
  }

  private static bluetoothService: BluetoothService | null = null;
  public static getInstance(start: boolean = false): BluetoothService {
    if (!BluetoothService.bluetoothService) {
      BluetoothService.bluetoothService = new BluetoothService();
      if (start) {
        BluetoothService.bluetoothService.initialize();
      }
    }
    return BluetoothService.bluetoothService;
  }

  public static resetInstance = async () => {
    if (BluetoothService.bluetoothService) {
      BluetoothService.bluetoothService.stopReconnectionScan();
      // Disconnect from any connected device
      await BluetoothService.bluetoothService.disconnectFromDevice();

      // Remove all event listeners
      BluetoothService.bluetoothService.removeListeners();

      // Remove AppState listeners
      BluetoothService.bluetoothService.appStateSubscription?.remove();

      // Reset instance variables
      BluetoothService.bluetoothService.devices = [];
      BluetoothService.bluetoothService.connectedDevice = null;
      BluetoothService.bluetoothService.isScanning = false;
      BluetoothService.bluetoothService.isConnecting = false;
      BluetoothService.bluetoothService.chunks = {};
      BluetoothService.bluetoothService.expectedChunks = {};
      BluetoothService.bluetoothService.isLocked = false;

      if (await NotificationService.isNotificationListenerEnabled()) {
        await NotificationService.stopNotificationListenerService();
      }
      if (BluetoothService.bluetoothService.unsubscribePhoneNotifications) {
        BluetoothService.bluetoothService.unsubscribePhoneNotifications.remove();
      }

      // Nullify the instance
      BluetoothService.bluetoothService = null;

      console.log('BluetoothService instance has been reset.');
    }
  };
}
export default BluetoothService;

const bluetoothService = BluetoothService.getInstance();
