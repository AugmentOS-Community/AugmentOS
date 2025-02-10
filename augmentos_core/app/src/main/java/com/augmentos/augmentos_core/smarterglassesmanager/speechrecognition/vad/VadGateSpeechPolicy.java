package com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.vad;

import android.content.Context;
import android.util.Log;

import com.konovalov.vad.Vad;
import com.konovalov.vad.VadListener;
import com.konovalov.vad.config.FrameSize;
import com.konovalov.vad.config.Mode;
import com.konovalov.vad.config.Model;
import com.konovalov.vad.config.SampleRate;
import com.konovalov.vad.models.VadModel;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.google.asr.SpeechDetectionPolicy;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;

/** A speech detector that always reports hearing speech. */
public class VadGateSpeechPolicy implements SpeechDetectionPolicy {
    public final String TAG = "WearLLM_VadGateService";
    private Context mContext;
    private Vad vad;
    private VadModel vadModel;
    private boolean isCurrentlySpeech;

    public VadGateSpeechPolicy(Context context){
       mContext = context;
       isCurrentlySpeech = false;
    }

    public void startVad(int blockSizeSamples){
        vad = Vad.builder();

        blockSizeSamples = blockSizeSamples;

        Log.d(TAG, "VAD looking for block size samples: " + blockSizeSamples);
        //find the proper frame size
        FrameSize fsToUse = null;
        for (FrameSize fs : FrameSize.values()){
            if (fs.getValue() == blockSizeSamples){
                fsToUse = fs;
                break;
            }
        }

        if (fsToUse == null){
            Log.e(TAG, "Frame size not supported by VAD, exiting.");
            return;
        }

        vadModel = vad.setModel(Model.SILERO_DNN)
                .setSampleRate(SampleRate.SAMPLE_RATE_16K)
                .setFrameSize(fsToUse)
//                .setMode(Mode.VERY_AGGRESSIVE)
                .setMode(Mode.AGGRESSIVE)
//                .setMode(Mode.NORMAL)
                .setSilenceDurationMs(12000) //very long pause so we don't keep turning on/off ASR
                .setSpeechDurationMs(50)
                .setContext(mContext)
                .build();

        Log.d(TAG, "VAD init'ed.");
    }

    @Override
    public boolean shouldPassAudioToRecognizer() {
        return isCurrentlySpeech;
    }

    @Override
    public void init(int blockSizeSamples) {
        startVad(blockSizeSamples);
    }

    @Override
    public void reset() {}

    public short [] bytesToShort(byte[] bytes) {
        short[] shorts = new short[bytes.length/2];
        // to turn bytes to shorts as either big endian or little endian.
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(shorts);
        return shorts;
    }

    @Override
    public void processAudioBytes(byte[] bytes, int offset, int length) {
        short[] audioBytesFull = bytesToShort(bytes);

        // Ensure we process only full 512-sample frames
        int totalSamples = audioBytesFull.length;
        int frameSize = 512;

        if (totalSamples % frameSize != 0) {
            Log.e(TAG, "Invalid audio frame size: " + totalSamples + " samples. Needs to be multiple of 512.");
            return; // Skip processing if we have an invalid size
        }

        for (int i = 0; i < totalSamples / frameSize; i++) {
            int startIdx = i * frameSize;
            short[] audioBytesPartial = Arrays.copyOfRange(audioBytesFull, startIdx, startIdx + frameSize);

            vadModel.setContinuousSpeechListener(audioBytesPartial, new VadListener() {
                @Override
                public void onSpeechDetected() {
                    isCurrentlySpeech = true;
                }

                @Override
                public void onNoiseDetected() {
                    isCurrentlySpeech = false;
                }
            });
        }
    }

    @Override
    public void stop() {
        vadModel.close();
    }
}