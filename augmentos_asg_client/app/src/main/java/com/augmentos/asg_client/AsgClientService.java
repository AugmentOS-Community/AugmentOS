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
import android.content.SharedPreferences;
import android.os.Binder;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.widget.FrameLayout;

import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

import androidx.core.app.NotificationCompat;
import androidx.preference.PreferenceManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import com.augmentos.augmentos_core.AugmentosService;
import com.augmentos.asg_client.bluetooth.BluetoothManagerFactory;
import com.augmentos.asg_client.bluetooth.BluetoothStateListener;
import com.augmentos.asg_client.bluetooth.IBluetoothManager;
import com.augmentos.asg_client.camera.PhotoCaptureService;
import com.augmentos.asg_client.camera.PhotoQueueManager;
import com.augmentos.asg_client.network.INetworkManager;
import com.augmentos.asg_client.network.NetworkManagerFactory;
import com.augmentos.asg_client.network.NetworkStateListener; // Make sure this is the correct import path for your library
import com.augmentos.augmentos_core.smarterglassesmanager.camera.CameraRecordingService;
import com.augmentos.asg_client.rtmp.RTMPStreamer;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

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
    
    // Bluetooth management
    private IBluetoothManager bluetoothManager;
    
    // Microphone management for non-K900 devices
    private com.augmentos.asg_client.audio.GlassesMicrophoneManager glassesMicrophoneManager;
    private boolean isK900Device = false;
    
    // DEBUG: Timer and handler for VPS photo uploads
    private Handler debugVpsPhotoHandler;
    private Runnable debugVpsPhotoRunnable;
    
    // Photo queue manager for handling offline photo uploads
    private PhotoQueueManager mPhotoQueueManager;
    
    // RTMP streaming
    private RTMPStreamer rtmpStreamer;
    
    // Photo capture service
    private PhotoCaptureService mPhotoCaptureService;

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
        
        // Initialize the photo queue manager
        initializePhotoQueueManager();
        
        // Initialize the photo capture service
        initializePhotoCaptureService();
        
        // Initialize RTMP streaming components but don't autostart
        initializeRtmpStreaming();
        
        // Recording test code (kept from original)
        // this.recordFor5Seconds();
        
        // DEBUG: Start the debug photo upload timer for VPS
        //startDebugVpsPhotoUploadTimer();
    }
    
    /**
     * Initialize the photo queue manager
     */
    private void initializePhotoQueueManager() {
        if (mPhotoQueueManager == null) {
            mPhotoQueueManager = new PhotoQueueManager(getApplicationContext());
            
            // Set up queue callback
            mPhotoQueueManager.setQueueCallback(new PhotoQueueManager.QueueCallback() {
                @Override
                public void onPhotoQueued(String requestId, String filePath) {
                    Log.d(TAG, "Photo queued: " + requestId + ", path: " + filePath);
                }
                
                @Override
                public void onPhotoUploaded(String requestId, String url) {
                    Log.d(TAG, "Photo uploaded from queue: " + requestId + ", URL: " + url);
                    // Send notification to phone if connected
                    sendPhotoSuccessResponse(requestId, "system", url);
                }
                
                @Override
                public void onPhotoUploadFailed(String requestId, String error) {
                    Log.d(TAG, "Photo upload failed from queue: " + requestId + ", error: " + error);
                    // We don't send error notifications to avoid spamming the phone
                }
            });
            
            // Process the queue in case there are queued photos from previous sessions
            mPhotoQueueManager.processQueue();
        }
    }
    
    // Flag to track if RTMP streaming is active
    private boolean isRtmpStreamingActive = false;
    
    // Variable to store the current RTMP URL for reconnection if needed
    private String currentRtmpUrl = null;
    
    // The SurfaceView used for RTMP streaming preview
    private android.view.SurfaceView rtmpSurfaceView = null;
    
    // Callback for RTMP streaming state changes for external monitoring
    public interface RtmpStreamingListener {
        void onStreamingStarted(String url);
        void onStreamingStopped();
        void onStreamingError(String error);
    }
    
    // List of streaming listeners
    private final List<RtmpStreamingListener> rtmpStreamingListeners = new ArrayList<>();
    
    /**
     * Add a listener to receive RTMP streaming state changes
     * 
     * @param listener The listener to add
     */
    public void addRtmpStreamingListener(RtmpStreamingListener listener) {
        if (listener != null && !rtmpStreamingListeners.contains(listener)) {
            rtmpStreamingListeners.add(listener);
        }
    }
    
    /**
     * Remove a previously added RTMP streaming listener
     * 
     * @param listener The listener to remove
     */
    public void removeRtmpStreamingListener(RtmpStreamingListener listener) {
        rtmpStreamingListeners.remove(listener);
    }
    
    /**
     * Initialize the photo capture service
     */
    private void initializePhotoCaptureService() {
        if (mPhotoCaptureService == null) {
            if (mPhotoQueueManager == null) {
                initializePhotoQueueManager();
            }
            
            mPhotoCaptureService = new PhotoCaptureService(getApplicationContext(), mPhotoQueueManager) {
                @Override
                protected void sendPhotoSuccessResponse(String requestId, String appId, String photoUrl) {
                    // Override to delegate to parent class
                    AsgClientService.this.sendPhotoSuccessResponse(requestId, appId, photoUrl);
                }
                
                @Override
                protected void sendPhotoErrorResponse(String requestId, String appId, String errorMessage) {
                    // Override to delegate to parent class
                    AsgClientService.this.sendPhotoErrorResponse(requestId, appId, errorMessage);
                }
            };
            
            // Set the photo capture listener
            mPhotoCaptureService.setPhotoCaptureListener(photoCaptureListener);
        }
    }
    
    /**
     * Get the photo queue manager instance
     * 
     * @return PhotoQueueManager instance
     */
    public PhotoQueueManager getPhotoQueueManager() {
        if (mPhotoQueueManager == null) {
            initializePhotoQueueManager();
        }
        return mPhotoQueueManager;
    }
    
    /**
     * Get the photo capture service instance
     * 
     * @return PhotoCaptureService instance
     */
    public PhotoCaptureService getPhotoCaptureService() {
        if (mPhotoCaptureService == null) {
            initializePhotoCaptureService();
        }
        return mPhotoCaptureService;
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
            //initializeGlassesMicrophoneManager();
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
        // This method is no longer used, but kept for reference
        // Would need to implement using CameraNeo if needed
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

        // No web server to stop
        
        // Stop debug VPS photo timer
        stopDebugVpsPhotoUploadTimer();
        
        // Stop RTMP streaming if active
        if (rtmpStreamer != null) {
            if (isRtmpStreamingActive) {
                try {
                    // Use synchronous approach for shutdown to ensure cleanup happens
                    rtmpStreamer.stopStreaming(new RTMPStreamer.StreamingCallback() {
                        @Override
                        public void onStreamingStarted() {
                            // Not used in this context
                        }
                        
                        @Override
                        public void onStreamingStopped() {
                            Log.d(TAG, "RTMP streaming stopped during service shutdown");
                            isRtmpStreamingActive = false;
                            currentRtmpUrl = null;
                            
                            // Notify listeners
                            notifyStreamingStopped();
                        }
                        
                        @Override
                        public void onStreamingError(String error) {
                            Log.e(TAG, "Error stopping RTMP stream during shutdown: " + error);
                            isRtmpStreamingActive = false;
                            currentRtmpUrl = null;
                            
                            // Notify listeners
                            notifyStreamingError("Error during shutdown: " + error);
                        }
                    });
                    
                    // Give it a moment to clean up
                    try {
                        Thread.sleep(500);
                    } catch (InterruptedException e) {
                        // Ignore
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error stopping RTMP stream: " + e.getMessage());
                }
            }
            
            // Always release resources regardless of streaming state
            try {
                rtmpStreamer.release();
                Log.d(TAG, "RTMP streamer resources released during service shutdown");
            } catch (Exception e) {
                Log.e(TAG, "Error releasing RTMP resources: " + e.getMessage());
            }
            
            // Clear the surface view reference
            rtmpSurfaceView = null;
            rtmpStreamer = null;
            isRtmpStreamingActive = false;
            currentRtmpUrl = null;
            
            // Clear listeners
            rtmpStreamingListeners.clear();
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
        
        // No need to clean up PhotoQueueManager as it's stateless and file-based
        
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
            
            // Process photo upload queue when connection is restored
            if (mPhotoQueueManager != null && !mPhotoQueueManager.isQueueEmpty()) {
                Log.d(TAG, "WiFi connected - processing photo upload queue");
                mPhotoQueueManager.processQueue();
            }
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
                
                // Convert to string
                String jsonString = wifiStatus.toString();
                Log.d(TAG, "Formatted WiFi status message: " + jsonString);
                
                // Convert JSON to bytes and send
                bluetoothManager.sendData(jsonString.getBytes());
                
                Log.d(TAG, "Sent WiFi status via BLE");
            } catch (JSONException e) {
                Log.e(TAG, "Error creating WiFi status JSON", e);
            }
        }
    }
    
    /**
     * Send WiFi scan results to AugmentOS Core via Bluetooth
     */
    private void sendWifiScanResultsOverBle(List<String> networks) {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            try {
                JSONObject scanResults = new JSONObject();
                scanResults.put("type", "wifi_scan_result");
                
                // Add the networks as a JSON array
                JSONArray networksArray = new JSONArray();
                for (String network : networks) {
                    networksArray.put(network);
                }
                scanResults.put("networks", networksArray);
                
                // Convert to string
                String jsonString = scanResults.toString();
                Log.d(TAG, "Formatted WiFi scan results: " + jsonString);
                
                // Convert JSON to bytes and send
                bluetoothManager.sendData(jsonString.getBytes());
                
                Log.d(TAG, "Sent WiFi scan results via BLE. Found " + networks.size() + " networks.");
            } catch (JSONException e) {
                Log.e(TAG, "Error creating WiFi scan results JSON", e);
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
            // Adding a 3 second delay before sending WiFi status
            if (networkManager != null) {
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    boolean wifiConnected = networkManager.isConnectedToWifi();
                    sendWifiStatusOverBle(wifiConnected);
                    Log.d(TAG, "Sent WiFi status after 3s delay: " + (wifiConnected ? "CONNECTED" : "DISCONNECTED"));
                }, 3000); // 3 second delay
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
        
        // Process the data

        // First, log the data for debugging (only in development)
        StringBuilder hexData = new StringBuilder();
        for (byte b : data) {
            hexData.append(String.format("%02X ", b));
        }
        Log.d(TAG, "Bluetooth data: " + hexData.toString());
        
        // Check if this is a message with ##...## format (K900 BES2700 protocol)
        if (data.length > 4 && data[0] == 0x23 && data[1] == 0x23) {
            Log.d(TAG, "🔍 Detected ##...## protocol formatted message");
            
            // Look for end marker ($$)
            int endMarkerPos = -1;
            for (int i = 4; i < data.length - 1; i++) {
                if (data[i] == 0x24 && data[i+1] == 0x24) {
                    endMarkerPos = i;
                    break;
                }
            }
            
            if (endMarkerPos > 0) {
                Log.d(TAG, "🔍 Found end marker at position: " + endMarkerPos);
                
                // Extract the command code and log it
                byte commandType = data[2];
                Log.d(TAG, "🔍 Command type byte: 0x" + String.format("%02X", commandType));
                
                // Extract length (assuming little-endian 2 bytes)
                int length = (data[3] & 0xFF);
                if (data.length > 4) {
                    length |= ((data[4] & 0xFF) << 8);
                }
                Log.d(TAG, "🔍 Payload length from header: " + length);
                
                // Extract payload (assuming it starts at position 5)
                int payloadStart = 5;
                int payloadLength = endMarkerPos - payloadStart;
                Log.d(TAG, "🔍 Actual payload length: " + payloadLength);
                
                // Only process if payload length looks correct
                if (payloadLength > 0) {
                    // Check if payload is JSON (starts with '{')
                    if (data[payloadStart] == '{') {
                        try {
                            // Extract the JSON string
                            String jsonStr = new String(data, payloadStart, payloadLength, "UTF-8");
                            Log.d(TAG, "✅ Extracted JSON from ##...$$: " + jsonStr);
                            
                            // Parse the JSON
                            JSONObject jsonObject = new JSONObject(jsonStr);
                            
                            // Extract the "C" field value, which we'll pass to the JSON processor
                            // This simplifies our approach - we just use the C field regardless
                            // of whether it's part of a command or our direct data
                            processJsonCommand(jsonObject);
                            return;
                        } catch (Exception e) {
                            Log.e(TAG, "❌ Error parsing JSON from ##...$$: " + e.getMessage());
                        }
                    } else {
                        Log.d(TAG, "⚠️ Payload doesn't start with '{': 0x" + String.format("%02X", data[payloadStart]));
                    }
                } else {
                    Log.e(TAG, "❌ Invalid payload length: " + payloadLength);
                }
            } else {
                Log.e(TAG, "❌ End marker not found in ##...## message");
            }
            
            // If extraction failed, fall through to standard processing
            Log.d(TAG, "⚠️ Failed to extract JSON from ##...## message, trying standard processing");
        }
        
        // Check if this is a JSON message (starts with '{')
        if (data.length > 0 && data[0] == '{') {
            try {
                String jsonStr = new String(data, "UTF-8");
                Log.d(TAG, "Received JSON data: " + jsonStr);
                JSONObject jsonObject = new JSONObject(jsonStr);
                processJsonCommand(jsonObject);
                return;
            } catch (Exception e) {
                Log.e(TAG, "Error parsing JSON data", e);
                // Fall through to binary command processing
            }
        }
    }
    
    /**
     * Process JSON commands received via Bluetooth
     */
    private void processJsonCommand(JSONObject json) {
        try {
            // If this is our direct data format (only C field), extract the JSON from it
            JSONObject dataToProcess = json;
            if (json.has("C")) {
                String dataPayload = json.optString("C", "");
                Log.d(TAG, "📦 Detected direct data format! Payload: " + dataPayload);
                
                // Try to parse the payload as JSON
                try {
                    dataToProcess = new JSONObject(dataPayload);
                    Log.d(TAG, "📦 Successfully parsed payload as JSON");
                } catch (JSONException e) {
                    Log.d(TAG, "📦 Payload is not valid JSON, using as-is");
                    // If not valid JSON, continue with original json object
                    parseK900Command(dataPayload);
                    return;
                }
            }
            
            // Process the data (either original or extracted from C field)
            String type = dataToProcess.optString("type", "");
            Log.d(TAG, "Processing JSON message type: " + type);
            
            switch (type) {
                case "phone_ready":
                    // Phone is connected and ready - respond that we're also ready
                    Log.d(TAG, "📱 Received phone_ready message - sending glasses_ready response");
                    
                    try {
                        // Create a glasses_ready response
                        JSONObject response = new JSONObject();
                        response.put("type", "glasses_ready");
                        response.put("timestamp", System.currentTimeMillis());
                        
                        // Convert to string
                        String jsonResponse = response.toString();
                        Log.d(TAG, "Formatted glasses_ready response: " + jsonResponse);
                        
                        // Send the response back
                        if (bluetoothManager != null && bluetoothManager.isConnected()) {
                            bluetoothManager.sendData(jsonResponse.getBytes());
                            Log.d(TAG, "✅ Sent glasses_ready response to phone");
                        }
                    } catch (JSONException e) {
                        Log.e(TAG, "Error creating glasses_ready response", e);
                    }
                    break;
                    
                case "auth_token":
                    // Handle authentication token
                    String coreToken = dataToProcess.optString("coreToken", "");
                    if (!coreToken.isEmpty()) {
                        Log.d(TAG, "Received coreToken from AugmentOS Core");
                        saveCoreToken(coreToken);
                        
                        // Send acknowledgment
                        sendTokenStatusResponse(true);
                    } else {
                        Log.e(TAG, "Received empty coreToken");
                        sendTokenStatusResponse(false);
                    }
                    break;
                    
                case "take_photo":
                    String requestId = dataToProcess.optString("requestId", "");
                    String appId = dataToProcess.optString("appId", "");
                    
                    if (requestId.isEmpty()) {
                        Log.e(TAG, "Cannot take photo - missing requestId");
                        return;
                    }
                    
                    // Generate a temporary file path for the photo
                    String timeStamp = new java.text.SimpleDateFormat("yyyyMMdd_HHmmss", java.util.Locale.US).format(new java.util.Date());
                    String photoFilePath = getExternalFilesDir(null) + java.io.File.separator + "IMG_" + timeStamp + ".jpg";
                    
                    Log.d(TAG, "Taking photo with requestId: " + requestId + ", appId: " + appId);
                    Log.d(TAG, "Photo will be saved to: " + photoFilePath);
                    
                    // Take the photo using CameraNeo instead of CameraRecordingService
                    mPhotoCaptureService.takePhotoAndUpload(photoFilePath, requestId, appId);
                    break;
                    
                case "start_rtmp_stream":
                    Log.d(TAG, "RTMP streaming requested via BLE command");
                    String rtmpUrl = dataToProcess.optString("rtmpUrl", "");
                    
                    if (rtmpUrl.isEmpty()) {
                        Log.e(TAG, "Cannot start RTMP stream - missing rtmpUrl");
                        sendRtmpStreamingResponse(false, "Missing rtmpUrl parameter");
                        break;
                    }
                    
                    // Configuring video/audio settings if provided
                    if (dataToProcess.has("video")) {
                        try {
                            JSONObject videoConfig = dataToProcess.getJSONObject("video");
                            int bitrate = videoConfig.optInt("bitrate", 250000);
                            int width = videoConfig.optInt("width", 176);
                            int height = videoConfig.optInt("height", 144);
                            int fps = videoConfig.optInt("fps", 15);
                            
                            configureRtmpVideo(bitrate, width, height, fps);
                        } catch (Exception e) {
                            Log.e(TAG, "Error parsing video config: " + e.getMessage());
                        }
                    }
                    
                    if (dataToProcess.has("audio")) {
                        try {
                            JSONObject audioConfig = dataToProcess.getJSONObject("audio");
                            int bitrate = audioConfig.optInt("bitrate", 32000);
                            int sampleRate = audioConfig.optInt("sampleRate", 44100);
                            boolean stereo = audioConfig.optBoolean("stereo", false);
                            
                            configureRtmpAudio(bitrate, sampleRate, stereo);
                        } catch (Exception e) {
                            Log.e(TAG, "Error parsing audio config: " + e.getMessage());
                        }
                    }
                    
                    // Start streaming
                    boolean success = startRtmpStreaming(rtmpUrl);
                    if (success) {
                        sendRtmpStreamingResponse(true, "RTMP streaming started");
                    } else {
                        sendRtmpStreamingResponse(false, "Failed to start RTMP streaming");
                    }
                    break;
                    
                case "stop_rtmp_stream":
                    Log.d(TAG, "RTMP streaming stop requested via BLE command");
                    boolean stopSuccess = stopRtmpStreaming();
                    if (stopSuccess) {
                        sendRtmpStreamingResponse(true, "RTMP streaming stopped");
                    } else {
                        sendRtmpStreamingResponse(false, "Failed to stop RTMP streaming");
                    }
                    break;
                    
                case "get_rtmp_status":
                    Log.d(TAG, "RTMP status requested via BLE command");
                    sendRtmpStreamingStatus();
                    break;
                    
                case "set_wifi_credentials":
                    // Handle WiFi configuration command if needed
                    String ssid = dataToProcess.optString("ssid", "");
                    String password = dataToProcess.optString("password", "");
                    if (!ssid.isEmpty()) {
                        Log.d(TAG, "Connecting to WiFi network: " + ssid);
                        if (networkManager != null) {
                            networkManager.connectToWifi(ssid, password);
                        }
                    }
                    break;

                case "request_wifi_status":
                    Log.d(TAG, "Got a request for wifi status");
                    if (networkManager != null) {
                        Log.d(TAG, "requesting wifi status");
                        boolean wifiConnected = networkManager.isConnectedToWifi();
                        sendWifiStatusOverBle(wifiConnected);
                    }
                    break;
                    
                case "request_wifi_scan":
                    Log.d(TAG, "Got a request to scan for WiFi networks");
                    if (networkManager != null) {
                        Log.d(TAG, "Starting WiFi scan");
                        // Perform WiFi scan in a background thread
                        new Thread(() -> {
                            try {
                                List<String> networks = networkManager.scanWifiNetworks();
                                sendWifiScanResultsOverBle(networks);
                            } catch (Exception e) {
                                Log.e(TAG, "Error scanning for WiFi networks", e);
                                // Send empty list in case of error
                                sendWifiScanResultsOverBle(new ArrayList<>());
                            }
                        }).start();
                    } else {
                        Log.e(TAG, "Cannot scan for WiFi networks - networkManager is null");
                        sendWifiScanResultsOverBle(new ArrayList<>());
                    }
                    break;
                case "ping":
                    JSONObject pingResponse = new JSONObject();
                    pingResponse.put("type", "pong");
                    if(bluetoothManager != null && bluetoothManager.isConnected()) {
                        bluetoothManager.sendData(pingResponse.toString().getBytes());
                    }
                    break;
                case "request_battery_state":
                    break;
                case "set_mic_state":

                    break;
                case "set_mic_vad_state":

                    break;
                case "request_version":
                case "cs_syvr":
                    Log.d(TAG, "📊 Received version request - sending version info");
                    sendVersionInfo();
                    break;
                case "":
                    Log.d(TAG, "Received data with no type field: " + dataToProcess);
                    break;
                    
                default:
                    Log.w(TAG, "Unknown message type: " + type);
                    break;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error processing JSON command", e);
        }
    }

    // These are plain text commands from the K900's MCU, usually from button presses on the device
    public void parseK900Command(String command){
        switch (command) {
            case "cs_pho":
                Log.d(TAG, "📦 Payload is cs_pho");
                // Delegate to the photo capture service
                //getPhotoCaptureService().handlePhotoButtonPress();

                handleButtonPressForVpsDemo();
                break;
            case "hm_htsp":
            case "mh_htsp":
                Log.d(TAG, "📦 Payload is hm_htsp or mh_htsp");
                networkManager.startHotspot("Mentra Live", "MentraLive");
                break;
            case "cs_vdo":
                Log.d(TAG, "📦 Payload is cs_vdo");
                break;
            default:
                Log.d(TAG, "📦 Unknown payload: " + command);
                break;
        }
    }
    
    /**
     * Save the coreToken to SharedPreferences
     * This allows the ASG client to authenticate directly with the backend
     */
    private void saveCoreToken(String coreToken) {
        Log.d(TAG, "Saving coreToken to SharedPreferences");
        try {
            // Save to default SharedPreferences so it's accessible by all components
            SharedPreferences preferences = PreferenceManager.getDefaultSharedPreferences(getApplicationContext());
            SharedPreferences.Editor editor = preferences.edit();
            editor.putString("core_token", coreToken);
            editor.apply();
            
            Log.d(TAG, "CoreToken saved successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error saving coreToken", e);
        }
    }
    
    /**
     * Send a token status response back to AugmentOS Core
     */
    private void sendTokenStatusResponse(boolean success) {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            try {
                JSONObject response = new JSONObject();
                response.put("type", "token_status");
                response.put("success", success);
                response.put("timestamp", System.currentTimeMillis());
                
                // Convert to string
                String jsonString = response.toString();
                Log.d(TAG, "Formatted token status response: " + jsonString);
                
                // Send the JSON response
                bluetoothManager.sendData(jsonString.getBytes());
                
                Log.d(TAG, "Sent token status response: " + (success ? "SUCCESS" : "FAILED"));
            } catch (JSONException e) {
                Log.e(TAG, "Error creating token status response", e);
            }
        }
    }

    private void sendVersionInfo() {
        Log.d(TAG, "📊 Sending version information");

        try {
            JSONObject versionInfo = new JSONObject();
            versionInfo.put("type", "version_info");
            versionInfo.put("timestamp", System.currentTimeMillis());
            String appVersion = "1.0.0";
            String buildNumber = "1";
            try {
                appVersion = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
                buildNumber = String.valueOf(getPackageManager().getPackageInfo(getPackageName(), 0).versionCode);
            } catch (Exception e) {
                Log.e(TAG, "Error getting app version", e);
            }
            versionInfo.put("app_version", appVersion);
            versionInfo.put("build_number", buildNumber);
            versionInfo.put("device_model", android.os.Build.MODEL);
            versionInfo.put("android_version", android.os.Build.VERSION.RELEASE);

            if (bluetoothManager != null && bluetoothManager.isConnected()) {
                bluetoothManager.sendData(versionInfo.toString().getBytes(StandardCharsets.UTF_8));
                Log.d(TAG, "✅ Sent version info to phone");
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error creating version info", e);
        }
    }

    public void handleButtonPressForVpsDemo() {
        Log.d(TAG, "Handling button press for VPS demo");
        
        // Initialize PhotoCaptureService if needed
        if (mPhotoCaptureService == null) {
            initializePhotoCaptureService();
        }
        
        // Call the VPS photo upload method directly
        // This bypasses the backend communication and directly calls the VPS service
        mPhotoCaptureService.takeDebugVpsPhotoAndUpload();
    }
    
    /**
     * Take a photo and upload it to AugmentOS Cloud
     */
    // Photo capture listener (delegated to PhotoCaptureService)
    private final PhotoCaptureService.PhotoCaptureListener photoCaptureListener = 
        new PhotoCaptureService.PhotoCaptureListener() {
            @Override
            public void onPhotoCapturing(String requestId) {
                Log.d(TAG, "Photo capturing started: " + requestId);
            }
            
            @Override
            public void onPhotoCaptured(String requestId, String filePath) {
                Log.d(TAG, "Photo captured: " + requestId + ", path: " + filePath);
            }
            
            @Override
            public void onPhotoUploading(String requestId) {
                Log.d(TAG, "Photo uploading: " + requestId);
            }
            
            @Override
            public void onPhotoUploaded(String requestId, String url) {
                Log.d(TAG, "Photo uploaded: " + requestId + ", URL: " + url);
            }
            
            @Override
            public void onPhotoError(String requestId, String error) {
                Log.e(TAG, "Photo error: " + requestId + ", error: " + error);
            }
        };
    
    /**
     * Send a success response for a photo request
     */
    private void sendPhotoSuccessResponse(String requestId, String appId, String photoUrl) {
        try {
            JSONObject response = new JSONObject();
            response.put("type", "photo_response");
            response.put("requestId", requestId);
            response.put("appId", appId);
            response.put("success", true);
            response.put("photoUrl", photoUrl);
            
            // Convert to string
            String jsonString = response.toString();
            Log.d(TAG, "Formatted photo success response: " + jsonString);
            
            // Send the response back
            if (bluetoothManager != null && bluetoothManager.isConnected()) {
                bluetoothManager.sendData(jsonString.getBytes());
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error creating photo success response", e);
        }
    }
    
    /**
     * Send an error response for a photo request
     */
    private void sendPhotoErrorResponse(String requestId, String appId, String errorMessage) {
        try {
            JSONObject response = new JSONObject();
            response.put("type", "photo_response");
            response.put("requestId", requestId);
            response.put("appId", appId);
            response.put("success", false);
            response.put("error", errorMessage);
            
            // Convert to string
            String jsonString = response.toString();
            Log.d(TAG, "Formatted photo error response: " + jsonString);
            
            // Send the response back
            if (bluetoothManager != null && bluetoothManager.isConnected()) {
                bluetoothManager.sendData(jsonString.getBytes());
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error creating photo error response", e);
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
    
    /**
     * DEBUG FUNCTION: Starts a timer to take photos and upload them to the VPS server every 10 seconds.
     * This is only for debugging purposes and should not be enabled in production.
     */
    private void startDebugVpsPhotoUploadTimer() {
        Log.d(TAG, "DEBUG: Starting VPS photo upload debug timer");
        
        // Create a new Handler associated with the main thread
        debugVpsPhotoHandler = new Handler(Looper.getMainLooper());
        
        // Create a Runnable that will take and upload a photo
        debugVpsPhotoRunnable = new Runnable() {
            @Override
            public void run() {
                // Take a photo and upload it to the VPS server
                if (mPhotoCaptureService != null) {
                    mPhotoCaptureService.takeDebugVpsPhotoAndUpload();
                }
                
                // Schedule the next execution
                debugVpsPhotoHandler.postDelayed(this, 10000); // 10 seconds
            }
        };
        
        // Start the timer
        debugVpsPhotoHandler.post(debugVpsPhotoRunnable);
    }
    
    /**
     * Stop the debug VPS photo upload timer
     */
    private void stopDebugVpsPhotoUploadTimer() {
        Log.d(TAG, "DEBUG: Stopping VPS photo upload debug timer");
        if (debugVpsPhotoHandler != null && debugVpsPhotoRunnable != null) {
            debugVpsPhotoHandler.removeCallbacks(debugVpsPhotoRunnable);
            debugVpsPhotoRunnable = null;
            debugVpsPhotoHandler = null;
        }
    }
    
    /**
     * Initialize RTMP streaming components
     * This creates the necessary UI components and initializes the RTMPStreamer
     * but doesn't start streaming yet
     */
    private void initializeRtmpStreaming() {
        new Thread(() -> {
            try {
                Log.d(TAG, "Initializing RTMP streaming components");
                
                // Create UI components on main thread
                Handler mainHandler = new Handler(Looper.getMainLooper());
                final java.util.concurrent.CountDownLatch uiLatch = new java.util.concurrent.CountDownLatch(1);
                
                mainHandler.post(() -> {
                    try {
                        // Following the StreamPackLite README, we need a properly laid out SurfaceView
                        // Create a FrameLayout that we can add to the window with proper permissions
                        final android.widget.FrameLayout container = new android.widget.FrameLayout(getApplicationContext());
                        
                        // Create a SurfaceView as a child of the FrameLayout
                        rtmpSurfaceView = new android.view.SurfaceView(getApplicationContext());
                        Log.d(TAG, "Creating SurfaceView for RTMP streaming");
                        
                        // Add the SurfaceView to the container with specific size
                        android.widget.FrameLayout.LayoutParams params = new android.widget.FrameLayout.LayoutParams(
                            640, // Fixed width
                            480, // Fixed height
                            android.view.Gravity.CENTER // Center in parent
                        );
                        rtmpSurfaceView.setLayoutParams(params);
                        container.addView(rtmpSurfaceView);
                        Log.d(TAG, "Added SurfaceView to container with size 640x480");
                        
                        // Create window parameters - using TYPE_APPLICATION here which doesn't need special permissions
                        android.view.WindowManager.LayoutParams windowParams = new android.view.WindowManager.LayoutParams(
                            android.view.WindowManager.LayoutParams.WRAP_CONTENT,
                            android.view.WindowManager.LayoutParams.WRAP_CONTENT,
                            android.view.WindowManager.LayoutParams.TYPE_APPLICATION,
                            android.view.WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE |
                            android.view.WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                            android.graphics.PixelFormat.TRANSLUCENT
                        );
                        windowParams.gravity = android.view.Gravity.TOP | android.view.Gravity.START;
                        windowParams.x = 0;
                        windowParams.y = 0;
                        
                        // Get the window manager service
                        final android.view.WindowManager windowManager = (android.view.WindowManager) getSystemService(WINDOW_SERVICE);
                        
                        // Add a callback to monitor surface creation events
                        rtmpSurfaceView.getHolder().addCallback(new android.view.SurfaceHolder.Callback() {
                            @Override
                            public void surfaceCreated(android.view.SurfaceHolder holder) {
                                Log.d(TAG, "SurfaceView created - surface is ready");
                                Log.d(TAG, "Surface holder valid: " + holder.getSurface().isValid());
                                // Signal that the surface is created and ready to use
                                uiLatch.countDown();
                            }

                            @Override
                            public void surfaceChanged(android.view.SurfaceHolder holder, int format, int width, int height) {
                                Log.d(TAG, "SurfaceView changed: format=" + format + ", size=" + width + "x" + height);
                            }

                            @Override
                            public void surfaceDestroyed(android.view.SurfaceHolder holder) {
                                Log.d(TAG, "SurfaceView destroyed - surface no longer available");
                            }
                        });
                        
                        // Add the container to the window to make it part of the view hierarchy
                        try {
                            windowManager.addView(container, windowParams);
                            Log.d(TAG, "Successfully added container to window");
                        } catch (Exception e) {
                            Log.e(TAG, "Failed to add container to window: " + e.getMessage(), e);
                            // If adding to window fails, try to continue and see if the SurfaceView works anyway
                            uiLatch.countDown();
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Error initializing RTMP UI components: " + e.getMessage(), e);
                        uiLatch.countDown(); // Release the latch in case of error
                    }
                });
                
                // Wait for the surface to be ready - properly blocking until surfaceCreated is called
                try {
                    Log.d(TAG, "Waiting for surface to be ready...");
                    // Wait up to 5 seconds for the surface to initialize
                    boolean surfaceReady = uiLatch.await(5, java.util.concurrent.TimeUnit.SECONDS);
                    Log.d(TAG, "Surface ready status: " + surfaceReady);
                    
                    // Add a small delay to ensure surface is fully initialized
                    Thread.sleep(500);
                    Log.d(TAG, "Added delay for surface initialization");
                } catch (InterruptedException e) {
                    Log.e(TAG, "Surface wait interrupted", e);
                }
                
                // Initialize our RTMP streamer AFTER surface is ready
                Log.d(TAG, "Creating RTMPStreamer");
                rtmpStreamer = new RTMPStreamer(getApplicationContext());
                
                // Call startPreview which is the critical step according to the README
                // This must happen BEFORE starting the stream
                if (rtmpSurfaceView != null) {
                    Log.d(TAG, "Calling startPreview on the RTMPStreamer");
                    boolean previewStarted = rtmpStreamer.startPreview(rtmpSurfaceView);
                    Log.d(TAG, "startPreview result: " + previewStarted);
                    
                    // Force additional layout pass to ensure SurfaceView is measured and laid out
                    mainHandler.post(() -> {
                        rtmpSurfaceView.requestLayout();
                        Log.d(TAG, "Requested layout for SurfaceView");
                        Log.d(TAG, "SurfaceView dimensions after layout: " + rtmpSurfaceView.getWidth() + "x" + rtmpSurfaceView.getHeight());
                        Log.d(TAG, "SurfaceView holder valid: " + (rtmpSurfaceView.getHolder() != null && 
                                                            rtmpSurfaceView.getHolder().getSurface() != null && 
                                                            rtmpSurfaceView.getHolder().getSurface().isValid()));
                    });
                } else {
                    Log.e(TAG, "Surface view is null, couldn't start preview");
                }
                
                Log.d(TAG, "RTMP streaming components initialized, ready for streaming");
            } catch (Exception e) {
                Log.e(TAG, "Error initializing RTMP streaming components", e);
            }
        }).start();
    }
    
    /**
     * Start RTMP streaming to the specified URL
     * 
     * @param rtmpUrl The RTMP URL to stream to (e.g., rtmp://server:1935/live/streamkey)
     * @return true if the streaming request was sent, false otherwise
     */
    public boolean startRtmpStreaming(String rtmpUrl) {
        if (isRtmpStreamingActive) {
            Log.w(TAG, "RTMP streaming already active");
            return false;
        }
        
        if (rtmpStreamer == null) {
            Log.e(TAG, "RTMP streamer not initialized");
            return false;
        }
        
        if (rtmpUrl == null || rtmpUrl.isEmpty()) {
            Log.e(TAG, "Invalid RTMP URL");
            return false;
        }
        
        try {
            // Store the URL for reconnection if needed
            currentRtmpUrl = rtmpUrl;
            
            // Start streaming with callback
            rtmpStreamer.startStreaming(rtmpUrl, new RTMPStreamer.StreamingCallback() {
                @Override
                public void onStreamingStarted() {
                    Log.d(TAG, "RTMP streaming started successfully to " + rtmpUrl);
                    isRtmpStreamingActive = true;
                    
                    // Notify listeners
                    notifyStreamingStarted(rtmpUrl);
                }
                
                @Override
                public void onStreamingStopped() {
                    Log.d(TAG, "RTMP streaming stopped");
                    isRtmpStreamingActive = false;
                    currentRtmpUrl = null;
                    
                    // Notify listeners
                    notifyStreamingStopped();
                }
                
                @Override
                public void onStreamingError(String error) {
                    Log.e(TAG, "RTMP streaming error: " + error);
                    isRtmpStreamingActive = false;
                    
                    // Notify listeners
                    notifyStreamingError(error);
                }
            });
            
            Log.d(TAG, "RTMP streaming request sent to " + rtmpUrl);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error starting RTMP streaming", e);
            return false;
        }
    }
    
    /**
     * Stop the current RTMP stream
     * 
     * @return true if the stop request was sent, false otherwise
     */
    public boolean stopRtmpStreaming() {
        if (!isRtmpStreamingActive) {
            Log.w(TAG, "No active RTMP stream to stop");
            return false;
        }
        
        if (rtmpStreamer == null) {
            Log.e(TAG, "RTMP streamer not initialized");
            return false;
        }
        
        try {
            rtmpStreamer.stopStreaming(new RTMPStreamer.StreamingCallback() {
                @Override
                public void onStreamingStarted() {
                    // Not used in this context
                }
                
                @Override
                public void onStreamingStopped() {
                    Log.d(TAG, "RTMP streaming stopped successfully");
                    isRtmpStreamingActive = false;
                    currentRtmpUrl = null;
                    
                    // Notify listeners
                    notifyStreamingStopped();
                }
                
                @Override
                public void onStreamingError(String error) {
                    Log.e(TAG, "Error stopping RTMP stream: " + error);
                    isRtmpStreamingActive = false;
                    currentRtmpUrl = null;
                    
                    // Notify listeners with the error
                    notifyStreamingError("Error stopping stream: " + error);
                }
            });
            
            Log.d(TAG, "RTMP streaming stop request sent");
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error stopping RTMP streaming", e);
            return false;
        }
    }
    
    /**
     * Check if RTMP streaming is currently active
     * 
     * @return true if streaming is active, false otherwise
     */
    public boolean isRtmpStreaming() {
        return isRtmpStreamingActive;
    }
    
    /**
     * Get the current RTMP URL that's being streamed to
     * 
     * @return The current RTMP URL or null if not streaming
     */
    public String getCurrentRtmpUrl() {
        return currentRtmpUrl;
    }
    
    /**
     * Configure video streaming parameters
     * 
     * @param bitrate Video bitrate in bits per second
     * @param width Video width in pixels
     * @param height Video height in pixels
     * @param fps Frames per second
     * @return true if configuration was successful, false otherwise
     */
    public boolean configureRtmpVideo(int bitrate, int width, int height, int fps) {
        if (rtmpStreamer == null) {
            Log.e(TAG, "RTMP streamer not initialized");
            return false;
        }
        
        try {
            rtmpStreamer.configureVideo(bitrate, width, height, fps);
            Log.d(TAG, "RTMP video configured: " + width + "x" + height + ", " + fps + "fps, " + bitrate + "bps");
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error configuring RTMP video", e);
            return false;
        }
    }
    
    /**
     * Configure audio streaming parameters
     * 
     * @param bitrate Audio bitrate in bits per second
     * @param sampleRate Audio sample rate in Hz
     * @param stereo true for stereo audio, false for mono
     * @return true if configuration was successful, false otherwise
     */
    public boolean configureRtmpAudio(int bitrate, int sampleRate, boolean stereo) {
        if (rtmpStreamer == null) {
            Log.e(TAG, "RTMP streamer not initialized");
            return false;
        }
        
        try {
            rtmpStreamer.configureAudio(bitrate, sampleRate, stereo);
            Log.d(TAG, "RTMP audio configured: " + sampleRate + "Hz, " + (stereo ? "stereo" : "mono") + ", " + bitrate + "bps");
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error configuring RTMP audio", e);
            return false;
        }
    }
    
    /**
     * Restart the current RTMP stream using the last URL
     * 
     * @return true if restart was successful, false otherwise
     */
    public boolean restartRtmpStreaming() {
        if (currentRtmpUrl == null || currentRtmpUrl.isEmpty()) {
            Log.e(TAG, "No previous RTMP URL to reconnect to");
            return false;
        }
        
        if (isRtmpStreamingActive) {
            stopRtmpStreaming();
        }
        
        // Short delay before reconnecting
        try {
            Thread.sleep(1000);
        } catch (InterruptedException e) {
            // Ignore
        }
        
        return startRtmpStreaming(currentRtmpUrl);
    }
    
    /**
     * Notify all listeners that streaming has started
     */
    private void notifyStreamingStarted(String url) {
        Handler mainHandler = new Handler(Looper.getMainLooper());
        mainHandler.post(() -> {
            for (RtmpStreamingListener listener : rtmpStreamingListeners) {
                try {
                    listener.onStreamingStarted(url);
                } catch (Exception e) {
                    Log.e(TAG, "Error notifying listener of streaming start", e);
                }
            }
        });
    }
    
    /**
     * Notify all listeners that streaming has stopped
     */
    private void notifyStreamingStopped() {
        Handler mainHandler = new Handler(Looper.getMainLooper());
        mainHandler.post(() -> {
            for (RtmpStreamingListener listener : rtmpStreamingListeners) {
                try {
                    listener.onStreamingStopped();
                } catch (Exception e) {
                    Log.e(TAG, "Error notifying listener of streaming stop", e);
                }
            }
        });
    }
    
    /**
     * Notify all listeners that a streaming error occurred
     */
    private void notifyStreamingError(String error) {
        Handler mainHandler = new Handler(Looper.getMainLooper());
        mainHandler.post(() -> {
            for (RtmpStreamingListener listener : rtmpStreamingListeners) {
                try {
                    listener.onStreamingError(error);
                } catch (Exception e) {
                    Log.e(TAG, "Error notifying listener of streaming error", e);
                }
            }
        });
    }
    
    /**
     * Send an RTMP streaming response over BLE
     * 
     * @param success Whether the operation was successful
     * @param message Success or error message
     */
    private void sendRtmpStreamingResponse(boolean success, String message) {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            try {
                JSONObject response = new JSONObject();
                response.put("type", "rtmp_response");
                response.put("success", success);
                response.put("message", message);
                response.put("timestamp", System.currentTimeMillis());
                
                bluetoothManager.sendData(response.toString().getBytes(StandardCharsets.UTF_8));
                Log.d(TAG, "Sent RTMP streaming response: " + response);
            } catch (Exception e) {
                Log.e(TAG, "Error sending RTMP streaming response", e);
            }
        }
    }
    
    /**
     * Send RTMP streaming status information over BLE
     */
    private void sendRtmpStreamingStatus() {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            try {
                JSONObject status = new JSONObject();
                status.put("type", "rtmp_status");
                status.put("streaming", isRtmpStreamingActive);
                
                if (isRtmpStreamingActive && currentRtmpUrl != null) {
                    status.put("rtmpUrl", currentRtmpUrl);
                }
                
                status.put("timestamp", System.currentTimeMillis());
                
                bluetoothManager.sendData(status.toString().getBytes(StandardCharsets.UTF_8));
                Log.d(TAG, "Sent RTMP streaming status: " + status);
            } catch (Exception e) {
                Log.e(TAG, "Error sending RTMP streaming status", e);
            }
        }
    }
    
    /**
     * Track whether we've been initialized to avoid duplicate initialization
     */
    private boolean mIsInitialized = false;
    
    /**
     * Check if the service has been initialized
     */
    private boolean isInitialized() {
        return mIsInitialized;
    }
    
    /**
     * Safely initialize core components with proper error handling
     */
    private void safelyInitializeComponents() {
        try {
            Log.e(TAG, "Starting initialization of core components");
            
            // Initialize the network manager
            try {
                initializeNetworkManager();
                Log.e(TAG, "Successfully initialized network manager");
            } catch (Exception e) {
                Log.e(TAG, "Failed to initialize network manager: " + e.getMessage(), e);
            }
            
            // Initialize the bluetooth manager
            try {
                initializeBluetoothManager();
                Log.e(TAG, "Successfully initialized bluetooth manager");
            } catch (Exception e) {
                Log.e(TAG, "Failed to initialize bluetooth manager: " + e.getMessage(), e);
            }
            
            // Mark as initialized
            mIsInitialized = true;
            Log.e(TAG, "Core components initialization complete");
            
        } catch (Exception e) {
            Log.e(TAG, "Uncaught exception during initialization: " + e.getMessage(), e);
        }
    }
    
    /**
     * Log detailed information about service start
     */
    private void logServiceStartInfo(Intent intent, int startId) {
        try {
            Log.e(TAG, "==============================================");
            Log.e(TAG, "SERVICE START INFO");
            Log.e(TAG, "StartId: " + startId);
            Log.e(TAG, "Android version: " + Build.VERSION.RELEASE + " (SDK " + Build.VERSION.SDK_INT + ")");
            Log.e(TAG, "Device: " + Build.MANUFACTURER + " " + Build.MODEL);
            Log.e(TAG, "Intent: " + (intent != null ? intent.toString() : "null"));
            Log.e(TAG, "Action: " + (intent != null ? intent.getAction() : "null"));
            if (intent != null && intent.getExtras() != null) {
                for (String key : intent.getExtras().keySet()) {
                    Log.e(TAG, "Extra: " + key + " = " + intent.getExtras().get(key));
                }
            }
            Log.e(TAG, "Thread ID: " + Thread.currentThread().getId());
            Log.e(TAG, "==============================================");
        } catch (Exception e) {
            Log.e(TAG, "Error logging service start info", e);
        }
    }
    
    /**
     * Record service start in SharedPreferences
     */
    private void recordServiceStart(String action, Bundle extras) {
        try {
            SharedPreferences prefs = getSharedPreferences("boot_stats", MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            
            // Increment counter
            int serviceStartCount = prefs.getInt("service_start_count", 0) + 1;
            editor.putInt("service_start_count", serviceStartCount);
            
            // Record details
            editor.putString("last_service_action", action);
            editor.putLong("last_service_start_time", System.currentTimeMillis());
            
            // Extract any info from extras
            if (extras != null) {
                if (extras.containsKey("boot_source")) {
                    editor.putString("last_service_boot_source", extras.getString("boot_source"));
                }
                if (extras.containsKey("boot_time")) {
                    editor.putLong("last_service_boot_time", extras.getLong("boot_time"));
                }
            }
            
            editor.apply();
            
            Log.e(TAG, "Recorded service start #" + serviceStartCount + " with action: " + action);
        } catch (Exception e) {
            Log.e(TAG, "Error recording service start", e);
        }
    }
    
    /**
     * Update the service notification with latest information
     */
    private void updateServiceNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                // Create an updated notification
                Notification notification = updateNotification();
                
                // Update the foreground notification
                NotificationManager notificationManager = 
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                
                if (notificationManager != null) {
                    notificationManager.notify(asgServiceNotificationId, notification);
                    Log.e(TAG, "Updated foreground notification");
                }
            } catch (Exception e) {
                Log.e(TAG, "Error updating notification", e);
            }
        }
    }
    
    // Use existing RTMP implementation in the service
    // Our StreamPackLite-based implementation (RTMPStreamingExample) can be used
    // if the existing RTMP implementation needs to be enhanced in the future
}
