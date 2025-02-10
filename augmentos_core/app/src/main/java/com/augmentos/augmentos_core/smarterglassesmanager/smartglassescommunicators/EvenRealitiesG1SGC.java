package com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.preference.PreferenceManager;

import java.io.IOException;
import java.io.InputStream;
import java.util.concurrent.ConcurrentLinkedQueue;

//BMP
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import java.util.zip.CRC32;
import java.nio.ByteBuffer;

import com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.SmartGlassesCommunicator;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.SmartGlassesFontSize;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassesconnection.SmartGlassesAndroidService;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.HeadUpAngleEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.G1FontLoader;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.SmartGlassesConnectionState;
import com.google.gson.Gson;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.AudioChunkNewEvent;
import com.augmentos.smartglassesmanager.cpp.L3cCpp;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.BatteryLevelEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.BrightnessLevelEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchDiscoverEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchStopEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesHeadDownEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesHeadUpEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesDevice;
import com.augmentos.augmentos_core.R;
import org.greenrobot.eventbus.EventBus;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class EvenRealitiesG1SGC extends SmartGlassesCommunicator {
    private static final String TAG = "WearableAi_EvenRealitiesG1SGC";
    public static final String SHARED_PREFS_NAME = "EvenRealitiesPrefs";
    private int heartbeatCount = 0;
    private BluetoothAdapter bluetoothAdapter;

    public static final String LEFT_DEVICE_KEY = "SavedG1LeftName";
    public static final String RIGHT_DEVICE_KEY = "SavedG1RightName";

    private boolean isKilled = false;

    private static final UUID UART_SERVICE_UUID = UUID.fromString("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
    private static final UUID UART_TX_CHAR_UUID = UUID.fromString("6E400002-B5A3-F393-E0A9-E50E24DCCA9E");
    private static final UUID UART_RX_CHAR_UUID = UUID.fromString("6E400003-B5A3-F393-E0A9-E50E24DCCA9E");
    private static final UUID CLIENT_CHARACTERISTIC_CONFIG_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private static final String SAVED_G1_ID_KEY = "SAVED_G1_ID_KEY";
    private Context context;
    private BluetoothGatt leftGlassGatt;
    private BluetoothGatt rightGlassGatt;
    private BluetoothGattCharacteristic leftTxChar;
    private BluetoothGattCharacteristic rightTxChar;
    private BluetoothGattCharacteristic leftRxChar;
    private BluetoothGattCharacteristic rightRxChar;
    private SmartGlassesConnectionState connectionState = SmartGlassesConnectionState.DISCONNECTED;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Handler queryBatterStatusHandler = new Handler(Looper.getMainLooper());
    private final Handler sendBrightnessCommandHandler = new Handler(Looper.getMainLooper());
    private Handler connectHandler = new Handler(Looper.getMainLooper());
    private Handler reconnectHandler = new Handler(Looper.getMainLooper());
    private Handler characteristicHandler = new Handler(Looper.getMainLooper());
    private final Semaphore sendSemaphore = new Semaphore(1);
    private boolean isLeftConnected = false;
    private boolean isRightConnected = false;
    private int currentSeq = 0;
    private boolean stopper = false;
    private boolean debugStopper = false;
    private boolean shouldUseAutoBrightness = false;
    private int brightnessValue;

    private static final long DELAY_BETWEEN_SENDS_MS = 30; //not using now
    private static final long DELAY_BETWEEN_CHUNKS_SEND = 16; //super small just in case
    private static final long DELAY_BETWEEN_ACTIONS_SEND = 250; //not using now
    private static final long HEARTBEAT_INTERVAL_MS = 30000;
    private static final long MICBEAT_INTERVAL_MS = (1000 * 60) * 30; //micbeat every 30 minutes

    private int leftReconnectAttempts = 0;
    private int rightReconnectAttempts = 0;
    private int reconnectAttempts = 0;  // Counts the number of reconnect attempts
    private static final long BASE_RECONNECT_DELAY_MS = 3000;  // Start with 3 seconds
    private static final long MAX_RECONNECT_DELAY_MS = 60000;

    //heartbeat sender
    private Handler heartbeatHandler = new Handler();
    private Handler findCompatibleDevicesHandler;
    private boolean isScanningForCompatibleDevices = false;
    private boolean isScanning = false;

    private Runnable heartbeatRunnable;

    //mic heartbeat turn on
    private Handler micBeatHandler = new Handler();
    private Runnable micBeatRunnable;

    //white list sender
    private Handler whiteListHandler = new Handler();
    private boolean whiteListedAlready = false;

    //mic enable Handler
    private Handler micEnableHandler = new Handler();
    private boolean micEnabledAlready = false;

    //notification period sender
    private Handler notificationHandler = new Handler();
    private Runnable notificationRunnable;
    private boolean notifysStarted = false;
    private int notificationNum = 10;

    //text wall periodic sender
    private Handler textWallHandler = new Handler();
    private Runnable textWallRunnable;
    private boolean textWallsStarted = false;
    private int textWallNum = 10;

    //pairing logic
    private boolean isLeftPairing = false;
    private boolean isRightPairing = false;
    private boolean isLeftBonded = false;
    private boolean isRightBonded = false;
    private BluetoothDevice leftDevice = null;
    private BluetoothDevice rightDevice = null;
    private String preferredG1Id = null;
    private String pendingSavedG1LeftName = null;
    private String pendingSavedG1RightName = null;
    private String savedG1LeftName = null;
    private String savedG1RightName = null;
    private String preferredG1DeviceId = null;

    //handler to turn off screen
    //Handler goHomeHandler;
    //Runnable goHomeRunnable;

    //Retry handler
    Handler retryBondHandler;
    private static final long BOND_RETRY_DELAY_MS = 5000; // 5-second backoff

    //remember when we connected
    private long lastConnectionTimestamp = 0;
    private SmartGlassesDevice smartGlassesDevice;

    private static final long CONNECTION_TIMEOUT_MS = 10000; // 10 seconds

    // Handlers for connection timeouts
    private final Handler leftConnectionTimeoutHandler = new Handler(Looper.getMainLooper());
    private final Handler rightConnectionTimeoutHandler = new Handler(Looper.getMainLooper());

    // Runnable tasks for handling timeouts
    private Runnable leftConnectionTimeoutRunnable;
    private Runnable rightConnectionTimeoutRunnable;
    private boolean isBondingReceiverRegistered = false;
    private boolean forceCoreOnboardMic;

    // lock writing until the last write is successful
    //fonts in G1
    G1FontLoader fontLoader;

    public EvenRealitiesG1SGC(Context context, SmartGlassesDevice smartGlassesDevice) {
        super();
        this.context = context;
        loadPairedDeviceNames();
        //goHomeHandler = new Handler();
        this.smartGlassesDevice = smartGlassesDevice;
        preferredG1DeviceId = getPreferredG1DeviceId(context);
        brightnessValue = getSavedBrightnessValue(context);
        this.bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
        this.forceCoreOnboardMic = SmartGlassesAndroidService.getForceCoreOnboardMic(context);

        //setup fonts
        fontLoader = new G1FontLoader(context);
    }

    private final BluetoothGattCallback leftGattCallback = createGattCallback("Left");
    private final BluetoothGattCallback rightGattCallback = createGattCallback("Right");

    private BluetoothGattCallback createGattCallback(String side) {
        return new BluetoothGattCallback() {
            @Override
            public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
//                Log.d(TAG, "ConnectionStateChanged");
                // Cancel the connection timeout
                if ("Left".equals(side) && leftConnectionTimeoutRunnable != null) {
                    leftConnectionTimeoutHandler.removeCallbacks(leftConnectionTimeoutRunnable);
                    leftConnectionTimeoutRunnable = null;
                } else if ("Right".equals(side) && rightConnectionTimeoutRunnable != null) {
                    rightConnectionTimeoutHandler.removeCallbacks(rightConnectionTimeoutRunnable);
                    rightConnectionTimeoutRunnable = null;
                }

                if (status == BluetoothGatt.GATT_SUCCESS) {

                    if (newState == BluetoothProfile.STATE_CONNECTED) {
                        Log.d(TAG, side + " glass connected, discovering services...");
                        if ("Left".equals(side)) {
                            isLeftConnected = true;
                            leftReconnectAttempts = 0;
                        } else {
                            isRightConnected = true;
                            rightReconnectAttempts = 0;
                        }
                        Log.d(TAG, "Discover serviecs calling...");
                        gatt.discoverServices();
                    } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                        Log.d(TAG, side + " glass disconnected, stopping heartbeats");

                        // Mark both sides as not ready (you could also clear both if one disconnects)
                        leftServicesWaiter.setTrue();
                        rightServicesWaiter.setTrue();

                        // Force disconnection from the other side if necessary
                        if ("Left".equals(side)) {
                            isLeftConnected = false;
                            leftReconnectAttempts++;
                            leftGlassGatt = null;
                            // If right is still connected, disconnect it too
                            if (rightGlassGatt != null) {
                                Log.d(TAG, "Left glass disconnected - forcing disconnection from right glass.");
                                rightGlassGatt.disconnect();
                                rightGlassGatt.close();
                                rightGlassGatt = null;
                                isRightConnected = false;
                                rightReconnectAttempts++;
                            }
                        } else { // side equals "Right"
                            isRightConnected = false;
                            rightReconnectAttempts++;
                            rightGlassGatt = null;
                            // If left is still connected, disconnect it too
                            if (leftGlassGatt != null) {
                                Log.d(TAG, "Right glass disconnected - forcing disconnection from left glass.");
                                leftGlassGatt.disconnect();
                                leftGlassGatt.close();
                                leftGlassGatt = null;
                                isLeftConnected = false;
                                leftReconnectAttempts++;
                            }
                        }

                        // Stop any periodic transmissions
                        stopHeartbeat();
                        stopMicBeat();
                        sendQueue.clear();
                        updateConnectionState();

                        // Compute reconnection delay for both sides (here you could choose the maximum of the two delays or a new delay)
                        long delayLeft = Math.min(BASE_RECONNECT_DELAY_MS * (1L << leftReconnectAttempts), MAX_RECONNECT_DELAY_MS);
                        long delayRight = Math.min(BASE_RECONNECT_DELAY_MS * (1L << rightReconnectAttempts), MAX_RECONNECT_DELAY_MS);
                        long delay = Math.max(delayLeft, delayRight); // or choose another strategy

                        Log.d(TAG, side + " glass disconnected. Scheduling reconnection for both glasses in " + delay + " ms (Left attempts: " + leftReconnectAttempts + ", Right attempts: " + rightReconnectAttempts + ")");

                        if (gatt.getDevice() != null) {
                            // Close the current gatt connection
                            gatt.close();
                        }

                        // Schedule a reconnection for both devices after the delay
                        reconnectHandler.postDelayed(() -> {
                            if (gatt.getDevice() != null && !isKilled) {
                                Log.d(TAG, "Reconnecting to both glasses.");
                                // Assuming you have stored references to both devices:
                                if (leftDevice != null) {
                                    reconnectToGatt(leftDevice);
                                }
                                if (rightDevice != null) {
                                    reconnectToGatt(rightDevice);
                                }
                            }
                        }, delay);
                    }
                } else {
                    stopHeartbeat();
                    stopMicBeat();
                    sendQueue.clear();

                    Log.e(TAG, side + " glass connection failed with status: " + status);
                    if ("Left".equals(side)) {
                        isLeftConnected = false;
                        leftReconnectAttempts++;
                        leftGlassGatt = null;
                    } else {
                        isRightConnected = false;
                        rightReconnectAttempts++;
                        rightGlassGatt = null;
                    }
                    gatt.disconnect();
                    gatt.close();
                    scheduleReconnect(side, gatt.getDevice());
                }
            }

            @Override
            public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                if (status == BluetoothGatt.GATT_SUCCESS) {

                    gatt.requestMtu(251); // Request a higher MTU size
                    Log.d(TAG, "Requested MTU size: 251");

                    BluetoothGattService uartService = gatt.getService(UART_SERVICE_UUID);

                    if (uartService != null) {
                        BluetoothGattCharacteristic txChar = uartService.getCharacteristic(UART_TX_CHAR_UUID);
                        BluetoothGattCharacteristic rxChar = uartService.getCharacteristic(UART_RX_CHAR_UUID);

                        if (txChar != null) {
                            if ("Left".equals(side)) leftTxChar = txChar;
                            else rightTxChar = txChar;
//                            enableNotification(gatt, txChar, side);
                            txChar.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                            Log.d(TAG, side + " glass TX characteristic found");
                        }

                        if (rxChar != null) {
                            if ("Left".equals(side)) leftRxChar = rxChar;
                            else rightRxChar = rxChar;
                            enableNotification(gatt, rxChar, side);
                            rxChar.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                            Log.d(TAG, side + " glass RX characteristic found");
                        }

                        // Request MTU size
                        gatt.requestMtu(251);
//                        Log.d(TAG, "Requested MTU size: 251");

                        if (isLeftConnected && isRightConnected) {
                            //no idea why but it's in the Even app - Cayden
                            Log.d(TAG, "Sending 0xF4 Command");
                            sendDataSequentially(new byte[]{(byte) 0xF4, (byte) 0x01});

                            //no longer need to be staggered as we fixed the sender
                            //do first battery status query
                            queryBatterStatusHandler.postDelayed(() -> queryBatteryStatus(), 10);

                            //setup brightness
                            sendBrightnessCommandHandler.postDelayed(() -> sendBrightnessCommand(brightnessValue, shouldUseAutoBrightness), 10);


                            // Start MIC streaming
                            if (!forceCoreOnboardMic) {
                                setMicEnabled(true, 10); // Enable the MIC
                            } else {
                                setMicEnabled(false, 10); // Enable the MIC
                            }

                            //enable our AugmentOS notification key
                            sendWhiteListCommand(10);

                            //start heartbeat
                            startHeartbeat(3000);

                            //start mic beat
                            startMicBeat(30000);

                            //start sending debug notifications
                            //                        startPeriodicNotifications(302);
                            //start sending debug notifications
                            //                        startPeriodicTextWall(302);
                        }
                    } else {
                        Log.e(TAG, side + " glass UART service not found");
                    }
                }
            }

            @Override
            public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    Log.d(TAG, "PROC_QUEUE - " + side + " glass write successful");
                } else {
                    Log.e(TAG, side + " glass write failed with status: " + status);

                    if(status == 133) {
                        Log.d(TAG, "GOT THAT 133 STATUS!");

                    }
                }

                //clear the waiter
                if ("Left".equals(side)) {
                    leftWaiter.setFalse();
                } else {
                    rightWaiter.setFalse();
                }
            }

            @Override
            public void onDescriptorWrite(BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
                //clear the waiter
                if ("Left".equals(side)) {
                    leftServicesWaiter.setFalse();
                } else {
                    rightServicesWaiter.setFalse();
                }
            }

            // In your BLE callback implementation:
