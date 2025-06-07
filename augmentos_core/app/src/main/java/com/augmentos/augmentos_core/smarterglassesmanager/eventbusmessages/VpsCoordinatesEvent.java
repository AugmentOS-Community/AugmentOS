package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

public class VpsCoordinatesEvent {
    public final String deviceModel;
    public final String requestId;
    public final double x;
    public final double y;
    public final double z;
    public final double qx;
    public final double qy;
    public final double qz;
    public final double qw;
    public final double confidence;

    public VpsCoordinatesEvent(String deviceModel, String requestId, double x, double y, double z, double qx, double qy, double qz, double qw, double confidence) {
        this.deviceModel = deviceModel;
        this.requestId = requestId;
        this.x = x;
        this.y = y;
        this.z = z;
        this.qx = qx;
        this.qy = qy;
        this.qz = qz;
        this.qw = qw;
        this.confidence = confidence;
    }
} 