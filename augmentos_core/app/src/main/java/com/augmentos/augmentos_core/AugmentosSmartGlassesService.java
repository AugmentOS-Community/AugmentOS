package com.augmentos.augmentos_core;

import android.content.Intent;
import android.graphics.ImageFormat;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.MemoryFile;
import android.os.ParcelFileDescriptor;
import android.os.RemoteException;
import android.util.Log;

import com.augmentos.augmentos_core.events.AugmentosSmartGlassesDisconnectedEvent;
import com.augmentos.augmentos_core.ui.AugmentosCoreUi;
import com.augmentos.augmentoslib.events.DiarizationOutputEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.SmartGlassesConnectionStateChangedEvent;
import com.augmentos.augmentoslib.events.SmartRingButtonOutputEvent;
import com.augmentos.augmentoslib.events.SpeechRecOutputEvent;

import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.Subscribe;

import java.util.ArrayList;

import com.augmentos.augmentos_core.smarterglassesmanager.smartglassesconnection.SmartGlassesAndroidService;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.SmartGlassesFontSize;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.ASR_FRAMEWORKS;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesDevice;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.SmartGlassesConnectionState;

public class AugmentosSmartGlassesService extends SmartGlassesAndroidService {
    public final String TAG = "AugmentOS_AugmentOSService";

    private final IBinder binder = new LocalBinder();

    String authToken = "";

    ArrayList<String> responsesBuffer;
    ArrayList<String> responsesToShare;
    private final Handler csePollLoopHandler = new Handler(Looper.getMainLooper());
    private Runnable cseRunnableCode;
    private final Handler displayPollLoopHandler = new Handler(Looper.getMainLooper());

    private long currTime = 0;
    private long lastPressed = 0;
    private long lastTapped = 0;

    // Double clicking constants
    private final long doublePressTimeConst = 420;
    private final long doubleTapTimeConst = 600;
    public WindowManagerWithTimeouts windowManager;
    public AugmentosSmartGlassesService() {
        super(AugmentosCoreUi.class,
                "augmentos_app",
                3589,
                "AugmentOS SGM",
                "AugmentOS SmartGlassesManager", R.drawable.ic_launcher_foreground);
    }

    @Override
    public void onCreate() {
        //setup keys/settings before super
        saveChosenAsrFramework(this, ASR_FRAMEWORKS.AUGMENTOS_ASR_FRAMEWORK);

        super.onCreate();

        //setup event bus subscribers
        this.setupEventBusSubscribers();

        windowManager = new WindowManagerWithTimeouts(
                19, // globalTimeoutSeconds
                () -> {
                    sendHomeScreen();
                } // what to do when globally timed out
        );
    }

    @Override
    protected void onGlassesConnectionStateChanged(SmartGlassesDevice device, SmartGlassesConnectionState connectionState) {
        Log.d(TAG, "Glasses connected successfully: " + device.deviceModelName);
        setFontSize(SmartGlassesFontSize.MEDIUM);
        EventBus.getDefault().post(new SmartGlassesConnectionStateChangedEvent(device, connectionState));
    }

    @Override
    public void onDestroy(){
        EventBus.getDefault().post(new AugmentosSmartGlassesDisconnectedEvent());
        EventBus.getDefault().unregister(this);

        //if (windowManager != null) windowManager.stopQueue();
        if (windowManager != null) windowManager.shutdown();

        super.onDestroy();
    }

    @Subscribe
    public void onSmartRingButtonEvent(SmartRingButtonOutputEvent event) {
        int buttonId = event.buttonId;
        long time = event.timestamp;
        boolean isDown = event.isDown;

        if(!isDown || buttonId != 1) return;
        Log.d(TAG,"DETECTED BUTTON PRESS W BUTTON ID: " + buttonId);
        currTime = System.currentTimeMillis();

        //Detect double presses
        if(isDown && currTime - lastPressed < doublePressTimeConst) {
            Log.d(TAG, "Double tap - CurrTime-lastPressed: "+ (currTime-lastPressed));
        }

        if(isDown) {
            lastPressed = System.currentTimeMillis();
        }
    }

    @Subscribe
    public void onDiarizeData(DiarizationOutputEvent event) {
    }

    @Subscribe
    public void onTranscript(SpeechRecOutputEvent event) {

    }

    public WindowManagerWithTimeouts getWindowManager() {
        return windowManager;
    }

    public void clearScreen() {
     sendHomeScreen();
    }
}
