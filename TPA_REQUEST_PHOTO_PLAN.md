# K900 Photo Button Functionality Plan

## Overview
Implement a comprehensive photo capture and upload system for K900 devices that properly handles the hardware button press event, ensuring photos are managed whether the device is online or offline, by leveraging the existing photo request infrastructure.

## Requirements

### Button Press Handling Flow
1. When K900 button is pressed:
   - K900 makes direct REST API call to cloud server
   - Server checks if any apps are subscribed to button press event
   - If apps are subscribed, server returns 200 OK (apps will be notified via websocket through the phone)
   - If no apps are subscribed, server returns JSON response with `{"action": "take_photo", "requestId": "xyz123", "saveToGallery": true}`
   - K900 takes photo and uploads directly to server when instructed
   - If connection to server fails, K900 takes photo locally and queues for later upload

### Server-Side Logic
- New REST endpoint to receive button press events from K900
- Check session's TPAs for button press subscriptions
- Forward button press to subscribed TPAs via websocket if needed
- Generate photo request details directly in REST response when no TPAs are subscribed
- Handle photo upload and gallery storage

### Offline Mode (Client-Side)
- Queue photos when offline
- Upload when WiFi becomes available
- Manage storage and retry logic

### Storage Management
- Check available storage before saving photos locally
- Implement storage threshold warnings
- Implement cleanup policies for old queued photos

### Persistent Queue for Offline Photos
- Queue should persist between reboots
- Use filesystem-based approach:
  - Directory for queued photos
  - JSON file tracking upload status
- Periodically check if queued photos are already on server
  - Upload if not present
  - Delete if already present

### Retry Mechanism
- Implement exponential backoff for failed uploads
- Set maximum retry attempts
- Log and notify user of persistently failing uploads

### Upload Progress Tracking
- Report upload status to augmentos_manager
- Include:
  - Number of photos in queue
  - Current upload progress
  - Success/failure notifications
- Allow user to see queued photos in augmentos_manager

## Implementation Phases

### Phase 1: Button Press REST Endpoint
- Add new REST endpoint in cloud for K900 button press events
- Implement authentication via coretoken
- Modify parseK900Command to send REST API call to server
- Implement response handling for take_photo instructions
- Implement local photo capture for offline mode

### Phase 2: Server-Side Logic
- Implement subscription checking for button events
- Add photo request generation logic
- Update gallery storage functionality
- Track photo uploads with requestId

### Phase 3: Offline Support
- Implement photo queue manager
- Create persistent storage system for queued photos
- Implement WiFi connectivity monitoring
- Add upload service for queued photos

### Phase 4: UX and Optimization
- Add progress reporting to augmentos_manager
- Implement storage checks and warnings
- Optimize battery usage
- Fine-tune retry logic

## Implementation Details

