package com.augmentos.augmentos_core.smarterglassesmanager.smartglassesconnection;

import android.content.Context;

import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.Subscribe;
import org.json.JSONObject;

import android.os.Handler;
import android.util.Log;

//custom, our code
import androidx.lifecycle.LifecycleOwner;

import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.AudioChunkNewEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.DisableBleScoAudioEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.VirtualSGC;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.special.SelfSGC;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.LC3AudioChunkNewEvent;
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
import com.augmentos.augmentoslib.events.CenteredTextViewRequestEvent;
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
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassesconnection.SmartGlassesAndroidService;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesDevice;
import com.augmentos.augmentoslib.events.TextLineViewRequestEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.SmartGlassesConnectionState;
import com.augmentos.smartglassesmanager.cpp.L3cCpp;

//rxjava
import java.nio.ByteBuffer;

import io.reactivex.rxjava3.subjects.PublishSubject;

class SmartGlassesRepresentative {
    private static final String TAG = "WearableAi_ASGRepresentative";

    //receive/send data stream
    PublishSubject<JSONObject> dataObservable;

    Context context;

    public SmartGlassesDevice smartGlassesDevice;
    SmartGlassesCommunicator smartGlassesCommunicator;
    MicrophoneLocalAndBluetooth bluetoothAudio;

    //timing settings
    long referenceCardDelayTime = 10000;

    LifecycleOwner lifecycleOwner;

    //handler to handle delayed UI events
    Handler uiHandler;
    Handler micHandler;

    SmartGlassesRepresentative(Context context, SmartGlassesDevice smartGlassesDevice, LifecycleOwner lifecycleOwner, PublishSubject<JSONObject> dataObservable){
        this.context = context;
        this.smartGlassesDevice = smartGlassesDevice;
        this.lifecycleOwner = lifecycleOwner;

        //receive/send data
        this.dataObservable = dataObservable;

        uiHandler = new Handler();
        micHandler = new Handler();

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

        if (SmartGlassesAndroidService.getSensingEnabled(context)) {
            // If the glasses don't support a microphone, handle local microphone
            if (!smartGlassesDevice.getHasInMic() || SmartGlassesAndroidService.getForceCoreOnboardMic(context)) {
                connectAndStreamLocalMicrophone(true);
            }
        }
    }

