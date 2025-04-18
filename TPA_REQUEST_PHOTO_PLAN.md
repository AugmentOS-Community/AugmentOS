# TPA Photo Request Implementation Plan

This document outlines the plan to implement photo request functionality for third-party apps (TPAs) in AugmentOS.

## Overview

Enable third-party applications to request photos from connected smart glasses, with the following flow:
1. TPA makes a photo request via AugmentOS SDK
2. Request flows through AugmentOS Cloud to the connected device
3. Smart glasses take a photo and upload it to cloud storage
4. Cloud returns the photo URL to the requesting application

## Detailed Implementation Plan

### 1. AugmentOS SDK Enhancement

Add a new request type to the SDK:

```typescript
// In TPA SDK types
enum RequestType {
  // Existing types
  DISPLAY_UPDATE,
  CHANGE_MIC_STATE,
  // New type
  REQUEST_PHOTO,
}

// SDK method
requestPhoto(): Promise<string> // Returns URL to photo
```

### 2. AugmentOS Cloud Updates

#### 2.1. API Endpoint

Create a new WebSocket message handler for photo requests:

```typescript
// In WebSocket message handler
case 'REQUEST_PHOTO':
  if (isAppRunning(message.appId)) {
    const requestId = generateUniqueId();
    const request = {
      type: 'photo_request',
      requestId: requestId,
      appId: message.appId
    };
    
    // Store request in pending requests map
    pendingPhotoRequests.set(requestId, {
      appId: message.appId,
      timestamp: Date.now(),
      resolve: message.resolve,
      reject: message.reject
    });
    
    // Send to client
    sendToClient(clientId, request);
    
    // Set timeout
    setTimeout(() => {
      if (pendingPhotoRequests.has(requestId)) {
        pendingPhotoRequests.get(requestId).reject('Photo request timed out');
        pendingPhotoRequests.delete(requestId);
      }
    }, DEFAULT_PHOTO_TIMEOUT);
  } else {
    message.reject('App not running');
  }
  break;
```

#### 2.2. Photo Upload Endpoint

Create a new REST endpoint to receive and process uploaded photos:

```typescript
// New REST endpoint
app.post('/api/upload-pov-photo', authenticateCoreToken, async (req, res) => {
  const { requestId, photo } = req.body;
  
  if (!pendingPhotoRequests.has(requestId)) {
    return res.status(404).json({ error: 'Photo request not found' });
  }
  
  try {
    // Upload to CDN
    const photoUrl = await uploadToCloudflare(photo);
    
    // Resolve the pending request
    const pendingRequest = pendingPhotoRequests.get(requestId);
    pendingRequest.resolve(photoUrl);
    pendingPhotoRequests.delete(requestId);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process photo' });
  }
});
```

### 3. AugmentOS Core Updates

#### 3.1. Add New Request Handler

Update `ServerCommsCallback` to handle photo requests:

```java
// In ServerCommsCallback implementation
case "photo_request":
    Log.d(TAG, "Received photo request: " + requestId);
    if (mSmartGlassesCommunicator != null) {
        mSmartGlassesCommunicator.requestPhoto(requestId);
    } else {
        sendPhotoRequestFailure(requestId, "No smart glasses connected");
    }
    break;
```

#### 3.2. SmartGlassesCommunicator Abstract Method

Add a new abstract method to `SmartGlassesCommunicator`:

```java
/**
 * Request a photo to be taken by the connected smart glasses
 * @param requestId Unique ID for this photo request
 */
public void requestPhoto(String requestId) {
    // Default empty implementation
    Log.d(TAG, "Photo request not implemented for this device");
    sendPhotoRequestFailure(requestId, "Not supported by this device");
}

protected void sendPhotoRequestFailure(String requestId, String reason) {
    // Send failure response to cloud
    if (mServerComms != null) {
        try {
            JSONObject response = new JSONObject();
            response.put("type", "photo_request_failed");
            response.put("requestId", requestId);
            response.put("reason", reason);
            mServerComms.sendMessage(response.toString());
        } catch (JSONException e) {
            Log.e(TAG, "Error creating photo failure response", e);
        }
    }
}
```

#### 3.3. Photo Upload Service in AugmentOS Core

Add a new service to handle photo uploading:

