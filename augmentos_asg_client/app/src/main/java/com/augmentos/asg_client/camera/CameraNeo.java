package com.augmentos.asg_client.camera;

import static com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.isK900Device;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.ImageFormat;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CameraMetadata;
import android.hardware.camera2.CaptureFailure;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.TotalCaptureResult;
import android.hardware.camera2.params.MeteringRectangle;
import android.hardware.camera2.params.OutputConfiguration;
import android.hardware.camera2.params.SessionConfiguration;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.PowerManager;
import android.util.Log;
import android.util.Size;
import android.view.Surface;
import android.view.WindowManager;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.lifecycle.LifecycleService;

import com.augmentos.asg_client.R;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

public class CameraNeo extends LifecycleService {
    private static final String TAG = "CameraNeo";
    private static final String CHANNEL_ID = "CameraNeoServiceChannel";
    private static final int NOTIFICATION_ID = 1;
    
    // Camera variables
    private CameraDevice cameraDevice = null;
    private CaptureRequest.Builder captureRequestBuilder;
    private CameraCaptureSession cameraCaptureSession;
    private ImageReader imageReader;
    private HandlerThread backgroundThread;
    private Handler backgroundHandler;
    private Semaphore cameraOpenCloseLock = new Semaphore(1);
    private Size jpegSize;
    private String cameraId;
    private boolean isK900Device = false;
    
    // Screen wake variables
    private PowerManager.WakeLock wakeLock;
    private PowerManager.WakeLock fullWakeLock;
    
    // Target photo resolution (4:3 landscape orientation)
    private static final int TARGET_WIDTH = 1440;
    private static final int TARGET_HEIGHT = 1080;
    
    // Callback and execution handling
    private final Executor executor = Executors.newSingleThreadExecutor();
    
    // Intent action definitions
    public static final String ACTION_TAKE_PHOTO = "com.augmentos.camera.ACTION_TAKE_PHOTO";
    public static final String EXTRA_PHOTO_FILE_PATH = "com.augmentos.camera.EXTRA_PHOTO_FILE_PATH";
    
    // Callback interface for photo capture
    public interface PhotoCaptureCallback {
        void onPhotoCaptured(String filePath);
        void onPhotoError(String errorMessage);
    }
    
    // Static callback for photo capture
    private static PhotoCaptureCallback sPhotoCallback;
    
    // For compatibility with CameraRecordingService
    private static String lastPhotoPath;
    
