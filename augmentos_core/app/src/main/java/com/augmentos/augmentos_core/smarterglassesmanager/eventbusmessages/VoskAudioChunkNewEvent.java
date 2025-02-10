package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

public class VoskAudioChunkNewEvent {
    public byte [] thisChunk;

    public VoskAudioChunkNewEvent(byte [] thisChunk){
        this.thisChunk = thisChunk;
    }
}