//            @Override
//            public void onDescriptorWrite(BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
//                super.onDescriptorWrite(gatt, descriptor, status);
//
//                if (status == BluetoothGatt.GATT_SUCCESS) {
//                    Log.d(TAG, "PROC_QUEUE - " + side + " SIDE: Descriptor write callback successful");
//                } else {
//                    Log.e(TAG, "PROC_QUEUE - " + side + " SIDE: Descriptor write callback failed with status: " + status);
//                }
//            }

            @Override
            public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
                characteristicHandler.post(() -> {
                    if (characteristic.getUuid().equals(UART_RX_CHAR_UUID)) {
                        byte[] data = characteristic.getValue();
                        String deviceName = gatt.getDevice().getName();

                        // Handle MIC audio data
                        if (data.length > 0 && (data[0] & 0xFF) == 0xF1) {
                            int seq = data[1] & 0xFF; // Sequence number
                            // eg. LC3 to PCM
                            byte[] lc3 = Arrays.copyOfRange(data, 2, 202);
                            byte[] pcmData = L3cCpp.decodeLC3(lc3);
                            if (pcmData == null) {
                                throw new IllegalStateException("Failed to decode LC3 data");
                            }

//                            Log.d(TAG, "Audio data received. Seq: " + seq + ", from: " + deviceName);
                            if (deviceName.contains("R_")) {
                                //Log.d(TAG, "Ignoring...");
//                                Log.d(TAG, "Audio data received. Seq: " + seq + ", Data: " + Arrays.toString(pcmData) + ", from: " + deviceName);
//                                Log.d(TAG, "Audio data received. Seq: " + seq + ", from: " + deviceName + ", length: " + pcmData.length);
                                if (!forceCoreOnboardMic) {
                                    EventBus.getDefault().post(new AudioChunkNewEvent(pcmData));
                                }
                            } else {
//                                Log.d(TAG, "Lc3 Audio data received. Seq: " + seq + ", Data: " + Arrays.toString(lc3) + ", from: " + deviceName);
//                                Log.d(TAG, "PCM Audio data received. Seq: " + seq + ", Data: " + Arrays.toString(pcmData) + ", from: " + deviceName);
//                                if (!forceCoreOnboardMic) {
//                                  EventBus.getDefault().post(new AudioChunkNewEvent(pcmData));
//                                }
                            }
//                          Log.d(this.getClass().getSimpleName(), "============Lc3 data = " + Arrays.toString(lc3) + ", Pcm = " + Arrays.toString(pcmData));
                        }
                        //HEAD UP MOVEMENTS
                        else if (data.length > 1 && (data[0] & 0xFF) == 0xF5 && (data[1] & 0xFF) == 0x02) {
                            // Only check head movements from the right sensor
                            if (deviceName.contains("R_")) {
                                // Check for head down movement - initial F5 02 signal
                                Log.d(TAG, "HEAD UP MOVEMENT DETECTED");
                                EventBus.getDefault().post(new GlassesHeadUpEvent());
                                //showDashboard();
                                //                                displayTextWall("AugmentOS\t\tDashboard\nBy the boys:\n- cayden\n- Israelov\n- Nicobro");
                                //                                byte[] bmpData = loadBmpFromAssets();
                                //                                if (bmpData != null) {
                                //                                    displayBitmapImage(bmpData);
                                //                                } else {
                                //                                    Log.e(TAG, "Could not load BMP data");
                                //                                }
                            }
                        }
                        //HEAD DOWN MOVEMENTS
                        else if (data.length > 1 && (data[0] & 0xFF) == 0xF5 && (data[1] & 0xFF) == 0x03) {
                            if (deviceName.contains("R_")) {
                                // Log.d(TAG, "HEAD DOWN MOVEMENT DETECTED");
                                //                                clearBmpDisplay();
                                EventBus.getDefault().post(new GlassesHeadDownEvent());

                            }
                        }
                        //BATTERY RESPONSE
                        else if (data.length > 2 && data[0] == 0x2C && data[1] == 0x66) {
                            if (deviceName.contains("L_")) {
//                                Log.d(TAG, "Battery response received");
                                int batteryLevel = data[2];

                                EventBus.getDefault().post(new BatteryLevelEvent(batteryLevel));
                            }
                        }
                        //HEARTBEAT RESPONSE
                        else if (data.length > 0 && data[0] == 0x25) {
//                            Log.d(TAG, "Heartbeat response received");
                        }
                        // Handle other non-audio responses
                        else {
//                            Log.d(TAG, "Received other Even Realities response: " + bytesToHex(data) + ", from: " + deviceName);
                        }
                    }
                });
            }

        };
    }

//    private void enableNotification(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, String side) {
//        gatt.setCharacteristicNotification(characteristic, true);
//        BluetoothGattDescriptor descriptor = characteristic.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG_UUID);
//
//        if (descriptor != null) {
//            descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
//
//            // Wait 200ms before setting false
//            new Handler(Looper.getMainLooper()).postDelayed(() -> {
//                if ("Left".equals(side)) {
//                    leftServicesWaiter.setFalse();
//                } else {
//                    rightServicesWaiter.setFalse();
//                }
//            }, 200);
//
//            boolean result = gatt.writeDescriptor(descriptor);
//            if (result) {
//                Log.d(TAG, side + " SIDE, Descriptor write successful for characteristic: " + characteristic.getUuid());
//                if ("Left".equals(side)) isLeftConnected = true;
//                else isRightConnected = true;
//                updateConnectionState();
//            } else {
//                Log.e(TAG, side + " SIDE, Failed to write descriptor for characteristic: " + characteristic.getUuid());
//            }
//        } else {
//            Log.e(TAG, side + " SIDE, Descriptor not found for characteristic: " + characteristic.getUuid());
//        }
//    }

    //OG enable notifications