### 1. K900 Command Handler (Client-Side)
```java
public void parseK900Command(String command) {
    switch (command) {
        case "cs_pho":
            Log.d(TAG, "📦 Payload is cs_pho");
            handlePhotoButtonPress();
            break;
            
        // ... other cases
    }
}

private void handlePhotoButtonPress() {
    // Get core token for authentication
    String coreToken = PreferenceManager.getDefaultSharedPreferences(this)
            .getString("core_token", "");
    
    if (TextUtils.isEmpty(coreToken)) {
        Log.e(TAG, "No core token available, taking photo locally");
        takePhotoLocally();
        return;
    }
    
    // Prepare REST API call
    try {
        String buttonPressUrl = BuildConfig.CLOUD_BASE_URL + "/api/button-press";
        
        JSONObject buttonPressPayload = new JSONObject();
        buttonPressPayload.put("buttonId", "photo");
        buttonPressPayload.put("pressType", "short");
        buttonPressPayload.put("deviceId", deviceId);
        
        // Make REST API call with timeout
        OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .writeTimeout(5, TimeUnit.SECONDS)
            .readTimeout(5, TimeUnit.SECONDS)
            .build();
        
        RequestBody requestBody = RequestBody.create(
            MediaType.parse("application/json"), 
            buttonPressPayload.toString()
        );
        
        Request request = new Request.Builder()
            .url(buttonPressUrl)
            .addHeader("Authorization", "Bearer " + coreToken)
            .post(requestBody)
            .build();
        
        // Execute request asynchronously
        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "Failed to send button press event", e);
                // Connection failed, take photo locally
                takePhotoLocally();
            }
            
            @Override
            public void onResponse(Call call, Response response) {
                try {
                    if (!response.isSuccessful()) {
                        Log.e(TAG, "Server returned error: " + response.code());
                        // Server error, take photo locally
                        takePhotoLocally();
                        return;
                    }
                    
                    // Parse response
                    String responseBody = response.body().string();
                    JSONObject jsonResponse = new JSONObject(responseBody);
                    
                    // Check if we need to take a photo
                    if ("take_photo".equals(jsonResponse.optString("action"))) {
                        String requestId = jsonResponse.optString("requestId");
                        boolean saveToGallery = jsonResponse.optBoolean("saveToGallery", true);
                        
                        Log.d(TAG, "Server requesting photo with requestId: " + requestId);
                        
                        // Take photo and upload directly to server
                        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
                        String photoFilePath = getExternalFilesDir(null) + File.separator + "IMG_" + timeStamp + ".jpg";
                        takePhotoAndUpload(photoFilePath, requestId, saveToGallery);
                    } else {
                        Log.d(TAG, "Button press handled by server, no photo needed");
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error processing server response", e);
                    takePhotoLocally();
                } finally {
                    response.close();
                }
            }
        });
    } catch (Exception e) {
        Log.e(TAG, "Error preparing button press request", e);
        // Something went wrong, take photo locally
        takePhotoLocally();
    }
}

private void takePhotoLocally() {
    // Check storage before taking photo
    if (!hasEnoughStorage()) {
        Log.e(TAG, "Not enough storage to save photo");
        return;
    }
    
    String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
    String photoFilePath = getExternalFilesDir(null) + File.separator + "IMG_" + timeStamp + ".jpg";
    
    // Take photo and queue for later upload
    takePhotoAndQueueForUpload(photoFilePath);
}

private void takePhotoAndUpload(String photoFilePath, String requestId, boolean saveToGallery) {
    // Take the photo
    CameraRecordingService.takePicture(getApplicationContext(), photoFilePath, 
        new CameraRecordingService.PictureCallback() {
            @Override
            public void onPictureTaken(boolean success, String filePath) {
                if (success) {
                    // Upload directly to server
                    uploadPhotoToServer(filePath, requestId, saveToGallery);
                } else {
                    Log.e(TAG, "Failed to take photo");
                }
            }
        });
}

private void uploadPhotoToServer(String photoFilePath, String requestId, boolean saveToGallery) {
    // Get core token
    String coreToken = PreferenceManager.getDefaultSharedPreferences(this)
            .getString("core_token", "");
    
    if (TextUtils.isEmpty(coreToken)) {
        Log.e(TAG, "No core token available for upload");
        // Queue the photo for later
        PhotoQueueManager queueManager = new PhotoQueueManager(this);
        queueManager.queuePhoto(photoFilePath);
        return;
    }
    
    // Create a thread to handle the upload
    new Thread(() -> {
        try {
            File photoFile = new File(photoFilePath);
            if (!photoFile.exists()) {
                Log.e(TAG, "Photo file does not exist: " + photoFilePath);
                return;
            }
            
            String uploadUrl = BuildConfig.CLOUD_BASE_URL + "/api/upload-pov-photo";
            
            OkHttpClient client = new OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .build();
            
            RequestBody requestBody = new MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("requestId", requestId)
                .addFormDataPart("appId", "system")
                .addFormDataPart("save_to_gallery", String.valueOf(saveToGallery))
                .addFormDataPart("photo", photoFile.getName(),
                    RequestBody.create(MediaType.parse("image/jpeg"), photoFile))
                .build();
                
            Request request = new Request.Builder()
                .url(uploadUrl)
                .addHeader("Authorization", "Bearer " + coreToken)
                .post(requestBody)
                .build();
                
            Response response = client.newCall(request).execute();
            if (!response.isSuccessful()) {
                Log.e(TAG, "Upload failed with status: " + response.code());
                // Queue for later retry
                PhotoQueueManager queueManager = new PhotoQueueManager(getApplicationContext());
                queueManager.queuePhoto(photoFilePath);
            } else {
                Log.d(TAG, "Photo uploaded successfully");
                // Delete the temporary file
                photoFile.delete();
            }
            response.close();
        } catch (Exception e) {
            Log.e(TAG, "Error uploading photo", e);
            // Queue for later retry
            PhotoQueueManager queueManager = new PhotoQueueManager(getApplicationContext());
            queueManager.queuePhoto(photoFilePath);
        }
    }).start();
}
```

