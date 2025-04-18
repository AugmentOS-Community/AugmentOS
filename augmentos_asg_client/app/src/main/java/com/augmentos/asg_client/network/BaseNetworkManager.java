package com.augmentos.asg_client.network;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiManager;
import android.util.Log;

import java.util.ArrayList;
import java.util.List;

/**
 * Base implementation of the INetworkManager interface.
 * Provides common functionality for all network manager implementations.
 */
public abstract class BaseNetworkManager implements INetworkManager {
    private static final String TAG = "BaseNetworkManager";
    
    protected final Context context;
    protected final List<NetworkStateListener> listeners = new ArrayList<>();
    protected boolean isHotspotEnabled = false;
    
    /**
     * Create a new BaseNetworkManager
     * @param context The application context
     */
    public BaseNetworkManager(Context context) {
        this.context = context.getApplicationContext();
    }
    
    @Override
    public void addWifiListener(NetworkStateListener listener) {
        if (!listeners.contains(listener)) {
            listeners.add(listener);
        }
    }
    
    @Override
    public void removeWifiListener(NetworkStateListener listener) {
        listeners.remove(listener);
    }
    
    /**
     * Notify all listeners that the WiFi state has changed
     * @param isConnected true if connected to WiFi, false otherwise
     */
    protected void notifyWifiStateChanged(boolean isConnected) {
        // Important! Check the actual WiFi state - this prevents reversed state reporting
        boolean actuallyConnected = isConnectedToWifi();
        
        // If the reported state doesn't match the actual state, log a warning
        if (isConnected != actuallyConnected) {
            Log.w(TAG, "WiFi state mismatch - reported: " + (isConnected ? "connected" : "disconnected") + 
                    ", actual: " + (actuallyConnected ? "connected" : "disconnected"));
            // Use the actual state instead of the reported state
            isConnected = actuallyConnected;
        }
        
        Log.d(TAG, "WiFi state changed: " + (isConnected ? "CONNECTED" : "DISCONNECTED"));
        for (NetworkStateListener listener : listeners) {
            try {
                listener.onWifiStateChanged(isConnected);
            } catch (Exception e) {
                Log.e(TAG, "Error notifying listener", e);
            }
        }
    }
    
    /**
     * Notify all listeners that the hotspot state has changed
     * @param isEnabled true if the hotspot is enabled, false otherwise
     */
    protected void notifyHotspotStateChanged(boolean isEnabled) {
        Log.d(TAG, "Hotspot state changed: " + (isEnabled ? "enabled" : "disabled"));
        this.isHotspotEnabled = isEnabled;
        for (NetworkStateListener listener : listeners) {
            try {
                listener.onHotspotStateChanged(isEnabled);
            } catch (Exception e) {
                Log.e(TAG, "Error notifying listener", e);
            }
        }
    }
    
    /**
     * Notify all listeners that WiFi credentials have been received
     * @param ssid The SSID of the network
     * @param password The password for the network
     * @param authToken Optional authentication token
     */
    protected void notifyWifiCredentialsReceived(String ssid, String password, String authToken) {
        Log.d(TAG, "WiFi credentials received for SSID: " + ssid);
        for (NetworkStateListener listener : listeners) {
            try {
                listener.onWifiCredentialsReceived(ssid, password, authToken);
            } catch (Exception e) {
                Log.e(TAG, "Error notifying listener", e);
            }
        }
    }
    
    /**
     * Check if the device is currently connected to a WiFi network
     * @return true if connected to WiFi, false otherwise
     */
    @Override
    public boolean isConnectedToWifi() {
        try {
            // First, check if WiFi is enabled at all
            WifiManager wifiManager = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
            if (wifiManager == null || !wifiManager.isWifiEnabled()) {
                Log.d(TAG, "isConnectedToWifi(): WiFi is disabled or WifiManager is null");
                return false;
            }
            
            // Now check if we're actually connected to a network
            ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) {
                Log.d(TAG, "isConnectedToWifi(): ConnectivityManager is null");
                return false;
            }
            
            Network network = cm.getActiveNetwork();
            if (network == null) {
                Log.d(TAG, "isConnectedToWifi(): No active network");
                return false;
            }
            
            NetworkCapabilities capabilities = cm.getNetworkCapabilities(network);
            boolean hasWifiTransport = capabilities != null && 
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
            
            Log.d(TAG, "isConnectedToWifi(): WiFi enabled=" + wifiManager.isWifiEnabled() + 
                    ", Has WiFi Transport=" + hasWifiTransport + 
                    ", Status=" + (hasWifiTransport ? "CONNECTED" : "DISCONNECTED"));
            
            return hasWifiTransport;
        } catch (Exception e) {
            Log.e(TAG, "Error checking WiFi connection", e);
            return false;
        }
    }
    
    /**
     * Get the SSID of the currently connected WiFi network
     * @return the SSID string, or empty string if not connected
     */
    @Override
    public String getCurrentWifiSsid() {
        try {
            // First check if we're connected to WiFi at all
            if (!isConnectedToWifi()) {
                return "";
            }
            
            // Get the WiFi manager and connection info
            WifiManager wifiManager = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
            if (wifiManager == null) {
                return "";
            }
            
            // Get connection info
            String ssid = wifiManager.getConnectionInfo().getSSID();
            
            // WifiManager surrounds SSID with quotes - remove them if present
            if (ssid != null && ssid.startsWith("\"") && ssid.endsWith("\"")) {
                ssid = ssid.substring(1, ssid.length() - 1);
            }
            
            // Check for the "unknown ssid" value
            if (ssid == null || ssid.isEmpty() || "<unknown ssid>".equals(ssid)) {
                return "";
            }
            
            return ssid;
        } catch (Exception e) {
            Log.e(TAG, "Error getting current WiFi SSID", e);
            return "";
        }
    }
    
    /**
     * Initialize the network manager
     * Default implementation checks the current WiFi state and notifies listeners
     */
    @Override
    public void initialize() {
        boolean connected = isConnectedToWifi();
        notifyWifiStateChanged(connected);
        notifyHotspotStateChanged(isHotspotEnabled);
    }
    
    /**
     * Clean up resources
     */
    @Override
    public void shutdown() {
        listeners.clear();
    }
}