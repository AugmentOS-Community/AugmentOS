package com.augmentos.otaupdater.worker;

import android.content.Context;
import android.content.Intent;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.augmentos.otaupdater.helper.Constants;

public class OtaHeartbeatWorker extends Worker {
    private static final String TAG = Constants.TAG;

    public OtaHeartbeatWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "Sending OTA heartbeat");
        
        // Send heartbeat broadcast to ASG client
        Intent heartbeatIntent = new Intent("com.augmentos.otaupdater.ACTION_HEARTBEAT");
        heartbeatIntent.setPackage("com.augmentos.asg_client");
        getApplicationContext().sendBroadcast(heartbeatIntent);
        
        return Result.success();
    }
} 