### 2. Server-Side Button Press Endpoint
```typescript
// In API routes file (e.g., button-press.routes.ts)

import { Router } from 'express';
import { authenticateCoreToken } from '../middleware/core-auth.middleware';
import { WebSocketService } from '../services/core/websocket.service';
import { GlassesToCloudMessageType } from '@augmentos/sdk';

const router = Router();

// Inject dependencies
export const createButtonPressRoutes = (
  webSocketService: WebSocketService
) => {
  // Endpoint to handle button press events from K900
  router.post('/button-press', authenticateCoreToken, async (req, res) => {
    try {
      const { buttonId, pressType, deviceId } = req.body;
      const userId = req.user.id; // From auth middleware
      
      // Only handle photo button for now
      if (buttonId !== 'photo') {
        return res.status(200).json({ success: true, message: 'Button press acknowledged' });
      }
      
      // Check if any TPAs are subscribed to this button event
      const hasSubscribers = webSocketService.hasButtonPressSubscribers(userId, buttonId);
      
      if (hasSubscribers) {
        // Forward button press to subscribed TPAs via websocket
        const buttonPressEvent = {
          type: GlassesToCloudMessageType.BUTTON_PRESS,
          buttonId,
          pressType,
          timestamp: Date.now()
        };
        
        webSocketService.broadcastButtonPressToTpas(userId, buttonPressEvent);
        
        // Just acknowledge, no photo needed
        return res.status(200).json({ success: true, message: 'Button press forwarded to apps' });
      } else {
        // No apps subscribed, instruct K900 to take a photo
        const requestId = generateUniqueId();
        
        // Store this request ID for later validation when the photo is uploaded
        await storeSystemPhotoRequest(requestId, userId);
        
        // Tell K900 to take a photo directly
        return res.status(200).json({ 
          success: true, 
          action: 'take_photo',
          requestId,
          saveToGallery: true
        });
      }
    } catch (error) {
      console.error('Error handling button press:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });
  
  // Helper function to store system photo request
  async function storeSystemPhotoRequest(requestId: string, userId: string) {
    // Store in database or in-memory cache
    // This will be checked when the photo is uploaded
    await db.systemPhotoRequests.create({
      requestId,
      userId,
      timestamp: new Date(),
      status: 'pending'
    });
  }
  
  // Other button-related endpoints could go here
  
  return router;
};
```

### 3. Photo Upload Endpoint (Server-Side)
```typescript
// In photos.routes.ts

// Endpoint for uploading photos from button press
router.post('/upload-pov-photo', authenticateCoreToken, async (req, res) => {
  try {
    const { requestId, appId, save_to_gallery } = req.body;
    const userId = req.user.id; // From auth middleware
    const photo = req.files.photo; // Using a multipart form parser middleware
    
    // Validate the request ID if it's a system request
    if (appId === 'system') {
      const systemRequest = await db.systemPhotoRequests.findOne({
        where: { requestId, userId }
      });
      
      if (!systemRequest) {
        return res.status(400).json({
          success: false,
          error: 'Invalid system photo request'
        });
      }
      
      // Mark as completed
      await systemRequest.update({ status: 'completed' });
    }
    
    // Upload photo to storage
    const photoUrl = await uploadPhotoToStorage(photo);
    
    // If save_to_gallery is true, save to user's gallery
    if (save_to_gallery === 'true' || save_to_gallery === true) {
      await galleryService.saveToGallery({
        userId,
        photoUrl,
        requestId,
        appId: appId || 'system',
        timestamp: new Date(),
        metadata: extractPhotoMetadata(photo)
      });
    }
    
    res.status(200).json({ 
      success: true, 
      photoUrl,
      message: 'Photo uploaded successfully'
    });
  } catch (error) {
    console.error('Error handling photo upload:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
```

