package com.augmentos.asg_client;

// ---------------------------------------------------------------------------------
// Below are the imports you likely need; if your project requires others, keep them:
// ---------------------------------------------------------------------------------
import static com.augmentos.asg_client.AsgConstants.asgServiceNotificationId;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Binder;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONException;
import org.json.JSONObject;

import com.augmentos.augmentos_core.AugmentosService;
import com.augmentos.asg_client.bluetooth.BluetoothManagerFactory;
import com.augmentos.asg_client.bluetooth.BluetoothStateListener;
import com.augmentos.asg_client.bluetooth.IBluetoothManager;
import com.augmentos.asg_client.network.INetworkManager;
import com.augmentos.asg_client.network.NetworkManagerFactory;
import com.augmentos.asg_client.network.NetworkStateListener; // Make sure this is the correct import path for your library
import com.augmentos.augmentos_core.smarterglassesmanager.camera.CameraRecordingService;

/**
 * This is the FULL AsgClientService code that:
 * 1) Runs in the foreground.
 * 2) Starts and binds to AugmentosService so we can get its instance.
 * 3) Cleans up properly when stopped or destroyed.
 *
 * "NOTHING LEFT OUT" – all functionality is shown below.
 */
public class AsgClientService extends Service implements NetworkStateListener, BluetoothStateListener {

    // ---------------------------------------------
    // Constants & Class Fields
    // ---------------------------------------------
    public static final String TAG = "AugmentOS_AsgClientService";

    // Actions for starting/stopping service
    public static final String ACTION_START_CORE = "ACTION_START_CORE";
    public static final String ACTION_STOP_CORE = "ACTION_STOP_CORE";
    public static final String ACTION_START_FOREGROUND_SERVICE = "MY_ACTION_START_FOREGROUND_SERVICE";
    public static final String ACTION_STOP_FOREGROUND_SERVICE = "MY_ACTION_STOP_FOREGROUND_SERVICE";

    // Notification channel info
    private final String notificationAppName = "ASG Client";
    private final String notificationDescription = "Running in foreground";
    private final String myChannelId = "asg_client";

    // Binder for any clients that bind to AsgClientService (optional usage)
    private final IBinder binder = new LocalBinder();

    // Reference to the AugmentosService we bind to
    private AugmentosService augmentosService = null;
    private boolean isAugmentosBound = false;

    // Network management
    private static final int WIFI_SETUP_PORT = 8088;
    private INetworkManager networkManager;
    private CameraWebServer webServer;
    
    // Bluetooth management
    private IBluetoothManager bluetoothManager;
    
    // Microphone management for non-K900 devices
    private com.augmentos.asg_client.audio.GlassesMicrophoneManager glassesMicrophoneManager;
    private boolean isK900Device = false;
    

    // ---------------------------------------------
    // ServiceConnection for the AugmentosService
    // ---------------------------------------------
    private final ServiceConnection augmentosConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            Log.d(TAG, "onServiceConnected: AugmentosService is connected");
            // We have the binder from AugmentosService, so cast and get the instance
            AugmentosService.LocalBinder binder = (AugmentosService.LocalBinder) service;
            augmentosService = binder.getService();
            isAugmentosBound = true;

            Log.d(TAG, "AugmentosService is bound and ready for action!");
            
