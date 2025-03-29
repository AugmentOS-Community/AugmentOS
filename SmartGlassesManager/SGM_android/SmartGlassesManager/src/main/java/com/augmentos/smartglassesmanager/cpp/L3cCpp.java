package com.augmentos.smartglassesmanager.cpp;

public class L3cCpp {

    static {
        System.loadLibrary("lc3");
    }

    private L3cCpp() {
        // Private constructor to prevent instantiation
    }

    public static void init() {
        // This method can be used for additional initialization if needed
    }

    public static native long initEncoder();
    public static native void freeEncoder(long encoderPtr);
    public static native byte[] encodeLC3(long encoderPtr, byte[] pcmData);

    public static native long initDecoder();
    public static native void freeDecoder(long decoderPtr);
    public static native byte[] decodeLC3(long decoderPtr, byte[] lc3Data);
}
