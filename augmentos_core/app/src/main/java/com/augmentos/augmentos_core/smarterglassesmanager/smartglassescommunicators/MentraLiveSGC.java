package com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.BatteryLevelEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchDiscoverEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchStopEvent;
//import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.SmartGlassesBatteryEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesNeedWifiCredentialsEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesDevice;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.SmartGlassesConnectionState;

import org.greenrobot.eventbus.EventBus;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import io.reactivex.rxjava3.subjects.PublishSubject;

/**
 * Smart Glasses Communicator for Mentra Live (K900) glasses
 * Uses BLE to communicate with the glasses
 * 
 * Note: Mentra Live glasses have no display capabilities, only camera and microphone.
 * All display-related methods are stubbed out and will log a message but not actually display anything.
 */
public class MentraLiveSGC extends SmartGlassesCommunicator {
    private static final String TAG = "WearableAi_MentraLiveSGC";
    
    // BLE UUIDs - updated to match K900 BES2800 MCU UUIDs for compatibility with both glass types
    // CRITICAL FIX: Swapped TX and RX UUIDs to match actual usage from central device perspective
    // In BLE, characteristic names are from the perspective of the device that owns them:
    // - From peripheral's perspective: TX is for sending, RX is for receiving
    // - From central's perspective: RX is peripheral's TX, TX is peripheral's RX
    private static final UUID SERVICE_UUID = UUID.fromString("00004860-0000-1000-8000-00805f9b34fb");
    private static final UUID RX_CHAR_UUID = UUID.fromString("000070FF-0000-1000-8000-00805f9b34fb"); // Central receives on peripheral's TX
    private static final UUID TX_CHAR_UUID = UUID.fromString("000071FF-0000-1000-8000-00805f9b34fb"); // Central transmits on peripheral's RX
    private static final UUID CLIENT_CHARACTERISTIC_CONFIG_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    
    // Reconnection parameters
    private static final int BASE_RECONNECT_DELAY_MS = 1000; // Start with 1 second
    private static final int MAX_RECONNECT_DELAY_MS = 30000; // Max 30 seconds
    private static final int MAX_RECONNECT_ATTEMPTS = 10;
    private int reconnectAttempts = 0;
    
    // Keep-alive parameters
    private static final int KEEP_ALIVE_INTERVAL_MS = 5000; // 5 seconds
    private static final int CONNECTION_TIMEOUT_MS = 10000; // 10 seconds
    
    // Device settings
    private static final String PREFS_NAME = "MentraLivePrefs";
    private static final String PREF_DEVICE_ADDRESS = "LastConnectedDeviceAddress";
    
    // Auth settings
    private static final String AUTH_PREFS_NAME = "augmentos_auth_prefs";
    private static final String KEY_CORE_TOKEN = "core_token";
    
    // State tracking
    private Context context;
    private SmartGlassesDevice smartGlassesDevice;
    private PublishSubject<JSONObject> dataObservable;
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothLeScanner bluetoothScanner;
    private BluetoothGatt bluetoothGatt;
    private BluetoothDevice connectedDevice;
    private BluetoothGattCharacteristic txCharacteristic;
    private BluetoothGattCharacteristic rxCharacteristic;
    private Handler handler = new Handler(Looper.getMainLooper());
    private ScheduledExecutorService scheduler;
    private boolean isScanning = false;
    private boolean isConnecting = false;
    private boolean isKilled = false;
    private ConcurrentLinkedQueue<byte[]> sendQueue = new ConcurrentLinkedQueue<>();
    private Runnable connectionTimeoutRunnable;
    private Handler connectionTimeoutHandler = new Handler(Looper.getMainLooper());
    private Runnable processSendQueueRunnable;
    // Current MTU size
    private int currentMtu = 23; // Default BLE MTU
    
    // Battery state tracking
    private int batteryLevel = 50; // Default until we get actual value
    private boolean isCharging = false;
    private boolean isConnected = false;
    
    // WiFi state tracking
    private boolean isWifiConnected = false;
    private String wifiSsid = "";
    
    public MentraLiveSGC(Context context, SmartGlassesDevice smartGlassesDevice, PublishSubject<JSONObject> dataObservable) {
        super();
        this.context = context;
        this.smartGlassesDevice = smartGlassesDevice;
        this.dataObservable = dataObservable;
        
        // Initialize bluetooth adapter
        BluetoothManager bluetoothManager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
        if (bluetoothManager != null) {
            bluetoothAdapter = bluetoothManager.getAdapter();
        }
        
        // Initialize connection state
        mConnectState = SmartGlassesConnectionState.DISCONNECTED;
        
        // Initialize the send queue processor
        processSendQueueRunnable = new Runnable() {
            @Override
            public void run() {
                processSendQueue();
                // Schedule next check
                if (isConnected) {
                    handler.postDelayed(this, 100); // Process queue every 100ms
                }
            }
        };
        
        // Initialize scheduler for keep-alive and reconnection
        scheduler = Executors.newScheduledThreadPool(1);
    }
    
    @Override
    protected void setFontSizes() {
        LARGE_FONT = 3;
        MEDIUM_FONT = 2;
        SMALL_FONT = 1;
    }
    
