package com.augmentos.augmentos_core.smarterglassesmanager.hci;

//thanks to https://github.com/aahlenst/android-audiorecord-sample/blob/master/src/main/java/com/example/audiorecord/BluetoothRecordActivity.java

import android.bluetooth.BluetoothDevice;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.CountDownTimer;
import android.os.Handler;
import android.util.Log;

import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.ScoStartEvent;

import org.greenrobot.eventbus.EventBus;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.atomic.AtomicBoolean;
public class MicrophoneLocalAndBluetooth {
    private static final String TAG = "WearableAi_MicrophoneLocalAndBluetooth";

    private static final int SAMPLING_RATE_IN_HZ = 16000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    private final static float BUFFER_SIZE_SECONDS = 0.128f; // gives us 2048
    private static final int BUFFER_SIZE_FACTOR = 2;
    private final int bufferSize;
    private boolean bluetoothAudio = false; // are we using local audio or bluetooth audio?
    private boolean shouldUseHearItBleMicrophone = false; // should we use HearIt BLE microphone?
    private int retries = 0;
    private int retryLimit = 3;

    private Handler mHandler;

    private final AtomicBoolean recordingInProgress = new AtomicBoolean(false);

    private HearItBleMicrophone hearItBleMicrophone;

    private final BroadcastReceiver bluetoothStateReceiver = new BroadcastReceiver() {
        private BluetoothState bluetoothState = BluetoothState.UNAVAILABLE;

        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (action.equals(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED)) {
                int state = intent.getIntExtra(AudioManager.EXTRA_SCO_AUDIO_STATE, -1);
                switch (state) {
                    case AudioManager.SCO_AUDIO_STATE_CONNECTED:
                        if (mIsStarting) {
                            mIsStarting = false;
                        }
                        if (mIsCountDownOn) {
                            mIsCountDownOn = false;
                            mCountDown.cancel();
                        }
                        bluetoothAudio = true;
                        startRecording();
                        break;
                    case AudioManager.SCO_AUDIO_STATE_CONNECTING:
                        handleBluetoothStateChange(BluetoothState.UNAVAILABLE);
                    case AudioManager.SCO_AUDIO_STATE_DISCONNECTED:
                        handleBluetoothStateChange(BluetoothState.UNAVAILABLE);
                        break;
                    case AudioManager.SCO_AUDIO_STATE_ERROR:
                        handleBluetoothStateChange(BluetoothState.UNAVAILABLE);
                        break;
                }
            } else if (action.equals(BluetoothDevice.ACTION_ACL_CONNECTED)) {
                handleNewBluetoothDevice();
            } else if (action.equals(BluetoothDevice.ACTION_ACL_DISCONNECTED)) {
                handleDisconnectBluetoothDevice();
            }
        }

        private void handleBluetoothStateChange(BluetoothState state) {
            if (bluetoothState == state) {
                return;
            }
            bluetoothState = state;
            bluetoothStateChanged(state);
        }

        private void handleNewBluetoothDevice() {
            retries = 0;
            mIsCountDownOn = true;
            mCountDown.start();
        }