### 4. Photo Queue Manager (Client-Side)
```java
public class PhotoQueueManager {
    private static final String TAG = "PhotoQueueManager";
    private static final String QUEUE_FILE = "photo_upload_queue.json";
    private static final String QUEUE_DIRECTORY = "queued_photos";
    private static final long MIN_STORAGE_REQUIRED = 50 * 1024 * 1024; // 50MB
    
    private final Context mContext;
    private final List<QueuedPhoto> mQueuedPhotos = new ArrayList<>();
    
    public PhotoQueueManager(Context context) {
        mContext = context;
        loadQueue();
        
        // Create queue directory if it doesn't exist
        File queueDir = new File(mContext.getFilesDir(), QUEUE_DIRECTORY);
        if (!queueDir.exists()) {
            queueDir.mkdirs();
        }
    }
    
    // Add photo to queue
    public void queuePhoto(String photoPath) {
        // Check storage space
        if (!hasEnoughStorage()) {
            Log.e(TAG, "Not enough storage to save photo");
            return;
        }
        
        // Copy photo to queue directory
        String queuedPath = copyToQueueDirectory(photoPath);
        if (queuedPath == null) {
            return;
        }
        
        // Add to queue
        QueuedPhoto photo = new QueuedPhoto(queuedPath, System.currentTimeMillis());
        mQueuedPhotos.add(photo);
        saveQueue();
        
        // Notify manager app
        notifyQueueUpdate();
    }
    
    // Check if there are queued photos
    public boolean hasQueuedPhotos() {
        return !mQueuedPhotos.isEmpty();
    }
    
    // Get all queued photos
    public List<QueuedPhoto> getQueuedPhotos() {
        return new ArrayList<>(mQueuedPhotos);
    }
    
    // Remove photo from queue
    public void removePhoto(QueuedPhoto photo) {
        mQueuedPhotos.remove(photo);
        saveQueue();
        
        // Notify manager app
        notifyQueueUpdate();
    }
    
    // Update photo in queue
    public void updatePhoto(QueuedPhoto photo) {
        // Find and update the photo
        for (int i = 0; i < mQueuedPhotos.size(); i++) {
            if (mQueuedPhotos.get(i).path.equals(photo.path)) {
                mQueuedPhotos.set(i, photo);
                break;
            }
        }
        saveQueue();
    }
    
    // Check if we have enough storage
    public boolean hasEnoughStorage() {
        File dataDir = mContext.getFilesDir();
        StatFs statFs = new StatFs(dataDir.getPath());
        long availableBytes = statFs.getAvailableBytes();
        return availableBytes > MIN_STORAGE_REQUIRED;
    }
    
    // Copy photo to queue directory
    private String copyToQueueDirectory(String photoPath) {
        try {
            File sourceFile = new File(photoPath);
            File destDir = new File(mContext.getFilesDir(), QUEUE_DIRECTORY);
            File destFile = new File(destDir, sourceFile.getName());
            
            InputStream in = new FileInputStream(sourceFile);
            OutputStream out = new FileOutputStream(destFile);
            
            byte[] buffer = new byte[1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            
            in.close();
            out.close();
            
            return destFile.getAbsolutePath();
        } catch (IOException e) {
            Log.e(TAG, "Error copying photo to queue directory", e);
            return null;
        }
    }
    
    // Process queue when online
    public void processQueue() {
        if (!isWifiConnected() || mQueuedPhotos.isEmpty()) {
            return;
        }
        
        // Start foreground service for upload
        Intent serviceIntent = new Intent(mContext, PhotoUploadService.class);
        ContextCompat.startForegroundService(mContext, serviceIntent);
    }
    
    // Save queue to persistent storage
    private void saveQueue() {
        try {
            JSONArray queueArray = new JSONArray();
            for (QueuedPhoto photo : mQueuedPhotos) {
                JSONObject photoObj = new JSONObject();
                photoObj.put("path", photo.path);
                photoObj.put("timestamp", photo.timestamp);
                photoObj.put("attempts", photo.attempts);
                queueArray.put(photoObj);
            }
            
            File queueFile = new File(mContext.getFilesDir(), QUEUE_FILE);
            FileWriter writer = new FileWriter(queueFile);
            writer.write(queueArray.toString());
            writer.close();
        } catch (Exception e) {
            Log.e(TAG, "Error saving queue", e);
        }
    }
    
    // Load queue from persistent storage
    private void loadQueue() {
        try {
            File queueFile = new File(mContext.getFilesDir(), QUEUE_FILE);
            if (!queueFile.exists()) {
                return;
            }
            
            BufferedReader reader = new BufferedReader(new FileReader(queueFile));
            StringBuilder json = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                json.append(line);
            }
            reader.close();
            
            JSONArray queueArray = new JSONArray(json.toString());
            for (int i = 0; i < queueArray.length(); i++) {
                JSONObject photoObj = queueArray.getJSONObject(i);
                String path = photoObj.getString("path");
                long timestamp = photoObj.getLong("timestamp");
                int attempts = photoObj.optInt("attempts", 0);
                
                QueuedPhoto photo = new QueuedPhoto(path, timestamp);
                photo.attempts = attempts;
                mQueuedPhotos.add(photo);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error loading queue", e);
        }
    }
    
    // Check WiFi connectivity
    private boolean isWifiConnected() {
        ConnectivityManager cm = (ConnectivityManager) mContext.getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
        return activeNetwork != null && activeNetwork.isConnectedOrConnecting() && 
               activeNetwork.getType() == ConnectivityManager.TYPE_WIFI;
    }
    
    // Notify manager app of queue update
    private void notifyQueueUpdate() {
        // Send broadcast to manager app with queue stats
        Intent intent = new Intent("com.augmentos.PHOTO_QUEUE_UPDATED");
        intent.putExtra("queue_size", mQueuedPhotos.size());
        mContext.sendBroadcast(intent);
    }
    
    // Queue item class
    public static class QueuedPhoto {
        public String path;
        public long timestamp;
        public int attempts = 0;
        
        public QueuedPhoto(String path, long timestamp) {
            this.path = path;
            this.timestamp = timestamp;
        }
    }
}
```