    /**
     * Starts BLE scanning for Mentra Live glasses
     */
    private void startScan() {
        if (bluetoothAdapter == null || isScanning) {
            return;
        }
        
        bluetoothScanner = bluetoothAdapter.getBluetoothLeScanner();
        if (bluetoothScanner == null) {
            Log.e(TAG, "BLE scanner not available");
            return;
        }
        
        // Configure scan settings
        ScanSettings settings = new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build();
        
        // Set up filters for both standard "Xy_A" and K900 "XyBLE_" device names
        List<ScanFilter> filters = new ArrayList<>();
        
        // Standard glasses filter
        ScanFilter standardFilter = new ScanFilter.Builder()
                .setDeviceName("Xy_A") // Name for standard glasses BLE peripheral
                .build();
        filters.add(standardFilter);
        
        // K900/Mentra Live glasses filter
        ScanFilter k900Filter = new ScanFilter.Builder()
                .setDeviceName("XyBLE_") // Name for K900/Mentra Live glasses
                .build();
        filters.add(k900Filter);
        
        // Start scanning
        try {
            Log.d(TAG, "Starting BLE scan for Mentra Live glasses");
            isScanning = true;
            bluetoothScanner.startScan(filters, settings, scanCallback);
            
            // Set a timeout to stop scanning after 60 seconds (increased from 30 seconds)
            // After timeout, just stop scanning but DON'T automatically try to connect
            handler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (isScanning) {
                        Log.d(TAG, "Scan timeout reached - stopping BLE scan");
                        stopScan();
                        // NOTE: Removed automatic reconnection to last device
                        // Now waits for explicit connection request from UI
                    }
                }
            }, 60000); // 60 seconds (increased from 30)
        } catch (Exception e) {
            Log.e(TAG, "Error starting BLE scan", e);
            isScanning = false;
        }
    }
    
    /**
     * Stops BLE scanning
     */
    private void stopScan() {
        if (bluetoothAdapter == null || bluetoothScanner == null || !isScanning) {
            return;
        }
        
        try {
            bluetoothScanner.stopScan(scanCallback);
            isScanning = false;
            Log.d(TAG, "BLE scan stopped");
            EventBus.getDefault().post(new GlassesBluetoothSearchStopEvent(smartGlassesDevice.deviceModelName));
        } catch (Exception e) {
            Log.e(TAG, "Error stopping BLE scan", e);
        }
    }
    
    /**
     * BLE Scan callback
     */
    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            if (result.getDevice() == null || result.getDevice().getName() == null) {
                return;
            }
            
            String deviceName = result.getDevice().getName();
            String deviceAddress = result.getDevice().getAddress();
            
            Log.d(TAG, "Found BLE device: " + deviceName + " (" + deviceAddress + ")");
            
            // Check if this device matches the saved device address
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String savedDeviceAddress = prefs.getString(PREF_DEVICE_ADDRESS, null);
            
            // Post the discovered device to the event bus ONLY 
            // Don't automatically connect - wait for explicit connect request from UI
            if (deviceName.equals("Xy_A") || deviceName.startsWith("XyBLE_")) {
                String glassType = deviceName.equals("Xy_A") ? "Standard" : "K900";
                Log.d(TAG, "Found compatible " + glassType + " glasses device: " + deviceAddress);
                EventBus.getDefault().post(new GlassesBluetoothSearchDiscoverEvent(
                        smartGlassesDevice.deviceModelName, deviceAddress));
                
                // If this is the specific device we want to connect to, connect to it
                if (savedDeviceAddress != null && savedDeviceAddress.equals(deviceAddress)) {
                    Log.d(TAG, "Found our specific device, connecting: " + deviceAddress);
                    stopScan();
                    connectToDevice(result.getDevice());
                }
            }
        }
        
        @Override
        public void onScanFailed(int errorCode) {
            Log.e(TAG, "BLE scan failed with error: " + errorCode);
            isScanning = false;
        }
    };
    
    /**
     * Connect to a specific BLE device
     */
    private void connectToDevice(BluetoothDevice device) {
        if (device == null) {
            return;
        }
        
        // Cancel any previous connection timeouts
        if (connectionTimeoutRunnable != null) {
            connectionTimeoutHandler.removeCallbacks(connectionTimeoutRunnable);
        }
        
        // Set connection timeout
        connectionTimeoutRunnable = new Runnable() {
            @Override
            public void run() {
                if (isConnecting && !isConnected) {
                    Log.d(TAG, "Connection timeout - closing GATT connection");
                    isConnecting = false;
                    
                    if (bluetoothGatt != null) {
                        bluetoothGatt.disconnect();
                        bluetoothGatt.close();
                        bluetoothGatt = null;
                    }
                    
                    // Try to reconnect with exponential backoff
                    handleReconnection();
                }
            }
        };
        
        connectionTimeoutHandler.postDelayed(connectionTimeoutRunnable, CONNECTION_TIMEOUT_MS);
        
        // Update connection state
        isConnecting = true;
        connectionEvent(SmartGlassesConnectionState.CONNECTING);
        Log.d(TAG, "Connecting to device: " + device.getAddress());
        
        // Connect to the device
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                bluetoothGatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE);
            } else {
                bluetoothGatt = device.connectGatt(context, false, gattCallback);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error connecting to GATT server", e);
            isConnecting = false;
            connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
        }
    }
    
    /**
     * Try to reconnect to the last known device
     */
    private void reconnectToLastKnownDevice() {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String lastDeviceAddress = prefs.getString(PREF_DEVICE_ADDRESS, null);
        
        if (lastDeviceAddress != null && bluetoothAdapter != null) {
            Log.d(TAG, "Attempting to reconnect to last known device: " + lastDeviceAddress);
            try {
                BluetoothDevice device = bluetoothAdapter.getRemoteDevice(lastDeviceAddress);
                if (device != null) {
                    Log.d(TAG, "Found saved device, connecting directly: " + lastDeviceAddress);
                    connectToDevice(device);
                } else {
                    Log.e(TAG, "Could not create device from address: " + lastDeviceAddress);
                    connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
                    startScan(); // Fallback to scanning
                }
            } catch (Exception e) {
                Log.e(TAG, "Error connecting to saved device: " + e.getMessage());
                connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
                startScan(); // Fallback to scanning
            }
        } else {
            // No last device to connect to, start scanning
            Log.d(TAG, "No last known device, starting scan");
            startScan();
        }
    }
    
    /**
     * Handle reconnection with exponential backoff
     */
    private void handleReconnection() {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            Log.d(TAG, "Maximum reconnection attempts reached (" + MAX_RECONNECT_ATTEMPTS + ")");
            reconnectAttempts = 0;
            connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
            return;
        }
        
        // Calculate delay with exponential backoff
        long delay = Math.min(BASE_RECONNECT_DELAY_MS * (1L << reconnectAttempts), MAX_RECONNECT_DELAY_MS);
        reconnectAttempts++;
        
        Log.d(TAG, "Scheduling reconnection attempt " + reconnectAttempts + 
              " in " + delay + "ms (max " + MAX_RECONNECT_ATTEMPTS + ")");
        
        // Schedule reconnection attempt
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!isConnected && !isConnecting && !isKilled) {
                    // Try last known device first, but don't start scanning automatically
                    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                    String lastDeviceAddress = prefs.getString(PREF_DEVICE_ADDRESS, null);
                    
                    if (lastDeviceAddress != null && bluetoothAdapter != null) {
                        Log.d(TAG, "Reconnection attempt " + reconnectAttempts + " - trying last known device: " + lastDeviceAddress);
                        try {
                            BluetoothDevice device = bluetoothAdapter.getRemoteDevice(lastDeviceAddress);
                            if (device != null) {
                                Log.d(TAG, "Found saved device, connecting directly: " + lastDeviceAddress);
                                connectToDevice(device);
                            } else {
                                Log.e(TAG, "Could not create device from address: " + lastDeviceAddress);
                                connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
                            }
                        } catch (Exception e) {
                            Log.e(TAG, "Error connecting to saved device: " + e.getMessage());
                            connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
                        }
                    } else {
                        Log.d(TAG, "Reconnection attempt " + reconnectAttempts + " - no last device available");
                        // Note: We don't start scanning here anymore to avoid unexpected behavior
                        // Instead, let the user explicitly trigger a new scan when needed
                    }
                }
            }
        }, delay);
    }
    
    /**
     * GATT callback for BLE operations
     */
    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            // Cancel the connection timeout
            if (connectionTimeoutRunnable != null) {
                connectionTimeoutHandler.removeCallbacks(connectionTimeoutRunnable);
                connectionTimeoutRunnable = null;
            }
            
            if (status == BluetoothGatt.GATT_SUCCESS) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    Log.d(TAG, "Connected to GATT server, discovering services...");
                    isConnecting = false;
                    isConnected = true;
                    connectedDevice = gatt.getDevice();
                    
                    // Save the connected device address for future reconnections
                    if (connectedDevice != null) {
                        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                        prefs.edit().putString(PREF_DEVICE_ADDRESS, connectedDevice.getAddress()).apply();
                    }
                    
                    // Discover services
                    gatt.discoverServices();
                    
                    // Reset reconnect attempts on successful connection
                    reconnectAttempts = 0;
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    Log.d(TAG, "Disconnected from GATT server");
                    isConnected = false;
                    isConnecting = false;
                    connectedDevice = null;
                    connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
                    
                    // Stop keep-alive and queue processing
                    stopKeepAlive();
                    handler.removeCallbacks(processSendQueueRunnable);
                    
                    // Clean up GATT resources
                    if (bluetoothGatt != null) {
                        bluetoothGatt.close();
                        bluetoothGatt = null;
                    }
                    
                    // Attempt reconnection
                    handleReconnection();
                }
            } else {
                // Connection error
                Log.e(TAG, "GATT connection error: " + status);
                isConnected = false;
                isConnecting = false;
                connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
                
                // Clean up resources
                if (bluetoothGatt != null) {
                    bluetoothGatt.close();
                    bluetoothGatt = null;
                }
                
                // Attempt reconnection
                handleReconnection();
            }
        }
        
        @Override
        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "GATT services discovered");
                
                // Find our service and characteristics
                BluetoothGattService service = gatt.getService(SERVICE_UUID);
                if (service != null) {
                    txCharacteristic = service.getCharacteristic(TX_CHAR_UUID);
                    rxCharacteristic = service.getCharacteristic(RX_CHAR_UUID);
                    
                    if (rxCharacteristic != null && txCharacteristic != null) {
                        // CRITICAL FIX: Update connection state FIRST
                        // This ensures notifications can be enabled AFTER connection is established
                        Log.d(TAG, "✅ Both TX and RX characteristics found - connection ready");
                        connectionEvent(SmartGlassesConnectionState.CONNECTED);
                        
                        // CRITICAL FIX: Request MTU size ONCE - don't schedule delayed retries
                        // This avoids BLE operations during active data flow
                        if (checkPermission()) {
                            boolean mtuRequested = gatt.requestMtu(512);
                            Log.d(TAG, "🔄 Requested MTU size 512, success: " + mtuRequested);
                        }
                        
                        // Enable notifications AFTER connection is established
                        enableNotifications();
                        
                        // Start queue processing for sending data
                        handler.post(processSendQueueRunnable);
                        
                        // Start keep-alive mechanism
                        startKeepAlive();
                        
                        // Request battery and WiFi status
                        requestBatteryStatus();
                        requestWifiStatus();
                        
                        // Send the coreToken to the ASG client
                        sendCoreTokenToAsgClient();
                    } else {
                        Log.e(TAG, "Required BLE characteristics not found");
                        if (rxCharacteristic == null) {
                            Log.e(TAG, "RX characteristic (peripheral's TX) not found");
                        }
                        if (txCharacteristic == null) {
                            Log.e(TAG, "TX characteristic (peripheral's RX) not found");
                        }
                        gatt.disconnect();
                    }
                } else {
                    Log.e(TAG, "Required BLE service not found: " + SERVICE_UUID);
                    gatt.disconnect();
                }
            } else {
                Log.e(TAG, "Service discovery failed with status: " + status);
                gatt.disconnect();
            }
        }
        
        @Override
        public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "Characteristic read successful");
                // Process the read data if needed
            } else {
                Log.e(TAG, "Characteristic read failed with status: " + status);
            }
        }
        
        @Override
        public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "Characteristic write successful");
                // Continue processing the send queue if we have more items
                handler.post(processSendQueueRunnable);
            } else {
                Log.e(TAG, "Characteristic write failed with status: " + status);
                // If write fails, try again later
                handler.postDelayed(processSendQueueRunnable, 500);
            }
        }
        
        @Override
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
            // Get thread ID for tracking thread issues
            long threadId = Thread.currentThread().getId();
            
            //Log.e(TAG, "Thread-" + threadId + ": 🎉 onCharacteristicChanged CALLBACK TRIGGERED! Characteristic: " + characteristic.getUuid());
            
            // With the fixed UUID definitions, we should now be receiving notifications on RX_CHAR_UUID
            // (peripheral's TX characteristic that we receive on)
            boolean isCorrectCharacteristic = false;
            if (characteristic.getUuid().equals(RX_CHAR_UUID)) {
                //Log.e(TAG, "Thread-" + threadId + ": 🎯 RX CHARACTERISTIC NOTIFICATION RECEIVED! (Peripheral's TX)");
                isCorrectCharacteristic = true;
            }
