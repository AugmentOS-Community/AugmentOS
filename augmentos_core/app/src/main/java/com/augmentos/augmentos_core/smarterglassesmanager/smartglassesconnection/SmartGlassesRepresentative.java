package com.augmentos.augmentos_core.smarterglassesmanager.smartglassesconnection;

import android.content.Context;

import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.Subscribe;
import org.json.JSONObject;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

//custom, our code
import androidx.lifecycle.LifecycleOwner;

import com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.DisableBleScoAudioEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.VirtualSGC;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.special.SelfSGC;
import com.augmentos.augmentos_core.smarterglassesmanager.hci.AudioProcessingCallback;
import com.augmentos.augmentoslib.events.DisplayCustomContentRequestEvent;
import com.augmentos.augmentoslib.events.DoubleTextWallViewRequestEvent;
import com.augmentos.augmentoslib.events.HomeScreenEvent;
import com.augmentos.augmentoslib.events.SendBitmapViewRequestEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.SetFontSizeEvent;
import com.augmentos.augmentoslib.events.TextWallViewRequestEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.AudioWearableSGC;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.EvenRealitiesG1SGC;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.UltraliteSGC;
import com.augmentos.augmentoslib.events.BulletPointListViewRequestEvent;
import com.augmentos.augmentoslib.events.FinalScrollingTextRequestEvent;
import com.augmentos.augmentoslib.events.IntermediateScrollingTextRequestEvent;
import com.augmentos.augmentoslib.events.ReferenceCardImageViewRequestEvent;
import com.augmentos.augmentoslib.events.ReferenceCardSimpleViewRequestEvent;
import com.augmentos.augmentoslib.events.RowsCardViewRequestEvent;
import com.augmentos.augmentoslib.events.PromptViewRequestEvent;
import com.augmentos.augmentoslib.events.ScrollingTextViewStartRequestEvent;
import com.augmentos.augmentoslib.events.ScrollingTextViewStopRequestEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.hci.AudioChunkCallback;
import com.augmentos.augmentos_core.smarterglassesmanager.hci.MicrophoneLocalAndBluetooth;
//import com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.ActiveLookSGC;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.AndroidSGC;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.SmartGlassesCommunicator;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesDevice;
import com.augmentos.augmentoslib.events.TextLineViewRequestEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.SmartGlassesConnectionState;
import com.augmentos.smartglassesmanager.cpp.L3cCpp;

//rxjava
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.Arrays;

import io.reactivex.rxjava3.subjects.PublishSubject;

public class SmartGlassesRepresentative {
    private static final String TAG = "WearableAi_ASGRepresentative";

    //receive/send data stream
    PublishSubject<JSONObject> dataObservable;

    Context context;

    public SmartGlassesDevice smartGlassesDevice;
    public SmartGlassesCommunicator smartGlassesCommunicator;
    MicrophoneLocalAndBluetooth bluetoothAudio;

    //timing settings
    long referenceCardDelayTime = 10000;

    LifecycleOwner lifecycleOwner;

    //consolidated handler for UI events
    private Handler handler;
    
    // Direct callback for audio processing (replaces EventBus)
    private AudioProcessingCallback audioProcessingCallback;

    public SmartGlassesRepresentative(Context context, SmartGlassesDevice smartGlassesDevice, LifecycleOwner lifecycleOwner, PublishSubject<JSONObject> dataObservable, AudioProcessingCallback audioProcessingCallback){
        this.context = context;
        this.smartGlassesDevice = smartGlassesDevice;
        this.lifecycleOwner = lifecycleOwner;

        //receive/send data
        this.dataObservable = dataObservable;
        
        // Store the audio processing callback
        this.audioProcessingCallback = audioProcessingCallback;

        // Handler is initialized on demand via getHandler()

        //setup lc3 encoder
        lc3EncoderPointer = L3cCpp.initEncoder();
        if (lc3EncoderPointer == 0) {
            Log.e(TAG, "Failed to initialize LC3 encoder");
        }

        //register event bus subscribers
        EventBus.getDefault().register(this);
    }

