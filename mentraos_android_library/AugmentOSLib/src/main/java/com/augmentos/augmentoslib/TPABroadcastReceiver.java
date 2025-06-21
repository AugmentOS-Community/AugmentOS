package com.augmentos.augmentoslib;

import static android.content.Context.RECEIVER_EXPORTED;
import static com.augmentos.augmentoslib.AugmentOSGlobalConstants.EVENT_BUNDLE;
import static com.augmentos.augmentoslib.AugmentOSGlobalConstants.EVENT_ID;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;

import com.augmentos.augmentoslib.events.CommandTriggeredEvent;
import com.augmentos.augmentoslib.events.CoreToManagerOutputEvent;
import com.augmentos.augmentoslib.events.FocusChangedEvent;
import com.augmentos.augmentoslib.events.GlassesPovImageEvent;
import com.augmentos.augmentoslib.events.GlassesTapOutputEvent;
import com.augmentos.augmentoslib.events.KillTpaEvent;
import com.augmentos.augmentoslib.events.NotificationEvent;
import com.augmentos.augmentoslib.events.SmartRingButtonOutputEvent;
import com.augmentos.augmentoslib.events.SpeechRecOutputEvent;
import com.augmentos.augmentoslib.events.TranslateOutputEvent;

import org.greenrobot.eventbus.EventBus;

import java.io.Serializable;

public class TPABroadcastReceiver extends BroadcastReceiver {
    private String filterPkg;
    private Context context;
    public String TAG = "AugmentOSLib_TPABroadcastReceiver";

    public TPABroadcastReceiver(Context myContext) {
        this.context = myContext;
        this.filterPkg = AugmentOSGlobalConstants.TO_TPA_FILTER;
        IntentFilter intentFilter = new IntentFilter(this.filterPkg);
        this.context.registerReceiver(this, intentFilter, RECEIVER_EXPORTED);
    }

    public void onReceive(Context context, Intent intent) {
        String eventId = intent.getStringExtra(EVENT_ID);
        Serializable serializedEvent = intent.getSerializableExtra(EVENT_BUNDLE);

        //map from id to event
        switch (eventId) {
            case CommandTriggeredEvent.eventId:
                AugmentOSLibBus.getInstance().post((CommandTriggeredEvent) serializedEvent);
                break;
            case KillTpaEvent.eventId:
                AugmentOSLibBus.getInstance().post((KillTpaEvent) serializedEvent);
                break;
            case SpeechRecOutputEvent.eventId:
                AugmentOSLibBus.getInstance().post((SpeechRecOutputEvent) serializedEvent);
                break;
            case TranslateOutputEvent.eventId:
                AugmentOSLibBus.getInstance().post((TranslateOutputEvent) serializedEvent);
                break;
            case SmartRingButtonOutputEvent.eventId:
                AugmentOSLibBus.getInstance().post((SmartRingButtonOutputEvent) serializedEvent);
                break;
            case GlassesTapOutputEvent.eventId:
                AugmentOSLibBus.getInstance().post((GlassesTapOutputEvent) serializedEvent);
                break;
            case FocusChangedEvent.eventId:
                AugmentOSLibBus.getInstance().post((FocusChangedEvent) serializedEvent);
                break;
            case GlassesPovImageEvent.eventId:
                AugmentOSLibBus.getInstance().post((GlassesPovImageEvent) serializedEvent);
                break;
            case CoreToManagerOutputEvent.eventId:
                AugmentOSLibBus.getInstance().post((CoreToManagerOutputEvent) serializedEvent);
                break;
            case NotificationEvent.eventId:
                AugmentOSLibBus.getInstance().post((NotificationEvent) serializedEvent);
                break;
        }
    }

    public void destroy(){
        this.context.unregisterReceiver(this);
    }
}
