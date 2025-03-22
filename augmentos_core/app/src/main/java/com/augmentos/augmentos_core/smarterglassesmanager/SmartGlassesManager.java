package com.augmentos.augmentos_core.smarterglassesmanager;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.lifecycle.LifecycleOwner;

import com.augmentos.augmentos_core.R;
import com.augmentos.augmentos_core.WindowManagerWithTimeouts;
import com.augmentos.augmentos_core.events.AugmentosSmartGlassesDisconnectedEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.SmartGlassesConnectionEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.SmartGlassesConnectionStateChangedEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.TextToSpeechEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.SmartGlassesFontSize;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassesconnection.SmartGlassesRepresentative;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.ASR_FRAMEWORKS;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.SpeechRecSwitchSystem;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.AudioWearable;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.EvenRealitiesG1;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.InmoAirOne;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.MentraMach1;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesDevice;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesOperatingSystem;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.TCLRayNeoXTwo;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.VuzixShield;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.VuzixUltralite;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.special.VirtualWearable;
import com.augmentos.augmentos_core.smarterglassesmanager.texttospeech.TextToSpeechSystem;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.SmartGlassesConnectionState;
import com.augmentos.augmentoslib.events.DiarizationOutputEvent;
import com.augmentos.augmentoslib.events.SmartRingButtonOutputEvent;
import com.augmentos.augmentoslib.events.SpeechRecOutputEvent;
import com.augmentos.augmentoslib.events.BulletPointListViewRequestEvent;
import com.augmentos.augmentoslib.events.CenteredTextViewRequestEvent;
import com.augmentos.augmentoslib.events.DoubleTextWallViewRequestEvent;
import com.augmentos.augmentoslib.events.FinalScrollingTextRequestEvent;
import com.augmentos.augmentoslib.events.HomeScreenEvent;
import com.augmentos.augmentoslib.events.ReferenceCardImageViewRequestEvent;
import com.augmentos.augmentoslib.events.ReferenceCardSimpleViewRequestEvent;
import com.augmentos.augmentoslib.events.RowsCardViewRequestEvent;
import com.augmentos.augmentoslib.events.SendBitmapViewRequestEvent;
import com.augmentos.augmentoslib.events.TextLineViewRequestEvent;
import com.augmentos.augmentoslib.events.TextWallViewRequestEvent;
import com.augmentos.augmentoslib.events.ScrollingTextViewStartRequestEvent;
import com.augmentos.augmentoslib.events.ScrollingTextViewStopRequestEvent;

import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.EventBusException;
import org.greenrobot.eventbus.Subscribe;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;

import androidx.preference.PreferenceManager;

import android.content.SharedPreferences;
import android.graphics.Bitmap;

import io.reactivex.rxjava3.subjects.PublishSubject;

/**
 * Manages smart glasses functionality without being a service
 * Converted from SmartGlassesAndroidService to work within AugmentosService
 */
public class SmartGlassesManager {
    private static final String TAG = "SGM_Manager"; // Equivalent to AugmentosSmartGlassesService "AugmentOS_AugmentOSService"

    // Context and lifecycle owner references
    private final Context context;
    private final LifecycleOwner lifecycleOwner;

    // Components from original service
    private TextToSpeechSystem textToSpeechSystem;
    private SpeechRecSwitchSystem speechRecSwitchSystem;
    private PublishSubject<JSONObject> dataObservable;
    private SmartGlassesRepresentative smartGlassesRepresentative;
    
    // UI management
    public WindowManagerWithTimeouts windowManager;

    // Connection handling
    private Handler connectHandler;
    private String translationLanguage;
    private Handler micDebounceHandler = new Handler(Looper.getMainLooper());
    private Runnable micTurnOffRunnable;
    private boolean pendingMicTurnOff = false;
    
    // Smart Ring and tap timing variables (from AugmentosSmartGlassesService)
    private long currTime = 0;
    private long lastPressed = 0;
    private final long lastTapped = 0;
    private final long doublePressTimeConst = 420;
    private final long doubleTapTimeConst = 600;
    
