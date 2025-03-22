package com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.augmentos;

import android.content.Context;
import android.util.Log;

import com.augmentos.augmentos_core.augmentos_backend.ServerComms;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.BypassVadForDebuggingEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassesconnection.SmartGlassesAndroidService;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.AsrStreamKey;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.SpeechRecFramework;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.vad.VadGateSpeechPolicy;
import com.augmentos.augmentoslib.events.SpeechRecOutputEvent;
import com.augmentos.augmentoslib.events.TranslateOutputEvent;
//import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.AsrStreamKey;
//import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.SpeechRecFramework;
//import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.vad.VadGateSpeechPolicy;

import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.Subscribe;
import org.json.JSONObject;

import java.lang.reflect.Field;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;

/**
 * SpeechRecAugmentos uses ServerComms for WebSocket interactions (single connection).
 * This class retains all VAD logic, EventBus usage, and rolling buffer logic.
 * It calls into ServerComms to send audio data, VAD status, etc.
 */
public class SpeechRecAugmentos extends SpeechRecFramework {
    private static final String TAG = "WearableAi_SpeechRecAugmentos";
    private static SpeechRecAugmentos instance;

    private final Context mContext;
    private final BlockingQueue<byte[]> rollingBuffer;
    private final int bufferMaxSize;

    // VAD
    private VadGateSpeechPolicy vadPolicy;
    private volatile boolean isSpeaking = false; // Track VAD state
//    private boolean vadEnabled = true;

    // VAD buffer for chunking
    private final BlockingQueue<Short> vadBuffer = new LinkedBlockingQueue<>();
    private final int vadFrameSize = 512; // 512-sample frames for VAD
    private volatile boolean vadRunning = true;
    private boolean bypassVadForDebugging = false;

    private SpeechRecAugmentos(Context context) {
        this.mContext = context;

//        vadEnabled = !SmartGlassesAndroidService.getBypassVadEnabled(context);

        // 1) Create or fetch your single ServerComms (the new consolidated manager).
        //    For example, we create a new instance here:

        // 2) Let ServerComms know it should forward "interim"/"final" messages to this class.
        ServerComms.getInstance().setSpeechRecAugmentos(this);

        // Rolling buffer to store ~220ms of audio for replay on VAD trigger
        this.bufferMaxSize = (int) ((16000 * 0.22 * 2) / 512);
        this.rollingBuffer = new LinkedBlockingQueue<>(bufferMaxSize);

        bypassVadForDebugging = SmartGlassesAndroidService.getBypassVadForDebugging(context);

        // Initialize VAD asynchronously
        initVadAsync();
    }

    /**
     * Initializes the VAD model on a background thread, then sets up the VAD logic.
     */
    private void initVadAsync() {
        new Thread(() -> {
            vadPolicy = new VadGateSpeechPolicy(mContext);
            vadPolicy.init(512);
            setupVadListener();
            startVadProcessingThread();
        }).start();
    }

