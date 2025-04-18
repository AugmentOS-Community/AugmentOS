package com.augmentos.asg_client.network;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

/**
 * Implementation of INetworkManager for devices without system permissions.
 * Provides limited WiFi functionality and prompts the user to manually configure settings.
 */
public class FallbackNetworkManager extends BaseNetworkManager {
    private static final String TAG = "FallbackNetworkManager";
    
    private final WifiManager wifiManager;
    private final DebugNotificationManager notificationManager;
    private BroadcastReceiver wifiStateReceiver;
    
    /**
     * Create a new FallbackNetworkManager
     * @param context The application context
     * @param notificationManager The notification manager to use
     */
    public FallbackNetworkManager(Context context, DebugNotificationManager notificationManager) {
        super(context);
        this.wifiManager = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
        this.notificationManager = notificationManager;
        
        notificationManager.showDebugNotification(
                "Limited Network Manager", 
                "Running with limited permissions. WiFi and hotspot functionality will be limited.");
    }
    
    @Override
    public void initialize() {
        super.initialize();
        registerWifiStateReceiver();
        
        // Check if we're already connected to WiFi
        if (isConnectedToWifi()) {
            notificationManager.showWifiStateNotification(true);
        } else {
            notificationManager.showWifiStateNotification(false);
            // Prompt the user to enable WiFi manually
            promptEnableWifi();
        }
    }
    
    @Override
    public void enableWifi() {
        try {
            // Try to enable WiFi directly
            if (!wifiManager.isWifiEnabled()) {
                // This will likely fail without system permissions on Android 10+
                wifiManager.setWifiEnabled(true);
            }
            
            // Prompt the user to enable WiFi manually
            promptEnableWifi();
        } catch (Exception e) {
            Log.e(TAG, "Error enabling WiFi", e);
            // Fallback to prompting the user
            promptEnableWifi();
        }
    }
    
    @Override
    public void disableWifi() {
        try {
            // Try to disable WiFi directly
            if (wifiManager.isWifiEnabled()) {
                // This will likely fail without system permissions on Android 10+
                wifiManager.setWifiEnabled(false);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error disabling WiFi", e);
            notificationManager.showDebugNotification(
                    "WiFi Control Limited",
                    "Unable to disable WiFi automatically. Please disable WiFi manually.");
        }
    }
    
    @Override
    public void startHotspot(String ssid, String password) {
        // We can't start a hotspot without system permissions
        // Prompt the user to enable hotspot manually
        promptEnableHotspot();
    }
    
    @Override
    public void stopHotspot() {
        // We can't stop a hotspot without system permissions
        // Prompt the user to disable hotspot manually
        notificationManager.showDebugNotification(
                "Hotspot Control Limited",
                "Unable to disable hotspot automatically. Please disable the hotspot manually.");
    }
    
    @Override
    public void connectToWifi(String ssid, String password) {
        // We can't connect to WiFi automatically without system permissions
        // Prompt the user to connect manually
        notificationManager.showDebugNotification(
                "Manual WiFi Connection Required",
                "Please connect to WiFi network: " + ssid + " manually using the WiFi settings.");
        
        // Open the WiFi settings
        Intent intent = new Intent(Settings.ACTION_WIFI_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }
    
    /**
     * Prompt the user to enable WiFi manually
     */
    private void promptEnableWifi() {
        notificationManager.showDebugNotification(
                "WiFi Connection Required",
                "Please enable WiFi and connect to a network manually using the WiFi settings.");
        
        // Try to open the WiFi settings
        try {
            Intent intent = new Intent(Settings.ACTION_WIFI_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "Error opening WiFi settings", e);
        }
    }
    
    /**
     * Prompt the user to enable hotspot manually
     */
    private void promptEnableHotspot() {
        notificationManager.showDebugNotification(
                "Hotspot Setup Required",
                "Please enable mobile hotspot manually using the settings.");
        
        // Try to open the hotspot settings
        try {
            Intent intent = new Intent();
            intent.setClassName("com.android.settings", 
                    "com.android.settings.TetherSettings");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "Error opening hotspot settings", e);
            
            // Fallback to main settings
            try {
                Intent intent = new Intent(Settings.ACTION_WIRELESS_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            } catch (Exception e2) {
                Log.e(TAG, "Error opening wireless settings", e2);
            }
        }
    }
    
    /**
     * Register a receiver for WiFi state changes
     */
    private void registerWifiStateReceiver() {
        if (wifiStateReceiver != null) {
            return; // Already registered
        }
        
        wifiStateReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (WifiManager.NETWORK_STATE_CHANGED_ACTION.equals(intent.getAction())) {
                    boolean connected = isConnectedToWifi();
                    notifyWifiStateChanged(connected);
                    
                    // Always update the notification with the current state
                    notificationManager.showWifiStateNotification(connected);
                    
                    Log.d(TAG, "WiFi state changed broadcast: connected=" + connected);
                }
            }
        };
        
        IntentFilter filter = new IntentFilter(WifiManager.NETWORK_STATE_CHANGED_ACTION);
        context.registerReceiver(wifiStateReceiver, filter);
    }
    
    /**
     * Unregister the WiFi state receiver
     */
    private void unregisterWifiStateReceiver() {
        if (wifiStateReceiver != null) {
            try {
                context.unregisterReceiver(wifiStateReceiver);
                wifiStateReceiver = null;
            } catch (Exception e) {
                Log.e(TAG, "Error unregistering WiFi receiver", e);
            }
        }
    }
    
    @Override
    public void shutdown() {
        super.shutdown();
        unregisterWifiStateReceiver();
    }
}