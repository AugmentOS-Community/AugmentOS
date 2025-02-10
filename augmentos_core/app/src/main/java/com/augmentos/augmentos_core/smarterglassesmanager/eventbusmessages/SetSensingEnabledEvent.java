package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

public class SetSensingEnabledEvent {

    public boolean enabled;

    public SetSensingEnabledEvent(boolean newEnabled){
        this.enabled = newEnabled;
    }
}