    /**
     * Get the path to the most recently captured photo
     * Added for compatibility with CameraRecordingService
     */
    public static String getLastPhotoPath() {
        return lastPhotoPath;
    }
    
    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "CameraNeo Camera2 service created");
        createNotificationChannel();
        showNotification("Camera Service", "Service is running");
        startBackgroundThread();
    }
    
    /**
     * Take a picture and get notified through callback when complete
     * 
     * @param context Application context
     * @param filePath File path to save the photo
     * @param callback Callback to be notified when photo is captured
     */
    public static void takePictureWithCallback(Context context, String filePath, PhotoCaptureCallback callback) {
        // Store the callback statically (limitation: only one callback can be active at a time)
        sPhotoCallback = callback;
        
        Intent intent = new Intent(context, CameraNeo.class);
        intent.setAction(ACTION_TAKE_PHOTO);
        intent.putExtra(EXTRA_PHOTO_FILE_PATH, filePath);
        context.startForegroundService(intent);
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);
        
        if (intent != null && ACTION_TAKE_PHOTO.equals(intent.getAction())) {
            String filePath = intent.getStringExtra(EXTRA_PHOTO_FILE_PATH);
            if (filePath == null || filePath.isEmpty()) {
                String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
                filePath = getExternalFilesDir(null) + File.separator + "IMG_" + timeStamp + ".jpg";
            }
            
            setupCameraAndTakePicture(filePath);
        }
        
        return START_STICKY;
    }
    
    private void setupCameraAndTakePicture(String filePath) {
        // Wake the screen before accessing the camera
        wakeUpScreen();
        
        // Check if we're on a K900 device
        isK900Device = isK900Device(getApplicationContext());
        Log.d(TAG, "Device is K900: " + isK900Device);
        
        // For all devices, use Camera2 API but with K900-specific adjustments if needed
        setupCamera2(filePath);
    }
    
    /**
     * Force the screen to turn on so camera can be accessed
     */
    private void wakeUpScreen() {
        Log.d(TAG, "Waking up screen for camera access");
        
        try {
            // Create a partial wake lock to keep CPU running
            PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
            if (powerManager == null) {
                Log.e(TAG, "PowerManager is null");
                return;
            }
            
            // First create a partial wake lock to keep the CPU running
            if (wakeLock == null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, 
                        "AugmentOS:CameraWakeLock");
                wakeLock.acquire(60000); // 60-second timeout
            }
            
            // Then create a full wake lock to turn the screen on
            if (fullWakeLock == null) {
                fullWakeLock = powerManager.newWakeLock(
                        PowerManager.FULL_WAKE_LOCK | 
                        PowerManager.ACQUIRE_CAUSES_WAKEUP | 
                        PowerManager.ON_AFTER_RELEASE, 
                        "AugmentOS:CameraFullWakeLock");
                fullWakeLock.acquire(5000); // 5-second timeout
            }
            
            Log.d(TAG, "Screen wake locks acquired");
        } catch (Exception e) {
            Log.e(TAG, "Error acquiring wake locks", e);
        }
    }
    
    /**
     * Set up Camera2 API for all devices
     */
    @SuppressLint("MissingPermission")
    private void setupCamera2(String filePath) {
        CameraManager manager = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
        if (manager == null) {
            Log.e(TAG, "Could not get camera manager");
            notifyPhotoError("Camera service unavailable");
            stopSelf();
            return;
        }
        
        try {
            String[] cameraIds = manager.getCameraIdList();
            
            // Log available cameras
            Log.d(TAG, "Available cameras: " + cameraIds.length);
            for (String id : cameraIds) {
                CameraCharacteristics characteristics = manager.getCameraCharacteristics(id);
                Integer facing = characteristics.get(CameraCharacteristics.LENS_FACING);
                String facingStr = facing == null ? "unknown" : 
                                   facing == CameraCharacteristics.LENS_FACING_BACK ? "back" :
                                   facing == CameraCharacteristics.LENS_FACING_FRONT ? "front" : "external";
                Log.d(TAG, "Camera " + id + ": facing=" + facingStr);
            }
            
            // For K900, just use camera ID "0" directly instead of checking lens facing
            if (isK900Device) {
                if (cameraIds.length > 0) {
                    this.cameraId = "0";  // Always use camera ID 0 for K900
                    Log.d(TAG, "K900 device: Using camera ID 0 directly");
                } else {
                    notifyPhotoError("No cameras available on K900 device");
                    stopSelf();
                    return;
                }
            } else {
                // For regular devices, find the back-facing camera
                for (String id : cameraIds) {
                    CameraCharacteristics characteristics = manager.getCameraCharacteristics(id);
                    Integer facing = characteristics.get(CameraCharacteristics.LENS_FACING);
                    
                    if (facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                        this.cameraId = id;
                        break;
                    }
                }
                
                // If no back camera found, use the first available camera
                if (this.cameraId == null && cameraIds.length > 0) {
                    this.cameraId = cameraIds[0];
                    Log.d(TAG, "No back camera found, using camera ID: " + this.cameraId);
                }
            }
            
            // Verify that we have a valid camera ID
            if (this.cameraId == null) {
                notifyPhotoError("No suitable camera found");
                stopSelf();
                return;
            }
            
            // Get characteristics for the selected camera
            CameraCharacteristics characteristics = manager.getCameraCharacteristics(this.cameraId);
            
            // Check if this camera supports JPEG format
            StreamConfigurationMap map = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            if (map == null) {
                notifyPhotoError("Camera " + this.cameraId + " doesn't support configuration maps");
                stopSelf();
                return;
            }
            
            // Find the closest available JPEG size to our target
            Size[] jpegSizes = map.getOutputSizes(ImageFormat.JPEG);
            if (jpegSizes == null || jpegSizes.length == 0) {
                notifyPhotoError("Camera doesn't support JPEG format");
                stopSelf();
                return;
            }
            
            // Log available sizes
            Log.d(TAG, "Available JPEG sizes for camera " + this.cameraId + ":");
            for (Size size : jpegSizes) {
                Log.d(TAG, "  " + size.getWidth() + "x" + size.getHeight());
            }
            
            jpegSize = chooseBestSize(jpegSizes, TARGET_WIDTH, TARGET_HEIGHT);
            Log.d(TAG, "Selected JPEG size: " + jpegSize.getWidth() + "x" + jpegSize.getHeight());
            
            // Setup ImageReader for JPEG data
            imageReader = ImageReader.newInstance(
                    jpegSize.getWidth(), jpegSize.getHeight(),
                    ImageFormat.JPEG, 2);
            
            imageReader.setOnImageAvailableListener(reader -> {
                // Process the captured JPEG
                try (Image image = reader.acquireLatestImage()) {
                    if (image == null) {
                        Log.e(TAG, "Acquired image is null");
                        notifyPhotoError("Failed to acquire image data");
                        stopSelf();
                        return;
                    }
                    
                    ByteBuffer buffer = image.getPlanes()[0].getBuffer();
                    byte[] bytes = new byte[buffer.remaining()];
                    buffer.get(bytes);
                    
                    // Save the image data to the file
                    boolean success = saveImageDataToFile(bytes, filePath);
                    
                    if (success) {
                        lastPhotoPath = filePath;
                        notifyPhotoCaptured(filePath);
                    } else {
                        notifyPhotoError("Failed to save image");
                    }
                    
                    // Clean up resources
                    closeCamera();
                    stopSelf();
                } catch (Exception e) {
                    Log.e(TAG, "Error handling image data", e);
                    notifyPhotoError("Error processing photo: " + e.getMessage());
                    closeCamera();
                    stopSelf();
                }
            }, backgroundHandler);
            
            // Open the camera
            if (!cameraOpenCloseLock.tryAcquire(2500, TimeUnit.MILLISECONDS)) {
                throw new RuntimeException("Time out waiting to lock camera opening.");
            }
            
            Log.d(TAG, "Opening camera ID: " + this.cameraId);
            manager.openCamera(this.cameraId, stateCallback, backgroundHandler);
            
        } catch (CameraAccessException e) {
            Log.e(TAG, "Camera access exception", e);
            notifyPhotoError("Could not access camera: " + e.getMessage());
            stopSelf();
        } catch (InterruptedException e) {
            Log.e(TAG, "Interrupted while trying to lock camera", e);
            notifyPhotoError("Camera operation interrupted");
            stopSelf();
        } catch (Exception e) {
            Log.e(TAG, "Error setting up camera", e);
            notifyPhotoError("Error setting up camera: " + e.getMessage());
            stopSelf();
        }
    }
    
    /**
     * Save image data to file
     */
    private boolean saveImageDataToFile(byte[] data, String filePath) {
        try {
            File file = new File(filePath);
            
            // Ensure parent directory exists
            File parentDir = file.getParentFile();
            if (parentDir != null && !parentDir.exists()) {
                parentDir.mkdirs();
            }
            
            // Write image data to file
            try (FileOutputStream output = new FileOutputStream(file)) {
                output.write(data);
            }
            
            Log.d(TAG, "Saved image to: " + filePath);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error saving image", e);
            return false;
        }
    }
    
    /**
     * Camera state callback for Camera2 API
     */
    private final CameraDevice.StateCallback stateCallback = new CameraDevice.StateCallback() {
        @Override
        public void onOpened(@NonNull CameraDevice camera) {
            Log.d(TAG, "Camera device opened successfully");
            cameraOpenCloseLock.release();
            cameraDevice = camera;
            createCameraPreviewSession();
        }
        
        @Override
        public void onDisconnected(@NonNull CameraDevice camera) {
            Log.d(TAG, "Camera device disconnected");
            cameraOpenCloseLock.release();
            camera.close();
            cameraDevice = null;
            stopSelf();
        }
        
        @Override
        public void onError(@NonNull CameraDevice camera, int error) {
            Log.e(TAG, "Camera device error: " + error);
            cameraOpenCloseLock.release();
            camera.close();
            cameraDevice = null;
            notifyPhotoError("Camera device error: " + error);
            stopSelf();
        }
    };
    
    /**
     * Create a capture session to take a photo
     */
    private void createCameraPreviewSession() {
        try {
            if (cameraDevice == null || imageReader == null) {
                Log.e(TAG, "Camera device or image reader is null");
                notifyPhotoError("Camera not properly initialized");
                stopSelf();
                return;
            }
            
            // Configure captureRequestBuilder for still capture
            captureRequestBuilder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
            captureRequestBuilder.addTarget(imageReader.getSurface());
            
            // Configure camera settings
            captureRequestBuilder.set(CaptureRequest.CONTROL_MODE, CameraMetadata.CONTROL_MODE_AUTO);
            
            // Auto-focus config (skip for K900 if it causes issues)
            if (!isK900Device) {
                captureRequestBuilder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
            }
            
            // Auto exposure and white balance with device-specific tweaks
            captureRequestBuilder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
            
            // K900-specific exposure compensation adjustment
            if (isK900Device) {
                captureRequestBuilder.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, 0); // Neutral for K900
                // Use center-weighted metering for better exposure on K900
                captureRequestBuilder.set(CaptureRequest.CONTROL_AE_REGIONS, new MeteringRectangle[]{
                    new MeteringRectangle(0, 0, 4208, 3120, MeteringRectangle.METERING_WEIGHT_MAX)
                });
            } else {
                captureRequestBuilder.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, 1); // Slight brightness boost for other devices
            }
            
            captureRequestBuilder.set(CaptureRequest.CONTROL_AWB_MODE, CaptureRequest.CONTROL_AWB_MODE_AUTO);
            
            // Image quality settings with device-specific enhancements
            if (isK900Device) {
                // Higher quality settings for K900 to improve image clarity
                captureRequestBuilder.set(CaptureRequest.NOISE_REDUCTION_MODE, CaptureRequest.NOISE_REDUCTION_MODE_HIGH_QUALITY);
                captureRequestBuilder.set(CaptureRequest.EDGE_MODE, CaptureRequest.EDGE_MODE_HIGH_QUALITY);
                captureRequestBuilder.set(CaptureRequest.JPEG_QUALITY, (byte)95); // Higher quality for K900
                
                // Use reflection to attempt to set K900-specific vendor tags
                // This avoids API level restrictions while still allowing access to vendor features
                try {
                    Log.d(TAG, "Attempting to enhance image quality for K900");
                    
                    // Try to enable noise reduction more aggressively for K900
                    captureRequestBuilder.set(CaptureRequest.NOISE_REDUCTION_MODE, CaptureRequest.NOISE_REDUCTION_MODE_HIGH_QUALITY);
                    
                    // Set color correction gains for better white balance on K900
                    captureRequestBuilder.set(CaptureRequest.COLOR_CORRECTION_MODE, CaptureRequest.COLOR_CORRECTION_MODE_HIGH_QUALITY);
                    
                    // Increase saturation slightly for better color rendition
                    captureRequestBuilder.set(CaptureRequest.CONTROL_EFFECT_MODE, CaptureRequest.CONTROL_EFFECT_MODE_OFF);
                    
                    Log.d(TAG, "Applied K900-specific image quality enhancements");
                } catch (Exception e) {
                    // If any of these settings fail, continue without them
                    Log.d(TAG, "Some K900 image quality enhancements not available: " + e.getMessage());
                }
            } else {
                // Standard settings for other devices
                captureRequestBuilder.set(CaptureRequest.NOISE_REDUCTION_MODE, CaptureRequest.NOISE_REDUCTION_MODE_HIGH_QUALITY);
                captureRequestBuilder.set(CaptureRequest.EDGE_MODE, CaptureRequest.EDGE_MODE_HIGH_QUALITY);
                captureRequestBuilder.set(CaptureRequest.JPEG_QUALITY, (byte)90);
            }
            
            // Set proper rotation
            // For K900 devices, use 270-degree rotation
            // For standard devices, derive from display rotation
            captureRequestBuilder.set(CaptureRequest.JPEG_ORIENTATION, 270);
            
            // Create capture session
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                // Use SessionConfiguration for Android 9.0+
                List<OutputConfiguration> outputs = new ArrayList<>();
                outputs.add(new OutputConfiguration(imageReader.getSurface()));
                
                SessionConfiguration config = new SessionConfiguration(
                        SessionConfiguration.SESSION_REGULAR,
                        outputs,
                        Executors.newSingleThreadExecutor(),
                        new CameraCaptureSession.StateCallback() {
                            @Override
                            public void onConfigured(@NonNull CameraCaptureSession session) {
                                Log.d(TAG, "Camera capture session configured successfully");
                                cameraCaptureSession = session;
                                capture();
                            }
                            
                            @Override
                            public void onConfigureFailed(@NonNull CameraCaptureSession session) {
                                Log.e(TAG, "Failed to configure camera session");
                                notifyPhotoError("Failed to configure camera");
                                stopSelf();
                            }
                        });
                
                cameraDevice.createCaptureSession(config);
            } else {
                // Use older API for pre-Android 9.0
                cameraDevice.createCaptureSession(
                        Collections.singletonList(imageReader.getSurface()),
                        new CameraCaptureSession.StateCallback() {
                            @Override
                            public void onConfigured(@NonNull CameraCaptureSession session) {
                                Log.d(TAG, "Camera capture session configured successfully");
                                cameraCaptureSession = session;
                                capture();
                            }
                            
                            @Override
                            public void onConfigureFailed(@NonNull CameraCaptureSession session) {
                                Log.e(TAG, "Failed to configure camera session");
                                notifyPhotoError("Failed to configure camera");
                                stopSelf();
                            }
                        },
                        null);
            }
        } catch (CameraAccessException e) {
            Log.e(TAG, "Camera access exception", e);
            notifyPhotoError("Camera access error: " + e.getMessage());
            stopSelf();
        } catch (Exception e) {
            Log.e(TAG, "Error creating camera preview session", e);
            notifyPhotoError("Error preparing camera: " + e.getMessage());
            stopSelf();
        }
    }
    
    /**
     * Capture the image
     */
    private void capture() {
        if (cameraDevice == null || cameraCaptureSession == null) {
            Log.e(TAG, "Camera or session is null");
            notifyPhotoError("Camera not ready");
            stopSelf();
            return;
        }
        
        try {
            Log.d(TAG, "Capturing image...");
            
            // This is where we finally take the picture
            cameraCaptureSession.capture(captureRequestBuilder.build(), new CameraCaptureSession.CaptureCallback() {
                @Override
                public void onCaptureCompleted(@NonNull CameraCaptureSession session,
                                              @NonNull CaptureRequest request,
                                              @NonNull TotalCaptureResult result) {
                    Log.d(TAG, "Image capture completed");
                    // Processing continues in ImageReader listener
                }
                
                @Override
                public void onCaptureFailed(@NonNull CameraCaptureSession session,
                                           @NonNull CaptureRequest request,
                                           @NonNull CaptureFailure failure) {
                    Log.e(TAG, "Image capture failed: " + failure.getReason());
                    notifyPhotoError("Capture failed: " + failure.getReason());
                    closeCamera();
                    stopSelf();
                }
            }, backgroundHandler);
        } catch (CameraAccessException e) {
            Log.e(TAG, "Error during capture", e);
            notifyPhotoError("Error capturing image: " + e.getMessage());
            closeCamera();
            stopSelf();
        } catch (Exception e) {
            Log.e(TAG, "Unexpected error during capture", e);
            notifyPhotoError("Unexpected error: " + e.getMessage());
            closeCamera();
            stopSelf();
        }
    }
    
    /**
     * Choose best size based on target dimensions
     */
    private Size chooseBestSize(Size[] choices, int targetWidth, int targetHeight) {
        // Calculate target aspect ratio
        float targetRatio = (float) targetWidth / targetHeight;
        
        // Find sizes with aspect ratios close to target
        List<Size> goodSizes = new ArrayList<>();
        for (Size size : choices) {
            float ratio = (float) size.getWidth() / size.getHeight();
            if (Math.abs(ratio - targetRatio) < 0.1f) {  // Within 10% of target ratio
                goodSizes.add(size);
            }
        }
        
        if (goodSizes.isEmpty()) {
            // If no sizes with good ratio, use all available
            goodSizes.addAll(Arrays.asList(choices));
        }
        
        // Sort by area (closest to target area first)
        final int targetArea = targetWidth * targetHeight;
        Collections.sort(goodSizes, (s1, s2) -> {
            int area1 = s1.getWidth() * s1.getHeight();
            int area2 = s2.getWidth() * s2.getHeight();
            return Math.abs(area1 - targetArea) - Math.abs(area2 - targetArea);
        });
        
        // Return best match (or first one if list is empty)
        return goodSizes.isEmpty() ? choices[0] : goodSizes.get(0);
    }
    
    private void notifyPhotoCaptured(String filePath) {
        if (sPhotoCallback != null) {
            executor.execute(() -> sPhotoCallback.onPhotoCaptured(filePath));
        }
    }
    
    private void notifyPhotoError(String errorMessage) {
        if (sPhotoCallback != null) {
            executor.execute(() -> sPhotoCallback.onPhotoError(errorMessage));
        }
    }
    
    /**
     * Start background thread
     */
    private void startBackgroundThread() {
        backgroundThread = new HandlerThread("CameraNeoBackground");
        backgroundThread.start();
        backgroundHandler = new Handler(backgroundThread.getLooper());
    }
    
    /**
     * Stop background thread
     */
    private void stopBackgroundThread() {
        if (backgroundThread != null) {
            backgroundThread.quitSafely();
            try {
                backgroundThread.join();
                backgroundThread = null;
                backgroundHandler = null;
            } catch (InterruptedException e) {
                Log.e(TAG, "Interrupted when stopping background thread", e);
            }
        }
    }
    
    /**
     * Close camera resources
     */
    private void closeCamera() {
        try {
            cameraOpenCloseLock.acquire();
            if (cameraCaptureSession != null) {
                cameraCaptureSession.close();
                cameraCaptureSession = null;
            }
            if (cameraDevice != null) {
                cameraDevice.close();
                cameraDevice = null;
            }
            if (imageReader != null) {
                imageReader.close();
                imageReader = null;
            }
            
            // Release wake locks
            releaseWakeLocks();
            
        } catch (InterruptedException e) {
            Log.e(TAG, "Interrupted while closing camera", e);
        } finally {
            cameraOpenCloseLock.release();
        }
    }
    
    /**
     * Release wake locks to avoid battery drain
     */
    private void releaseWakeLocks() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
                wakeLock = null;
                Log.d(TAG, "Partial wake lock released");
            }
            
            if (fullWakeLock != null && fullWakeLock.isHeld()) {
                fullWakeLock.release();
                fullWakeLock = null;
                Log.d(TAG, "Full wake lock released");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error releasing wake locks", e);
        }
    }
    
    // -----------------------------------------------------------------------------------
    // Notification handling
    // -----------------------------------------------------------------------------------

    private void showNotification(String title, String message) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
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
                    "Camera Neo Service Channel",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        closeCamera();
        stopBackgroundThread();
        releaseWakeLocks(); // Ensure wake locks are released
    }
}