//    private void enableNotification(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, String side) {
//        // Simply enable notifications
//        boolean set_result = gatt.setCharacteristicNotification(characteristic, true);
//        Log.d(TAG, "PROC_QUEUE - setCharacteristicNotification result for " + side + ": " + set_result);
//
//        // Set write type for the characteristic
//        characteristic.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
//        Log.d(TAG, "PROC_QUEUE - write type set for " + side);
//
////        gatt.setCharacteristicNotification(characteristic, true);
////        BluetoothGattDescriptor descriptor = characteristic.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG_UUID);
////        if (descriptor != null) {
////            descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
////            if ("Left".equals(side)) {
////                leftServicesWaiter.setTrue();
////            } else {
////                rightServicesWaiter.setTrue();
////            }
////            boolean result = gatt.writeDescriptor(descriptor);
////            if (result) {
////                Log.d(TAG, side + " SIDE," + "Descriptor write successful for characteristic: " + characteristic.getUuid());
////                if ("Left".equals(side)) isLeftConnected = true;
////                else isRightConnected = true;
////                updateConnectionState();
////            } else {
////                Log.e(TAG, side + " SIDE," + "Failed to write descriptor for characteristic: " + characteristic.getUuid());
////            }
////        } else {
////            Log.e(TAG, side + " SIDE," + "Descriptor not found for characteristic: " + characteristic.getUuid());
////        }
//
//        //in case this things doesn't write the descriptor properly, do this
//        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
//            @Override
//            public void run() {
//                Log.d(TAG, "PROC_QUEUE - Forcing " + side + " waiter to false after timeout");
//                if (side.equals("Left")) {
//                    leftServicesWaiter.setFalse();
//                } else {
//                    rightServicesWaiter.setFalse();
//                }
//            }
//        }, 2000); // 2 seconds
//        isLeftConnected = true;
//        isRightConnected = true;
//        updateConnectionState();
//    }

    //working on rare phones
    private void enableNotification(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, String side) {
        Log.d(TAG, "PROC_QUEUE - Starting notification setup for " + side);

        // Simply enable notifications
        boolean result = gatt.setCharacteristicNotification(characteristic, true);
        Log.d(TAG, "PROC_QUEUE - setCharacteristicNotification result for " + side + ": " + result);

        // Set write type for the characteristic
        characteristic.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
        Log.d(TAG, "PROC_QUEUE - write type set for " + side);

        // Mark as connected and release waiter immediately
        if ("Left".equals(side)) {
            isLeftConnected = true;
            leftServicesWaiter.setFalse();
            Log.d(TAG, "PROC_QUEUE - left side setup complete");
        } else {
            isRightConnected = true;
            rightServicesWaiter.setFalse();
            Log.d(TAG, "PROC_QUEUE - right side setup complete");
        }
        updateConnectionState();
    }

    //attempted combination of the 2
//    private void enableNotification(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, String side) {
//        Log.d(TAG, "PROC_QUEUE - Starting notification setup for " + side);
//
//        // Simply enable notifications
//        boolean result = gatt.setCharacteristicNotification(characteristic, true);
//        Log.d(TAG, "PROC_QUEUE - setCharacteristicNotification result for " + side + ": " + result);
//
//        if (!result) {
//            Log.e(TAG, "PROC_QUEUE - Failed to enable notifications for " + side);
//            return;
//        }
//
//        // Set write type for the characteristic
//        characteristic.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
//        Log.d(TAG, "PROC_QUEUE - write type set for " + side);
//
//        // Mark as connected and release waiter immediately
//        if ("Left".equals(side)) {
//            isLeftConnected = true;
//            leftServicesWaiter.setFalse();
//            Log.d(TAG, "PROC_QUEUE - left side setup complete");
//        } else {
//            isRightConnected = true;
//            rightServicesWaiter.setFalse();
//            Log.d(TAG, "PROC_QUEUE - right side setup complete");
//        }
//        updateConnectionState();
//    }

    private void updateConnectionState() {
        if (isLeftConnected && isRightConnected) {
            connectionState = SmartGlassesConnectionState.CONNECTED;
            Log.d(TAG, "Both glasses connected");
            lastConnectionTimestamp = System.currentTimeMillis();
            connectionEvent(connectionState);
        } else if (isLeftConnected || isRightConnected) {
            connectionState = SmartGlassesConnectionState.CONNECTING;
            Log.d(TAG, "One glass connected");
            connectionEvent(connectionState);
        } else {
            connectionState = SmartGlassesConnectionState.DISCONNECTED;
            Log.d(TAG, "No glasses connected");
            connectionEvent(connectionState);
        }
    }

    private final BroadcastReceiver bondingReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (BluetoothDevice.ACTION_BOND_STATE_CHANGED.equals(action)) {
                BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                int bondState = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, -1);

                if (bondState == BluetoothDevice.BOND_BONDED) {
                    Log.d(TAG, "Bonded with device: " + device.getName());
                    if (device.getName().contains("_L_")) {
                        isLeftBonded = true;
                        isLeftPairing = false;
                        pendingSavedG1LeftName = device.getName();
                    } else if (device.getName().contains("_R_")) {
                        isRightBonded = true;
                        isRightPairing = false;
                        pendingSavedG1RightName = device.getName();
                    }

                    // Restart scan for the next device
                    if (!isLeftBonded || !isRightBonded) {
                        // if (!(isLeftBonded && !isRightBonded)){// || !doPendingPairingIdsMatch()) {
                        Log.d(TAG, "Restarting scan to find remaining device...");
                        startScan();
                    } else if (isLeftBonded && isRightBonded && !doPendingPairingIdsMatch()) {
                        // We've connected to two different G1s...
                        // Let's unpair the right, try to pair to a different one
                        isRightBonded = false;
                        isRightConnected = false;
                        isRightPairing = false;
                        pendingSavedG1RightName = null;
                        Log.d(TAG, "Connected to two different G1s - retry right G1 arm");
                    } else {
                        Log.d(TAG, "Both devices bonded. Proceeding with connections...");
                        savedG1LeftName = pendingSavedG1LeftName;
                        savedG1RightName = pendingSavedG1RightName;
                        savePairedDeviceNames();
                        stopScan();

                        connectHandler.postDelayed(() -> {
                            connectToGatt(leftDevice);
                        }, 0);

                        connectHandler.postDelayed(() -> {
                            connectToGatt(rightDevice);
                        }, 2000);
                    }
                } else if (bondState == BluetoothDevice.BOND_NONE) {
                    Log.d(TAG, "Bonding failed for device: " + device.getName());
                    if (device.getName().contains("_L_")) isLeftPairing = false;
                    if (device.getName().contains("_R_")) isRightPairing = false;

                    // Restart scanning to retry bonding
                    if (retryBondHandler == null) {
                        retryBondHandler = new Handler(Looper.getMainLooper());
                    }

                    retryBondHandler.postDelayed(() -> {
                        Log.d(TAG, "Retrying scan after bond failure...");
                        startScan();
                    }, BOND_RETRY_DELAY_MS);
                }
            }
        }
    };

    public boolean doPendingPairingIdsMatch() {
        String leftId = parsePairingIdFromDeviceName(pendingSavedG1LeftName);
        String rightId = parsePairingIdFromDeviceName(pendingSavedG1RightName);
        Log.d(TAG, "LeftID: " + leftId);
        Log.d(TAG, "RightID: " + rightId);

        //ok, HACKY, but if one of them is null, that means that we connected to the other on a previous connect
        //this whole function shouldn't matter anymore anyway as we properly filter for the device name, so it should be fine
        //in the future, the way to actually check this would be to check the final ID string, which is the only one guaranteed to be unique
        if (leftId == null || rightId == null){
            return true;
        }

        return leftId != null && leftId.equals(rightId);
    }
    public String parsePairingIdFromDeviceName(String input) {
        if (input == null || input.isEmpty()) return null;
        // Regular expression to match the number after "G1_"
        Pattern pattern = Pattern.compile("G1_(\\d+)_");
        Matcher matcher = pattern.matcher(input);

        if (matcher.find()) {
            return matcher.group(1); // Group 1 contains the number
        }
        return null; // Return null if no match is found
    }

    public static void savePreferredG1DeviceId(Context context, String deviceName){
        context.getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(SAVED_G1_ID_KEY, deviceName)
                .apply();
    }

    public static String getPreferredG1DeviceId(Context context){
        SharedPreferences prefs = context.getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(SAVED_G1_ID_KEY, null);
    }

    public static int getSavedBrightnessValue(Context context){
        return Integer.parseInt(PreferenceManager.getDefaultSharedPreferences(context).getString(context.getResources().getString(R.string.SHARED_PREF_BRIGHTNESS), "50"));
    }

    private void savePairedDeviceNames() {
        if (savedG1LeftName != null && savedG1RightName != null) {
            context.getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putString(LEFT_DEVICE_KEY, savedG1LeftName)
                    .putString(RIGHT_DEVICE_KEY, savedG1RightName)
                    .apply();
            Log.d(TAG, "Saved paired device names: Left=" + savedG1LeftName + ", Right=" + savedG1RightName);
        }
    }

    private void loadPairedDeviceNames() {
        SharedPreferences prefs = context.getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE);
        savedG1LeftName = prefs.getString(LEFT_DEVICE_KEY, null);
        savedG1RightName = prefs.getString(RIGHT_DEVICE_KEY, null);
        Log.d(TAG, "Loaded paired device names: Left=" + savedG1LeftName + ", Right=" + savedG1RightName);
    }

    public static void deleteEvenSharedPreferences(Context context) {
        savePreferredG1DeviceId(context, null);
        SharedPreferences prefs = context.getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().clear().apply();
        Log.d(TAG, "Nuked EvenRealities SharedPreferences");
    }

    private void connectToGatt(BluetoothDevice device) {
        Log.d(TAG, "connectToGatt called");

        // re-set services waiter
        leftServicesWaiter.setTrue();
        rightServicesWaiter.setTrue();

        if (device.getName().contains("_L_") && leftGlassGatt == null) {
            Log.d(TAG, "Connect GATT to left side");
            leftGlassGatt = device.connectGatt(context, false, leftGattCallback);
            isLeftConnected = false; // Reset connection state
//            startConnectionTimeout("Left", leftGlassGatt);
        } else if (device.getName().contains("_R_") && rightGlassGatt == null) {
            Log.d(TAG, "Connect GATT to right side");
            rightGlassGatt = device.connectGatt(context, false, rightGattCallback);
            isRightConnected = false; // Reset connection state
//            startConnectionTimeout("Right", rightGlassGatt);
        } else {
            Log.d(TAG, "Tried to connect to incorrect or already connected device: " + device.getName());
        }
    }

    private void reconnectToGatt(BluetoothDevice device) {
        if (isKilled){
            return;
        }
        connectToGatt(device); // Reuse the connectToGatt method
    }

    private void startConnectionTimeout(String side, BluetoothGatt gatt) {
        Runnable timeoutRunnable = () -> {
            if ("Left".equals(side)) {
                if (!isLeftConnected) {
                    Log.d(TAG, "Left connection timed out. Closing GATT and retrying...");
                    if (leftGlassGatt != null) {
                        leftGlassGatt.disconnect();
                        leftGlassGatt.close();
                        leftGlassGatt = null;
                    }
                    leftReconnectAttempts++;
                    scheduleReconnect("Left", gatt.getDevice());
                }
            } else if ("Right".equals(side)) {
                if (!isRightConnected) {
                    Log.d(TAG, "Right connection timed out. Closing GATT and retrying...");
                    if (rightGlassGatt != null) {
                        rightGlassGatt.disconnect();
                        rightGlassGatt.close();
                        rightGlassGatt = null;
                    }
                    rightReconnectAttempts++;
                    scheduleReconnect("Right", gatt.getDevice());
                }
            }
        };

        if ("Left".equals(side)) {
            leftConnectionTimeoutRunnable = timeoutRunnable;
            leftConnectionTimeoutHandler.postDelayed(leftConnectionTimeoutRunnable, CONNECTION_TIMEOUT_MS);
        } else if ("Right".equals(side)) {
            rightConnectionTimeoutRunnable = timeoutRunnable;
            rightConnectionTimeoutHandler.postDelayed(rightConnectionTimeoutRunnable, CONNECTION_TIMEOUT_MS);
        }
    }

    private void scheduleReconnect(String side, BluetoothDevice device) {
        long delay;
        if ("Left".equals(side)) {
            delay = Math.min(BASE_RECONNECT_DELAY_MS * (1L << leftReconnectAttempts), MAX_RECONNECT_DELAY_MS);
            Log.d(TAG, side + " glass reconnecting in " + delay + " ms (Attempt " + leftReconnectAttempts + ")");
        } else { // "Right"
            delay = Math.min(BASE_RECONNECT_DELAY_MS * (1L << rightReconnectAttempts), MAX_RECONNECT_DELAY_MS);
            Log.d(TAG, side + " glass reconnecting in " + delay + " ms (Attempt " + rightReconnectAttempts + ")");
        }

        reconnectHandler.postDelayed(() -> reconnectToGatt(device), delay);
    }


    private final ScanCallback modernScanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            BluetoothDevice device = result.getDevice();
            String name = device.getName();

            // Now you can reference the bluetoothAdapter field if needed:
            if (!bluetoothAdapter.isEnabled()) {
                Log.e(TAG, "Bluetooth is disabled");
                return;
            }

            // Check if G1 arm
            if (name == null || !name.contains("Even G1_")) {
                return;
            }

