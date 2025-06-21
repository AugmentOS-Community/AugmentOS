package com.augmentos.augmentoslib.events;

import com.augmentos.augmentoslib.FocusStates;

import java.io.Serializable;

public class FocusChangedEvent implements Serializable {
    public static final String eventId = "focusRevokedEvent";
    public FocusStates focusState;
    public String appPackage;

    public FocusChangedEvent(FocusStates focusState, String appPackage){
        this.focusState = focusState;
        this.appPackage = appPackage;
    }
}
