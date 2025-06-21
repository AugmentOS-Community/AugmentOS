package com.augmentos.augmentoslib.events;

import java.io.Serializable;

public class DoubleTextWallViewRequestEvent implements Serializable {
    public String textTop;
    public String textBottom;
    public static final String eventId = "doubleTextWallViewRequestEvent";


    public DoubleTextWallViewRequestEvent(String textTop, String textBottom) {
        this.textTop = textTop;
        this.textBottom = textBottom;
    }
}
