package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

/**
 * Event sent when glasses need WiFi credentials to connect to a network.
 * This is specifically for glasses models that require WiFi connectivity,
 * such as Mentra Live glasses.
 */
public class GlassesNeedWifiCredentialsEvent {
    // The device model name requiring WiFi credentials
    public final String deviceModel;
    
    // Whether the device currently needs WiFi credentials
    public final boolean needsCredentials;
    
    // Additional info about current WiFi status if available
    public final boolean isWifiConnected;
    public final String currentSsid;
    
    /**
     * Create a new GlassesNeedWifiCredentialsEvent
     * 
     * @param deviceModel The glasses model name
     * @param needsCredentials Whether the glasses need WiFi credentials
     * @param isWifiConnected Current WiFi connection state if known
     * @param currentSsid Current SSID if connected
     */
    public GlassesNeedWifiCredentialsEvent(String deviceModel, boolean needsCredentials, 
                                         boolean isWifiConnected, String currentSsid) {
        this.deviceModel = deviceModel;
        this.needsCredentials = needsCredentials;
        this.isWifiConnected = isWifiConnected;
        this.currentSsid = currentSsid;
    }
}