//            Log.d(TAG, "PREFERRED ID: " + preferredG1DeviceId);
            if (preferredG1DeviceId == null || !name.contains(preferredG1DeviceId + "_")) {
                Log.d(TAG, "NOT PAIRED GLASSES");
                return;
            }


            Log.d(TAG, "FOUND OUR PREFERRED ID: " + preferredG1DeviceId);

            boolean isLeft = name.contains("_L_");

            // If we already have saved device names for left/right...
            if (savedG1LeftName != null && savedG1RightName != null) {
                if (!(name.contains(savedG1LeftName) || name.contains(savedG1RightName))) {
                    return; // Not a matching device
                }
            }

            // Identify which side (left/right)
            if (isLeft) {
                leftDevice = device;
            } else {
                rightDevice = device;
            }

            int bondState = device.getBondState();
            if (bondState != BluetoothDevice.BOND_BONDED) {
                // Stop scan before initiating bond
                stopScan();

                if (isLeft && !isLeftPairing && !isLeftBonded) {
//                    Log.d(TAG, "Bonding with Left Glass...");
                    isLeftPairing = true;
                    connectionState = SmartGlassesConnectionState.BONDING;
                    connectionEvent(connectionState);
                    bondDevice(device);
                } else if (!isLeft && !isRightPairing && !isRightBonded) {
//                    Log.d(TAG, "Bonding with Right Glass...");
                    isRightPairing = true;
                    connectionState = SmartGlassesConnectionState.BONDING;
                    connectionEvent(connectionState);
                    bondDevice(device);
                } else {
                    Log.d(TAG, "Not running a53dd");
                }
            } else {
                // Already bonded
                if (isLeft) isLeftBonded = true; else isRightBonded = true;

                // Both are bonded => connect to GATT
                if (leftDevice != null && rightDevice != null && isLeftBonded && isRightBonded) {
                    Log.d(TAG, "Both sides bonded. Ready to connect to GATT.");
                    stopScan();

                    connectHandler.postDelayed(() -> {
                        attemptGattConnection(leftDevice);
                    },0);

                    connectHandler.postDelayed(() -> {
                        attemptGattConnection(rightDevice);
                    },2000);
                } else {
                    Log.d(TAG, "Not running a63dd");
                }
            }
        }

        @Override
        public void onScanFailed(int errorCode) {
            Log.e(TAG, "Scan failed with error: " + errorCode);
        }
    };

    @Override
    public void connectToSmartGlasses() {
        // Register bonding receiver
        IntentFilter filter = new IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED);
        context.registerReceiver(bondingReceiver, filter);
        isBondingReceiverRegistered=true;

        preferredG1DeviceId = getPreferredG1DeviceId(context);

        if(!bluetoothAdapter.isEnabled()) {

            return;
        }

        // Start scanning for devices
        connectionState = SmartGlassesConnectionState.SCANNING;
        connectionEvent(connectionState);
        startScan();
    }

    private void startScan() {
        BluetoothLeScanner scanner = bluetoothAdapter.getBluetoothLeScanner();
        if (scanner == null) {
            Log.e(TAG, "BluetoothLeScanner not available.");
            return;
        }

        // Optionally, define filters if needed
        List<ScanFilter> filters = new ArrayList<>();
        // For example, to filter by device name:
        // filters.add(new ScanFilter.Builder().setDeviceName("Even G1_").build());

        // Set desired scan settings
        ScanSettings settings = new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build();

        // Start scanning
        isScanning = true;
        scanner.startScan(filters, settings, modernScanCallback);
        Log.d(TAG, "CALL START SCAN - Started scanning for devices...");

        // Stop the scan after some time (e.g., 10-15s instead of 60 to avoid throttling)
        //handler.postDelayed(() -> stopScan(), 10000);
    }

    private void stopScan() {
        BluetoothLeScanner scanner = bluetoothAdapter.getBluetoothLeScanner();
        if (scanner != null) {
            scanner.stopScan(modernScanCallback);
        }
        isScanning = false;
        Log.d(TAG, "Stopped scanning for devices");
    }

    private void bondDevice(BluetoothDevice device) {
        try {
            Log.d(TAG, "Attempting to bond with device: " + device.getName());
            Method method = device.getClass().getMethod("createBond");
            method.invoke(device);
        } catch (Exception e) {
            Log.e(TAG, "Bonding failed: " + e.getMessage());
        }
    }

    private void attemptGattConnection(BluetoothDevice device) {
        Log.d(TAG, "attemptGattConnection called");
        if (!isLeftBonded || !isRightBonded) {
            Log.d(TAG, "Cannot connect to GATT: Both devices are not bonded yet");
            return;
        }

        connectionState = SmartGlassesConnectionState.CONNECTING;
        connectionEvent(connectionState);

        // Connect left first
        if (device.getName().contains("_L_") && leftGlassGatt == null) {
            Log.d(TAG, "Connecting to GATT for Left Glass...");
            leftGlassGatt = device.connectGatt(context, false, leftGattCallback);
            isLeftConnected = true;
        }
        // Only connect right after left is fully connected
        else if (device.getName().contains("_R_") && rightGlassGatt == null && isLeftConnected) {
            Log.d(TAG, "Connecting to GATT for Right Glass...");
            rightGlassGatt = device.connectGatt(context, false, rightGattCallback);
            isRightConnected = true;
        }
        else {
            Log.d(TAG, "Waiting for left glass before connecting right");
        }
    }

    private byte[] createTextPackage(String text, int currentPage, int totalPages, int screenStatus) {
        byte[] textBytes = text.getBytes();
        ByteBuffer buffer = ByteBuffer.allocate(9 + textBytes.length);
        buffer.put((byte) 0x4E);
        buffer.put((byte) (currentSeq++ & 0xFF));
        buffer.put((byte) 1);
        buffer.put((byte) 0);
        buffer.put((byte) screenStatus);
        buffer.put((byte) 0);
        buffer.put((byte) 0);
        buffer.put((byte) currentPage);
        buffer.put((byte) totalPages);
        buffer.put(textBytes);

        return buffer.array();
    }

    private void sendDataSequentially(byte[] data) {
        sendDataSequentially(data, false);
    }

    private void sendDataSequentially(List<byte[]> data) {
        sendDataSequentially(data, false);
    }

//    private void sendDataSequentially(byte[] data, boolean onlyLeft) {
//        if (stopper) return;
//        stopper = true;
//
//        new Thread(() -> {
//            try {
//                if (leftGlassGatt != null && leftTxChar != null) {
//                    leftTxChar.setValue(data);
//                    leftGlassGatt.writeCharacteristic(leftTxChar);
//                    Thread.sleep(DELAY_BETWEEN_SENDS_MS);
//                }
//
//                if (!onlyLeft && rightGlassGatt != null && rightTxChar != null) {
//                    rightTxChar.setValue(data);
//                    rightGlassGatt.writeCharacteristic(rightTxChar);
//                    Thread.sleep(DELAY_BETWEEN_SENDS_MS);
//                }
//                stopper = false;
//            } catch (InterruptedException e) {
//                Log.e(TAG, "Error sending data: " + e.getMessage());
//            }
//        }).start();
//    }

    // Data class to represent a send request
    private static class SendRequest {
        final byte[] data;
        final boolean onlyLeft;
        final boolean onlyRight;
        public int waitTime = -1;

        SendRequest(byte[] data, boolean onlyLeft, boolean onlyRight) {
            this.data = data;
            this.onlyLeft = onlyLeft;
            this.onlyRight = onlyRight;
        }

        SendRequest(byte[] data, boolean onlyLeft, boolean onlyRight, int waitTime) {
            this.data = data;
            this.onlyLeft = onlyLeft;
            this.onlyRight = onlyRight;
            this.waitTime = waitTime;
        }
    }

    // Queue to hold pending requests
    private final ConcurrentLinkedQueue<SendRequest []> sendQueue = new ConcurrentLinkedQueue<>();
    private volatile boolean isWorkerRunning = false;

    // Non-blocking function to add new send request
    private void sendDataSequentially(byte[] data, boolean onlyLeft) {
        SendRequest [] chunks = {new SendRequest(data, onlyLeft, false)};
        sendQueue.offer(chunks);
        startWorkerIfNeeded();
    }

    // Non-blocking function to add new send request
    private void sendDataSequentially(byte[] data, boolean onlyLeft, int waitTime) {
        SendRequest [] chunks = {new SendRequest(data, onlyLeft, false, waitTime)};
        sendQueue.offer(chunks);
        startWorkerIfNeeded();
    }

    // Overloaded function to handle multiple chunks (List<byte[]>)
    private void sendDataSequentially(List<byte[]> data, boolean onlyLeft) {
        sendDataSequentially(data, onlyLeft, false);
    }

    private void sendDataSequentially(byte[] data, boolean onlyLeft, boolean onlyRight) {
        SendRequest [] chunks = {new SendRequest(data, onlyLeft, onlyRight)};
        sendQueue.offer(chunks);
        startWorkerIfNeeded();
    }

    private void sendDataSequentially(byte[] data, boolean onlyLeft, boolean onlyRight, int waitTime) {
        SendRequest [] chunks = {new SendRequest(data, onlyLeft, onlyRight, waitTime)};
        sendQueue.offer(chunks);
        startWorkerIfNeeded();
    }

    private void sendDataSequentially(List<byte[]> data, boolean onlyLeft, boolean onlyRight) {
        SendRequest[] chunks = new SendRequest[data.size()];
        for (int i = 0; i < data.size(); i++) {
            chunks[i] = new SendRequest(data.get(i), onlyLeft, onlyRight);
        }
        sendQueue.offer(chunks);
        startWorkerIfNeeded();
    }

    // Start the worker thread if it's not already running
    private synchronized void startWorkerIfNeeded() {
        if (!isWorkerRunning) {
            isWorkerRunning = true;
            new Thread(this::processQueue).start();
        }
    }



    public class BooleanWaiter {
        private boolean flag = true;  // initially true

        public synchronized void waitWhileTrue() throws InterruptedException {
            while (flag) {
                wait();
            }
        }

        public synchronized void setTrue() {
            flag = true;
        }

        public synchronized void setFalse() {
            flag = false;
            notifyAll();
        }
    }

    private final BooleanWaiter leftWaiter = new BooleanWaiter();
    private final BooleanWaiter rightWaiter = new BooleanWaiter();
    private final BooleanWaiter leftServicesWaiter = new BooleanWaiter();
    private final BooleanWaiter rightServicesWaiter = new BooleanWaiter();
    private static final long INITIAL_CONNECTION_DELAY_MS = 350; // Adjust this value as needed

    private void processQueue() {
        //first wait until the services are setup and ready to receive data
        Log.d(TAG, "PROC_QUEUE - waiting on services waiters");
        try {
            leftServicesWaiter.waitWhileTrue();
            rightServicesWaiter.waitWhileTrue();
        } catch (InterruptedException e) {
            Log.e(TAG, "Interrupted waiting for descriptor writes: " + e);
        }
        Log.d(TAG, "PROC_QUEUE - DONE waiting on services waiters");

        while (true) {
            SendRequest[] requests = sendQueue.poll();
            if (requests == null){
                continue;
            }

            for (SendRequest request : requests) {
                if (request == null) {
                    isWorkerRunning = false;
                    break;
                }

                try {
                    //force an initial delay so BLE gets all setup
                    long timeSinceConnection = System.currentTimeMillis() - lastConnectionTimestamp;
                    if (timeSinceConnection < INITIAL_CONNECTION_DELAY_MS) {
                        Thread.sleep(INITIAL_CONNECTION_DELAY_MS - timeSinceConnection);
                    }

                    boolean leftSuccess = true;
                    boolean rightSuccess = true;

                    // Send to left glass
                    if (!request.onlyRight && leftGlassGatt != null && leftTxChar != null && isLeftConnected) {
                        leftWaiter.setTrue();
                        leftTxChar.setValue(request.data);
                        leftSuccess = leftGlassGatt.writeCharacteristic(leftTxChar);
                    }

                    if (leftSuccess) {
                        leftWaiter.waitWhileTrue();
                    } else {
                        Log.d(TAG, "PROC_QUEUE - LEFT send fail");
                    }

                    // Send to right glass
                    if (!request.onlyLeft && rightGlassGatt != null && rightTxChar != null && isRightConnected) {
                        rightWaiter.setTrue();
                        rightTxChar.setValue(request.data);
                        rightSuccess = rightGlassGatt.writeCharacteristic(rightTxChar);
                    }

                    //wait to make sure the right happens
                    if (rightSuccess) {
                        rightWaiter.waitWhileTrue();
                    } else {
                        Log.d(TAG, "PROC_QUEUE - LEFT send fail");
                    }

                    Thread.sleep(DELAY_BETWEEN_CHUNKS_SEND);

                    // if the packet asked us to do a delay, then do it
                    if (request.waitTime != -1){
                        Thread.sleep(request.waitTime);
                    }
                } catch (InterruptedException e) {
                    Log.e(TAG, "Error sending data: " + e.getMessage());
                    // Optionally re-add the failed request to the queue
                    // sendQueue.offer(request);
                }
            }
//            try {
//                Thread.sleep(DELAY_BETWEEN_ACTIONS_SEND);
//            } catch (InterruptedException e) {
//                e.printStackTrace();
//            }
        }
    }