//            else if (characteristic.getUuid().equals(TX_CHAR_UUID)) {
//                // This shouldn't happen normally, but we'll keep it for robustness
//                Log.e(TAG, "Thread-" + threadId + ": 🎯 TX CHARACTERISTIC NOTIFICATION RECEIVED! (Should be rare)");
//                isCorrectCharacteristic = true;
//            } else {
//                Log.e(TAG, "Thread-" + threadId + ": ⚠️ UNKNOWN CHARACTERISTIC NOTIFICATION: " + characteristic.getUuid());
//            }
            
            if (isCorrectCharacteristic) {
                byte[] data = characteristic.getValue();
                if (data != null && data.length > 0) {
                    // Critical debugging for LC3 audio issue - dump ALL received data
                    StringBuilder hexDump = new StringBuilder();
                    for (int i = 0; i < Math.min(data.length, 32); i++) {
                        hexDump.append(String.format("%02X ", data[i]));
                    }
                    
                    // Check for LC3 audio data multiple ways
                    boolean isLc3Command = false;
                    
                    // Method 1: Exact byte comparison
                    boolean method1 = data[0] == (byte)0xA0;
                    
                    // Method 2: Unsigned integer comparison
                    boolean method2 = (data[0] & 0xFF) == 0xA0;
                    
                    // Method 3: Comparison with signed value equivalent
                    boolean method3 = data[0] == -96; // 0xA0 as signed byte is -96 decimal
                    
                    // Combined result
                    isLc3Command = method1 || method2 || method3;
                    
//                    Log.e(TAG, "Thread-" + threadId + ": 🎤 BLE PACKET RECEIVED - " + data.length + " bytes");
//                    Log.e(TAG, "Thread-" + threadId + ": 🔍 LC3 Detection - Method1: " + method1 + ", Method2: " + method2 + ", Method3: " + method3);
//                    Log.e(TAG, "Thread-" + threadId + ": 🔍 Command byte: 0x" + String.format("%02X", data[0]) + " (" + (int)(data[0] & 0xFF) + ")");
//                    Log.e(TAG, "Thread-" + threadId + ": 🔍 First 32 bytes: " + hexDump);
                    
                    // Log MTU information with packet
                    int mtuSize = -1;
                    if (gatt != null) {
                        try {
                            // Calculate effective MTU (current MTU - 3 bytes BLE overhead)
                            int effectiveMtu = currentMtu - 3;
                            //Log.e(TAG, "Thread-" + threadId + ": 📏 Packet size: " + data.length + " bytes, MTU limit: " + effectiveMtu + " bytes");
                            
                            if (data.length > effectiveMtu) {
                                Log.e(TAG, "Thread-" + threadId + ": ⚠️ WARNING: Packet size exceeds MTU limit - may be truncated!");
                            }
                        } catch (Exception e) {
                            Log.e(TAG, "Thread-" + threadId + ": ❌ Error getting MTU size: " + e.getMessage());
                        }
                    }
                    
                    // Check if this looks like LC3 audio data based on combined detection
                    if (isLc3Command && data.length >= 20) {
                        //Log.e(TAG, "Thread-" + threadId + ": 🎵 LC3 AUDIO PACKET CONFIRMED! Length: " + data.length + " bytes");
                        
                        // Additional debugging: Check LC3 packet structure
                        if (data.length > 2) {
                            int packetLength = data.length;
                            //Log.e(TAG, "Thread-" + threadId + ": 📦 LC3 packet structure analysis:");
                            //Log.e(TAG, "Thread-" + threadId + ": 📦 Command: 0x" + String.format("%02X", data[0]));
                            
                            if (packetLength >= 60) {
                                //Log.e(TAG, "Thread-" + threadId + ": ✅ LC3 packet size looks good for audio data");
                            } else {
                                Log.e(TAG, "Thread-" + threadId + ": ⚠️ LC3 packet size may be truncated");
                                if (mtuSize > 0 && packetLength >= mtuSize) {
                                    Log.e(TAG, "Thread-" + threadId + ": ❌ Packet size matches MTU limit - likely truncated!");
                                }
                            }
                            
                            // Check if audioProcessingCallback is registered
                            //Log.e(TAG, "Thread-" + threadId + ": ⭐ Audio callback registered: " + (audioProcessingCallback != null ? "YES" : "NO"));
                        }
                    }
                    
                    // Process the received data
                    processReceivedData(data, data.length);
                }
            } else {
                Log.e(TAG, "Thread-" + threadId + ": ⚠️ Received notification for unrecognized characteristic: " + characteristic.getUuid());
                Log.e(TAG, "Thread-" + threadId + ": ⚠️ Expected TX_CHAR_UUID: " + TX_CHAR_UUID + " or RX_CHAR_UUID: " + RX_CHAR_UUID);
                
                // Try to get the service to debug
                BluetoothGattService service = characteristic.getService();
                if (service != null) {
                    Log.e(TAG, "Thread-" + threadId + ": ⚠️ Service UUID: " + service.getUuid() + ", expected: " + SERVICE_UUID);
                }
            }
        }
        
        @Override
        public void onDescriptorWrite(BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
            long threadId = Thread.currentThread().getId();
            
            // CRITICAL FIX: Just log the result but take NO ACTION regardless of status
            // This prevents descriptor write failures from crashing the connection
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.e(TAG, "Thread-" + threadId + ": ✅ Descriptor write successful");
            } else {
                // Just log the error without taking ANY action
                Log.e(TAG, "Thread-" + threadId + ": ℹ️ Descriptor write failed with status: " + status + " - IGNORING");
                // DO NOT add any other operations or logging as they might cause issues
            }
            
            // DO NOT: 
            // - Schedule any operations
            // - Try to retry anything
            // - Create any new BLE operations
            // - Post any handlers
            // - Do any validation or checking
            
            // Any of these could cause thread conflicts that would kill the connection
        }
        
        @Override
        public void onMtuChanged(BluetoothGatt gatt, int mtu, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "🔵 MTU negotiation successful - changed to " + mtu + " bytes");
                int effectivePayload = mtu - 3;
                Log.d(TAG, "   Effective payload size: " + effectivePayload + " bytes");
                
                // Store the new MTU value
                currentMtu = mtu;
                
                // If the negotiated MTU is sufficient for LC3 audio packets (typically 40-60 bytes)
                if (mtu >= 64) {
                    Log.d(TAG, "✅ MTU size is sufficient for LC3 audio data packets");
                } else {
                    Log.w(TAG, "⚠️ MTU size may be too small for LC3 audio data packets");
                    
                    // Log the effective MTU payload directly
                    Log.d(TAG, "📊 Effective MTU payload: " + effectivePayload + " bytes");
                    
                    // Check if it's sufficient for LC3 audio
                    if (effectivePayload < 60) {
                        Log.e(TAG, "❌ CRITICAL: Effective MTU too small for LC3 audio!");
                        Log.e(TAG, "   This will likely cause issues with LC3 audio transmission");
                    }
                    
                    // If we still have a small MTU, try requesting again
                    if (mtu < 64 && gatt != null && checkPermission()) {
                        handler.postDelayed(() -> {
                            if (isConnected && gatt != null) {
                                Log.d(TAG, "🔄 Re-attempting MTU increase after initial small MTU");
                                boolean retryMtuRequest = gatt.requestMtu(512);
                                Log.d(TAG, "   MTU increase retry requested: " + retryMtuRequest);
                            }
                        }, 1000); // Wait 1 second before retry
                    }
                }
            } else {
                Log.e(TAG, "❌ MTU change failed with status: " + status);
                Log.w(TAG, "   Will continue with default MTU (23 bytes, 20 byte payload)");
                
                // Try again if the MTU request failed
                if (gatt != null && checkPermission()) {
                    handler.postDelayed(() -> {
                        if (isConnected && gatt != null) {
                            Log.d(TAG, "🔄 Re-attempting MTU increase after previous failure");
                            boolean retryMtuRequest = gatt.requestMtu(512);
                            Log.d(TAG, "   MTU increase retry requested: " + retryMtuRequest);
                        }
                    }, 1500); // Wait 1.5 seconds before retry
                }
            }
        }
    };
    
    /**
     * Enable notifications for the RX characteristic
     */
    private void enableNotifications() {
        long threadId = Thread.currentThread().getId();
        Log.e(TAG, "Thread-" + threadId + ": 🔵 enableNotifications() called");
        
        if (bluetoothGatt == null) {
            Log.e(TAG, "Thread-" + threadId + ": ❌ Cannot enable notifications - bluetoothGatt is null");
            return;
        }
        
        if (!hasPermissions()) {
            Log.e(TAG, "Thread-" + threadId + ": ❌ Cannot enable notifications - missing permissions");
            return;
        }
        
        // CRITICAL FIX: Only use setCharacteristicNotification - SKIP ALL DESCRIPTOR OPERATIONS
        // The descriptor writes are causing the connection to crash during active data flow
        
        boolean notificationSuccess = false;
        
        // Enable only local notifications for RX characteristic - NO DESCRIPTOR WRITES!
        if (rxCharacteristic != null) {
            try {
                Log.e(TAG, "Thread-" + threadId + ": 📱 Setting up local notifications for RX characteristic: " + RX_CHAR_UUID);
                boolean rxNotificationSuccess = bluetoothGatt.setCharacteristicNotification(rxCharacteristic, true);
                Log.e(TAG, "Thread-" + threadId + ": 📱 RX characteristic notifications enabled: " + rxNotificationSuccess);
                notificationSuccess = rxNotificationSuccess;
            } catch (Exception e) {
                Log.e(TAG, "Thread-" + threadId + ": ❌ Exception enabling RX notifications: " + e.getMessage());
            }
        } else {
            Log.e(TAG, "Thread-" + threadId + ": ⚠️ RX characteristic is null");
        }
        
        // Also enable TX characteristic since we may need it as fallback
        if (txCharacteristic != null) {
            try {
                Log.e(TAG, "Thread-" + threadId + ": 📱 Setting up local notifications for TX characteristic: " + TX_CHAR_UUID);
                boolean txNotificationSuccess = bluetoothGatt.setCharacteristicNotification(txCharacteristic, true);
                Log.e(TAG, "Thread-" + threadId + ": 📱 TX characteristic notifications enabled: " + txNotificationSuccess);
                notificationSuccess = notificationSuccess || txNotificationSuccess;
            } catch (Exception e) {
                Log.e(TAG, "Thread-" + threadId + ": ❌ Exception enabling TX notifications: " + e.getMessage());
            }
        } else {
            Log.e(TAG, "Thread-" + threadId + ": ⚠️ TX characteristic is null");
        }
        
        // Log notification status but AVOID any delayed operations!
        if (notificationSuccess) {
            Log.e(TAG, "Thread-" + threadId + ": 🎯 Local notification registration SUCCESS");
            Log.e(TAG, "Thread-" + threadId + ": 🔔 Ready to receive LC3 audio data via onCharacteristicChanged()");
        } else {
            Log.e(TAG, "Thread-" + threadId + ": ❌ Failed to enable notifications");
        }
        
        // REMOVED: All scheduled/delayed operations and service rediscovery
        // These can cause threading issues that lead to descriptor write failures
    }
    
    /**
     * Start the keep-alive mechanism to maintain connection
     */
    private void startKeepAlive() {
        if (scheduler == null) {
            scheduler = Executors.newScheduledThreadPool(1);
        }
        
        scheduler.scheduleAtFixedRate(new Runnable() {
            @Override
            public void run() {
                if (isConnected) {
                    // Send a keep-alive packet
                    try {
                        JSONObject keepAliveJson = new JSONObject();
                        keepAliveJson.put("type", "keep_alive");
                        keepAliveJson.put("timestamp", System.currentTimeMillis());
                        sendJson(keepAliveJson);
                    } catch (JSONException e) {
                        Log.e(TAG, "Error creating keep-alive JSON", e);
                    }
                }
            }
        }, KEEP_ALIVE_INTERVAL_MS, KEEP_ALIVE_INTERVAL_MS, TimeUnit.MILLISECONDS);
    }
    
    /**
     * Stop the keep-alive mechanism
     */
    private void stopKeepAlive() {
        if (scheduler != null && !scheduler.isShutdown()) {
            scheduler.shutdown();
            try {
                if (!scheduler.awaitTermination(1000, TimeUnit.MILLISECONDS)) {
                    scheduler.shutdownNow();
                }
            } catch (InterruptedException e) {
                scheduler.shutdownNow();
            }
        }
    }
    
    /**
     * Process the send queue
     */
    private void processSendQueue() {
        if (!isConnected || bluetoothGatt == null || txCharacteristic == null) {
            return;
        }
        
        // Send the next item from the queue
        byte[] data = sendQueue.poll();
        if (data != null) {
            sendDataInternal(data);
        }
    }
    
    /**
     * Send data through BLE
     */
    private void sendDataInternal(byte[] data) {
        if (!isConnected || bluetoothGatt == null || txCharacteristic == null || data == null) {
            return;
        }
        
        try {
            txCharacteristic.setValue(data);
            bluetoothGatt.writeCharacteristic(txCharacteristic);
        } catch (Exception e) {
            Log.e(TAG, "Error sending data via BLE", e);
        }
    }
    
    /**
     * Queue data to be sent
     */
    private void queueData(byte[] data) {
        if (data != null) {
            sendQueue.add(data);
            
            // Trigger queue processing if not already running
            handler.removeCallbacks(processSendQueueRunnable);
            handler.post(processSendQueueRunnable);
        }
    }
    
    /**
     * Send a JSON object to the glasses
     */
    private void sendJson(JSONObject json) {
        if (json != null) {
            String jsonStr = json.toString();
            queueData(jsonStr.getBytes(StandardCharsets.UTF_8));
        }
    }
    
    /**
     * Process data received from the glasses
     */
    private void processReceivedData(byte[] data, int size) {
        // Check if we have enough data
        if (data == null || size < 1) {
            Log.w(TAG, "Received empty or invalid data packet");
            return;
        }
        
        // Log the first few bytes to help with debugging
        StringBuilder hexData = new StringBuilder();
        for (int i = 0; i < Math.min(size, 16); i++) {
            hexData.append(String.format("%02X ", data[i]));
        }
        Log.d(TAG, "Processing data packet, first " + Math.min(size, 16) + " bytes: " + hexData.toString());
        
        // Check the first byte to determine the packet type
        byte commandByte = data[0];
        Log.d(TAG, "Command byte: 0x" + String.format("%02X", commandByte) + " (" + (int)(commandByte & 0xFF) + ")");
        
        // Get thread ID for consistent logging
        long threadId = Thread.currentThread().getId();
        
        // CRITICAL DEBUG: Try multiple ways to detect LC3 audio data
        boolean isLc3Audio = false;
        
        // Method 1: Check using switch case (what we were doing)
        if (commandByte == (byte)0xA0) {
            isLc3Audio = true;
            Log.e(TAG, "Thread-" + threadId + ": 🔍 LC3 DETECTION METHOD 1 (switch): MATCH");
        } else {
            Log.e(TAG, "Thread-" + threadId + ": 🔍 LC3 DETECTION METHOD 1 (switch): NO MATCH");
        }
        
        // Method 2: Check by comparing integer values
        int cmdByteInt = commandByte & 0xFF; // Convert signed byte to unsigned int
        if (cmdByteInt == 0xA0) {
            isLc3Audio = true;
            Log.e(TAG, "Thread-" + threadId + ": 🔍 LC3 DETECTION METHOD 2 (int compare): MATCH");
        } else {
            Log.e(TAG, "Thread-" + threadId + ": 🔍 LC3 DETECTION METHOD 2 (int compare): NO MATCH - Value: " + cmdByteInt);
        }
        
        // Method 3: Explicit check against -96 (0xA0 as signed byte)
        if (commandByte == -96) {
            isLc3Audio = true;
            Log.e(TAG, "Thread-" + threadId + ": 🔍 LC3 DETECTION METHOD 3 (signed byte): MATCH");
        } else {
            Log.e(TAG, "Thread-" + threadId + ": 🔍 LC3 DETECTION METHOD 3 (signed byte): NO MATCH - Value: " + (int)commandByte);
        }
        
        // Process based on detection results
        if (isLc3Audio) {
            Log.e(TAG, "Thread-" + threadId + ": ✅ DETECTED LC3 AUDIO PACKET!");
            
            // Report packet size vs. MTU diagnostic
            if (bluetoothGatt != null) {
                try {
                    int effectiveMtu = currentMtu - 3;
                    Log.e(TAG, "Thread-" + threadId + ": 📏 Packet size: " + size + " bytes, MTU limit: " + effectiveMtu + " bytes");
                    
                    if (size > effectiveMtu) {
                        Log.e(TAG, "Thread-" + threadId + ": ⚠️ WARNING: Packet size exceeds MTU limit - may be truncated!");
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Thread-" + threadId + ": ❌ Error getting MTU size: " + e.getMessage());
                }
            }
            
            if (size > 1) {
                // Extract the LC3 audio data (skip the command byte)
                byte[] lc3AudioData = Arrays.copyOfRange(data, 1, data.length);
                
                // Log callback status
                Log.e(TAG, "Thread-" + threadId + ": ⭐ Audio callback registered: " + (audioProcessingCallback != null ? "YES" : "NO"));
                
                // Forward to the audio processing system
                if (audioProcessingCallback != null) {
                    try {
                        Log.e(TAG, "Thread-" + threadId + ": ⏩ Forwarding LC3 audio data (" + lc3AudioData.length + " bytes) to processing system");
                        audioProcessingCallback.onLC3AudioDataAvailable(lc3AudioData);
                        Log.e(TAG, "Thread-" + threadId + ": ✅ LC3 audio data forwarded successfully");
                    } catch (Exception e) {
                        //Log.e(TAG, "Thread-" + threadId + ": ❌ EXCEPTION during audio data forwarding: " + e.getMessage(), e);
                    }
                } else {
                    Log.e(TAG, "Thread-" + threadId + ": ❌ Received LC3 audio data but no processing callback is registered");
                    
                    // Fire a warning event that we're receiving audio but not processing it
                    // This will help the user understand why audio isn't working
                    handler.post(() -> {
                        Log.e(TAG, "Thread-" + threadId + ": 📢 Posting warning about missing audio callback");
                        // TODO: Consider adding a specific event for missing audio callback
                    });
                }
            } else {
                Log.e(TAG, "Thread-" + threadId + ": ⚠️ Received audio packet with no data");
            }
        } else {
            // Not LC3 audio, continue with regular switch statement
            switch (commandByte) {
                
            case '{': // Likely a JSON message (starts with '{')
                try {
                    String jsonStr = new String(data, 0, size, StandardCharsets.UTF_8);
                    if (jsonStr.startsWith("{") && jsonStr.endsWith("}")) {
                        JSONObject json = new JSONObject(jsonStr);
                        processJsonMessage(json);
                    } else {
                        Log.w(TAG, "Received data that starts with '{' but is not valid JSON");
                    }
                } catch (JSONException e) {
                    Log.e(TAG, "Error parsing received JSON data", e);
                }
                break;
                
            default:
                // Unknown packet type
                Log.w(TAG, "Received unknown packet type: " + String.format("0x%02X", commandByte));
                if (size > 10) { 
                    Log.d(TAG, "First 10 bytes: " + bytesToHex(Arrays.copyOfRange(data, 0, 10)));
                } else {
                    Log.d(TAG, "Data: " + bytesToHex(data));
                }
                break;
            }
        }
    }
    
    /**
     * Process a JSON message
     */
    private void processJsonMessage(JSONObject json) {
        String type = json.optString("type", "");
        
        switch (type) {
            case "battery_status":
                // Process battery status
                int level = json.optInt("level", batteryLevel);
                boolean charging = json.optBoolean("charging", isCharging);
                updateBatteryStatus(level, charging);
                break;
                
            case "wifi_status":
                // Process WiFi status information
                boolean wifiConnected = json.optBoolean("connected", false);
                String ssid = json.optString("ssid", "");
                updateWifiStatus(wifiConnected, ssid);
                break;
                
            case "token_status":
                // Process coreToken acknowledgment
                boolean success = json.optBoolean("success", false);
                Log.d(TAG, "Received token status from ASG client: " + (success ? "SUCCESS" : "FAILED"));
                break;
                
            case "button_press":
                // Process button press event
                // ...
                break;
                
            case "sensor_data":
                // Process sensor data
                // ...
                break;
                
            default:
                // Pass the data to the subscriber for custom processing
                if (dataObservable != null) {
                    dataObservable.onNext(json);
                }
                break;
        }
    }
    
    /**
     * Send the coreToken to the ASG client for direct backend authentication
     */
    private void sendCoreTokenToAsgClient() {
        Log.d(TAG, "Preparing to send coreToken to ASG client");
        
        // Get the coreToken from SharedPreferences
        SharedPreferences prefs = context.getSharedPreferences(AUTH_PREFS_NAME, Context.MODE_PRIVATE);
        String coreToken = prefs.getString(KEY_CORE_TOKEN, null);
        
        if (coreToken == null || coreToken.isEmpty()) {
            Log.e(TAG, "No coreToken available to send to ASG client");
            return;
        }
        
        try {
            // Create a JSON object with the token
            JSONObject tokenMsg = new JSONObject();
            tokenMsg.put("type", "auth_token");
            tokenMsg.put("coreToken", coreToken);
            tokenMsg.put("timestamp", System.currentTimeMillis());
            
            // Send the JSON object
            Log.d(TAG, "Sending coreToken to ASG client");
            sendJson(tokenMsg);
            
        } catch (JSONException e) {
            Log.e(TAG, "Error creating coreToken JSON message", e);
        }
    }
    
    /**
     * Convert bytes to hex string for debugging
     */
    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02X ", b));
        }
        return sb.toString();
    }
    
    /**
     * Request battery status from the glasses
     */
    private void requestBatteryStatus() {
        try {
            JSONObject json = new JSONObject();
            json.put("type", "request");
            json.put("request", "battery_status");
            sendJson(json);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating battery status request", e);
        }
    }
    
    /**
     * Update battery status and notify listeners
     */
    private void updateBatteryStatus(int level, boolean charging) {
        batteryLevel = level;
        isCharging = charging;
        
        // Post battery event so the system knows the battery level
        EventBus.getDefault().post(new BatteryLevelEvent(level, charging));
    }
    
    /**
     * Update WiFi status and notify listeners
     */
    private void updateWifiStatus(boolean connected, String ssid) {
        boolean wasConnected = isWifiConnected;
        String previousSsid = wifiSsid;
        
        isWifiConnected = connected;
        wifiSsid = ssid;
        
        Log.d(TAG, "ASG WiFi status: " + (connected ? "Connected" : "Disconnected") + 
                  (connected ? " to " + ssid : ""));
        
        // Post WiFi status event to the event bus so AugmentosService and other components can react
        boolean needsCredentials = !connected; // If not connected, credentials are needed
        EventBus.getDefault().post(new GlassesNeedWifiCredentialsEvent(
                smartGlassesDevice.deviceModelName, 
                needsCredentials,
                connected, 
                ssid));
        
        // If WiFi connection status has changed, update the status
        if (wasConnected != connected || !ssid.equals(previousSsid)) {
            // This will trigger a status update that includes the new WiFi state
            connectionEvent(mConnectState);
        }
    }
    
    /**
     * Request WiFi status from the glasses
     */
    private void requestWifiStatus() {
        try {
            JSONObject json = new JSONObject();
            json.put("type", "request");
            json.put("request", "wifi_status");
            sendJson(json);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating WiFi status request", e);
        }
    }
    
    /**
     * Check if we have the necessary permissions
     */
    private boolean hasPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ActivityCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == 
                   PackageManager.PERMISSION_GRANTED;
        } else {
            return ActivityCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH) == 
                   PackageManager.PERMISSION_GRANTED;
        }
    }
    
    // Helper method for permission checking when needed in different contexts
    private boolean checkPermission() {
        return hasPermissions();
    }
    
    // SmartGlassesCommunicator interface implementation
    
    @Override
    public void findCompatibleDeviceNames() {
        Log.d(TAG, "Finding compatible Mentra Live glasses");
        
        if (bluetoothAdapter == null) {
            Log.e(TAG, "Bluetooth not available");
            return;
        }
        
        if (!bluetoothAdapter.isEnabled()) {
            Log.e(TAG, "Bluetooth is not enabled");
            return;
        }
        
        // Start scanning for BLE devices
        startScan();
    }
    

    @Override
    public void connectToSmartGlasses() {
        Log.d(TAG, "Connecting to Mentra Live glasses");
        connectionEvent(SmartGlassesConnectionState.CONNECTING);
        
        if (isConnected) {
            connectionEvent(SmartGlassesConnectionState.CONNECTED);
            return;
        }
        
        if (bluetoothAdapter == null) {
            Log.e(TAG, "Bluetooth not available");
            connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
            return;
        }
        
        if (!bluetoothAdapter.isEnabled()) {
            Log.e(TAG, "Bluetooth is not enabled");
            connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
            return;
        }
        
        // Get last known device address
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String lastDeviceAddress = prefs.getString(PREF_DEVICE_ADDRESS, null);
        
        if (lastDeviceAddress != null) {
            // Connect to last known device if available
            Log.d(TAG, "Attempting to connect to last known device: " + lastDeviceAddress);
            try {
                BluetoothDevice device = bluetoothAdapter.getRemoteDevice(lastDeviceAddress);
                if (device != null) {
                    Log.d(TAG, "Found saved device, connecting directly: " + lastDeviceAddress);
                    connectToDevice(device);
                } else {
                    Log.e(TAG, "Could not create device from address: " + lastDeviceAddress);
                    connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
                    startScan(); // Fallback to scanning
                }
            } catch (Exception e) {
                Log.e(TAG, "Error connecting to saved device: " + e.getMessage());
                connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
                startScan(); // Fallback to scanning
            }
        } else {
            // If no last known device, start scanning for devices
            Log.d(TAG, "No last known device, starting scan");
            startScan();
        }
    }
    
    @Override
    public void changeSmartGlassesMicrophoneState(boolean enable) {
        Log.d(TAG, "Changing microphone state to: " + enable);
        
        try {
            JSONObject json = new JSONObject();
            json.put("type", "command");
            json.put("command", "microphone");
            json.put("enable", enable);
            sendJson(json);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating microphone command", e);
        }
    }
    
    @Override
    public void requestPhoto(String requestId, String appId) {
        Log.d(TAG, "Requesting photo: " + requestId + " for app: " + appId);
        
        try {
            JSONObject json = new JSONObject();
            json.put("type", "command");
            json.put("command", "camera");
            json.put("action", "take_photo");
            json.put("requestId", requestId);
            json.put("appId", appId);
            sendJson(json);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating photo request JSON", e);
        }
    }
    
    @Override
    public void requestVideoStream(String appId) {
        Log.d(TAG, "Requesting video stream for app: " + appId);
        
        try {
            JSONObject json = new JSONObject();
            json.put("type", "command");
            json.put("command", "camera");
            json.put("action", "start_video_stream");
            json.put("appId", appId);
            sendJson(json);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating video stream request JSON", e);
        }
    }
    
    /**
     * Check if the ASG client is connected to WiFi
     * @return true if connected to WiFi, false otherwise
     */
    public boolean isAsgWifiConnected() {
        return isWifiConnected;
    }
    
    /**
     * Get the SSID of the WiFi network the ASG client is connected to
     * @return SSID string, or empty string if not connected
     */
    public String getAsgWifiSsid() {
        return wifiSsid;
    }
    
    /**
     * Manually request a WiFi status update from the ASG client
     */
    public void refreshAsgWifiStatus() {
        if (isConnected) {
            requestWifiStatus();
        }
    }
    
    @Override
    public void destroy() {
        Log.d(TAG, "Destroying MentraLiveSGC");
        
        // Mark as killed to prevent reconnection attempts
        boolean wasKilled = isKilled;
        isKilled = true;
        
        // Stop scanning if in progress
        if (isScanning) {
            stopScan();
        }
        
        // Stop keep-alive
        stopKeepAlive();
        
        // Cancel connection timeout
        if (connectionTimeoutRunnable != null) {
            connectionTimeoutHandler.removeCallbacks(connectionTimeoutRunnable);
        }
        
        // Cancel any pending handlers
        handler.removeCallbacksAndMessages(null);
        
        // Disconnect from GATT if connected
        if (bluetoothGatt != null) {
            bluetoothGatt.disconnect();
            bluetoothGatt.close();
            bluetoothGatt = null;
        }
        
        isConnected = false;
        isConnecting = false;
        
        // Clear the send queue
        sendQueue.clear();
        
        // Reset state variables
        reconnectAttempts = 0;
        
        context = null;
        smartGlassesDevice = null;
        dataObservable = null;
        
        // Set connection state to disconnected
        connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
    }
    
    // Display methods - all stub implementations since Mentra Live has no display
    
    @Override
    public void setFontSize(SmartGlassesFontSize fontSize) {
        Log.d(TAG, "[STUB] Device has no display. Cannot set font size: " + fontSize);
    }
    
    @Override
    public void displayTextWall(String text) {
        Log.d(TAG, "[STUB] Device has no display. Text wall would show: " + text);
    }
    
    @Override
    public void displayBitmap(Bitmap bitmap) {
        Log.d(TAG, "[STUB] Device has no display. Cannot display bitmap.");
    }
    
    @Override
    public void displayTextLine(String text) {
        Log.d(TAG, "[STUB] Device has no display. Text line would show: " + text);
    }
    
    @Override
    public void displayReferenceCardSimple(String title, String body) {
        Log.d(TAG, "[STUB] Device has no display. Reference card would show: " + title);
    }
    
    @Override
    public void updateGlassesBrightness(int brightness) {
        Log.d(TAG, "[STUB] Device has no display. Cannot set brightness: " + brightness);
    }
    
    @Override
    public void showHomeScreen() {
        Log.d(TAG, "[STUB] Device has no display. Cannot show home screen.");
    }
    
    @Override
    public void blankScreen() {
        Log.d(TAG, "[STUB] Device has no display. Cannot blank screen.");
    }
    
    @Override
    public void displayRowsCard(String[] rowStrings) {
        Log.d(TAG, "[STUB] Device has no display. Cannot display rows card with " + rowStrings.length + " rows");
    }
    
    @Override
    public void showNaturalLanguageCommandScreen(String prompt, String naturalLanguageArgs) {
        Log.d(TAG, "[STUB] Device has no display. Cannot show natural language command screen: " + prompt);
    }
    
    @Override
    public void updateNaturalLanguageCommandScreen(String naturalLanguageArgs) {
        Log.d(TAG, "[STUB] Device has no display. Cannot update natural language command screen");
    }
    
    @Override
    public void scrollingTextViewIntermediateText(String text) {
        Log.d(TAG, "[STUB] Device has no display. Cannot display scrolling text: " + text);
    }
    
    @Override
    public void displayPromptView(String title, String[] options) {
        Log.d(TAG, "[STUB] Device has no display. Cannot display prompt view: " + title);
    }
    
    @Override
    public void displayCustomContent(String json) {
        Log.d(TAG, "[STUB] Device has no display. Cannot display custom content");
    }
    
    @Override
    public void displayReferenceCardImage(String title, String body, String imgUrl) {
        Log.d(TAG, "[STUB] Device has no display. Reference card with image would show: " + title);
    }
    
    @Override
    public void displayDoubleTextWall(String textTop, String textBottom) {
        Log.d(TAG, "[STUB] Device has no display. Double text wall would show: " + textTop + " / " + textBottom);
    }
    
    @Override
    public void displayBulletList(String title, String[] bullets) {
        Log.d(TAG, "[STUB] Device has no display. Bullet list would show: " + title + " with " + bullets.length + " items");
    }
    
    @Override
    public void startScrollingTextViewMode(String title) {
        Log.d(TAG, "[STUB] Device has no display. Scrolling text view would start with: " + title);
    }
    
    @Override
    public void scrollingTextViewFinalText(String text) {
        Log.d(TAG, "[STUB] Device has no display. Scrolling text view would show: " + text);
    }
    
    @Override
    public void stopScrollingTextViewMode() {
        Log.d(TAG, "[STUB] Device has no display. Scrolling text view would stop");
    }
    
    @Override
    public void sendCustomCommand(String commandJson) {
        Log.d(TAG, "Received custom command: " + commandJson);
        
        try {
            JSONObject json = new JSONObject(commandJson);
            String type = json.optString("type", "");
            
            switch (type) {
                case "wifi_credentials":
                    String ssid = json.optString("ssid", "");
                    String password = json.optString("password", "");
                    
                    // Validate inputs
                    if (ssid.isEmpty()) {
                        Log.e(TAG, "Cannot set WiFi credentials - SSID is empty");
                        return;
                    }
                    
                    // Send WiFi credentials to the ASG client
                    JSONObject wifiCommand = new JSONObject();
                    wifiCommand.put("type", "command");
                    wifiCommand.put("command", "set_wifi");
                    wifiCommand.put("ssid", ssid);
                    wifiCommand.put("password", password);
                    sendJson(wifiCommand);
                    
                    // Update local state - we don't actually know if it will connect yet,
                    // but the device will send a wifi_status update once it tries
                    Log.d(TAG, "Sent WiFi credentials to connect to: " + ssid);
                    break;
                    
                default:
                    Log.w(TAG, "Unknown custom command type: " + type);
                    break;
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error parsing custom command JSON", e);
        }
    }
}