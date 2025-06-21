package com.augmentos.augmentoslib.events;

import java.io.Serializable;

public class ReferenceCardSimpleViewRequestEvent implements Serializable {
    public String title;
    public String body;
    public static final String eventId = "referenceCardSimpleViewRequestEvent";

    public ReferenceCardSimpleViewRequestEvent(String title, String body) {
        this.title = title;
        this.body = body;
    }
}
