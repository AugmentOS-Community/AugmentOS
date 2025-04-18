package com.augmentos.asg_client.network;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

/**
 * Factory class that creates the appropriate network manager based on device type.
 */
public class NetworkManagerFactory {
    private static final String TAG = "NetworkManagerFactory";
    
    // Constants for K900 detection
    private static final String K900_BROADCAST_ACTION = "com.xy.xsetting.action";
    private static final String K900_SYSTEM_UI_PACKAGE = "com.android.systemui";
    
    /**
     * Get the appropriate network manager for the current device
     * @param context The application context
     * @return The appropriate network manager
     */
    public static INetworkManager getNetworkManager(Context context) {
        DebugNotificationManager notificationManager = new DebugNotificationManager(context);
        
        // First check if we're on a K900 device
        if (isK900Device(context)) {
            Log.i(TAG, "Detected K900 device, using K900NetworkManager");
            notificationManager.showDeviceTypeNotification(true);
            return new K900NetworkManager(context);
        } 
        
        // Next check if we have system permissions
        if (hasSystemPermissions(context)) {
            Log.i(TAG, "Device has system permissions, using SystemNetworkManager");
            notificationManager.showDeviceTypeNotification(false);
            return new SystemNetworkManager(context, notificationManager);
        }
        
        // Fallback to the basic implementation
        Log.i(TAG, "Using FallbackNetworkManager");
        notificationManager.showDeviceTypeNotification(false);
        notificationManager.showDebugNotification(
                "Limited WiFi Functionality", 
                "This app is running without system permissions. WiFi and hotspot functionality will be limited.");
        return new FallbackNetworkManager(context, notificationManager);
    }
    
    /**
     * Check if the device is a K900
     * @param context The application context
     * @return true if the device is a K900, false otherwise
     */
    private static boolean isK900Device(Context context) {
        try {
            // First check if the SystemUI package exists
            PackageManager pm = context.getPackageManager();
            pm.getPackageInfo(K900_SYSTEM_UI_PACKAGE, 0);
            
            // Create a test broadcast to check if the K900-specific receiver is present
            final boolean[] responseReceived = {false};
            
            // Set up a receiver for the response
            BroadcastReceiver testReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    Log.d(TAG, "Received response from K900 broadcast: " + intent);
                    responseReceived[0] = true;
                }
            };
            
            // Register for any response from our probe
            context.registerReceiver(testReceiver, new IntentFilter("com.xy.xsetting.response"));
            
            // Send a test probe
            Intent testIntent = new Intent(K900_BROADCAST_ACTION);
            testIntent.setPackage(K900_SYSTEM_UI_PACKAGE);
            testIntent.putExtra("cmd", "test_k900");
            context.sendBroadcast(testIntent);
            
            // Wait a short time for response
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                try {
                    context.unregisterReceiver(testReceiver);
                } catch (Exception e) {
                    Log.e(TAG, "Error unregistering test receiver", e);
                }
            }, 1000);
            
            // For now, we'll return false as we don't have a way to wait synchronously
            // In a real implementation, you'd want to use a callback or other mechanism
            return false;
        } catch (Exception e) {
            Log.e(TAG, "Error checking for K900 device", e);
            return false;
        }
    }
    
    /**
     * Check if the app has system permissions
     * @param context The application context
     * @return true if the app has system permissions, false otherwise
     */
    private static boolean hasSystemPermissions(Context context) {
        try {
            // Check if the app is installed in a system location
            String appPath = context.getPackageCodePath();
            return appPath.startsWith("/system/") || appPath.contains("/priv-app/");
        } catch (Exception e) {
            Log.e(TAG, "Error checking for system permissions", e);
            return false;
        }
    }
}