    /**
     * Sets up a loop that checks VAD state and sends VAD on/off to the server.
     */
    private void setupVadListener() {
        new Thread(() -> {
            while (true) {
                boolean newVadIsSpeakingState = vadPolicy.shouldPassAudioToRecognizer();

                if (newVadIsSpeakingState && !isSpeaking) {
                    // VAD opened
                    sendVadStatus(true);
                    sendBufferedAudio();
                    isSpeaking = true;
                } else if (!newVadIsSpeakingState && isSpeaking) {
                    // VAD closed
                    sendVadStatus(false);
                    isSpeaking = false;
                }

                try {
                    Thread.sleep(50);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }).start();
    }

    /**
     * Drains the rolling buffer (last ~150ms) and sends it immediately when VAD opens.
     */
    private void sendBufferedAudio() {
        List<byte[]> bufferDump = new ArrayList<>();
        rollingBuffer.drainTo(bufferDump);

        for (byte[] chunk : bufferDump) {
            // Now we send audio chunks through ServerComms (single WebSocket).
            ServerComms.getInstance().sendAudioChunk(chunk);
        }
    }

    /**
     * Start a background thread that chunks up audio for VAD (512 frames).
     */
    private void startVadProcessingThread() {
        new Thread(() -> {
            while (vadRunning) {
                try {
                    while (vadBuffer.size() < vadFrameSize) {
                        Thread.sleep(5);
                    }
                    short[] vadChunk = new short[vadFrameSize];
                    for (int i = 0; i < vadFrameSize; i++) {
                        vadChunk[i] = vadBuffer.poll();
                    }
                    byte[] bytes = shortsToBytes(vadChunk);
                    vadPolicy.processAudioBytes(bytes, 0, bytes.length);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }).start();
    }

    /**
     * Tells the server whether VAD is "speaking" or not.
     */
    private void sendVadStatus(boolean isNowSpeaking) {
        ServerComms.getInstance().sendVadStatus(isNowSpeaking);
    }

    /**
     * Called by external code to feed raw PCM chunks (16-bit, 16kHz).
     * runs VAD on decoded data to tell whether or not we should send the encoded data to the backend
     */
    @Override
    public void ingestAudioChunk(byte[] audioChunk) {
        if (vadPolicy == null) {
            Log.e(TAG, "VAD not initialized yet. Skipping audio.");
            return;
        }
        if (!isVadInitialized()) {
            Log.e(TAG, "VAD model not initialized. Skipping audio.");
            return;
        }
        short[] audioSamples = bytesToShort(audioChunk);
        for (short sample : audioSamples) {
            if (vadBuffer.size() >= 16000) {
                vadBuffer.poll();
            }
            vadBuffer.offer(sample);
        }
    }

    /**
     * Called by external code to feed raw LC3 chunks
     */
    @Override
    public void ingestLC3AudioChunk(byte[] LC3audioChunk) {
        // If currently speaking, send data live
//        if (!vadEnabled || isSpeaking) {
        if (bypassVadForDebugging) {
            Log.d(TAG, "Bypassing VAD for debugging.");
            ServerComms.getInstance().sendAudioChunk(LC3audioChunk);
            return;
        }

        if (isSpeaking) {
            ServerComms.getInstance().sendAudioChunk(LC3audioChunk);
        }

        // Maintain rolling buffer for "catch-up"
        if (rollingBuffer.size() >= bufferMaxSize) {
            rollingBuffer.poll();
        }
        rollingBuffer.offer(LC3audioChunk);
    }


    /**
     * Converts short[] -> byte[] (little-endian)
     */
    private byte[] shortsToBytes(short[] shorts) {
        ByteBuffer byteBuffer = ByteBuffer.allocate(shorts.length * 2);
        byteBuffer.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().put(shorts);
        return byteBuffer.array();
    }

    /**
     * Converts byte[] -> short[] (little-endian)
     */
    private short[] bytesToShort(byte[] bytes) {
        short[] shorts = new short[bytes.length / 2];
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(shorts);
        return shorts;
    }

    /**
     * Simple reflection-based check to see if the VAD model is loaded.
     */
    private boolean isVadInitialized() {
        try {
            Field vadField = vadPolicy.getClass().getDeclaredField("vad");
            vadField.setAccessible(true);
            Object vadInstance = vadField.get(vadPolicy);
            return vadInstance != null;
        } catch (Exception e) {
            Log.e(TAG, "Failed to check VAD init state.", e);
            return false;
        }
    }

    /**
     * Called by your external code to start the recognition service (connect to WebSocket, etc.).
     */
    @Override
    public void start() {
        Log.d(TAG, "Starting Speech Recognition Service");
    }

    /**
     * Called by your external code to stop the recognition service.
     */
    @Override
    public void destroy() {
        Log.d(TAG, "Destroying Speech Recognition Service");
        vadRunning = false;
        //ServerComms.getInstance().disconnectWebSocket();
    }

    /**
     * Create a new instance, ensuring old one is destroyed.
     */
    public static synchronized SpeechRecAugmentos getInstance(Context context) {
        if (instance != null) {
            instance.destroy();
        }
        instance = new SpeechRecAugmentos(context);
        return instance;
    }

    /**
     * If you had logic to update dynamic ASR config, you can call:
     */
    public void updateConfig(List<AsrStreamKey> languages) {
        ServerComms.getInstance().updateAsrConfig(languages);
    }

    /**
     * ServerComms calls this whenever it receives "interim"/"final" messages from the server
     * that relate to speech or translation. We then post them to the EventBus.
     */
    public void handleSpeechJson(JSONObject msg) {
        // Example parse logic for "interim"/"final"
        try {
            long timestamp = (long) (msg.getDouble("timestamp") * 1000);
            String type = msg.getString("type"); // "interim" or "final"
            String language = msg.getString("language");
            String translateLanguage = msg.optString("translateLanguage", null);
            boolean isTranslation = (translateLanguage != null);
            String text = msg.getString("text");

            if ("interim".equals(type)) {
                if (isTranslation) {
                    EventBus.getDefault().post(new TranslateOutputEvent(text, language, translateLanguage, timestamp, false));
                } else {
                    EventBus.getDefault().post(new SpeechRecOutputEvent(text, language, timestamp, false));
                }
            } else {
                // "final"
                if (isTranslation) {
                    EventBus.getDefault().post(new TranslateOutputEvent(text, language, translateLanguage, timestamp, true));
                } else {
                    EventBus.getDefault().post(new SpeechRecOutputEvent(text, language, timestamp, true));
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error parsing speech JSON: " + msg, e);
        }
    }

    public void microphoneStateChanged(boolean state){
        if (vadPolicy != null){
            vadPolicy.microphoneStateChanged(state);
        }
    }

    public void changeBypassVadForDebuggingState(boolean bypassVadForDebugging) {
        Log.d(TAG, "setBypassVadForDebugging: " + bypassVadForDebugging);
        this.bypassVadForDebugging = bypassVadForDebugging;
    }
}
