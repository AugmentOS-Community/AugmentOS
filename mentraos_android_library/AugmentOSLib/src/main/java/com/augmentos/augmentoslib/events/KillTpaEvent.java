package com.augmentos.augmentoslib.events;

import com.augmentos.augmentoslib.ThirdPartyEdgeApp;

import java.io.Serializable;

public class KillTpaEvent implements Serializable {
    public ThirdPartyEdgeApp tpa;
    public static final String eventId = "killTpaEvent";

    public KillTpaEvent(ThirdPartyEdgeApp tpa){
        this.tpa = tpa;
    }

}