        private void handleDisconnectBluetoothDevice() {
            if (mIsCountDownOn) {
                mIsCountDownOn = false;
                mCountDown.cancel();
            }
            bluetoothAudio = false;
            deactivateBluetoothSco();
            startRecording();
        }
    };

    private AudioRecord recorder = null;

    private AudioManager audioManager;
    private boolean mIsCountDownOn = false;
    private boolean mIsStarting = false;

    private Thread recordingThread = null;

    private Context mContext;

    private AudioChunkCallback mChunkCallback;

    public MicrophoneLocalAndBluetooth(Context context, boolean useBluetoothSco, AudioChunkCallback chunkCallback) {
        this(context, chunkCallback);
        this.shouldUseHearItBleMicrophone = true;
        useBluetoothMic(useBluetoothSco);
    }

    public MicrophoneLocalAndBluetooth(Context context, AudioChunkCallback chunkCallback) {
        bufferSize = Math.round(SAMPLING_RATE_IN_HZ * BUFFER_SIZE_SECONDS);

        mIsStarting = true;

        mContext = context;

        audioManager = (AudioManager) mContext.getSystemService(Context.AUDIO_SERVICE);

        mChunkCallback = chunkCallback;

        mHandler = new Handler();

        startRecording();
    }

    private void useBluetoothMic(boolean shouldUseBluetoothSco) {
        bluetoothAudio = shouldUseBluetoothSco;

        if (shouldUseBluetoothSco) {
            startBluetoothSco();
        } else {
            stopBluetoothSco();
        }

        if (recordingInProgress.get()) {
            startRecording();
        }
    }

    private void startBluetoothSco() {
        IntentFilter filter = new IntentFilter();
        filter.addAction(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED);
        filter.addAction(BluetoothDevice.ACTION_ACL_CONNECTED);
        filter.addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED);

        mContext.registerReceiver(bluetoothStateReceiver, filter);

        mIsCountDownOn = true;
        mCountDown.start();
    }

    private void stopBluetoothSco() {
        mIsCountDownOn = false;
        mCountDown.cancel();
        try {
            mContext.unregisterReceiver(bluetoothStateReceiver);
        } catch (IllegalArgumentException e) {
            e.printStackTrace();
        }
    }

    private void startRecording() {
        Log.d(TAG, "Starting recording...");
        if (recorder != null) {
            stopRecording();
        }
        if (bluetoothAudio) {
            audioManager.setMode(AudioManager.MODE_IN_CALL);
            EventBus.getDefault().post(new ScoStartEvent(true));
        } else {
            audioManager.setMode(AudioManager.MODE_NORMAL);
            EventBus.getDefault().post(new ScoStartEvent(false));
        }

        recorder = new AudioRecord(MediaRecorder.AudioSource.UNPROCESSED,
                SAMPLING_RATE_IN_HZ, CHANNEL_CONFIG, AUDIO_FORMAT, bufferSize * 2);

        recorder.startRecording();

        recordingInProgress.set(true);

        recordingThread = new Thread(new RecordingRunnable(), "Recording Thread");
        recordingThread.start();

        if (bluetoothAudio && shouldUseHearItBleMicrophone) {
            Log.d(TAG, "Connecting HearItBle... ");
            hearItBleMicrophone = new HearItBleMicrophone(mContext);
            hearItBleMicrophone.setHearItBleMicCallback(new HearItBleMicrophone.HearItBleMicCallback() {
                @Override
                public void onConnected() {
                    Log.d(TAG, "--- HearItBle connected!");
                    stopAndroidMics();
                }

                @Override
                public void onPcmDataAvailable(byte[] pcmData) {
//                    Log.d(TAG, "GOT HEAR IT AUDIO DATA");
                    ByteBuffer b_buffer = ByteBuffer.allocate(pcmData.length);
                    b_buffer.put(pcmData);
                    mChunkCallback.onSuccess(b_buffer);
                }
            });
            hearItBleMicrophone.startScanning();
        }
    }

    private void stopAndroidMics(){
        mIsCountDownOn = false;
        mCountDown.cancel();
        deactivateBluetoothSco();
        audioManager.setMode(AudioManager.MODE_NORMAL);

        stopRecording();
    }

    private void stopRecording() {
        Log.d(TAG, "Running stopRecording...");

        if (recorder == null) {
            Log.d(TAG, "--- Recorder null, exiting.");
            return;
        }

        recordingInProgress.set(false);
        recorder.stop();
        recorder.release();
        recorder = null;
        recordingThread = null;
    }

    private void activateBluetoothSco() {
        retries += 1;

        if (!audioManager.isBluetoothScoAvailableOffCall()) {
            Log.e(TAG, "SCO is not available, recording is not possible");
            return;
        }

        if (audioManager.isBluetoothScoOn()) {
            audioManager.stopBluetoothSco();
        }
        audioManager.startBluetoothSco();
    }

    private void deactivateBluetoothSco() {
        audioManager.stopBluetoothSco();
    }

    private void bluetoothStateChanged(BluetoothState state) {
        if (BluetoothState.UNAVAILABLE == state && recordingInProgress.get()) {
            bluetoothAudio = false;
            Log.d(TAG, "");
            stopRecording();
            deactivateBluetoothSco();
        } else if (BluetoothState.AVAILABLE == state && !recordingInProgress.get()) {
            bluetoothAudio = true;
            startRecording();
        } else if (BluetoothState.AVAILABLE == state && !bluetoothAudio) {
            bluetoothAudio = true;
            startRecording();
        }
    }

    private class RecordingRunnable implements Runnable {
        @Override
        public void run() {
            short[] short_buffer = new short[bufferSize];
            ByteBuffer b_buffer = ByteBuffer.allocate(short_buffer.length * 2);

            while (recordingInProgress.get()) {
                int result = recorder.read(short_buffer, 0, short_buffer.length);
                if (result < 0) {
                    Log.d(TAG, "ERROR");
                }
//                Log.d(TAG, "GOT MAIN AUDIO DATA");
                b_buffer.order(ByteOrder.LITTLE_ENDIAN);
                b_buffer.asShortBuffer().put(short_buffer);
                if (hearItBleMicrophone != null && !hearItBleMicrophone.isConnected()) {
                    mChunkCallback.onSuccess(b_buffer);
                }
                b_buffer.clear();
            }
        }

        private String getBufferReadFailureReason(int errorCode) {
            switch (errorCode) {
                case AudioRecord.ERROR_INVALID_OPERATION:
                    return "ERROR_INVALID_OPERATION";
                case AudioRecord.ERROR_BAD_VALUE:
                    return "ERROR_BAD_VALUE";
                case AudioRecord.ERROR_DEAD_OBJECT:
                    return "ERROR_DEAD_OBJECT";
                case AudioRecord.ERROR:
                    return "ERROR";
                default:
                    return "Unknown (" + errorCode + ")";
            }
        }
    }

    enum BluetoothState {
        AVAILABLE, UNAVAILABLE
    }

    private CountDownTimer mCountDown = new CountDownTimer(1201, 400) {
        @SuppressWarnings("synthetic-access")
        @Override
        public void onTick(long millisUntilFinished) {
            audioManager.startBluetoothSco();
        }

        @SuppressWarnings("synthetic-access")
        @Override
        public void onFinish() {
            mIsCountDownOn = false;
            bluetoothAudio = false;
            startRecording();
        }
    };

    public void destroy() {
        Log.d(TAG, "Destroying local microphone...");
        stopRecording();

        if (hearItBleMicrophone != null) {
            hearItBleMicrophone.destroy();
        }

        mIsCountDownOn = false;
        mCountDown.cancel();
        deactivateBluetoothSco();
        audioManager.setMode(AudioManager.MODE_NORMAL);
        if (mContext != null) {
            try {
                mContext.unregisterReceiver(bluetoothStateReceiver);
            } catch (IllegalArgumentException e) {
                e.printStackTrace();
            }
        }
    }
}