    public void findCompatibleDeviceNames(){
        // If we have not created a communicator yet (or the device changed), create it once
        //if (smartGlassesCommunicator == null || !isSameDevice(smartGlassesDevice, smartGlassesCommunicator)) {
        if (smartGlassesCommunicator == null) {
            smartGlassesCommunicator = createCommunicator();
        }

        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.findCompatibleDeviceNames();
        } else {
            Log.d(TAG, "SmartGlassesCommunicator is NULL, something truly awful must have transpired");
        }
    }

    public void connectToSmartGlasses(){
        // Same approach: if the communicator is null, create it
        //if (smartGlassesCommunicator == null || !isSameDevice(smartGlassesDevice, smartGlassesCommunicator)) {
        if (smartGlassesCommunicator == null) {
            smartGlassesCommunicator = createCommunicator();
        }

        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.connectToSmartGlasses();
        } else {
            Log.d(TAG, "SmartGlassesCommunicator is NULL, something truly awful must have transpired");
        }

        if (SmartGlassesManager.getSensingEnabled(context)) {
            // If the glasses don't support a microphone, handle local microphone
            if (!smartGlassesDevice.getHasInMic() || SmartGlassesManager.getForceCoreOnboardMic(context)) {
                
                connectAndStreamLocalMicrophone(true);
            }
        }
    }

    /**
     * Helper to create the appropriate communicator once.
     */
    private SmartGlassesCommunicator createCommunicator() {
        SmartGlassesCommunicator communicator;
        
        switch (smartGlassesDevice.getGlassesOs()) {
            case ANDROID_OS_GLASSES:
                communicator = new AndroidSGC(context, smartGlassesDevice, dataObservable);
                break;
                
            case AUDIO_WEARABLE_GLASSES:
                communicator = new AudioWearableSGC(context, smartGlassesDevice);
                break;
                
            case VIRTUAL_WEARABLE:
                communicator = new VirtualSGC(context, smartGlassesDevice);
                break;
                
            case ULTRALITE_MCU_OS_GLASSES:
                communicator = new UltraliteSGC(context, smartGlassesDevice, lifecycleOwner);
                break;
                
            case EVEN_REALITIES_G1_MCU_OS_GLASSES:
                communicator = new EvenRealitiesG1SGC(context, smartGlassesDevice);
                break;
                
            case SELF_OS_GLASSES:
                communicator = new SelfSGC(context, smartGlassesDevice);
                break;
                
            default:
                return null;  // or throw an exception
        }
        
        // BATTERY OPTIMIZATION: Register audio processing callback with the base communicator
        if (communicator != null && audioProcessingCallback != null) {
            // Standard registration for all communicators via base class
            communicator.registerAudioProcessingCallback(audioProcessingCallback);
            Log.d(TAG, "BATTERY OPTIMIZATION: Registered audio processing callback for " + 
                  smartGlassesDevice.getGlassesOs().name());
                
            // Special case for AndroidSGC which has additional AudioSystem registration
            if (communicator instanceof AndroidSGC) {
                ((AndroidSGC) communicator).registerSpeechRecSystem(audioProcessingCallback);
                Log.d(TAG, "BATTERY OPTIMIZATION: Registered additional AudioSystem callback for AndroidSGC");
            }
        }
        
        return communicator;
    }

    /**
     * Optional helper to check if the communicator is for the same device.
     * Some communicator classes might have a method or field to check device identity.
     */
    //private boolean isSameDevice(SmartGlassesDevice device, SmartGlassesCommunicator comm) {
    //    return comm != null && comm. != null
    //            && comm.getDevice().equals(device);
    //}

    public void updateGlassesBrightness(int brightness) {
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.updateGlassesBrightness(brightness);
        }
    }

    public void updateGlassesAutoBrightness(boolean autoBrightness) {
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.updateGlassesAutoBrightness(autoBrightness);
        }
    }

    public void updateGlassesHeadUpAngle(int headUpAngle) {
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.updateGlassesHeadUpAngle(headUpAngle);
        }
    }

    @Subscribe
    public void onDisableBleScoEvent(DisableBleScoAudioEvent receivedEvent) {
        Log.d(TAG, "onDisableBleScoEvent called");
        restartAudioWithNoBleSco();
    }

    public void restartAudioWithNoBleSco(){
        //kill current audio
        if (bluetoothAudio != null) {
            bluetoothAudio.destroy();
        }

        //start new audio, with no bluetooth
        connectAndStreamLocalMicrophone(false);
    }

    public void changeBluetoothMicState(boolean enableBluetoothMic){
        // kill current audio
        if (bluetoothAudio != null) {
            bluetoothAudio.destroy();
        }

        if (enableBluetoothMic) {
            connectAndStreamLocalMicrophone(true);
        }
    }

    // Get handler with lazy initialization
    private Handler getHandler() {
        if (handler == null) {
            handler = new Handler(Looper.getMainLooper());
        }
        return handler;
    }
    
    private void connectAndStreamLocalMicrophone(boolean useBluetoothSco) {
        //follow this order for speed
        //start audio from bluetooth headset
        getHandler().post(() -> {
            bluetoothAudio = new MicrophoneLocalAndBluetooth(context, useBluetoothSco, 
                chunk -> receiveChunk(chunk));
        });
    }

    /**
     * BATTERY OPTIMIZATION: Direct method to control audio encoding bypass
     * (Implementation removed as requested)
     */
    public void setBypassAudioEncoding(boolean bypass) {
        // Method kept for API compatibility but bypass functionality removed
        Log.d(TAG, "Audio encoding bypass setting ignored - feature disabled");
    }
    
    //data from the local microphone, convert to LC3, send
    private long lc3EncoderPointer = 0;
    private final ByteArrayOutputStream remainderBuffer = new ByteArrayOutputStream();
    private int BYTES_PER_FRAME = 320;

    // data from the local microphone, convert to LC3, send
    private void receiveChunk(ByteBuffer chunk) {
        byte[] audio_bytes = chunk.array();

        // Append to remainder buffer
        remainderBuffer.write(audio_bytes, 0, audio_bytes.length);

        byte[] fullBuffer = remainderBuffer.toByteArray();
        int fullLength = fullBuffer.length;
        int frameCount = fullLength / BYTES_PER_FRAME; // BYTES_PER_FRAME = 320

        for (int i = 0; i < frameCount; i++) {
            int offset = i * BYTES_PER_FRAME;
            byte[] frameBytes = Arrays.copyOfRange(fullBuffer, offset, offset + BYTES_PER_FRAME);

            byte[] lc3Data = L3cCpp.encodeLC3(lc3EncoderPointer, frameBytes);

            if (audioProcessingCallback != null) {
                audioProcessingCallback.onLC3AudioDataAvailable(lc3Data);
            }
        }

        if (audioProcessingCallback != null) {
            audioProcessingCallback.onAudioDataAvailable(audio_bytes);
        }

        // Save remainder (partial frame) for next round
        int leftoverBytes = fullLength % BYTES_PER_FRAME;
        remainderBuffer.reset();
        if (leftoverBytes > 0) {
            remainderBuffer.write(fullBuffer, fullLength - leftoverBytes, leftoverBytes);
        }
    }

    public void destroy(){
        Log.d(TAG, "SG rep destroying");

        // BATTERY OPTIMIZATION: Safe EventBus unregistration
        try {
            if (EventBus.getDefault().isRegistered(this)) {
                EventBus.getDefault().unregister(this);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error unregistering from EventBus", e);
        }

        if (bluetoothAudio != null) {
            try {
                bluetoothAudio.destroy();
                bluetoothAudio = null; // BATTERY OPTIMIZATION: Prevent memory leaks
            } catch (Exception e) {
                Log.e(TAG, "Error destroying bluetoothAudio", e);
            }
        }

        if (smartGlassesCommunicator != null){
            smartGlassesCommunicator.destroy();
            smartGlassesCommunicator = null;
        }

        if (lc3EncoderPointer != 0) {
            L3cCpp.freeEncoder(lc3EncoderPointer);
            lc3EncoderPointer = 0;
        }

        if (handler != null) {
            handler.removeCallbacksAndMessages(null);
            handler = null;
        }
        
        // BATTERY OPTIMIZATION: Clear references to prevent memory leaks
        context = null;
        lifecycleOwner = null;
        audioProcessingCallback = null;
        dataObservable = null;
        
        // Clear the callback reference
        audioProcessingCallback = null;

        Log.d(TAG, "SG rep destroy complete");
    }

    //are our smart glasses currently connected?
    public SmartGlassesConnectionState getConnectionState() {
        if (smartGlassesCommunicator == null){
            return SmartGlassesConnectionState.DISCONNECTED;
        } else {
            return smartGlassesCommunicator.getConnectionState();
        }
    }

    public void showReferenceCard(String title, String body){
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.displayReferenceCardSimple(title, body);
        }
    }

    public void showRowsCard(String[] rowStrings){
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.displayRowsCard(rowStrings);
        }
    }

    public void startScrollingTextViewModeTest(){
        //pass for now
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.startScrollingTextViewMode("ScrollingTextView");
            smartGlassesCommunicator.scrollingTextViewFinalText("test line 1");
            smartGlassesCommunicator.scrollingTextViewFinalText("line 2 testy boi");
            smartGlassesCommunicator.scrollingTextViewFinalText("how's this?");
            smartGlassesCommunicator.scrollingTextViewFinalText("this is a line of text that is going to be long enough to wrap around, it would be good to see if it doesn so, that would be super cool");
            smartGlassesCommunicator.scrollingTextViewFinalText("test line n");
            smartGlassesCommunicator.scrollingTextViewFinalText("line n + 1 testy boi");
            smartGlassesCommunicator.scrollingTextViewFinalText("seconnndd how's this?");
        }
    }

    private void homeUiAfterDelay(long delayTime){
        getHandler().postDelayed(this::homeScreen, delayTime);
    }

    public void homeScreen() {
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.showHomeScreen();
        }
    }

    // Keep only the subscribe methods for static methods that still use EventBus or from other components
    
    @Subscribe
    public void onHomeScreenEvent(HomeScreenEvent receivedEvent) {
        homeScreen();
    }

    @Subscribe
    public void onTextWallViewEvent(TextWallViewRequestEvent receivedEvent){
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.displayTextWall(receivedEvent.text);
        }
    }

    @Subscribe
    public void onDoubleTextWallViewEvent(DoubleTextWallViewRequestEvent receivedEvent){
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.displayDoubleTextWall(receivedEvent.textTop, receivedEvent.textBottom);
        }
    }

    @Subscribe
    public void onReferenceCardSimpleViewEvent(ReferenceCardSimpleViewRequestEvent receivedEvent){
        Log.d(TAG, "SHOWING REFERENCE CARD");
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.displayReferenceCardSimple(receivedEvent.title, receivedEvent.body);
        }
    }

    @Subscribe
    public void onRowsCardViewEvent(RowsCardViewRequestEvent receivedEvent){
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.displayRowsCard(receivedEvent.rowStrings);
        }
    }
    
    @Subscribe
    public void onDisplayCustomContentRequestEvent(DisplayCustomContentRequestEvent receivedEvent){
        Log.d(TAG, "Got display custom content event: " + receivedEvent.json);
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.displayCustomContent(receivedEvent.json);
        }
    }
    
    @Subscribe
    public void onIntermediateScrollingTextEvent(IntermediateScrollingTextRequestEvent receivedEvent) {
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.scrollingTextViewIntermediateText(receivedEvent.text);
        }
    }

    @Subscribe
    public void onPromptViewRequestEvent(PromptViewRequestEvent receivedEvent) {
        Log.d(TAG, "onPromptViewRequestEvent called");
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.displayPromptView(receivedEvent.prompt, receivedEvent.options);
        }
    }

    public void changeMicrophoneState(boolean isMicrophoneEnabled) {}
}