    /**
     * Helper to create the appropriate communicator once.
     */
    private SmartGlassesCommunicator createCommunicator() {
        switch (smartGlassesDevice.getGlassesOs()) {
            case ANDROID_OS_GLASSES:
                return new AndroidSGC(context, smartGlassesDevice, dataObservable);
            case AUDIO_WEARABLE_GLASSES:
                return new AudioWearableSGC(context, smartGlassesDevice);
            case VIRTUAL_WEARABLE:
                return new VirtualSGC(context, smartGlassesDevice);
            case ULTRALITE_MCU_OS_GLASSES:
                return new UltraliteSGC(context, smartGlassesDevice, lifecycleOwner);
            case EVEN_REALITIES_G1_MCU_OS_GLASSES:
                return new EvenRealitiesG1SGC(context, smartGlassesDevice);
            case SELF_OS_GLASSES:
                return new SelfSGC(context, smartGlassesDevice);
            default:
                return null;  // or throw an exception
        }
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

    private void connectAndStreamLocalMicrophone(boolean useBluetoothSco) {
        //follow this order for speed
        //start audio from bluetooth headset
        uiHandler.post(new Runnable() {
            @Override
            public void run() {
                bluetoothAudio = new MicrophoneLocalAndBluetooth(context, useBluetoothSco, new AudioChunkCallback(){
                    @Override
                    public void onSuccess(ByteBuffer chunk){
                        receiveChunk(chunk);
                    }
                });
            }
        });
    }

    //data from the local microphone, convert to LC3, send
    private void receiveChunk(ByteBuffer chunk){
        byte[] audio_bytes = chunk.array();

        //encode as LC3
        byte[] lc3Data = L3cCpp.encodeLC3(chunk.array());
        // Log.d(TAG, "LC3 Data encoded: " + lc3Data.toString());

        //throw off new audio chunk event
        EventBus.getDefault().post(new AudioChunkNewEvent(audio_bytes));
        EventBus.getDefault().post(new LC3AudioChunkNewEvent(lc3Data));
    }

    public void destroy(){
        Log.d(TAG, "SG rep destroying");

        EventBus.getDefault().unregister(this);

        if (bluetoothAudio != null) {
            bluetoothAudio.destroy();
        }

        if (smartGlassesCommunicator != null){
            smartGlassesCommunicator.destroy();
            smartGlassesCommunicator = null;
        }

        if (uiHandler != null) {
            uiHandler.removeCallbacksAndMessages(null);
        }

        Log.d(TAG, "SG rep destroy complete");
    }

    //are our smart glasses currently connected?
    public SmartGlassesConnectionState getConnectionState(){
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
        uiHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                homeScreen();
            }
        }, delayTime);
    }

    public void homeScreen(){
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.showHomeScreen();
        }
    }

    @Subscribe
    public void onHomeScreenEvent(HomeScreenEvent receivedEvent){
        homeScreen();
    }

    @Subscribe
    public void onTextWallViewEvent(TextWallViewRequestEvent receivedEvent){
        if (smartGlassesCommunicator != null) {
            // Log.d(TAG, "SINGLE TEXT WALL BOOM");
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
//            homeUiAfterDelay(referenceCardDelayTime);
        }
    }


    @Subscribe
    public void onRowsCardViewEvent(RowsCardViewRequestEvent receivedEvent){
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.displayRowsCard(receivedEvent.rowStrings);
//            homeUiAfterDelay(referenceCardDelayTime);
        }
    }

    @Subscribe
    public void onBulletPointListViewEvent(BulletPointListViewRequestEvent receivedEvent){
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.displayBulletList(receivedEvent.title, receivedEvent.bullets);
//            homeUiAfterDelay(referenceCardDelayTime);
        }
    }

    @Subscribe
    public void onReferenceCardImageViewEvent(ReferenceCardImageViewRequestEvent receivedEvent){
        Log.d(TAG, "sending reference card image view event");
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.displayReferenceCardImage(receivedEvent.title, receivedEvent.body, receivedEvent.imgUrl);
//            homeUiAfterDelay(referenceCardDelayTime);
        }
    }

    @Subscribe
    public void onSendBitmapViewRequestEvent(SendBitmapViewRequestEvent receievedEvent){
        Log.d(TAG, "Sending a bitmap event");
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.displayBitmap(receievedEvent.bmp);
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
    public void onTextLineViewRequestEvent(TextLineViewRequestEvent receivedEvent){
        Log.d(TAG, "Got text line event: " + receivedEvent.text);
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.displayTextLine(receivedEvent.text);
        }
    }

    @Subscribe
    public void onStartScrollingTextViewEvent(ScrollingTextViewStartRequestEvent receivedEvent){
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.startScrollingTextViewMode(receivedEvent.title);
        }
    }

    @Subscribe
    public void onStopScrollingTextViewEvent(ScrollingTextViewStopRequestEvent receivedEvent){
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.stopScrollingTextViewMode();
        }
    }

    @Subscribe
    public void onFinalScrollingTextEvent(FinalScrollingTextRequestEvent receivedEvent) {
        Log.d(TAG, "onFinalScrollingTextEvent");
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.scrollingTextViewFinalText(receivedEvent.text);
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

    @Subscribe
    public void onSetFontSizeEvent(SetFontSizeEvent receivedEvent) {
        if (smartGlassesCommunicator != null) {
            smartGlassesCommunicator.setFontSize(receivedEvent.fontSize);
        }
    }

    public void changeMicrophoneState(boolean isMicrophoneEnabled) {}
}
