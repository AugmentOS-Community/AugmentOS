package com.augmentos.augmentos_core.smarterglassesmanager.camera;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.util.Log;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

import com.augmentos.augmentos_core.R;
import com.pedro.encoder.input.video.CameraHelper;
import com.pedro.rtmp.utils.ConnectCheckerRtmp;
import com.pedro.rtplibrary.rtmp.RtmpCamera2;
import com.pedro.rtplibrary.rtmp.RtmpCamera2.*;
import com.pedro.rtplibrary.view.OffScreenGlThread;
import com.pedro.rtplibrary.view.OpenGlView;
import com.pedro.rtplibrary.view.TakePhotoCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Service for recording and streaming using rtmp-rtsp-stream-client-java (2.1.3).
 */
public class CameraRecordingService extends Service implements ConnectCheckerRtmp {

    private static final String TAG = "CameraRecordingService";
    private static final String CHANNEL_ID = "CameraRecordingServiceChannel";
    private static final int NOTIFICATION_ID = 1;

    // Intent action definitions
    public static final String ACTION_START = "com.augmentos.camera.ACTION_START";
    public static final String ACTION_STREAM = "com.augmentos.camera.ACTION_STREAM";
    public static final String ACTION_RECORD = "com.augmentos.camera.ACTION_RECORD";
    public static final String ACTION_STOP = "com.augmentos.camera.ACTION_STOP";
    public static final String ACTION_TAKE_PHOTO = "com.augmentos.camera.ACTION_TAKE_PHOTO";
    public static final String EXTRA_PHOTO_FILE_PATH = "com.augmentos.camera.EXTRA_PHOTO_FILE_PATH";
    public static final String EXTRA_RTMP_URL = "com.augmentos.camera.EXTRA_RTMP_URL";

    private RtmpCamera2 rtmpCamera2;
    private OpenGlView glView;

    private boolean isStreaming = false;
    private boolean isRecording = false;
    private String currentRtmpUrl = "";

    // ------------------------------------------------------------------------
    // Retry configuration
    // ------------------------------------------------------------------------
    private static final int MAX_RETRIES = 5;       // how many times we’ll attempt to reconnect
    private static final int RETRY_DELAY_MS = 2000; // how long to wait before a retry (2 seconds)
    private int currentRetryCount = 0;              // tracks how many times we’ve retried so far

    // If you’d prefer exponential backoff, you can store a multiplier factor:
     private static final int INITIAL_RETRY_DELAY_MS = 6000;
     private static final int BACKOFF_FACTOR = 2;