//    @Override
//    public void displayReferenceCardSimple(String title, String body, int lingerTimeMs) {
//        displayReferenceCardSimple(title, body, lingerTimeMs);
//    }

    private static final int NOTIFICATION = 0x4B; // Notification command
    private String createNotificationJson(String appIdentifier, String title, String subtitle, String message) {
        long currentTime = System.currentTimeMillis() / 1000L; // Unix timestamp in seconds
        String currentDate = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new java.util.Date()); // Date format for 'date' field

        NCSNotification ncsNotification = new NCSNotification(
                notificationNum++,  // Increment sequence ID for uniqueness
                1,             // type (e.g., 1 = notification type)
                appIdentifier,
                title,
                subtitle,
                message,
                (int) currentTime,  // Cast long to int to match Python
                currentDate,        // Add the current date to the notification
                "AugmentOS" // display_name
        );

        Notification notification = new Notification(ncsNotification, "Add");

        Gson gson = new Gson();
        return gson.toJson(notification);
    }


    class Notification {
        NCSNotification ncs_notification;
        String type;

        public Notification() {
            // Default constructor
        }

        public Notification(NCSNotification ncs_notification, String type) {
            this.ncs_notification = ncs_notification;
            this.type = type;
        }
    }

    class NCSNotification {
        int msg_id;
        int type;
        String app_identifier;
        String title;
        String subtitle;
        String message;
        int time_s;  // Changed from long to int for consistency
        String date; // Added to match Python's date field
        String display_name;

        public NCSNotification(int msg_id, int type, String app_identifier, String title, String subtitle, String message, int time_s, String date, String display_name) {
            this.msg_id = msg_id;
            this.type = type;
            this.app_identifier = app_identifier;
            this.title = title;
            this.subtitle = subtitle;
            this.message = message;
            this.time_s = time_s;
            this.date = date; // Initialize the date field
            this.display_name = display_name;
        }
    }

    private List<byte[]> createNotificationChunks(String json) {
        final int MAX_CHUNK_SIZE = 176; // 180 - 4 header bytes
        byte[] jsonBytes = json.getBytes(StandardCharsets.UTF_8);
        int totalChunks = (int) Math.ceil((double) jsonBytes.length / MAX_CHUNK_SIZE);

        List<byte[]> chunks = new ArrayList<>();
        for (int i = 0; i < totalChunks; i++) {
            int start = i * MAX_CHUNK_SIZE;
            int end = Math.min(start + MAX_CHUNK_SIZE, jsonBytes.length);
            byte[] payloadChunk = Arrays.copyOfRange(jsonBytes, start, end);

            // Create the header
            byte[] header = new byte[] {
                    (byte) NOTIFICATION,
                    0x00, // notify_id (can be updated as needed)
                    (byte) totalChunks,
                    (byte) i
            };

            // Combine header and payload
            ByteBuffer chunk = ByteBuffer.allocate(header.length + payloadChunk.length);
            chunk.put(header);
            chunk.put(payloadChunk);

            chunks.add(chunk.array());
        }

        return chunks;
    }

    @Override
    public void displayReferenceCardSimple(String title, String body) {
        if (!isConnected()) {
            Log.d(TAG, "Not connected to glasses");
            return;
        }

        List<byte[]> chunks = createTextWallChunks(title + "\n\n" + body);
        sendChunks(chunks);
        Log.d(TAG, "Send simple reference card");
    }

    @Override
    public void destroy() {
        Log.d(TAG, "EvenRealitiesG1SGC ONDESTROY");
        isKilled = true;

        //stop BLE scanning
        stopScan();

        if (bondingReceiver != null && isBondingReceiverRegistered) {
            context.unregisterReceiver(bondingReceiver);
            isBondingReceiverRegistered = false;
        }

        //disable the microphone
        setMicEnabled(false, 0);

        //stop sending heartbeat
        stopHeartbeat();

        //stop sending micbeat
        stopMicBeat();

        // Stop periodic notifications
        stopPeriodicNotifications();

        // Stop periodic text wall
//        stopPeriodicNotifications();

        if (leftGlassGatt != null) {
            leftGlassGatt.disconnect();
        }

        if (leftGlassGatt != null) {
            leftGlassGatt.close();
            leftGlassGatt = null;
        }
        if (rightGlassGatt != null) {
            rightGlassGatt.disconnect();
        }
        if (rightGlassGatt != null) {
            rightGlassGatt.close();
            rightGlassGatt = null;
        }

        if (handler != null)
            handler.removeCallbacksAndMessages(null);
        if (heartbeatHandler != null)
            heartbeatHandler.removeCallbacks(heartbeatRunnable);
        if (whiteListHandler != null)
            whiteListHandler.removeCallbacksAndMessages(null);
        if (micEnableHandler != null)
            micEnableHandler.removeCallbacksAndMessages(null);
        if (notificationHandler != null)
            notificationHandler.removeCallbacks(notificationRunnable);
        if (textWallHandler != null)
            textWallHandler.removeCallbacks(textWallRunnable);
        //if (goHomeHandler != null)
        //    goHomeHandler.removeCallbacks(goHomeRunnable);
        if (findCompatibleDevicesHandler != null)
            findCompatibleDevicesHandler.removeCallbacksAndMessages(null);
        if (connectHandler != null)
            connectHandler.removeCallbacksAndMessages(null);
        if (retryBondHandler != null)
            retryBondHandler.removeCallbacksAndMessages(null);
        if (characteristicHandler != null) {
            characteristicHandler.removeCallbacksAndMessages(null);
        }
        if (reconnectHandler != null) {
            reconnectHandler.removeCallbacksAndMessages(null);
        }
        if (leftConnectionTimeoutHandler != null && leftConnectionTimeoutRunnable != null) {
            leftConnectionTimeoutHandler.removeCallbacks(leftConnectionTimeoutRunnable);
        }
        if (rightConnectionTimeoutHandler != null && rightConnectionTimeoutRunnable != null) {
            rightConnectionTimeoutHandler.removeCallbacks(rightConnectionTimeoutRunnable);
        }
        if (reconnectHandler != null) {
            reconnectHandler.removeCallbacksAndMessages(null);
        }
        if (queryBatterStatusHandler != null && queryBatterStatusHandler!= null) {
            queryBatterStatusHandler.removeCallbacksAndMessages(null);
        }

        sendQueue.clear();
        isWorkerRunning = false;

        isLeftConnected = false;
        isRightConnected = false;

        Log.d(TAG, "EvenRealitiesG1SGC cleanup complete");
    }


    @Override
    public boolean isConnected() {
        return connectionState == SmartGlassesConnectionState.CONNECTED;
    }

    // Remaining methods
    @Override
    public void displayCenteredText(String text) {}

    @Override
    public void showNaturalLanguageCommandScreen(String prompt, String naturalLanguageInput) {}

    @Override
    public void updateNaturalLanguageCommandScreen(String naturalLanguageArgs) {}

    @Override
    public void scrollingTextViewIntermediateText(String text) {}

    @Override
    public void scrollingTextViewFinalText(String text) {}

    @Override
    public void stopScrollingTextViewMode() {}

    @Override
    public void displayPromptView(String title, String[] options) {}

    @Override
    public void displayTextLine(String text) {}

    @Override
    public void displayBitmap(Bitmap bmp) {}

    public void blankScreen() {}

    public void displayDoubleTextWall(String textTop, String textBottom) {
//        List<byte[]> chunks = createDoubleTextWallChunks(textTop, textBottom);
//        textTop = "...... ......\n. . . . .\n. . . . . . . . . . . . . \n......... ...............\nshe shaid shit show";
//        textTop = "a fine bulgogi bowl man\n. .\u200B . . .\n. . . . . . . . . . . . . \n»......... ...............\nshe → shaid shit show";
//        textTop = "a fine bulgogi bowl man\n. .\u200B . . .\n. . . . . . . . . . . . . \n......... ...............\nshe shaid shit show";
//        textBottom = "|...\n| . .\n|. . . \n|....\n|asdf";
        List<byte[]> chunks = createDoubleTextWallChunks(textTop, textBottom);
        sendChunks(chunks);
//        Log.d(TAG, "Send double text wall");
    }

    public void showHomeScreen() {
//        Log.d(TAG, "EVEN SHOWING HOME SCREEN");
        displayTextWall(" ");
//        clearG1Screen();
    }

    public void clearG1Screen() {
        displayTextWall(" ");
        byte[] exitCommand = new byte[]{(byte) 0x18};
        sendDataSequentially(exitCommand, false);
    }

    @Override
    public void setFontSize(SmartGlassesFontSize fontSize) {}

    public void displayRowsCard(String[] rowStrings) {}

    public void displayBulletList(String title, String[] bullets) {}

    public void displayReferenceCardImage(String title, String body, String imgUrl) {}

    public void displayTextWall(String a) {
        //goHomeHandler.removeCallbacksAndMessages(goHomeRunnable);
        //goHomeHandler.removeCallbacksAndMessages(null);
        List<byte[]> chunks = createTextWallChunks(a);
        sendChunks(chunks);
//        Log.d(TAG, "Sent text wall");
    }

    public void setFontSizes() {}

    // Heartbeat methods
    private byte[] constructHeartbeat() {
        ByteBuffer buffer = ByteBuffer.allocate(6);
        buffer.put((byte) 0x25);
        buffer.put((byte) 6);
        buffer.put((byte) (currentSeq & 0xFF));
        buffer.put((byte) 0x00);
        buffer.put((byte) 0x04);
        buffer.put((byte) (currentSeq++ & 0xFF));
        return buffer.array();
    }

    private byte[] constructBatteryLevelQuery() {
        ByteBuffer buffer = ByteBuffer.allocate(2);
        buffer.put((byte) 0x2C);  // Command
        buffer.put((byte) 0x01); // use 0x02 for iOS
        return buffer.array();
    }

    private void startHeartbeat(int delay) {
        heartbeatCount = 0;

        heartbeatRunnable = new Runnable() {
            @Override
            public void run() {
                sendHeartbeat();
//                sendLoremIpsum();
                heartbeatHandler.postDelayed(this, HEARTBEAT_INTERVAL_MS);
            }
        };

        heartbeatHandler.postDelayed(heartbeatRunnable, delay);
    }

    //periodically send a mic ON request so it never turns off
    private void startMicBeat(int delay) {
        micBeatRunnable = new Runnable() {
            @Override
            public void run() {
                Log.d(TAG, "SENDING MIC BEAT");
                setMicEnabled(true, 1);
                micBeatHandler.postDelayed(this, MICBEAT_INTERVAL_MS);
            }
        };

        micBeatHandler.postDelayed(micBeatRunnable, delay);
    }

    @Override
    public void findCompatibleDeviceNames() {
        if (isScanningForCompatibleDevices) {
            Log.d(TAG, "Scan already in progress, skipping...");
            return;
        }
        isScanningForCompatibleDevices = true;

        BluetoothLeScanner scanner = bluetoothAdapter.getBluetoothLeScanner();
        if (scanner == null) {
            Log.e(TAG, "BluetoothLeScanner not available");
            isScanningForCompatibleDevices = false;
            return;
        }

        List<String> foundDeviceNames = new ArrayList<>();
        if (findCompatibleDevicesHandler == null) {
            findCompatibleDevicesHandler = new Handler(Looper.getMainLooper());
        }

        // Optional: add filters if you want to narrow the scan
        List<ScanFilter> filters = new ArrayList<>();
        ScanSettings settings = new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_BALANCED)
                .build();

        // Create a modern ScanCallback instead of the deprecated LeScanCallback
        final ScanCallback bleScanCallback = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                BluetoothDevice device = result.getDevice();
                String name = device.getName();
                if (name != null && name.contains("Even G1_") && name.contains("_L_")) {
                    synchronized (foundDeviceNames) {
                        if (!foundDeviceNames.contains(name)) {
                            foundDeviceNames.add(name);
                            Log.d(TAG, "Found smart glasses: " + name);
                            String adjustedName = parsePairingIdFromDeviceName(name);
                            EventBus.getDefault().post(
                                    new GlassesBluetoothSearchDiscoverEvent(
                                            smartGlassesDevice.deviceModelName,
                                            adjustedName
                                    )
                            );
                        }
                    }
                }
            }

            @Override
            public void onBatchScanResults(List<ScanResult> results) {
                // If needed, handle batch results here
            }

            @Override
            public void onScanFailed(int errorCode) {
                Log.e(TAG, "BLE scan failed with code: " + errorCode);
            }
        };

        // Start scanning
        scanner.startScan(filters, settings, bleScanCallback);
        Log.d(TAG, "Started scanning for smart glasses with BluetoothLeScanner...");

        // Stop scanning after 10 seconds (adjust as needed)
        findCompatibleDevicesHandler.postDelayed(() -> {
            scanner.stopScan(bleScanCallback);
            isScanningForCompatibleDevices = false;
            Log.d(TAG, "Stopped scanning for smart glasses.");
            EventBus.getDefault().post(
                    new GlassesBluetoothSearchStopEvent(
                            smartGlassesDevice.deviceModelName
                    )
            );
        }, 10000);
    }

    private void sendWhiteListCommand(int delay) {
        if (whiteListedAlready){
            return;
        }
        whiteListedAlready = true;

        Log.d(TAG, "Sending whitelist command");
        whiteListHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                List<byte[]> chunks = getWhitelistChunks();
                sendDataSequentially(chunks, false);
//                for (byte[] chunk : chunks) {
//                    Log.d(TAG, "Sending this chunk for white list:" + bytesToUtf8(chunk));
//                    sendDataSequentially(chunk, false);
//
////                    // Sleep for 100 milliseconds between sending each chunk
////                    try {
////                        Thread.sleep(150);
////                    } catch (InterruptedException e) {
////                        e.printStackTrace();
////                    }
//                }
            }
        }, delay);
    }

    private void stopHeartbeat() {
        if (heartbeatHandler != null) {
            heartbeatHandler.removeCallbacksAndMessages(null);
            heartbeatHandler.removeCallbacksAndMessages(heartbeatRunnable);
        }
    }

    private void stopMicBeat() {
        if (micBeatHandler != null) {
            micBeatHandler.removeCallbacksAndMessages(null);
            micBeatHandler.removeCallbacksAndMessages(micBeatRunnable);
        }
    }

    private void sendHeartbeat() {
        byte[] heartbeatPacket = constructHeartbeat();
//        Log.d(TAG, "Sending heartbeat: " + bytesToHex(heartbeatPacket));

        sendDataSequentially(heartbeatPacket, false, 100);

//        if (heartbeatCount < 3 || heartbeatCount % 10 == 0) {
//            queryBatterStatusHandler.post(this::queryBatteryStatus);
//        }
        queryBatterStatusHandler.postDelayed(this::queryBatteryStatus, 500);

        heartbeatCount++;
    }

    private void queryBatteryStatus() {
        byte[] batteryQueryPacket = constructBatteryLevelQuery();
//        Log.d(TAG, "Sending battery status query: " + bytesToHex(batteryQueryPacket));

        sendDataSequentially(batteryQueryPacket, false, 150);
    }

    public void sendBrightnessCommand(int brightness, boolean autoLight) {
        // Validate brightness range
        int validBrightness = (brightness * 63) / 100;

        // Construct the command
        ByteBuffer buffer = ByteBuffer.allocate(3);
        buffer.put((byte) 0x01);              // Command
        buffer.put((byte) validBrightness);       // Brightness level (0~63)
        buffer.put((byte) (autoLight ? 1 : 0)); // Auto light (0 = close, 1 = open)

        sendDataSequentially(buffer.array(), false);

        Log.d(TAG, "Sent auto light brightness command => Brightness: " + brightness + ", Auto Light: " + (autoLight ? "Open" : "Close"));

        //send to AugmentOS core
        EventBus.getDefault().post(new BrightnessLevelEvent(autoLight ? -1 : brightness));
    }

    public void sendHeadUpAngleCommand(int headUpAngle) {
        // Validate headUpAngle range (0 ~ 60)
        if (headUpAngle < 0) {
            headUpAngle = 0;
        } else if (headUpAngle > 60) {
            headUpAngle = 60;
        }

        // Construct the command
        ByteBuffer buffer = ByteBuffer.allocate(3);
        buffer.put((byte) 0x0B);        // Command for configuring headUp angle
        buffer.put((byte) headUpAngle); // Angle value (0~60)
        buffer.put((byte) 0x01);        // Level (fixed at 0x01)

        sendDataSequentially(buffer.array(), false);

        Log.d(TAG, "Sent headUp angle command => Angle: " + headUpAngle);
        EventBus.getDefault().post(new HeadUpAngleEvent(headUpAngle));
    }

    @Override
    public void updateGlassesBrightness(int brightness) {
        sendBrightnessCommand(brightness, false);
    }

    @Override
    public void updateGlassesHeadUpAngle(int headUpAngle) {
        sendHeadUpAngleCommand(headUpAngle);
    }

    @Override
    public void enableGlassesAutoBrightness() {
        sendBrightnessCommand(50, true);
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02X ", b));
        }
        return sb.toString().trim();
    }

    //microphone stuff
    public void setMicEnabled(boolean enable, int delay) {
        Log.d(TAG, "Running set mic enabled: " + enable);
        micEnableHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!isConnected()) {
                    Log.d(TAG, "Tryna start mic: Not connected to glasses");
                    return;
                }

                byte command = 0x0E; // Command for MIC control
                byte enableByte = (byte) (enable ? 1 : 0); // 1 to enable, 0 to disable

                ByteBuffer buffer = ByteBuffer.allocate(2);
                buffer.put(command);
                buffer.put(enableByte);

                sendDataSequentially(buffer.array(), false, true, 300); //wait some time to setup the mic
                Log.d(TAG, "Sent MIC command: " + bytesToHex(buffer.array()));
            }
        }, delay);
    }

    //notifications
    private void startPeriodicNotifications(int delay) {
        if (notifysStarted){
            return;
        }
        notifysStarted = true;

        notificationRunnable = new Runnable() {
            @Override
            public void run() {
                // Send notification
                sendPeriodicNotification();

                // Schedule the next notification
                notificationHandler.postDelayed(this, 12000);
            }
        };

        // Start the first notification after 5 seconds
        notificationHandler.postDelayed(notificationRunnable, delay);
    }

    private void sendPeriodicNotification() {
        if (!isConnected()) {
            Log.d(TAG, "Cannot send notification: Not connected to glasses");
            return;
        }

        // Example notification data (replace with your actual data)
//        String json = createNotificationJson("com.augment.os", "QuestionAnswerer", "How much caffeine in dark chocolate?", "25 to 50 grams per piece");
        String json = createNotificationJson("com.augment.os", "QuestionAnswerer", "How much caffeine in dark chocolate?", "25 to 50 grams per piece");
        Log.d(TAG, "the JSON to send: " + json);
        List<byte[]> chunks = createNotificationChunks(json);
//        Log.d(TAG, "THE CHUNKS:");
//        Log.d(TAG, chunks.get(0).toString());
//        Log.d(TAG, chunks.get(1).toString());
        for (byte[] chunk : chunks) {
            Log.d(TAG, "Sent chunk to glasses: " + bytesToUtf8(chunk));
        }

        // Send each chunk with a short sleep between each send
        sendDataSequentially(chunks, false);
//        for (byte[] chunk : chunks) {
//            sendDataSequentially(chunk);
//
////            // Sleep for 100 milliseconds between sending each chunk
////            try {
////                Thread.sleep(150);
////            } catch (InterruptedException e) {
////                e.printStackTrace();
////            }
//        }

        Log.d(TAG, "Sent periodic notification");
    }

    //text wall debug
    private void startPeriodicTextWall(int delay) {
        if (textWallsStarted){
            return;
        }
        textWallsStarted = true;

        textWallRunnable = new Runnable() {
            @Override
            public void run() {
                // Send notification
                sendPeriodicTextWall();

                // Schedule the next notification
                textWallHandler.postDelayed(this, 12000);
            }
        };

        // Start the first text wall send after 5 seconds
        textWallHandler.postDelayed(textWallRunnable, delay);
    }

    // Constants for text wall display
    private static final int TEXT_COMMAND = 0x4E;  // Text command
    private static final int DISPLAY_WIDTH = 240;  // Display width in pixels //I know, it's weird, but we printed a bunch of dots and this is the math
    private static final int DISPLAY_USE_WIDTH = 240;  // How much of the display to use
    private static final int FONT_SIZE = 21;      // Font size
    private static final float FONT_DIVIDER = 2.0f;
    private static final int LINES_PER_SCREEN = 5; // Lines per screen
    private static final int MAX_CHUNK_SIZE = 176; // Maximum chunk size for BLE packets
