package com.augmentos.augmentoslib.events;

import com.augmentos.augmentoslib.AugmentOSCommand;

import java.io.Serializable;

public class RegisterCommandRequestEvent implements Serializable {
    public AugmentOSCommand command;
    public static final String eventId = "registerCommandRequestEvent";

    public RegisterCommandRequestEvent(AugmentOSCommand command){
        this.command = command;
    }

    public static String getEventId(){
        return("registerCommandRequestEvent");
    }
}
