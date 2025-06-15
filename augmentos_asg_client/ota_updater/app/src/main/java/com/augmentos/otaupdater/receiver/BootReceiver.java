package com.augmentos.otaupdater.receiver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.augmentos.otaupdater.helper.Constants;
import com.augmentos.otaupdater.helper.OtaHelper;
import com.augmentos.otaupdater.worker.OtaCheckWorker;

import java.util.concurrent.TimeUnit;

/**
 * Created by markiyurtdas on 21.05.2025.
 */
public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = Constants.TAG;
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Constraints constraints = new Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build();

            PeriodicWorkRequest otaWork = new PeriodicWorkRequest.Builder(OtaCheckWorker.class, 15, TimeUnit.MINUTES)
                    .setConstraints(constraints)
                    .build();

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                    Constants.WORK_NAME_OTA_CHECK, ExistingPeriodicWorkPolicy.KEEP, otaWork);
            checkOldApkFile(context);
        }
    }

    private void checkOldApkFile(Context context) {
        new OtaHelper(context).checkOlderApkFile(context);
    }
}