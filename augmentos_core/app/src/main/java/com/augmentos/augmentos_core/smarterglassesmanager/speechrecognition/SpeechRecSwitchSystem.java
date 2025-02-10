package com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.AudioChunkNewEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.PauseAsrEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.SetSensingEnabledEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.ASR_FRAMEWORKS;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.AsrStreamKey;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.SpeechRecFramework;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.augmentos.SpeechRecAugmentos;
//import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.azure.SpeechRecAzure;
//import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.deepgram.SpeechRecDeepgram;
//import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.google.SpeechRecGoogle;

import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.Subscribe;

import java.util.List;

//send audio to one of the built in ASR frameworks.
public class SpeechRecSwitchSystem {
    private final String TAG = "WearableAi_SpeechRecSwitchSystem";
    private ASR_FRAMEWORKS asrFramework;
    private SpeechRecFramework speechRecFramework;
    private Context mContext;
    public String currentLanguage;
    public static boolean sensing_enabled;

    public SpeechRecSwitchSystem(Context mContext) {
        this.mContext = mContext;
        sensing_enabled = getSensingEnabled();
    }

    private boolean getSensingEnabled() {
        SharedPreferences sharedPreferences = mContext.getSharedPreferences("AugmentOSPrefs", Context.MODE_PRIVATE);
        return sharedPreferences.getBoolean("sensing_enabled", true);
    }

    public void saveSensingEnabled(boolean enabled) {
        SharedPreferences sharedPreferences = mContext.getSharedPreferences("AugmentOSPrefs", Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = sharedPreferences.edit();
        editor.putBoolean("sensing_enabled", enabled);
        editor.apply();
    }

    @Subscribe
    public void onSetSensingEnabledEvent(SetSensingEnabledEvent event){
        sensing_enabled = event.enabled;
        saveSensingEnabled(event.enabled);
    }

    public void startAsrFramework(ASR_FRAMEWORKS asrFramework) {
        //kill old asr
        EventBus.getDefault().unregister(this);
        if (speechRecFramework != null){
            speechRecFramework.destroy();
        }

        //set new asr
        this.asrFramework = asrFramework;

        //create new asr
        speechRecFramework = SpeechRecAugmentos.getInstance(mContext);

        //start asr
        speechRecFramework.start();
        EventBus.getDefault().register(this);
    }

    @Subscribe
    public void onAudioChunkNewEvent(AudioChunkNewEvent receivedEvent){
        //redirect audio to the currently in use ASR framework, if it's not paused
        if (!speechRecFramework.pauseAsrFlag) {
            if (!sensing_enabled){
                Log.d(TAG,"Sensing is disabled");
                return;
            }
            speechRecFramework.ingestAudioChunk(receivedEvent.thisChunk);
        }
    }

    @Subscribe
    public void onPauseAsrEvent(PauseAsrEvent receivedEvent){
        //redirect audio to the currently in use ASR framework
        speechRecFramework.pauseAsr(receivedEvent.pauseAsr);
    }

    public void destroy(){
        if (speechRecFramework != null){
            speechRecFramework.destroy();
        }
        EventBus.getDefault().unregister(this);
    }

    public void updateConfig(List<AsrStreamKey> languages){
        speechRecFramework.updateConfig(languages);
    }

}