//    private static final int INDENT_SPACES = 32;    // Number of spaces to indent text

    private int textSeqNum = 0; // Sequence number for text packets

    //currently only a single page - 1PAGE CHANGE
    private List<byte[]> createTextWallChunks(String text) {
        // Split text into lines based on display width and font size
        List<String> lines = splitIntoLines(text);

        // Add indentation to each line
        float fontDivider = 2.0f;  // Same as in splitIntoLines
        int unusedWidth = DISPLAY_WIDTH - DISPLAY_USE_WIDTH;
        int indentChars = Math.round(unusedWidth / (FONT_SIZE / FONT_DIVIDER) / 2);
        lines = lines.stream()
                .map(line -> " ".repeat(indentChars) + line)
                .collect(Collectors.toList());

        // Calculate total pages
//        int totalPages = (int) Math.ceil((double) lines.size() / LINES_PER_SCREEN);
        int totalPages = 1; //hard set to 1 since we only do 1 page - 1PAGECHANGE

        List<byte[]> allChunks = new ArrayList<>();

        // Process each page
        for (int page = 0; page < totalPages; page++) {
            // Get lines for current page
            int startLine = page * LINES_PER_SCREEN;
            int endLine = Math.min(startLine + LINES_PER_SCREEN, lines.size());
            List<String> pageLines = lines.subList(startLine, endLine);

            // Combine lines for this page
            StringBuilder pageText = new StringBuilder();
            for (String line : pageLines) {
                //Log.d(TAG, "LINE: " + line);
                pageText.append(line).append("\n");
            }
            //Log.d(TAG, "PAGE TEXT: " + pageText);

            byte[] textBytes = pageText.toString().getBytes(StandardCharsets.UTF_8);
            int totalChunks = (int) Math.ceil((double) textBytes.length / MAX_CHUNK_SIZE);

            // Create chunks for this page
            for (int i = 0; i < totalChunks; i++) {
                int start = i * MAX_CHUNK_SIZE;
                int end = Math.min(start + MAX_CHUNK_SIZE, textBytes.length);
                byte[] payloadChunk = Arrays.copyOfRange(textBytes, start, end);

                // Create header with protocol specifications
                byte screenStatus = 0x71; // New content (0x01) + Text Show (0x70)
                byte[] header = new byte[] {
                        (byte) TEXT_COMMAND,    // Command type
                        (byte) textSeqNum,      // Sequence number
                        (byte) totalChunks,     // Total packages
                        (byte) i,               // Current package number
                        screenStatus,           // Screen status
                        (byte) 0x00,                   // new_char_pos0 (high)
                        (byte) 0x00,                   // new_char_pos1 (low)
                        (byte) page,            // Current page number
                        (byte) totalPages       // Max page number
                };

                // Combine header and payload
                ByteBuffer chunk = ByteBuffer.allocate(header.length + payloadChunk.length);
                chunk.put(header);
                chunk.put(payloadChunk);

                allChunks.add(chunk.array());
            }

            // Increment sequence number for next page
            textSeqNum = (textSeqNum + 1) % 256;
            break; //hard set to 1  - 1PAGECHANGE
        }

//        Log.d(TAG, "TOTAL PAGES: " + totalPages);

        return allChunks;
    }

    private int calculateTextWidth(String text) {
        int width = 0;
        for (char c : text.toCharArray()) {
            G1FontLoader.FontGlyph glyph = fontLoader.getGlyph(c);
            width += glyph.width + 1; // Add 1 pixel per character for spacing
        }
        return width;
    }

    private List<byte[]> createDoubleTextWallChunks(String text1, String text2) {
        // Split both texts into lines
        List<String> lines1 = splitIntoLines(text1);
        List<String> lines2 = splitIntoLines(text2);

        // Ensure we only take up to 5 lines per screen
        while (lines1.size() < LINES_PER_SCREEN) lines1.add("");
        while (lines2.size() < LINES_PER_SCREEN) lines2.add("");

        lines1 = lines1.subList(0, LINES_PER_SCREEN);
        lines2 = lines2.subList(0, LINES_PER_SCREEN);

        // Get space width (each space is 2 pixels + 1 extra padding pixel, so 3 total)
        int spaceWidth = fontLoader.getGlyph(' ').width + 1;

        // Calculate where the right column should start
        int rightColumnStart = Math.round(DISPLAY_USE_WIDTH * 0.6f);

        // Construct the text output by merging the lines
        StringBuilder pageText = new StringBuilder();
        for (int i = 0; i < LINES_PER_SCREEN; i++) {  // Leave last line for debug
            String leftText = lines1.get(i).replace("\u2002", ""); // Drop enspaces
            String rightText = lines2.get(i).replace("\u2002", "");

            // Calculate width of left text
            int leftTextWidth = calculateTextWidth(leftText);

            // Calculate spacing needed
            int neededSpacingPixels = rightColumnStart - leftTextWidth;
            // Base spaces (at least 3)
            int baseSpaces = Math.max(neededSpacingPixels / spaceWidth, 3);
            // Check remainder to see if we should add one extra space
            int remainder = neededSpacingPixels % spaceWidth;
            boolean addExtraSpace = (neededSpacingPixels >= 0) && (remainder == 1 || remainder == 2);
            // Cap at 60 spaces
            int safeSpaces = Math.min(baseSpaces + (addExtraSpace ? 1 : 0), 60);

            // Log compressed info
            Log.d(TAG, String.format("L: '%s' (W=%d) | Spaces=%d%s | R: '%s'",
                    leftText, leftTextWidth, safeSpaces,
                    addExtraSpace ? " + extra space" : "", rightText));

            // Construct the full line
            pageText.append(leftText)
                    .append(" ".repeat(safeSpaces))
                    .append(rightText)
                    .append("\n");
        }

        // Convert **everything**, including debug line, into bytes and chunk it
        byte[] textBytes = pageText.toString().getBytes(StandardCharsets.UTF_8);
        int totalChunks = (int) Math.ceil((double) textBytes.length / MAX_CHUNK_SIZE);

        List<byte[]> allChunks = new ArrayList<>();
        for (int i = 0; i < totalChunks; i++) {
            int start = i * MAX_CHUNK_SIZE;
            int end = Math.min(start + MAX_CHUNK_SIZE, textBytes.length);
            byte[] payloadChunk = Arrays.copyOfRange(textBytes, start, end);

            // Create header with protocol specifications
            byte screenStatus = 0x71; // New content (0x01) + Text Show (0x70)
            byte[] header = new byte[]{
                    (byte) TEXT_COMMAND,    // Command type
                    (byte) textSeqNum,      // Sequence number
                    (byte) totalChunks,     // Total packages
                    (byte) i,               // Current package number
                    screenStatus,           // Screen status
                    (byte) 0x00,            // new_char_pos0 (high)
                    (byte) 0x00,            // new_char_pos1 (low)
                    (byte) 0x00,            // Current page number (always 0 for now)
                    (byte) 0x01             // Max page number (always 1)
            };

            // Combine header and payload
            ByteBuffer chunk = ByteBuffer.allocate(header.length + payloadChunk.length);
            chunk.put(header);
            chunk.put(payloadChunk);

            allChunks.add(chunk.array());
        }

        // **Ensure BLE packet limit is respected**
        if (allChunks.size() > totalChunks) {
            Log.e(TAG, "Chunking error: Exceeded totalChunks!");
        }

        // Increment sequence number for next page
        textSeqNum = (textSeqNum + 1) % 256;

        return allChunks;
    }

    private List<String> splitIntoLines(String text) {
        // Replace specific symbols
        text = text.replace("⬆", "^").replace("⟶", "-");

        // Handle the specific case of " " (single space)
        if (" ".equals(text)) {
            List<String> lines = new ArrayList<>();
            lines.add(" "); // Add a single space as a line
            return lines;
        }

        List<String> lines = new ArrayList<>();
        String[] rawLines = text.split("\n"); // Split by newlines first
        int charsPerLine = (int) Math.round((DISPLAY_USE_WIDTH / (FONT_SIZE / FONT_DIVIDER) * 1.45)); // Rough estimate

        for (String rawLine : rawLines) {
            if (rawLine.isEmpty()) {
                // Add an empty line for \n
                lines.add("");
                continue;
            }

            // Wrap text (similar to wrapText) using our rough charsPerLine
            String current = rawLine.trim();
            while (!current.isEmpty()) {
                // If shorter than max length, just add
                if (current.length() <= charsPerLine) {
                    lines.add(current);
                    break;
                }

                // Otherwise, find the best split position
                int splitIndex = charsPerLine;

                // Move splitIndex left until we find a space
                while (splitIndex > 0 && current.charAt(splitIndex) != ' ') {
                    splitIndex--;
                }

                // If no space was found, force the split at charsPerLine
                if (splitIndex == 0) {
                    splitIndex = charsPerLine;
                }

                // Extract the chunk, trim it, and add to result lines
                String chunk = current.substring(0, splitIndex).trim();
                lines.add(chunk);

                // Remove that chunk (plus leading/trailing spaces) from current
                current = current.substring(splitIndex).trim();
            }
        }

        return lines;
    }

    private void sendPeriodicTextWall() {
        if (!isConnected()) {
            Log.d(TAG, "Cannot send text wall: Not connected to glasses");
            return;
        }

        Log.d(TAG, "^^^^^^^^^^^^^ SENDING DEBUG TEXT WALL");

        // Example text wall content - replace with your actual text content
        String sampleText = "This is an example of a text wall that will be displayed on the glasses. " +
                "It demonstrates how text can be split into multiple pages and displayed sequentially. " +
                "Each page contains multiple lines, and each line is carefully formatted to fit the display width. " +
                "The text continues across multiple pages, showing how longer content can be handled effectively.";

        List<byte[]> chunks = createTextWallChunks(sampleText);

        // Send each chunk with a delay between sends
        for (byte[] chunk : chunks) {
            sendDataSequentially(chunk);

//            try {
//                Thread.sleep(150); // 150ms delay between chunks
//            } catch (InterruptedException e) {
//                e.printStackTrace();
//            }
        }

        // Log.d(TAG, "Sent text wall");
    }

    private static String bytesToUtf8(byte[] bytes) {
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private void stopPeriodicNotifications() {
        if (notificationHandler != null && notificationRunnable != null) {
            notificationHandler.removeCallbacks(notificationRunnable);
            Log.d(TAG, "Stopped periodic notifications");
        }
    }

    // handle white list stuff
    private static final int WHITELIST_CMD = 0x04; // Command ID for whitelist
    public List<byte[]> getWhitelistChunks() {
        // Define the hardcoded whitelist JSON
        List<AppInfo> apps = new ArrayList<>();
        apps.add(new AppInfo("com.augment.os", "AugmentOS"));
        String whitelistJson = createWhitelistJson(apps);

        Log.d(TAG, "Creating chunks for hardcoded whitelist: " + whitelistJson);

        // Convert JSON to bytes and split into chunks
        return createWhitelistChunks(whitelistJson);
    }

    private String createWhitelistJson(List<AppInfo> apps) {
        JSONArray appList = new JSONArray();
        try {
            // Add each app to the list
            for (AppInfo app : apps) {
                JSONObject appJson = new JSONObject();
                appJson.put("id", app.getId());
                appJson.put("name", app.getName());
                appList.put(appJson);
            }

            JSONObject whitelistJson = new JSONObject();
            whitelistJson.put("calendar_enable", false);
            whitelistJson.put("call_enable", false);
            whitelistJson.put("msg_enable", false);
            whitelistJson.put("ios_mail_enable", false);

            JSONObject appObject = new JSONObject();
            appObject.put("list", appList);
            appObject.put("enable", true);

            whitelistJson.put("app", appObject);

            return whitelistJson.toString();
        } catch (JSONException e) {
            Log.e(TAG, "Error creating whitelist JSON: " + e.getMessage());
            return "{}";
        }
    }

    // Simple class to hold app info
    class AppInfo {
        private String id;
        private String name;

        public AppInfo(String id, String name) {
            this.id = id;
            this.name = name;
        }

        public String getId() { return id; }
        public String getName() { return name; }
    }

    // Helper function to split JSON into chunks
    private List<byte[]> createWhitelistChunks(String json) {
        final int MAX_CHUNK_SIZE = 180 - 4; // Reserve space for the header
        byte[] jsonBytes = json.getBytes(StandardCharsets.UTF_8);
        int totalChunks = (int) Math.ceil((double) jsonBytes.length / MAX_CHUNK_SIZE);

        List<byte[]> chunks = new ArrayList<>();
        for (int i = 0; i < totalChunks; i++) {
            int start = i * MAX_CHUNK_SIZE;
            int end = Math.min(start + MAX_CHUNK_SIZE, jsonBytes.length);
            byte[] payloadChunk = Arrays.copyOfRange(jsonBytes, start, end);

            // Create the header: [WHITELIST_CMD, total_chunks, chunk_index]
            byte[] header = new byte[] {
                    (byte) WHITELIST_CMD,  // Command ID
                    (byte) totalChunks,   // Total number of chunks
                    (byte) i              // Current chunk index
            };

            // Combine header and payload
            ByteBuffer buffer = ByteBuffer.allocate(header.length + payloadChunk.length);
            buffer.put(header);
            buffer.put(payloadChunk);

            chunks.add(buffer.array());
        }

        return chunks;
    }

    @Override
    public void displayCustomContent(String content){
        Log.d(TAG, "DISPLAY CUSTOM CONTENT");
    }

    private void sendChunks(List<byte[]> chunks){
        // Send each chunk with a delay between sends
        for (byte[] chunk : chunks) {
            sendDataSequentially(chunk);

//            try {
//                Thread.sleep(DELAY_BETWEEN_CHUNKS_SEND); // delay between chunks
//            } catch (InterruptedException e) {
//                e.printStackTrace();
//            }
        }
    }

//    public int DEFAULT_CARD_SHOW_TIME = 6;
//    public void homeScreenInNSeconds(int n){
//        if (n == -1){
//            return;
//        }
//
//        if (n == 0){
//            n = DEFAULT_CARD_SHOW_TIME;
//        }
//
//        //disconnect after slight delay, so our above text gets a chance to show up
//        goHomeHandler.removeCallbacksAndMessages(goHomeRunnable);
//        goHomeHandler.removeCallbacksAndMessages(null);
//        goHomeRunnable = new Runnable() {
//            @Override
//            public void run() {
//                showHomeScreen();
//            }};
//        goHomeHandler.postDelayed(goHomeRunnable, n * 1000);
//    }


    //BMP handling

    // Add these class variables
    private static final int BMP_CHUNK_SIZE = 194;
    private static final byte[] GLASSES_ADDRESS = new byte[]{0x00, 0x1c, 0x00, 0x00};
    private static final byte[] END_COMMAND = new byte[]{0x20, 0x0d, 0x0e};

    public void displayBitmapImage(byte[] bmpData) {
        Log.d(TAG, "Starting BMP display process");

        try {
            if (bmpData == null || bmpData.length == 0) {
                Log.e(TAG, "Invalid BMP data provided");
                return;
            }
            Log.d(TAG, "Processing BMP data, size: " + bmpData.length + " bytes");

            // Split into chunks and send
            List<byte[]> chunks = createBmpChunks(bmpData);
            Log.d(TAG, "Created " + chunks.size() + " chunks");

            // Send all chunks
            sendBmpChunks(chunks);

            // Send end command
            sendBmpEndCommand();

            // Calculate and send CRC
            sendBmpCRC(bmpData);

        } catch (Exception e) {
            Log.e(TAG, "Error in displayBitmapImage: " + e.getMessage());
        }
    }

    private List<byte[]> createBmpChunks(byte[] bmpData) {
        List<byte[]> chunks = new ArrayList<>();
        int totalChunks = (int) Math.ceil((double) bmpData.length / BMP_CHUNK_SIZE);
        Log.d(TAG, "Creating " + totalChunks + " chunks from " + bmpData.length + " bytes");

        for (int i = 0; i < totalChunks; i++) {
            int start = i * BMP_CHUNK_SIZE;
            int end = Math.min(start + BMP_CHUNK_SIZE, bmpData.length);
            byte[] chunk = Arrays.copyOfRange(bmpData, start, end);

            // First chunk needs address bytes
            if (i == 0) {
                byte[] headerWithAddress = new byte[2 + GLASSES_ADDRESS.length + chunk.length];
                headerWithAddress[0] = 0x15;  // Command
                headerWithAddress[1] = (byte)(i & 0xFF);  // Sequence
                System.arraycopy(GLASSES_ADDRESS, 0, headerWithAddress, 2, GLASSES_ADDRESS.length);
                System.arraycopy(chunk, 0, headerWithAddress, 6, chunk.length);
                chunks.add(headerWithAddress);
            } else {
                byte[] header = new byte[2 + chunk.length];
                header[0] = 0x15;  // Command
                header[1] = (byte)(i & 0xFF);  // Sequence
                System.arraycopy(chunk, 0, header, 2, chunk.length);
                chunks.add(header);
            }
        }
        return chunks;
    }

    private void sendBmpChunks(List<byte[]> chunks) {
        for (int i = 0; i < chunks.size(); i++) {
            byte[] chunk = chunks.get(i);
            Log.d(TAG, "Sending chunk " + i + " of " + chunks.size() + ", size: " + chunk.length);
            sendDataSequentially(chunk);

//            try {
//                Thread.sleep(25); // Small delay between chunks
//            } catch (InterruptedException e) {
//                Log.e(TAG, "Sleep interrupted: " + e.getMessage());
//            }
        }
    }

    private void sendBmpEndCommand() {
        Log.d(TAG, "Sending BMP end command");
        sendDataSequentially(END_COMMAND);

        try {
            Thread.sleep(100); // Give it time to process
        } catch (InterruptedException e) {
            Log.e(TAG, "Sleep interrupted: " + e.getMessage());
        }
    }

    private void sendBmpCRC(byte[] bmpData) {
        // Create data with address for CRC calculation
        byte[] dataWithAddress = new byte[GLASSES_ADDRESS.length + bmpData.length];
        System.arraycopy(GLASSES_ADDRESS, 0, dataWithAddress, 0, GLASSES_ADDRESS.length);
        System.arraycopy(bmpData, 0, dataWithAddress, GLASSES_ADDRESS.length, bmpData.length);

        // Calculate CRC32
        CRC32 crc = new CRC32();
        crc.update(dataWithAddress);
        long crcValue = crc.getValue();

        // Create CRC command packet
        byte[] crcCommand = new byte[5];
        crcCommand[0] = 0x16;  // CRC command
        crcCommand[1] = (byte)((crcValue >> 24) & 0xFF);
        crcCommand[2] = (byte)((crcValue >> 16) & 0xFF);
        crcCommand[3] = (byte)((crcValue >> 8) & 0xFF);
        crcCommand[4] = (byte)(crcValue & 0xFF);

        Log.d(TAG, "Sending CRC command, CRC value: " + Long.toHexString(crcValue));
        sendDataSequentially(crcCommand);
    }

    private byte[] loadBmpFromAssets() {
        try {
            try (InputStream is = context.getAssets().open("image_1.bmp")) {
                return is.readAllBytes();
            }
        } catch (IOException e) {
            Log.e(TAG, "Failed to load BMP from assets: " + e.getMessage());
            return null;
        }
    }

    public void clearBmpDisplay() {
        Log.d(TAG, "Clearing BMP display with EXIT command");
        byte[] exitCommand = new byte[]{0x18};
        sendDataSequentially(exitCommand);
    }

    private void sendLoremIpsum(){
        String text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. ";
        sendDataSequentially(createTextWallChunks(text));
    }
}