```java
public class PhotoUploadService {
    private static final String TAG = "PhotoUploadService";
    private static final int TIMEOUT_CONNECT = 30000; // 30 seconds
    private static final int TIMEOUT_WRITE = 60000;   // 60 seconds
    private static final int TIMEOUT_READ = 60000;    // 60 seconds
    
    public interface UploadCallback {
        void onSuccess(String url);
        void onFailure(String errorMessage);
    }
    
    /**
     * Upload a photo to AugmentOS Cloud
     * 
     * @param context Application context
     * @param photoFilePath Path to the photo file
     * @param requestId Request ID associated with this photo
     * @param callback Callback to receive result
     */
    public static void uploadPhoto(Context context, String photoFilePath, String requestId, UploadCallback callback) {
        // Get core token for authentication
        String coreToken = PreferenceManager.getDefaultSharedPreferences(context)
                .getString("core_token", "");
        
        // Create a thread to handle the upload
        new Thread(() -> {
            OkHttpClient client = new OkHttpClient.Builder()
                .connectTimeout(TIMEOUT_CONNECT, TimeUnit.MILLISECONDS)
                .writeTimeout(TIMEOUT_WRITE, TimeUnit.MILLISECONDS)
                .readTimeout(TIMEOUT_READ, TimeUnit.MILLISECONDS)
                .build();
            
            try {
                File photoFile = new File(photoFilePath);
                if (!photoFile.exists()) {
                    handleFailure(callback, "Photo file does not exist: " + photoFilePath);
                    return;
                }
                
                String uploadUrl = BuildConfig.CLOUD_BASE_URL + "/api/upload-pov-photo";
                
                RequestBody requestBody = new MultipartBody.Builder()
                    .setType(MultipartBody.FORM)
                    .addFormDataPart("requestId", requestId)
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
                    handleFailure(callback, "Upload failed with status: " + response.code());
                } else {
                    String responseBody = response.body().string();
                    JSONObject jsonResponse = new JSONObject(responseBody);
                    String photoUrl = jsonResponse.optString("url", "");
                    
                    // Success
                    if (callback != null) {
                        new Handler(Looper.getMainLooper()).post(() -> {
                            callback.onSuccess(photoUrl);
                        });
                    }
                    
                    // Cleanup temporary file
                    photoFile.delete();
                }
                response.close();
            } catch (Exception e) {
                Log.e(TAG, "Error uploading photo", e);
                handleFailure(callback, "Upload error: " + e.getMessage());
            }
        }).start();
    }
    
    private static void handleFailure(UploadCallback callback, String errorMessage) {
        Log.e(TAG, errorMessage);
        if (callback != null) {
            new Handler(Looper.getMainLooper()).post(() -> {
                callback.onFailure(errorMessage);
            });
        }
    }
}
```

### 4. MentraLiveSGC Implementation

Implement the photo request method in `MentraLiveSGC`:

```java
@Override
public void requestPhoto(String requestId) {
    try {
        JSONObject json = new JSONObject();
        json.put("type", "command");
        json.put("command", "camera");
        json.put("action", "take_photo");
        json.put("requestId", requestId);
        sendJson(json);
        Log.d(TAG, "Sent photo request to glasses: " + requestId);
    } catch (JSONException e) {
        Log.e(TAG, "Error creating photo request JSON", e);
        sendPhotoRequestFailure(requestId, "Failed to create request");
    }
}
```

### 5. ASG Client Implementation

#### 5.1. Command Handler

Update `AsgClientService` to handle camera commands:

```java
// In parseJsonCommand method
case "camera":
    String action = commandJson.optString("action");
    if ("take_photo".equals(action)) {
        String requestId = commandJson.optString("requestId");
        takePovPhoto(requestId);
    }
    break;
```

#### 5.2. Photo Capture Function

Implement photo capture and upload using the PhotoUploadService from augmentos_core:

```java
private void takePovPhoto(String requestId) {
    // Create a temporary file path
    File photoDir = new File(getApplicationContext().getFilesDir(), "photos");
    if (!photoDir.exists()) {
        photoDir.mkdirs();
    }
    String photoPath = new File(photoDir, "pov_" + requestId + ".jpg").getAbsolutePath();
    
    // Take photo
    CameraRecordingService.takePicture(getApplicationContext(), photoPath, 
        new CameraRecordingService.PictureCallback() {
            @Override
            public void onPictureTaken(boolean success, String filePath) {
                if (success) {
                    // Upload photo to cloud using the service from augmentos_core
                    PhotoUploadService.uploadPhoto(
                        getApplicationContext(),
                        filePath,
                        requestId,
                        new PhotoUploadService.UploadCallback() {
                            @Override
                            public void onSuccess(String url) {
                                Log.d(TAG, "Photo uploaded successfully: " + url);
                            }
                            
                            @Override
                            public void onFailure(String errorMessage) {
                                Log.e(TAG, "Photo upload failed: " + errorMessage);
                                sendPhotoFailure(requestId, errorMessage);
                            }
                        }
                    );
                } else {
                    sendPhotoFailure(requestId, "Failed to take photo");
                }
            }
        });
}

private void sendPhotoFailure(String requestId, String reason) {
    try {
        JSONObject response = new JSONObject();
        response.put("type", "photo_failure");
        response.put("requestId", requestId);
        response.put("reason", reason);
        sendMessageToCore(response.toString());
    } catch (JSONException e) {
        Log.e(TAG, "Error creating photo failure JSON", e);
    }
}
```

### 6. Testing Plan

1. Create a test TPA that requests photos
2. Test with connected Mentra Live glasses
3. Verify full flow from request to URL return
4. Test error handling for various failure scenarios:
   - No glasses connected
   - Camera unavailable
   - Upload failure
   - Timeout scenarios

### 7. Documentation Updates

1. Update TPA SDK documentation to include new photo request API
2. Document permissions requirements for apps using the photo feature
3. Add sample code showing proper usage

### 8. Security Considerations

1. Ensure uploaded photos have proper authorization
2. Implement secure temporary URL generation with expiry
3. Add permission checks to ensure only authorized apps can request photos

## Timeline Estimate

1. SDK/Cloud changes: 2 days
2. Core/SmartGlassesCommunicator changes: 3 days
3. MentraLiveSGC implementation: 1 day
4. ASG Client implementation: 2 days
5. Testing and bug fixes: 3-4 days

Total: 9-12 days