     private int videoWidth = 1280;
     private int videoHeight = 720;
     private int videoFps = 30;
     private int videoBitrate = 2000 * 1024; // (2 Mbps)
    private int videoRotation = 0;
    private int audioBitrate = 128 * 1024;
    private int audioSampleRate = 44100;
    private boolean audioStereo = true;
    private boolean audioEchoCanceller = false;
    private boolean audioNoiseSuppressor = false;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "Service onCreate");
        createNotificationChannel();

        // Create an off-screen OpenGlView for preview
        //glView = new OpenGlView(this);

        rtmpCamera2 = new RtmpCamera2(getApplicationContext(), true, this);

        prepareCameraAndAudio();
    }

    private void prepareCameraAndAudio() {
        // Prepare video: width, height, fps, bitrate, hardwareRotation, rotation, camera facing
        boolean videoPrepared = rtmpCamera2.prepareVideo(
                1280,            // width
                720,             // height
                30,              // fps
                2000 * 1024,     // bitrate (2 Mbps)
               // false,           // hardwareRotation
                0              // rotation (0, 90, 180, 270)
                //CameraHelper.Facing.BACK
        );
        if (!videoPrepared) {
            Log.e(TAG, "Failed to prepare video");
        }

        // Prepare audio: bitrate, sample rate, stereo, echo canceller, noise suppressor
        boolean audioPrepared = rtmpCamera2.prepareAudio(
                128 * 1024,      // audio bitrate
                44100,           // sample rate
                true,            // stereo
                false,           // echo canceller
                false            // noise suppressor
        );
        if (!audioPrepared) {
            Log.e(TAG, "Failed to prepare audio");
        }

        // Start the camera preview (even if off-screen) so the camera is active
        rtmpCamera2.startPreview();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) {
            return START_STICKY;
        }

        switch (intent.getAction()) {
            case ACTION_START:
                showNotification("Camera Preview", "Camera is active (preview only).");
                break;

            case ACTION_STREAM:
                currentRtmpUrl = intent.getStringExtra(EXTRA_RTMP_URL);
                startStream(currentRtmpUrl);
                break;

            case ACTION_RECORD:
                startLocalRecording();
                break;

            case ACTION_STOP:
                stopAll();
                break;
            case ACTION_TAKE_PHOTO:
                String filePath = intent.getStringExtra(EXTRA_PHOTO_FILE_PATH);
                takePhoto(filePath);
                break;
        }
        return START_STICKY;
    }

    private void startStream(String rtmpUrl) {
        if (rtmpCamera2.isStreaming()) {
            Log.w(TAG, "Already streaming");
            return;
        }
        if (rtmpCamera2.isRecording()) {
            Log.d(TAG, "Starting streaming while recording locally...");
        }

        currentRetryCount = 0;

        rtmpCamera2.startStream(rtmpUrl);
        isStreaming = true;
        showNotification("Streaming", "Live streaming to: " + rtmpUrl);
    }

    private void rePrepareEncoders() {
        // Stop preview if running
        if (rtmpCamera2.isOnPreview()) {
            rtmpCamera2.stopPreview();
        }
        // Re-start preview with fresh encoders
        boolean videoPrepared = rtmpCamera2.prepareVideo(
                1280, 720, 30, 2000 * 1024, 0
        );
        if (!videoPrepared) {
            Log.e(TAG, "Failed to re-prepare video");
        }

        boolean audioPrepared = rtmpCamera2.prepareAudio(
                128 * 1024, 44100, true, false, false
        );
        if (!audioPrepared) {
            Log.e(TAG, "Failed to re-prepare audio");
        }
        rtmpCamera2.startPreview();
    }
    private void attemptRetry(String failureReason) {
        if (currentRetryCount < MAX_RETRIES) {
            currentRetryCount++;
            //long delay = RETRY_DELAY_MS;

            // If you want exponential backoff, do something like:
            long delay = (long) (INITIAL_RETRY_DELAY_MS * Math.pow(BACKOFF_FACTOR, currentRetryCount - 1));

            Log.w(TAG, String.format(
                    "Stream failed (%s). Retrying %d/%d in %d ms...",
                    failureReason, currentRetryCount, MAX_RETRIES, delay
            ));

            new Handler(getMainLooper()).postDelayed(() -> {
                if (!rtmpCamera2.isStreaming()) {
                    // Re-prepare the encoders
                    rePrepareEncoders();

                    // Now start the stream again
                    rtmpCamera2.startStream(currentRtmpUrl);
                    isStreaming = true;
                    //showNotification("Streaming", "Reconnecting...");
                }
            }, delay);

        } else {
            // We've hit max retries, show a final toast and stop the stream
            Log.e(TAG, "Max retries reached. Giving up on streaming.");
            stopAll(); // Or just stop streaming without stopping entire service: up to you.
        }
    }

    private void startLocalRecording() {
        if (rtmpCamera2.isRecording()) {
            Log.w(TAG, "Already recording locally!");
            return;
        }
        // Create a file path for the recording
        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        String filePath = getExternalFilesDir(null) + File.separator + "VID_" + timeStamp + ".mp4";

        try {
            rtmpCamera2.startRecord(filePath);
            isRecording = true;
            // showNotification("Recording", "Recording to: " + filePath);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private void takePhoto(String filePath) {
        if (filePath == null || filePath.isEmpty()) {
            // Construct a default file path if none provided
            String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
            filePath = getExternalFilesDir(null) + File.separator + "IMG_" + timeStamp + ".jpg";
        }

        String finalFilePath = filePath;
        rtmpCamera2.getGlInterface().takePhoto(bitmap -> {
            if (bitmap == null) {
                Log.e(TAG, "takePhoto() returned a null Bitmap");
                return;
            }
            // Save the bitmap to the filePath as a JPEG
            File file = new File(finalFilePath);
            FileOutputStream fos = null;
            try {
                fos = new FileOutputStream(file);
                bitmap.compress(Bitmap.CompressFormat.JPEG, 100, fos);
                fos.flush();
                Log.d(TAG, "Photo saved to: " + file.getAbsolutePath());
            } catch (IOException e) {
                Log.e(TAG, "Error saving photo", e);
            } finally {
                if (fos != null) {
                    try {
                        fos.close();
                    } catch (IOException ignored) { }
                }
            }
        });
    }


    private void stopAll() {
        Log.d(TAG, "Stopping stream, recording, and preview");
        if (rtmpCamera2.isStreaming()) {
            rtmpCamera2.stopStream();
            isStreaming = false;
        }
        if (rtmpCamera2.isRecording()) {
            rtmpCamera2.stopRecord();
            isRecording = false;
        }
        if (rtmpCamera2.isOnPreview()) {
            rtmpCamera2.stopPreview();
        }

        showNotification("Stopped", "Streaming and recording have stopped.");
        stopForeground(true);
        stopSelf();
    }

    // -----------------------------------------------------------------------------------
    // ConnectCheckerRtmp callback methods
    // -----------------------------------------------------------------------------------

    @Override
    public void onConnectionStartedRtmp(@NonNull String rtmpUrl) {
        Log.d(TAG, "RTMP connection started: " + rtmpUrl);
    }

    @Override
    public void onConnectionSuccessRtmp() {
        Log.d(TAG, "RTMP connection successful");
        currentRetryCount = 0;
    }

    @Override
    public void onConnectionFailedRtmp(@NonNull String reason) {
        Log.e(TAG, "RTMP connection failed: " + reason);
        if (rtmpCamera2.isStreaming()) {
            rtmpCamera2.stopStream();
            isStreaming = false;
        }

        attemptRetry(reason);
    }

    @Override
    public void onNewBitrateRtmp(long bitrate) {
        Log.d(TAG, "New bitrate: " + bitrate + " bps");
    }

    @Override
    public void onDisconnectRtmp() {
        Log.d(TAG, "RTMP disconnected");
        isStreaming = false;
        // Toast.makeText(this, "Stream disconnected", Toast.LENGTH_SHORT).show();
    }

    @Override
    public void onAuthErrorRtmp() {
        Log.e(TAG, "RTMP authentication error");
        Log.e(TAG, "RTMP authentication error");
        new Handler(getMainLooper()).post(() -> {
            Toast.makeText(this, "Authentication error", Toast.LENGTH_SHORT).show();
        });
    }

    @Override
    public void onAuthSuccessRtmp() {
        Log.d(TAG, "RTMP authentication successful");
        // Toast.makeText(this, "Authentication successful", Toast.LENGTH_SHORT).show();
    }

    // -----------------------------------------------------------------------------------
    // Notification handling
    // -----------------------------------------------------------------------------------

    private void showNotification(String title, String message) {
        // If you’re targeting Android 13+ and using POST_NOTIFICATIONS, check permission
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            // Permission not granted; do nothing or handle gracefully
            return;
        }
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.unknown_icon3)
                .setContentTitle(title)
                .setContentText(message)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setAutoCancel(false);

        // Start in foreground
        startForeground(NOTIFICATION_ID, builder.build());
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Recording/Streaming Service Channel",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    public static void startStreaming(Context context, String rtmpUrl) {
        Intent intent = new Intent(context, CameraRecordingService.class);
        intent.setAction(ACTION_STREAM);
        intent.putExtra(EXTRA_RTMP_URL, rtmpUrl);
        context.startService(intent);
    }

    public static void stopStreaming(Context context) {
        Intent intent = new Intent(context, CameraRecordingService.class);
        intent.setAction(ACTION_STOP);
        context.startService(intent);
    }

    // Static helpers for recording
    public static void startLocalRecording(Context context) {
        Intent intent = new Intent(context, CameraRecordingService.class);
        intent.setAction(ACTION_RECORD);
        context.startService(intent);
    }

    public static void stopLocalRecording(Context context) {
        Intent intent = new Intent(context, CameraRecordingService.class);
        intent.setAction(ACTION_STOP);
        context.startService(intent);
    }

    public static void takePicture(Context context, String filePath) {
        Intent intent = new Intent(context, CameraRecordingService.class);
        intent.setAction(ACTION_TAKE_PHOTO);
        intent.putExtra(EXTRA_PHOTO_FILE_PATH, filePath);
        context.startService(intent);
    }


    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "Service destroyed, cleaning up");
        stopAll();
        if (rtmpCamera2 != null) {
            rtmpCamera2.stopPreview();
            rtmpCamera2 = null;
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
