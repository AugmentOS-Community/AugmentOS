package com.augmentos.augmentos_manager;

import android.content.Context;
import android.util.Log;

import com.augmentos.augmentoslib.AugmentOSLib;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.Subscribe;

/**
 * Singleton class for managing communication with AugmentOS Core
 * Replaces the foreground service approach with a direct singleton pattern
 */
public class AugmentOSCommunicator {
    private static final String TAG = "AugmentOSCommunicator";
    private static AugmentOSCommunicator instance;
    
    private AugmentOSLib augmentOSLib;
    private ReactApplicationContext reactContext;
    private boolean isInitialized = false;

    // Private constructor to enforce singleton pattern
    private AugmentOSCommunicator() {
        // Intentionally empty
    }

    // Singleton instance getter
    public static synchronized AugmentOSCommunicator getInstance() {
        if (instance == null) {
            instance = new AugmentOSCommunicator();
        }
        return instance;
    }

    // Initialize with React context
    public void initialize(ReactApplicationContext context) {
        if (isInitialized) {
            return;
        }
        
        this.reactContext = context;
        this.augmentOSLib = new AugmentOSLib(context);
        this.augmentOSLib.subscribeCoreToManagerMessages(this::processCoreMessage);
        
        // Register for event bus events
        if (!EventBus.getDefault().isRegistered(this)) {
            EventBus.getDefault().register(this);
        }
        
        isInitialized = true;
        
        // Send initial status request
        sendCommandToCore("{ 'command': 'request_status' }");
        
        Log.d(TAG, "AugmentOSCommunicator initialized");
    }

    // Clean up resources
    public void cleanup() {
        if (augmentOSLib != null) {
            augmentOSLib.deinit();
        }
        
        if (EventBus.getDefault().isRegistered(this)) {
            EventBus.getDefault().unregister(this);
        }
        
        isInitialized = false;
        Log.d(TAG, "AugmentOSCommunicator cleanup complete");
    }

    // Process messages coming from Core
    public void processCoreMessage(String jsonString) {
        if (reactContext != null && reactContext.hasActiveCatalystInstance()) {
            reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("CoreMessageIntentEvent", jsonString);
        } else {
            Log.w(TAG, "Cannot emit message to JS - React context not available");
        }
    }

    // Send command to Core
    public void sendCommandToCore(String jsonString) {
        if (augmentOSLib != null) {
            augmentOSLib.sendDataFromManagerToCore(jsonString);
        } else {
            Log.e(TAG, "Cannot send command - AugmentOSLib not initialized");
        }
    }

    // Handle notification events
    @Subscribe
    public void onNewNotificationReceivedEvent(NewNotificationReceivedEvent event) {
        try {
            Log.d(TAG, "Received notification: " + event.toString());
            // Create JSON object from notification event
            String notificationJson = String.format(
                "{ \"command\": \"phone_notification\", \"params\": { \"app_name\": \"%s\", \"title\": \"%s\", \"text\": \"%s\" } }",
                event.appName, event.title, event.text
            );
            
            sendCommandToCore(notificationJson);
        } catch (Exception e) {
            Log.e(TAG, "Failed to process notification event", e);
        }
    }

    // Check if initialized
    public boolean isInitialized() {
        return isInitialized;
    }
}