### 5. Upload Service for Queued Photos
```java
public class PhotoUploadService extends Service {
    private static final String TAG = "PhotoUploadService";
    private static final int NOTIFICATION_ID = 1001;
    private static final int MAX_RETRY_ATTEMPTS = 3;
    private static final long RETRY_BASE_DELAY = 5000; // 5 seconds
    
    private PhotoQueueManager mQueueManager;
    private boolean mIsUploading = false;
    private int mTotalPhotos = 0;
    private int mUploadedPhotos = 0;
    private int mFailedPhotos = 0;
    
    @Override
    public void onCreate() {
        super.onCreate();
        mQueueManager = new PhotoQueueManager(this);
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, createNotification("Starting photo upload..."));
        
        if (!mIsUploading) {
            mIsUploading = true;
            mTotalPhotos = 0;
            mUploadedPhotos = 0;
            mFailedPhotos = 0;
            new Thread(this::processUploads).start();
        }
        
        return START_STICKY;
    }
    
    private void processUploads() {
        List<PhotoQueueManager.QueuedPhoto> photos = mQueueManager.getQueuedPhotos();
        mTotalPhotos = photos.size();
        
        updateNotification("Preparing to upload " + mTotalPhotos + " photos");
        
        // Check connectivity
        if (!isWifiConnected()) {
            Log.d(TAG, "WiFi not connected, waiting...");
            updateNotification("Waiting for WiFi connection...");
            // Service will be restarted when connectivity changes
            stopSelf();
            return;
        }
        
        for (PhotoQueueManager.QueuedPhoto photo : photos) {
            // Calculate retry delay with exponential backoff
            long delay = photo.attempts > 0 ? RETRY_BASE_DELAY * (1L << (photo.attempts - 1)) : 0;
            if (delay > 0) {
                try {
                    Thread.sleep(delay);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            
            // Generate a unique request ID for this queued photo
            String requestId = "system_queued_" + UUID.randomUUID().toString();
            
            // Update notification
            updateNotification("Uploading photo " + (mUploadedPhotos + 1) + " of " + mTotalPhotos);
            
            // Upload photo
            boolean success = uploadPhotoToServer(photo.path, requestId);
            
            if (success) {
                // Successfully uploaded
                mQueueManager.removePhoto(photo);
                new File(photo.path).delete();
                mUploadedPhotos++;
                updateNotification("Uploaded " + mUploadedPhotos + " of " + mTotalPhotos);
            } else {
                // Failed to upload
                photo.attempts++;
                mQueueManager.updatePhoto(photo);
                
                if (photo.attempts >= MAX_RETRY_ATTEMPTS) {
                    Log.e(TAG, "Max retries reached for photo: " + photo.path);
                    mFailedPhotos++;
                }
            }
        }
        
        // All done
        String finalMessage = "Upload complete. " + mUploadedPhotos + " uploaded";
        if (mFailedPhotos > 0) {
            finalMessage += ", " + mFailedPhotos + " failed";
        }
        updateNotification(finalMessage);
        
        // Stop service after a delay to ensure notification is seen
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            mIsUploading = false;
            stopSelf();
        }, 3000);
    }
    
    private boolean uploadPhotoToServer(String photoPath, String requestId) {
        // Get core token
        String coreToken = PreferenceManager.getDefaultSharedPreferences(this)
                .getString("core_token", "");
        
        if (TextUtils.isEmpty(coreToken)) {
            Log.e(TAG, "No core token available for upload");
            return false;
        }
        
        try {
            // Upload URL
            String uploadUrl = BuildConfig.CLOUD_BASE_URL + "/api/upload-pov-photo";
            
            File photoFile = new File(photoPath);
            if (!photoFile.exists()) {
                Log.e(TAG, "Photo file does not exist: " + photoPath);
                return false;
            }
            
            // Create multipart request
            OkHttpClient client = new OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .build();
            
            RequestBody requestBody = new MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("requestId", requestId)
                .addFormDataPart("appId", "system")
                .addFormDataPart("save_to_gallery", "true")
                .addFormDataPart("photo", photoFile.getName(),
                    RequestBody.create(MediaType.parse("image/jpeg"), photoFile))
                .build();
                
            Request request = new Request.Builder()
                .url(uploadUrl)
                .addHeader("Authorization", "Bearer " + coreToken)
                .post(requestBody)
                .build();
                
            // Execute request synchronously for the service
            Response response = client.newCall(request).execute();
            boolean isSuccessful = response.isSuccessful();
            
            if (!isSuccessful) {
                Log.e(TAG, "Upload failed with status: " + response.code());
            }
            
            response.close();
            return isSuccessful;
        } catch (Exception e) {
            Log.e(TAG, "Error uploading photo", e);
            return false;
        }
    }
    
    // Check WiFi connectivity
    private boolean isWifiConnected() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
        return activeNetwork != null && activeNetwork.isConnectedOrConnecting() && 
               activeNetwork.getType() == ConnectivityManager.TYPE_WIFI;
    }
    
    // Update notification
    private void updateNotification(String message) {
        Notification notification = createNotification(message);
        NotificationManager notificationManager = getSystemService(NotificationManager.class);
        notificationManager.notify(NOTIFICATION_ID, notification);
    }
    
    // Create notification
    private Notification createNotification(String message) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, "photo_upload_channel")
            .setContentTitle("Photo Upload")
            .setContentText(message)
            .setSmallIcon(R.drawable.ic_upload)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true);
            
        return builder.build();
    }
    
    // Create notification channel
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                "photo_upload_channel",
                "Photo Upload",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Used for photo upload progress");
            
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            notificationManager.createNotificationChannel(channel);
        }
    }
    
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
```

