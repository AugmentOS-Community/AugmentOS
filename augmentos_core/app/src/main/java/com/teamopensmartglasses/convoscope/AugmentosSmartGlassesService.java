package com.teamopensmartglasses.convoscope;

import static com.teamopensmartglasses.smartglassesmanager.smartglassescommunicators.EvenRealitiesG1SGC.deleteEvenSharedPreferences;

import android.content.ComponentName;
import android.content.Intent;
import android.content.ServiceConnection;
import android.graphics.ImageFormat;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.MemoryFile;
import android.os.ParcelFileDescriptor;
import android.os.RemoteException;
import android.util.Log;

import com.teamopensmartglasses.convoscope.events.AugmentosSmartGlassesDisconnectedEvent;
import com.teamopensmartglasses.convoscope.ui.AugmentosUi;
import com.teamopensmartglasses.augmentoslib.events.DiarizationOutputEvent;
import com.teamopensmartglasses.augmentoslib.events.GlassesTapOutputEvent;
import com.teamopensmartglasses.augmentoslib.events.SmartRingButtonOutputEvent;
import com.teamopensmartglasses.augmentoslib.events.SpeechRecOutputEvent;

import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.Subscribe;

import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.ArrayList;

import com.teamopensmartglasses.smartglassesmanager.SmartGlassesAndroidService;
import com.teamopensmartglasses.smartglassesmanager.camera.CameraRecorder;
import com.teamopensmartglasses.smartglassesmanager.smartglassescommunicators.SmartGlassesFontSize;
import com.teamopensmartglasses.smartglassesmanager.speechrecognition.ASR_FRAMEWORKS;
import com.teamopensmartglasses.smartglassesmanager.supportedglasses.SmartGlassesDevice;

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
    public DisplayQueue displayQueue;

    //camera
    private CameraRecorder cameraRecorder;

    private IAugmentOSCoreService coreService;
    private ServiceConnection coreConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            coreService = IAugmentOSCoreService.Stub.asInterface(service);
            Log.d(TAG, "Bound to AugmentOSCoreService");

            if (!coreService.asBinder().pingBinder()) {
                Log.e(TAG, "Core service binder is DEAD!");
            } else {
                Log.d(TAG, "Core service binder is ALIVE!");
            }
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            coreService = null;
            Log.e(TAG, "Core service DISCONNECTED!");
        }
    };

    public AugmentosSmartGlassesService() {
        super(AugmentosUi.class,
                "augmentos_app",
                3589,
                "AugmentOS SGM",
                "AugmentOS SmartGlassesManager", R.drawable.ic_launcher_foreground);
    }

    @Override
    public void onCreate() {
        super.onCreate();

        //setup event bus subscribers
        this.setupEventBusSubscribers();

        displayQueue = new DisplayQueue();

        String asrApiKey = getResources().getString(R.string.google_api_key);
        saveApiKey(this, asrApiKey);

        saveChosenAsrFramework(this, ASR_FRAMEWORKS.AZURE_ASR_FRAMEWORK);

        //bind to core to access shared memory
        bindToCoreService();

        //start background camera
        cameraRecorder = new CameraRecorder(this, this);
        recordNSeconds(10);
    }

    @Override
    protected void onGlassesConnected(SmartGlassesDevice device) {
        Log.d(TAG, "Glasses connected successfully: " + device.deviceModelName);
        setFontSize(SmartGlassesFontSize.MEDIUM);
        displayQueue.startQueue();
    }

    @Override
    public void onDestroy(){
        EventBus.getDefault().post(new AugmentosSmartGlassesDisconnectedEvent());
        EventBus.getDefault().unregister(this);

        if (displayQueue != null) displayQueue.stopQueue();

        super.onDestroy();
    }

    @Subscribe
    public void onGlassesTapSideEvent(GlassesTapOutputEvent event) {
        int numTaps = event.numTaps;
        boolean sideOfGlasses = event.sideOfGlasses;
        long time = event.timestamp;

        Log.d(TAG, "GLASSES TAPPED X TIMES: " + numTaps + " SIDEOFGLASSES: " + sideOfGlasses);
        if (numTaps == 3) {
            Log.d(TAG, "GOT A TRIPLE TAP");
        }
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

    //shared memory/binding to core stuff
    private void bindToCoreService() {
        Log.d(TAG, "Binding to core service...");
        Intent intent = new Intent();
        intent.setClassName("com.teamopensmartglasses.convoscope", "com.teamopensmartglasses.convoscope.AugmentosService");
        bindService(intent, coreConnection, BIND_AUTO_CREATE);
        Log.d(TAG, "Bound to core service.");
    }

    private void sendFrameToCore(byte[] frameData, int width, int height) {
        if (coreService == null) {
            Log.e(TAG, "Core service is not bound!");
            return;
        }

        try {
            int bufferSize = frameData.length; // YUV420 estimated size should be correct
            MemoryFile memoryFile = new MemoryFile("frameBuffer", bufferSize);
            memoryFile.allowPurging(false); // Prevent unexpected memory release

            // Write frame data correctly
            OutputStream outputStream = memoryFile.getOutputStream();
            outputStream.write(frameData);
            outputStream.flush();
            outputStream.close();

            // Get file descriptor correctly
            ParcelFileDescriptor pfd = MemoryFileUtil.getParcelFileDescriptor(memoryFile);

            Log.d(TAG, "Sending frame to core: " + width + "x" + height);

            // Send to core service
            coreService.receiveSharedMemory(pfd, width, height, ImageFormat.YUV_420_888);

            Log.d(TAG, "Frame send complete");

            memoryFile.close(); // Clean up memory file after sending
        } catch (IOException | RemoteException e) {
            Log.e(TAG, "Error sending frame to core service", e);
        }
    }

    private ParcelFileDescriptor getParcelFileDescriptor(MemoryFile memoryFile) throws IOException {
        try {
            Method method = MemoryFile.class.getDeclaredMethod("getFileDescriptor");
            method.setAccessible(true);
            FileDescriptor fd = (FileDescriptor) method.invoke(memoryFile);
            return ParcelFileDescriptor.dup(fd);
        } catch (Exception e) {
            throw new IOException("Failed to get ParcelFileDescriptor from MemoryFile", e);
        }
    }

    private FileOutputStream getMemoryFileOutputStream(MemoryFile memoryFile) throws IOException {
        try {
            Method method = MemoryFile.class.getDeclaredMethod("getFileDescriptor");
            method.setAccessible(true);
            FileDescriptor fd = (FileDescriptor) method.invoke(memoryFile);
            return new FileOutputStream(fd);
        } catch (Exception e) {
            throw new IOException("Failed to get FileOutputStream from MemoryFile", e);
        }
    }
    //background camera stuff - designed for ASG running core locally
    private final Handler handler = new Handler(Looper.getMainLooper());

    private void recordNSeconds(int n) {
        Log.d(TAG, "Do record video in background for n seconds");

        startRecording();

        handler.postDelayed(() -> {
            stopRecording();
        }, n * 1000);
    }

    public void startRecording() {
        cameraRecorder.startRecording();
    }

    public void stopRecording() {
        cameraRecorder.stopRecording();
    }

    public void pauseRecording() {
        cameraRecorder.pauseRecording();
    }

    public void resumeRecording() {
        cameraRecorder.resumeRecording();
    }

    public void toggleTorch() {
        cameraRecorder.toggleTorch();
    }

    @Override
    public void onRecordingStarted(long startTime) {
        Log.d("AugmentosService", "Recording started at: " + startTime);
    }

    @Override
    public void onRecordingPaused() {
        Log.d("AugmentosService", "Recording paused.");
    }

    @Override
    public void onRecordingResumed() {
        Log.d("AugmentosService", "Recording resumed.");
    }

    @Override
    public void onRecordingStopped() {
        Log.d("AugmentosService", "Recording stopped.");
    }

    @Override
    public void onCameraError(String errorMessage) {
        Log.e("AugmentosService", "Camera error: " + errorMessage);
    }

    @Override
    public void onFrameAvailable(byte[] frameData, int width, int height) {
        Log.d(TAG, "SmartGlassesService received frame: " + width + "x" + height);
        sendFrameToCore(frameData, width, height);
    }
}
