package com.augmentos.augmentoslib.events;

import java.io.Serializable;

public class FocusRequestEvent implements Serializable {
    public static final String eventId = "focusRequestEvent";
    public boolean focusRequest;

    public FocusRequestEvent(boolean focusRequest){
        //if true, request focus. if false, cancel focus
        this.focusRequest = focusRequest;
    }
}