### 6. WiFi Connection Receiver
```java
public class ConnectivityReceiver extends BroadcastReceiver {
    private static final String TAG = "ConnectivityReceiver";
    
    @Override
    public void onReceive(Context context, Intent intent) {
        if (ConnectivityManager.CONNECTIVITY_ACTION.equals(intent.getAction())) {
            Log.d(TAG, "Connectivity changed");
            
            ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
            boolean isConnected = activeNetwork != null && activeNetwork.isConnectedOrConnecting();
            boolean isWifi = activeNetwork != null && activeNetwork.getType() == ConnectivityManager.TYPE_WIFI;
            
            if (isConnected && isWifi) {
                Log.d(TAG, "WiFi connected, checking photo queue");
                
                // Check if we have queued photos
                PhotoQueueManager queueManager = new PhotoQueueManager(context);
                if (queueManager.hasQueuedPhotos()) {
                    Log.d(TAG, "Queued photos found, starting upload service");
                    
                    // Start upload service
                    Intent serviceIntent = new Intent(context, PhotoUploadService.class);
                    ContextCompat.startForegroundService(context, serviceIntent);
                }
            }
        }
    }
}
```

## Advantages of This Approach

1. **Direct Communication**: K900 communicates directly with cloud server via REST API
2. **Independent Operation**: K900 handles photo capture and upload without requiring phone connection
3. **Resilient to Phone Connection Issues**: Works even when phone is disconnected from glasses
4. **Clear Response Flow**: Server tells K900 exactly what to do in the response
5. **Offline Support**: Robust queuing system for offline operation
6. **User Experience**: Progress reporting and notifications keep users informed
7. **Future-Proof**: Same approach can be extended to other button types or events