            // Check if we're connected to WiFi
            if (networkManager != null && networkManager.isConnectedToWifi()) {
                Log.d(TAG, "We have WiFi connectivity - ready to connect to backend");
                onWifiConnected();
            } else {
                Log.d(TAG, "No WiFi connectivity detected - waiting for user to provide credentials via hotspot");
            }
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            Log.d(TAG, "onServiceDisconnected: AugmentosService disconnected");
            isAugmentosBound = false;
            augmentosService = null;
        }
    };

    // ---------------------------------------------
    // LocalBinder: allows this service to be bound
    // ---------------------------------------------
    public class LocalBinder extends Binder {
        public AsgClientService getService() {
            return AsgClientService.this;
        }
    }

    // ---------------------------------------------
    // Lifecycle Methods
    // ---------------------------------------------
    public AsgClientService() {
        // Empty constructor
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "AsgClientService onCreate");
        
        // Initialize the network manager
        initializeNetworkManager();
        
        // Initialize the bluetooth manager
        initializeBluetoothManager();
        
        // Recording test code (kept from original)
        // this.recordFor5Seconds();
    }
    
    /**
     * Initialize the network manager and set up callbacks
     */
    private void initializeNetworkManager() {
        // Create the network manager using the factory
        networkManager = NetworkManagerFactory.getNetworkManager(getApplicationContext());
        
        // Add a listener for network state changes (using the service itself as the listener)
        networkManager.addWifiListener(this);
        
        // Initialize the network manager
        networkManager.initialize();
    }
    
    /**
     * Initialize the bluetooth manager and set up callbacks
     */
    private void initializeBluetoothManager() {
        // Enhanced logging
        Log.e(TAG, "==========================================================");
        Log.e(TAG, "== INITIALIZING BLUETOOTH MANAGER");
        Log.e(TAG, "== Thread: " + Thread.currentThread().getId());
        Log.e(TAG, "==========================================================");
        
        // Create the bluetooth manager using the factory
        bluetoothManager = BluetoothManagerFactory.getBluetoothManager(getApplicationContext());
        
        // Enhanced logging about which manager was created
        Log.e(TAG, "==========================================================");
        Log.e(TAG, "== BLUETOOTH MANAGER CREATED");
        Log.e(TAG, "== Class: " + bluetoothManager.getClass().getName());
        Log.e(TAG, "== Simple name: " + bluetoothManager.getClass().getSimpleName());
        Log.e(TAG, "==========================================================");
        
        // Check if we're on a K900 device
        isK900Device = bluetoothManager.getClass().getSimpleName().contains("K900");
        Log.d(TAG, "Device type detected: " + (isK900Device ? "K900" : "Standard Android"));
        
        // If not a K900 device, initialize the glasses microphone manager
        if (!isK900Device) {
            initializeGlassesMicrophoneManager();
        }
        
        // Add a listener for bluetooth state changes (using the service itself as the listener)
        bluetoothManager.addBluetoothListener(this);
        
        // Initialize the bluetooth manager
        bluetoothManager.initialize();
    }
    
    /**
     * Initialize the glasses microphone manager (only for non-K900 devices)
     * Passes the existing bluetoothManager instance to ensure thread safety
     */
    private void initializeGlassesMicrophoneManager() {
        if (glassesMicrophoneManager != null) {
            // Already initialized
            return;
        }
        
        try {
            Log.d(TAG, "Initializing glasses microphone manager for non-K900 device");
            Log.d(TAG, "Thread ID: " + Thread.currentThread().getId() + ", Thread name: " + Thread.currentThread().getName());
            
            // Pass the existing bluetoothManager instance instead of creating a new one
            glassesMicrophoneManager = new com.augmentos.asg_client.audio.GlassesMicrophoneManager(
                getApplicationContext(), bluetoothManager);
            
            // Set up a callback for LC3 encoded audio data if needed
            glassesMicrophoneManager.setLC3DataCallback(lc3Data -> {
                // This callback is optional - we already send data directly through BLE in the manager
                //Log.d(TAG, "Received LC3 encoded audio data: " + lc3Data.length + " bytes");
            });
            
            Log.d(TAG, "Successfully initialized glasses microphone manager with shared bluetoothManager");
        } catch (Exception e) {
            Log.e(TAG, "Error initializing glasses microphone manager", e);
            glassesMicrophoneManager = null;
        }
    }
    
    /**
     * Called when WiFi is connected
     */
    private void onWifiConnected() {
        Log.d(TAG, "Connected to WiFi network");
        
        // If the AugmentOS service is bound, connect to the backend
        if (isAugmentosBound && augmentosService != null) {
            Log.d(TAG, "AugmentOS service is available, connecting to backend...");
            // Add code to connect to backend service here
            // For example:
            // augmentosService.connectToBackend();
        }
    }

    /**
     * This is where we handle start commands, like ACTION_START_CORE or ACTION_STOP_CORE.
     * We also start/stop or bind/unbind AugmentosService here.
     */
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);
        
        // CRITICAL: Ensure we call startForeground immediately on API 26+ to avoid ANR
        // This is a safety measure to ensure we're always starting in foreground mode
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            createNotificationChannel();
            startForeground(asgServiceNotificationId, updateNotification());
            Log.d(TAG, "Pre-emptively called startForeground to avoid background execution errors");
        }

        if (intent == null || intent.getAction() == null) {
            Log.e(TAG, "Received null intent or null action");
            return START_STICKY;
        }

        String action = intent.getAction();
        Bundle extras = intent.getExtras(); // Not used, but available if needed

        switch (action) {
            case ACTION_START_CORE:
            case ACTION_START_FOREGROUND_SERVICE:
                Log.d(TAG, "AsgClientService onStartCommand -> starting foreground");
                createNotificationChannel();
                startForeground(asgServiceNotificationId, updateNotification());

                // 1) Start AugmentosService in the background/foreground
                //    so it's alive even if we unbind.
                Intent augmentosIntent = new Intent(this, AugmentosService.class);
                augmentosIntent.setAction(AugmentosService.ACTION_START_CORE);
//                startForegroundService(augmentosIntent);
//
//                // 2) Bind to AugmentosService to get a reference to it
//                bindService(
//                        new Intent(this, AugmentosService.class),
//                        augmentosConnection,
//                        BIND_AUTO_CREATE
//                );
                break;

            case ACTION_STOP_CORE:
            case ACTION_STOP_FOREGROUND_SERVICE:
                Log.d(TAG, "AsgClientService onStartCommand -> stopping foreground");
                stopForeground(true);
                stopSelf();

                // If we’re bound to AugmentosService, unbind
                if (isAugmentosBound) {
                    unbindService(augmentosConnection);
                    isAugmentosBound = false;
                }

                // Optionally also stop AugmentosService entirely
                // if you want it fully shut down:
                stopService(new Intent(this, AugmentosService.class));
                break;

            default:
                Log.d(TAG, "Unknown action received in onStartCommand: " + action);
                break;
        }

        return START_STICKY;
    }

    private void recordFor5Seconds(){
        CameraRecordingService.startLocalRecording(getApplicationContext());
        new android.os.Handler().postDelayed(new Runnable() {
            @Override
            public void run() {
                CameraRecordingService.stopLocalRecording(getApplicationContext());
            }
        }, 60000); // 5000ms = 5 seconds
    }
    /**
     * Creates or updates our foreground notification channel and returns the
     * Notification object used by startForeground().
     */
    private Notification updateNotification() {
        Context context = getApplicationContext();

        // This PendingIntent leads to MainActivity if user taps the notification
        PendingIntent action = PendingIntent.getActivity(
                context,
                0,
                new Intent(context, MainActivity.class),
                PendingIntent.FLAG_CANCEL_CURRENT | PendingIntent.FLAG_MUTABLE
        );

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            // Fallback - if manager is null, we can’t create a channel, but we can build a basic notification
            return new NotificationCompat.Builder(this, myChannelId)
                    .setContentTitle(notificationAppName)
                    .setContentText(notificationDescription)
                    .setSmallIcon(com.augmentos.augmentos_core.R.drawable.ic_launcher_foreground)
                    .setOngoing(true)
                    .build();
        }

        // For Android O+, create or update notification channel
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    myChannelId,
                    notificationAppName,
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription(notificationDescription);
            manager.createNotificationChannel(channel);
        }

        // Build the actual notification
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, myChannelId)
                .setContentIntent(action)
                .setContentTitle(notificationAppName)
                .setContentText(notificationDescription)
                .setSmallIcon(com.augmentos.augmentos_core.R.drawable.ic_launcher_foreground)
                .setTicker("...")
                .setOngoing(true);

        return builder.build();
    }


    /**
     * Called when we’re destroyed. Good place to unbind from services if needed.
     */
    @Override
    public void onDestroy() {
        Log.d(TAG, "AsgClientService onDestroy");
        // If still bound to AugmentosService, unbind
        if (isAugmentosBound) {
            unbindService(augmentosConnection);
            isAugmentosBound = false;
        }

        // Stop the web server if it's running
        if (webServer != null) {
            webServer.stopServer();
        }
        
        // Shutdown the network manager if it's initialized
        if (networkManager != null) {
            networkManager.shutdown();
        }
        
        // Shutdown the bluetooth manager if it's initialized
        if (bluetoothManager != null) {
            // Remove this service as a listener first
            bluetoothManager.removeBluetoothListener(this);
            // Then shutdown the bluetooth manager
            bluetoothManager.shutdown();
        }
        
        // Clean up the glasses microphone manager if it's initialized
        if (glassesMicrophoneManager != null) {
            glassesMicrophoneManager.destroy();
            glassesMicrophoneManager = null;
        }
        
        super.onDestroy();
    }

    // ---------------------------------------------
    // Binding and Binder logic
    // ---------------------------------------------
    @Override
    public IBinder onBind(Intent intent) {
        Log.d(TAG, "AsgClientService onBind -> returning binder");
        return binder;
    }

    // ---------------------------------------------
    // Example public method to use AugmentosService
    // ---------------------------------------------
    public void doSomethingWithAugmentos() {
        if (isAugmentosBound && augmentosService != null) {
            // For example, call some method on AugmentosService
            // augmentosService.sendStatusToBackend();
            Log.d(TAG, "Called a method on the bound AugmentosService!");
        } else {
            Log.w(TAG, "AugmentosService is not bound yet.");
        }
    }

    /**
     * If needed, you can check whether we’re bound to AugmentosService,
     * or retrieve the instance (e.g. for Activity usage).
     */
    public AugmentosService getAugmentosService() {
        return augmentosService;
    }

    public boolean isAugmentosServiceBound() {
        return isAugmentosBound;
    }
    
    /**
     * Method for activities to check if we're connected to WiFi 
     */
    public boolean isConnectedToWifi() {
        return networkManager != null && networkManager.isConnectedToWifi();
    }
    
    /**
     * Method for activities to check if a Bluetooth device is connected
     */
    public boolean isBluetoothConnected() {
        return bluetoothManager != null && bluetoothManager.isConnected();
    }
    
    /**
     * Method for activities to start Bluetooth advertising
     */
    public void startBluetoothAdvertising() {
        if (bluetoothManager != null) {
            bluetoothManager.startAdvertising();
        }
    }
    
    /**
     * Method for activities to stop Bluetooth advertising
     */
    public void stopBluetoothAdvertising() {
        if (bluetoothManager != null) {
            bluetoothManager.stopAdvertising();
        }
    }
    
    /**
     * Method for activities to manually disconnect from a Bluetooth device
     */
    public void disconnectBluetooth() {
        if (bluetoothManager != null) {
            bluetoothManager.disconnect();
        }
    }
    
    /**
     * Method for activities to send data over Bluetooth
     * @return true if data was sent successfully, false otherwise
     */
    public boolean sendBluetoothData(byte[] data) {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            return bluetoothManager.sendData(data);
        }
        return false;
    }
    
    /**
     * Testing method that manually starts the WiFi setup process
     * This can be called from an activity for testing purposes
     */
    public void testWifiSetup() {
        if (networkManager != null) {
            // Force hotspot to start with default config
            networkManager.startHotspot(null, null);
        }
    }
    
    /**
     * Try to connect to a specific WiFi network 
     * This can be called from an activity for testing purposes
     */
    public void testConnectToWifi(String ssid, String password) {
        if (networkManager != null) {
            networkManager.connectToWifi(ssid, password);
        }
    }
    
    // ---------------------------------------------
    // NetworkStateListener Interface Methods
    // ---------------------------------------------
    
    /**
     * Handle WiFi state changes
     */
    @Override
    public void onWifiStateChanged(boolean isConnected) {
        Log.d(TAG, "WiFi state changed: " + (isConnected ? "CONNECTED" : "DISCONNECTED"));
        
        // When WiFi state changes, send status to AugmentOS Core via Bluetooth
        sendWifiStatusOverBle(isConnected);
        
        if (isConnected) {
            // Handle connection
            onWifiConnected();
        } else {
            // Handle disconnection
            Log.d(TAG, "WiFi disconnected");
        }
    }
    
    /**
     * Handle hotspot state changes
     */
    @Override
    public void onHotspotStateChanged(boolean isEnabled) {
        Log.d(TAG, "Hotspot state changed: " + (isEnabled ? "ENABLED" : "DISABLED"));
        // We don't need to report hotspot state via BLE
    }
    
    /**
     * Handle WiFi credentials received through setup
     */
    @Override
    public void onWifiCredentialsReceived(String ssid, String password, String authToken) {
        Log.d(TAG, "WiFi credentials received for network: " + ssid);
        // After receiving credentials, we'll likely connect to WiFi,
        // and onWifiStateChanged will be called, which will send status via BLE
    }
    
    /**
     * Send current WiFi status to AugmentOS Core via Bluetooth
     */
    private void sendWifiStatusOverBle(boolean isConnected) {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            try {
                JSONObject wifiStatus = new JSONObject();
                wifiStatus.put("type", "wifi_status");
                wifiStatus.put("connected", isConnected);
                
                // Include SSID if connected
                if (isConnected && networkManager != null) {
                    String ssid = networkManager.getCurrentWifiSsid();
                    if (ssid != null && !ssid.isEmpty()) {
                        wifiStatus.put("ssid", ssid);
                    } else {
                        wifiStatus.put("ssid", "unknown");
                    }
                } else {
                    wifiStatus.put("ssid", "");
                }
                
                // Convert JSON to bytes and send
                String jsonString = wifiStatus.toString();
                bluetoothManager.sendData(jsonString.getBytes());
                
                Log.d(TAG, "Sent WiFi status via BLE: " + jsonString);
            } catch (JSONException e) {
                Log.e(TAG, "Error creating WiFi status JSON", e);
            }
        }
    }
    
    // ---------------------------------------------
    // BluetoothStateListener Interface Methods
    // ---------------------------------------------
    
    /**
     * Called when Bluetooth connection state changes
     */
    @Override
    public void onConnectionStateChanged(boolean connected) {
        Log.d(TAG, "Bluetooth connection state changed: " + (connected ? "CONNECTED" : "DISCONNECTED"));
        
        if (connected) {
            Log.d(TAG, "Bluetooth device connected - ready for data exchange");
            
            // When Bluetooth connects, send the current WiFi status
            if (networkManager != null) {
                boolean wifiConnected = networkManager.isConnectedToWifi();
                sendWifiStatusOverBle(wifiConnected);
            }
            
            // For non-K900 devices, start the microphone to stream audio
            if (!isK900Device && glassesMicrophoneManager != null) {
                Log.d(TAG, "Starting microphone streaming for non-K900 device");
                glassesMicrophoneManager.startRecording();
            }
            
            // Notify any components that care about bluetooth status
            // For example, you could send a broadcast, update UI, etc.
        } else {
            Log.d(TAG, "Bluetooth device disconnected");
            
            // For non-K900 devices, stop the microphone when disconnected
            if (!isK900Device && glassesMicrophoneManager != null) {
                Log.d(TAG, "Stopping microphone streaming for non-K900 device");
                glassesMicrophoneManager.stopRecording();
            }
            
            // You might want to attempt reconnection here, or notify components
        }
    }
    
    /**
     * Called when data is received over Bluetooth (from either K900 or standard implementation)
     */
    @Override
    public void onDataReceived(byte[] data) {
        if (data == null || data.length == 0) {
            Log.w(TAG, "Received empty data packet from Bluetooth");
            return;
        }
        
        Log.d(TAG, "Received " + data.length + " bytes from Bluetooth");
        
        // Process the received data
        processBluetoothData(data);
    }
    
    /**
     * Process data received from Bluetooth
     * This method handles data from both K900 and standard implementations
     */
    private void processBluetoothData(byte[] data) {
        // First, log the data for debugging (only in development)
        StringBuilder hexData = new StringBuilder();
        for (byte b : data) {
            hexData.append(String.format("%02X ", b));
        }
        Log.d(TAG, "Bluetooth data: " + hexData.toString());
        
        // Determine the packet type from the first byte
        if (data.length > 0) {
            // The first byte could be a command identifier
            byte command = data[0];
            // Process according to the command type
            executeCommand(command, data);
        }
    }
    
    /**
     * Execute a command based on the command byte and data
     */
    private void executeCommand(byte command, byte[] data) {
        switch (command) {
            case 0x01: // Example: Connection status command
                Log.d(TAG, "Processing connection status command");
                // Handle connection status
                break;
                
            case 0x02: // Example: Data transfer command
                Log.d(TAG, "Processing data transfer command");
                // Extract and process the actual data
                // Example: triggerCoreFunction(Arrays.copyOfRange(data, 1, data.length));
                break;
                
            case 0x03: // Example: Request current status
                Log.d(TAG, "Processing status request command");
                // Prepare and send status data
                sendStatusData();
                break;

            case (byte)0xA1: // LC3 audio data from phone (0xA1 = 161 decimal)
                Log.d(TAG, "Received LC3 audio data from phone");
                // For now, just log it - in the future this would be played through the glasses speakers
                if (data.length > 1) {
                    byte[] audioData = java.util.Arrays.copyOfRange(data, 1, data.length);
                    Log.d(TAG, "LC3 audio data length: " + audioData.length + " bytes");
                    // In a future implementation, decode and play this audio on the glasses
                    // For example: playAudioOnGlasses(audioData);
                }
                break;
                
            default:
                Log.w(TAG, "Unknown command received: " + String.format("0x%02X", command));
                break;
        }
    }
    
    /**
     * Example method to send status data back to the connected device
     */
    private void sendStatusData() {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            // Create status data packet
            // Example: byte[] statusData = {0x04, 0x01, 0x00, 0x00}; // 0x04 = status response
            // bluetoothManager.sendData(statusData);
            Log.d(TAG, "Status data sent to connected device");
        } else {
            Log.w(TAG, "Cannot send status - no connected device");
        }
    }

    /**
     * Creates the channel once (used by updateNotification()).
     */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    myChannelId,
                    notificationAppName,
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription(notificationDescription);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
