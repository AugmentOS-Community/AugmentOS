package com.augmentos.asg_client.receiver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import com.augmentos.asg_client.AsgClientService;

public class OtaHeartbeatReceiver extends BroadcastReceiver {
    private static final String TAG = "OtaHeartbeatReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if ("com.augmentos.otaupdater.ACTION_HEARTBEAT".equals(intent.getAction())) {
            Log.d(TAG, "Received OTA heartbeat");

            // Send acknowledgment back to OTA updater
            Intent ackIntent = new Intent("com.augmentos.asg_client.ACTION_HEARTBEAT_ACK");
            ackIntent.setPackage("com.augmentos.otaupdater");
            context.sendBroadcast(ackIntent);

            Log.d(TAG, "Sent heartbeat acknowledgment");
        }
    }
} 