    // Event handler to notify outer service of state changes
    public interface SmartGlassesEventHandler {
        void onGlassesConnectionStateChanged(SmartGlassesDevice device, SmartGlassesConnectionState state);
    }
    
    private SmartGlassesEventHandler eventHandler;

    public SmartGlassesManager(Context context, LifecycleOwner lifecycleOwner, SmartGlassesEventHandler eventHandler) {
        this.context = context;
        this.lifecycleOwner = lifecycleOwner;
        this.eventHandler = eventHandler;
        initialize();
    }

    /**
     * Initialize all components - replaces onCreate from service
     */
    public void initialize() {
        // Setup connection handler
        connectHandler = new Handler(Looper.getMainLooper());

        // Apply settings before starting components (from AugmentosSmartGlassesService)
        saveChosenAsrFramework(context, ASR_FRAMEWORKS.AUGMENTOS_ASR_FRAMEWORK);

        // Start speech recognition
        speechRecSwitchSystem = new SpeechRecSwitchSystem(context);
        ASR_FRAMEWORKS asrFramework = getChosenAsrFramework(context);
        speechRecSwitchSystem.startAsrFramework(asrFramework);

        // Setup data observable
        dataObservable = PublishSubject.create();

        // Start text to speech
        textToSpeechSystem = new TextToSpeechSystem(context);
        textToSpeechSystem.setup();
        
        // Create window manager for UI
        windowManager = new WindowManagerWithTimeouts(
                19, // globalTimeoutSeconds
                this::sendHomeScreen // what to do when globally timed out
        );
        
        // Register for EventBus events
        try {
            EventBus.getDefault().register(this);
        } catch(EventBusException e) {
            e.printStackTrace();
        }
    }

    /**
     * Cleanup all resources - replaces onDestroy from service
     */
    public void cleanup() {
        EventBus.getDefault().unregister(this);

        // Kill speech rec
        if (speechRecSwitchSystem != null) {
            speechRecSwitchSystem.destroy();
        }

        // Kill smart glasses connection
        if (smartGlassesRepresentative != null) {
            smartGlassesRepresentative.destroy();
            smartGlassesRepresentative = null;
        }

        // Kill data transmitters
        if (dataObservable != null) {
            dataObservable.onComplete();
        }

        // Kill textToSpeech
        if (textToSpeechSystem != null) {
            textToSpeechSystem.destroy();
        }

        // Kill connection retry handler
        connectHandler.removeCallbacksAndMessages(null);
        
        // Clear window manager
        if (windowManager != null) {
            windowManager.shutdown();
        }
    }

    /**
     * Reset state without destroying - for disconnectWearable implementation
     */
    public void resetState() {
        // Kill smart glasses connection but keep manager alive
        if (smartGlassesRepresentative != null) {
            smartGlassesRepresentative.destroy();
            smartGlassesRepresentative = null;
        }
        
        // Notify about state change
        if (eventHandler != null) {
            eventHandler.onGlassesConnectionStateChanged(null, SmartGlassesConnectionState.DISCONNECTED);
        }
        
        // Post disconnected events (from AugmentosSmartGlassesService)
        EventBus.getDefault().post(new AugmentosSmartGlassesDisconnectedEvent());
        EventBus.getDefault().post(new SmartGlassesConnectionStateChangedEvent(null, SmartGlassesConnectionState.DISCONNECTED));
    }

    @Subscribe
    public void handleConnectionEvent(SmartGlassesConnectionEvent event) {
        sendUiUpdate();
    }

    public void connectToSmartGlasses(SmartGlassesDevice device) {
        // If we already have a representative for the same device, reuse it
        if (smartGlassesRepresentative == null || !smartGlassesRepresentative.smartGlassesDevice.deviceModelName.equals(device.deviceModelName)) {
            smartGlassesRepresentative = new SmartGlassesRepresentative(
                    context,
                    device,
                    lifecycleOwner,
                    dataObservable
            );
        }

        // Use connectHandler to do the connecting
        connectHandler.post(new Runnable() {
            @Override
            public void run() {
                Log.d(TAG, "CONNECTING TO SMART GLASSES");
                smartGlassesRepresentative.connectToSmartGlasses();
            }
        });
    }

