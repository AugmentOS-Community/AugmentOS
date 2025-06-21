package com.augmentos.augmentoslib.events;

import java.io.Serializable;

public class CoreToManagerOutputEvent implements Serializable {
    public String jsonData;
    public static final String eventId = "coreToManagerOutputEventId";

    public CoreToManagerOutputEvent(String newJsonData){
        this.jsonData = newJsonData;
    }
}
