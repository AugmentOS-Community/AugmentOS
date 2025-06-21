package com.augmentos.augmentoslib.events;

import java.io.Serializable;

public class DisplayCustomContentRequestEvent implements Serializable {
    public String json;
    public static final String eventId = "displayCustomContentRequestEvent";

    public DisplayCustomContentRequestEvent(String json) {
        this.json = json;
    }
}