    public void findCompatibleDeviceNames(SmartGlassesDevice device) {
        // Same check as above: do not re-create the representative if it's the same device
        if (smartGlassesRepresentative == null || !smartGlassesRepresentative.smartGlassesDevice.deviceModelName.equals(device.deviceModelName)) {
            smartGlassesRepresentative = new SmartGlassesRepresentative(
                    context,
                    device,
                    lifecycleOwner,
                    dataObservable
            );
        }

        // Just call findCompatibleDeviceNames on the same instance
        connectHandler.post(new Runnable() {
            @Override
            public void run() {
                Log.d(TAG, "FINDING COMPATIBLE SMART GLASSES DEVICE NAMES");
                smartGlassesRepresentative.findCompatibleDeviceNames();
            }
        });
    }

    public void sendUiUpdate() {
        SmartGlassesConnectionState connectionState;
        if (smartGlassesRepresentative != null) {
            connectionState = smartGlassesRepresentative.getConnectionState();
            
            // Update event handler
            if (eventHandler != null) {
                eventHandler.onGlassesConnectionStateChanged(
                        smartGlassesRepresentative.smartGlassesDevice,
                        connectionState
                );
            }
            
            // Save preferred wearable if connected
            if (connectionState == SmartGlassesConnectionState.CONNECTED) {
                savePreferredWearable(context, smartGlassesRepresentative.smartGlassesDevice.deviceModelName);
                
                // From AugmentosSmartGlassesService: Set font size when connected
                setFontSize(SmartGlassesFontSize.MEDIUM);
                
                // Post connection state event to EventBus
                EventBus.getDefault().post(new SmartGlassesConnectionStateChangedEvent(
                        smartGlassesRepresentative.smartGlassesDevice, connectionState));
            }
        } else {
            connectionState = SmartGlassesConnectionState.DISCONNECTED;
            
            // Notify with null device and disconnected state
            if (eventHandler != null) {
                eventHandler.onGlassesConnectionStateChanged(null, connectionState);
            }
        }
    }

    public static void savePreferredWearable(Context context, String wearableName) {
        PreferenceManager.getDefaultSharedPreferences(context)
                .edit()
                .putString(context.getResources().getString(R.string.PREFERRED_WEARABLE), wearableName)
                .apply();
    }

    public static String getPreferredWearable(Context context) {
        return PreferenceManager.getDefaultSharedPreferences(context)
                .getString(context.getResources().getString(R.string.PREFERRED_WEARABLE), "");
    }

    public static ASR_FRAMEWORKS getChosenAsrFramework(Context context) {
        String asrString = PreferenceManager.getDefaultSharedPreferences(context)
                .getString(context.getResources().getString(R.string.SHARED_PREF_ASR_KEY), "");
        if (asrString.equals("")) {
            saveChosenAsrFramework(context, ASR_FRAMEWORKS.AUGMENTOS_ASR_FRAMEWORK);
            asrString = ASR_FRAMEWORKS.AUGMENTOS_ASR_FRAMEWORK.name();
        }
        return ASR_FRAMEWORKS.valueOf(asrString);
    }

    public static void saveChosenAsrFramework(Context context, ASR_FRAMEWORKS asrFramework) {
        PreferenceManager.getDefaultSharedPreferences(context)
                .edit()
                .putString(context.getResources().getString(R.string.SHARED_PREF_ASR_KEY), asrFramework.name())
                .apply();
    }
    
    public static boolean getSensingEnabled(Context context) {
        SharedPreferences sharedPreferences = context.getSharedPreferences("AugmentOSPrefs", Context.MODE_PRIVATE);
        return sharedPreferences.getBoolean(context.getResources().getString(R.string.SENSING_ENABLED), true);
    }

