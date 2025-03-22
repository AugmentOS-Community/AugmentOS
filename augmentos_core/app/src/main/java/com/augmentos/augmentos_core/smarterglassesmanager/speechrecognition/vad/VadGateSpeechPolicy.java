package com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.vad;

import static androidx.core.content.ContentProviderCompat.requireContext;

import android.content.Context;
import android.util.Log;

import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.google.asr.SpeechDetectionPolicy;
import com.konovalov.vad.silero.VadSilero;
import com.konovalov.vad.silero.Vad;
import com.konovalov.vad.silero.config.FrameSize;
import com.konovalov.vad.silero.config.Mode;
import com.konovalov.vad.silero.config.SampleRate;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;

public class VadGateSpeechPolicy implements SpeechDetectionPolicy {
    public final String TAG = "WearLLM_VadGateService";
    private Context mContext;
    private VadSilero vad;
    private boolean isCurrentlySpeech;

    // Total required silence duration of 12 seconds.
    private static final long REQUIRED_SILENCE_DURATION_MS = 12000;
    // Throttle VAD checks during silence to once every 300ms.
    private static final long SILENCE_VAD_INTERVAL_MS = 333;

    // Timestamp of the last detected speech.
    private long lastSpeechDetectedTime = 0;
    // Throttle timer for silence VAD checks.
    private long lastVadCheckTime = 0;

    public VadGateSpeechPolicy(Context context){
        mContext = context;
        isCurrentlySpeech = false;
    }

    public void startVad(){
        // Set internal silence duration very low; external logic now manages the full required silence duration.
        vad = Vad.builder()
                .setContext(mContext)
                .setSampleRate(SampleRate.SAMPLE_RATE_16K)
                .setFrameSize(FrameSize.FRAME_SIZE_512)
                .setMode(Mode.NORMAL)
                .setSilenceDurationMs(50)
                .setSpeechDurationMs(50)
                .build();

        Log.d(TAG, "VAD init'ed.");
    }

    @Override
    public boolean shouldPassAudioToRecognizer() {
        return isCurrentlySpeech;
    }

    @Override
    public void init(int blockSizeSamples) {
        startVad();
    }

    @Override
    public void reset() {}

    public short[] bytesToShort(byte[] bytes) {
        short[] shorts = new short[bytes.length / 2];
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(shorts);
        return shorts;
    }

    @Override
    public void processAudioBytes(byte[] bytes, int offset, int length) {
        long now = System.currentTimeMillis();

        // If in speech state and it hasn't been 12 seconds since the last speech was detected, skip processing.
        if (isCurrentlySpeech && (now - lastSpeechDetectedTime < REQUIRED_SILENCE_DURATION_MS)) {
            return;
        }

        // During silence, throttle VAD checks to once every 300ms.
        if (!isCurrentlySpeech && (now - lastVadCheckTime < SILENCE_VAD_INTERVAL_MS)) {
            return;
        }
        lastVadCheckTime = now;

        short[] audioBytesFull = bytesToShort(bytes);
        int totalSamples = audioBytesFull.length;
        int frameSize = 512;

        if (totalSamples % frameSize != 0) {
            Log.e(TAG, "Invalid audio frame size: " + totalSamples + " samples. Needs to be multiple of 512.");
            return;
        }

        boolean previousSpeechState = isCurrentlySpeech;

        // Process each 512-sample frame
        for (int i = 0; i < totalSamples / frameSize; i++) {
            now = System.currentTimeMillis();
            int startIdx = i * frameSize;
            short[] audioFrame = Arrays.copyOfRange(audioBytesFull, startIdx, startIdx + frameSize);
            boolean detectedSpeech = vad.isSpeech(audioFrame);

            if (detectedSpeech) {
                isCurrentlySpeech = true;
                // Update the last speech detection timestamp.
                lastSpeechDetectedTime = now;
            } else {
                // If no speech detected, and 12 seconds have elapsed since the last speech, mark as silence.
                if (now - lastSpeechDetectedTime >= REQUIRED_SILENCE_DURATION_MS) {
                    isCurrentlySpeech = false;
                }
            }

            if (isCurrentlySpeech != previousSpeechState) {
                Log.d(TAG, "Speech detection changed to: " + (isCurrentlySpeech ? "SPEECH" : "SILENCE"));
                previousSpeechState = isCurrentlySpeech;
            }
        }
    }

    @Override
    public void stop() {
        vad.close();
    }

    public void microphoneStateChanged(boolean state) {
        if (!state) {
            // Microphone turned off: force immediate silence.
            isCurrentlySpeech = false;
            lastSpeechDetectedTime = 0;
            lastVadCheckTime = 0;

            // Optionally flush the VAD's internal state by processing a silent frame.
            short[] silentFrame = new short[512];
            vad.isSpeech(silentFrame);
            Log.d(TAG, "Microphone turned off; forced state to SILENCE.");
        }
    }
}

