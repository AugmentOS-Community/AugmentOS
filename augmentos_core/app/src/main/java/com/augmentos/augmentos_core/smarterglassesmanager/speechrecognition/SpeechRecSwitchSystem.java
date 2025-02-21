package com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition;

import android.content.Context;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.AudioChunkNewEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.LC3AudioChunkNewEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.PauseAsrEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.augmentos.SpeechRecAugmentos;

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

    public SpeechRecSwitchSystem(Context mContext) {
        this.mContext = mContext;
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
            speechRecFramework.ingestAudioChunk(receivedEvent.thisChunk);
        }
    }

    @Subscribe
    public void onLC3AudioChunkNewEvent(LC3AudioChunkNewEvent receivedEvent){
        //redirect audio to the currently in use ASR framework, if it's not paused
        if (!speechRecFramework.pauseAsrFlag) {
            speechRecFramework.ingestLC3AudioChunk(receivedEvent.thisChunk);
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