    public static void saveSensingEnabled(Context context, boolean enabled) {
        SharedPreferences sharedPreferences = context.getSharedPreferences("AugmentOSPrefs", Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = sharedPreferences.edit();
        editor.putBoolean(context.getResources().getString(R.string.SENSING_ENABLED), enabled);
        editor.apply();
    }

    public static boolean getForceCoreOnboardMic(Context context) {
        return PreferenceManager.getDefaultSharedPreferences(context)
                .getBoolean(context.getResources().getString(R.string.FORCE_CORE_ONBOARD_MIC), false);
    }

    public static void saveForceCoreOnboardMic(Context context, boolean toForce) {
        PreferenceManager.getDefaultSharedPreferences(context)
                .edit()
                .putBoolean(context.getResources().getString(R.string.FORCE_CORE_ONBOARD_MIC), toForce)
                .apply();
    }

    public SmartGlassesConnectionState getSmartGlassesConnectState() {
        if (smartGlassesRepresentative != null) {
            return smartGlassesRepresentative.getConnectionState();
        } else {
            return SmartGlassesConnectionState.DISCONNECTED;
        }
    }

    public SmartGlassesDevice getConnectedSmartGlasses() {
        if (smartGlassesRepresentative == null) return null;
        if (smartGlassesRepresentative.getConnectionState() != SmartGlassesConnectionState.CONNECTED) return null;
        return smartGlassesRepresentative.smartGlassesDevice;
    }

    public SmartGlassesOperatingSystem getConnectedDeviceModelOs() {
        if (smartGlassesRepresentative == null) return null;
        if (smartGlassesRepresentative.getConnectionState() != SmartGlassesConnectionState.CONNECTED) return null;
        return smartGlassesRepresentative.smartGlassesDevice.glassesOs;
    }

    public void updateGlassesBrightness(int brightness) {
        if (smartGlassesRepresentative != null) {
            smartGlassesRepresentative.updateGlassesBrightness(brightness);
        }
    }

    public void updateGlassesHeadUpAngle(int headUpAngle) {
        if (smartGlassesRepresentative != null) {
            smartGlassesRepresentative.updateGlassesHeadUpAngle(headUpAngle);
        }
    }

    public static void sendReferenceCard(String title, String body) {
        EventBus.getDefault().post(new ReferenceCardSimpleViewRequestEvent(title, body));
    }
    
    public static void sendTextWall(String text) {
        EventBus.getDefault().post(new TextWallViewRequestEvent(text));
    }

    public static void sendDoubleTextWall(String textTop, String textBottom) {
        EventBus.getDefault().post(new DoubleTextWallViewRequestEvent(textTop, textBottom));
    }

    public static void sendRowsCard(String[] rowStrings) {
        EventBus.getDefault().post(new RowsCardViewRequestEvent(rowStrings));
    }

    public void sendBulletPointList(String title, String[] bullets) {
        EventBus.getDefault().post(new BulletPointListViewRequestEvent(title, bullets));
    }

    public void sendReferenceCard(String title, String body, String imgUrl) {
        EventBus.getDefault().post(new ReferenceCardImageViewRequestEvent(title, body, imgUrl));
    }

    public void sendBitmap(Bitmap bitmap) {
        EventBus.getDefault().post(new SendBitmapViewRequestEvent(bitmap));
    }

    public void startScrollingText(String title) {
        EventBus.getDefault().post(new ScrollingTextViewStartRequestEvent(title));
    }

    public void pushScrollingText(String text) {
        EventBus.getDefault().post(new FinalScrollingTextRequestEvent(text));
    }

    public void stopScrollingText() {
        EventBus.getDefault().post(new ScrollingTextViewStopRequestEvent());
    }

    public void sendTextLine(String text) {
        EventBus.getDefault().post(new TextLineViewRequestEvent(text));
    }

    public void sendTextToSpeech(String text, String languageString) {
        EventBus.getDefault().post(new TextToSpeechEvent(text, languageString));
    }

    public void sendCenteredText(String text) {
        EventBus.getDefault().post(new CenteredTextViewRequestEvent(text));
    }

    public void sendHomeScreen() {
        EventBus.getDefault().post(new HomeScreenEvent());
    }

    public void setFontSize(SmartGlassesFontSize fontSize) {
        EventBus.getDefault().post(new com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.SetFontSizeEvent(fontSize));
    }

    public void changeMicrophoneState(boolean isMicrophoneEnabled) {
        Log.d(TAG, "Want to changing microphone state to " + isMicrophoneEnabled);
        Log.d(TAG, "Force core onboard mic: " + getForceCoreOnboardMic(this.context));

        if (smartGlassesRepresentative == null || smartGlassesRepresentative.smartGlassesDevice == null) {
            Log.d(TAG, "Cannot change microphone state: smartGlassesRepresentative or smartGlassesDevice is null");
            return;
        }

        // If we're trying to turn ON the microphone
        if (isMicrophoneEnabled) {
            // Cancel any pending turn-off operations
            if (pendingMicTurnOff) {
                Log.d(TAG, "Cancelling pending microphone turn-off");
                micDebounceHandler.removeCallbacks(micTurnOffRunnable);
                pendingMicTurnOff = false;
            }

            // Immediately turn on the microphone
            applyMicrophoneState(true);
        }
        // If we're trying to turn OFF the microphone
        else {
            // If there's already a pending turn-off, do nothing (debounce is already in progress)
            if (!pendingMicTurnOff) {
                Log.d(TAG, "Scheduling microphone turn-off with debounce");
                pendingMicTurnOff = true;

                // Define the runnable that will turn off the mic after the delay
                micTurnOffRunnable = new Runnable() {
                    @Override
                    public void run() {
                        Log.d(TAG, "Executing debounced microphone turn-off");
                        pendingMicTurnOff = false;
                        applyMicrophoneState(false);
                    }
                };

                // Schedule the delayed turn-off
                micDebounceHandler.postDelayed(micTurnOffRunnable, 10000); // 10 seconds
            }
        }
    }

    public void applyMicrophoneState(boolean isMicrophoneEnabled) {
        Log.d(TAG, "Want to change microphone state to " + isMicrophoneEnabled);
        Log.d(TAG, "Force core onboard mic: " + getForceCoreOnboardMic(this.context));

        // Prevent NullPointerException
        if (smartGlassesRepresentative == null || smartGlassesRepresentative.smartGlassesDevice == null) {
            Log.e(TAG, "SmartGlassesRepresentative or its device is null, cannot apply microphone state");
            return;
        }

        if (smartGlassesRepresentative.smartGlassesDevice.getHasInMic() && !getForceCoreOnboardMic(this.context)) {
            // If we should be using the glasses microphone
            smartGlassesRepresentative.smartGlassesCommunicator.changeSmartGlassesMicrophoneState(isMicrophoneEnabled);
        } else {
            if (smartGlassesRepresentative.smartGlassesDevice.getHasInMic()) {
                smartGlassesRepresentative.smartGlassesCommunicator.changeSmartGlassesMicrophoneState(false);
            }

            // If we should be using the phone's mic
            Log.d(TAG, "111 Changing microphone state to " + isMicrophoneEnabled);
            smartGlassesRepresentative.changeBluetoothMicState(isMicrophoneEnabled);
        }

        // Tell speech rec system that we stopped
        speechRecSwitchSystem.microphoneStateChanged(isMicrophoneEnabled);
    }

    // Implement methods from AugmentosSmartGlassesService
    
    @Subscribe
    public void onSmartRingButtonEvent(SmartRingButtonOutputEvent event) {
        int buttonId = event.buttonId;
        long time = event.timestamp;
        boolean isDown = event.isDown;

        if(!isDown || buttonId != 1) return;
        Log.d(TAG, "DETECTED BUTTON PRESS W BUTTON ID: " + buttonId);
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
        // Empty in original
    }

    @Subscribe
    public void onTranscript(SpeechRecOutputEvent event) {
        // Empty in original
    }
    
    public void clearScreen() {
        sendHomeScreen();
    }
    
    public static SmartGlassesDevice getSmartGlassesDeviceFromModelName(String modelName) {
        ArrayList<SmartGlassesDevice> allDevices = new ArrayList<>(
                Arrays.asList(
                        new VuzixUltralite(),
                        new MentraMach1(),
                        new EvenRealitiesG1(),
                        new VuzixShield(),
                        new InmoAirOne(),
                        new TCLRayNeoXTwo(),
                        new AudioWearable(),
                        new VirtualWearable()
                )
        );

        for (SmartGlassesDevice device : allDevices) {
            if (device.deviceModelName.equals(modelName)) {
                return device;
            }
        }

        return null;
    }
}