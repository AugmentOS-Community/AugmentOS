# TPA Photo Gallery Implementation Plan

## Implementation Status

### Completed:
- ✅ Created GalleryPhoto Mongoose model
- ✅ Added saveToGallery flag to WebSocketService's pendingPhotoRequests
- ✅ Added getPendingPhotoRequest method to WebSocketService to retrieve request details
- ✅ Updated photo upload endpoint to save photos to gallery when flag is set
- ✅ Created new API endpoints for retrieving and deleting gallery photos
- ✅ Registered gallery routes in main application
- ✅ Updated the SDK to expose the save_to_gallery flag
- ✅ Updated the UI in the manager app to display the gallery photos

### Next Steps:
- Testing the complete implementation
- Add CloudFlare R2 storage implementation in the future

## 1. Server-Side Gallery Storage

### 1.1 Database Schema (MongoDB/Mongoose)
```typescript
// gallery-photo.model.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface GalleryPhotoI extends Document {
  userId: string;
  photoUrl: string;
  requestId: string;
  appId: string;
  timestamp: Date;
  metadata: {
    width?: number;
    height?: number;
    format?: string;
    size_bytes?: number;
    device_info?: string;
  };
}

const GalleryPhotoSchema = new Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  photoUrl: {
    type: String,
    required: true
  },
  requestId: {
    type: String,
    required: true
  },
  appId: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  metadata: {
    width: Number,
    height: Number,
    format: String,
    size_bytes: Number,
    device_info: String
  }
}, { 
  timestamps: true 
});

export default mongoose.model<GalleryPhotoI>('GalleryPhoto', GalleryPhotoSchema);
```

### 1.2 Storage System Integration
- Continue using local file system for initial implementation
- Maintain existing structure from `/augmentos_cloud/packages/cloud/src/routes/photos.routes.ts`
- Add the gallery photo model to database when `save_to_gallery` is true

## 2. SDK Enhancement

### 2.1 Update TPA SDK Request Method
```typescript
// Current
requestPhoto(): Promise<string> // Returns URL to photo

// New - Add save_to_gallery parameter with false default
requestPhoto(options?: { 
  save_to_gallery?: boolean  // Default: false
}): Promise<string>   // Returns URL to photo
```

### 2.2 Update Protocol Message Format
```typescript
// Current message format
{
  type: 'REQUEST_PHOTO',
  appId: string,
  requestId: string
}

// New message format
{
  type: 'REQUEST_PHOTO',
  appId: string,
  requestId: string,
  save_to_gallery: boolean  // New field
}
```

## 3. Cloud Backend Updates

### 3.1 Request Handler Update
```typescript
// In WebSocket message handler
case 'REQUEST_PHOTO':
  if (isAppRunning(message.appId)) {
    const requestId = generateUniqueId();
    
    // Store save_to_gallery preference with the request
    const saveToGallery = message.save_to_gallery || false;
    
    const request = {
      type: 'photo_request',
      requestId: requestId,
      appId: message.appId,
      save_to_gallery: saveToGallery
    };
    
    // Store request in pending requests map
    pendingPhotoRequests.set(requestId, {
      appId: message.appId,
      timestamp: Date.now(),
      resolve: message.resolve,
      reject: message.reject,
      save_to_gallery: saveToGallery  // Store the preference
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

### 3.2 Photo Upload Endpoint Update
```typescript
// Update REST endpoint
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
    
    // If save_to_gallery is true, save to user's gallery
    if (pendingRequest.save_to_gallery) {
      const userId = getUserIdFromToken(req.token);
      await savePhotoToGallery({
        user_id: userId,
        photo_url: photoUrl,
        request_id: requestId,
        app_id: pendingRequest.appId,
        timestamp: new Date(),
        metadata: extractPhotoMetadata(photo)
      });
    }
    
    pendingPhotoRequests.delete(requestId);
    
    res.json({ success: true, photoUrl });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process photo' });
  }
});
```

### 3.3 Gallery REST API Endpoints
```typescript
// Get user's gallery
app.get('/api/gallery', authenticateCoreToken, async (req, res) => {
  try {
    const userId = getUserIdFromToken(req.token);
    const photos = await getUserGalleryPhotos(userId);
    res.json({ success: true, photos });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch gallery' });
  }
});

// Delete photo from gallery
app.delete('/api/gallery/:photoId', authenticateCoreToken, async (req, res) => {
  try {
    const userId = getUserIdFromToken(req.token);
    const { photoId } = req.params;
    
    // Verify ownership
    const photo = await getGalleryPhoto(photoId);
    if (!photo || photo.user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Delete from database
    await deleteGalleryPhoto(photoId);
    
    // Optionally delete from storage
    await deletePhotoFromStorage(photo.photo_url);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});
```

## 4. AugmentOS Core Updates

### 4.1 Update SmartGlassesCommunicator
```java
/**
 * Request a photo to be taken by the connected smart glasses
 * @param requestId Unique ID for this photo request
 * @param appId App ID requesting the photo
 * @param saveToGallery Whether to save the photo to user's gallery
 */
public void requestPhoto(String requestId, String appId, boolean saveToGallery) {
    // Default empty implementation
    Log.d(TAG, "Photo request not implemented for this device");
    sendPhotoRequestFailure(requestId, "Not supported by this device");
}
```

### 4.2 Update MentraLiveSGC Implementation
```java
@Override
public void requestPhoto(String requestId, String appId, boolean saveToGallery) {
    try {
        JSONObject json = new JSONObject();
        json.put("type", "command");
        json.put("command", "camera");
        json.put("action", "take_photo");
        json.put("requestId", requestId);
        json.put("appId", appId);
        json.put("save_to_gallery", saveToGallery);
        sendJson(json);
        Log.d(TAG, "Sent photo request to glasses: " + requestId);
    } catch (JSONException e) {
        Log.e(TAG, "Error creating photo request JSON", e);
        sendPhotoRequestFailure(requestId, "Failed to create request");
    }
}
```

## 5. ASG Client Implementation

### 5.1 Update Command Handler
```java
// In parseJsonCommand method
case "camera":
    String action = commandJson.optString("action");
    if ("take_photo".equals(action)) {
        String requestId = commandJson.optString("requestId");
        String appId = commandJson.optString("appId", "");
        boolean saveToGallery = commandJson.optBoolean("save_to_gallery", false);
        takePovPhoto(requestId, appId, saveToGallery);
    }
    break;
```

### 5.2 Update Photo Capture Function
```java
private void takePovPhoto(String requestId, String appId, boolean saveToGallery) {
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
                        appId,
                        saveToGallery,
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
```

### 5.3 Update PhotoUploadService
```java
public static void uploadPhoto(
    Context context, 
    String photoFilePath, 
    String requestId, 
    String appId,
    boolean saveToGallery,
    UploadCallback callback) {
    
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
                .addFormDataPart("appId", appId)
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
```

## 6. AugmentOS Manager App Updates

### 6.1 Update Gallery UI
```tsx
// In GlassesRecordingsGallery.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TabView } from 'react-native';
import { API } from '../utils/api'; // Create this utility

const GalleryScreen = () => {
  // State variables
  const [activeTab, setActiveTab] = useState('device'); // 'device' or 'cloud'
  const [deviceRecordings, setDeviceRecordings] = useState([]);
  const [cloudPhotos, setCloudPhotos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Load device recordings
  const loadDeviceRecordings = async () => {
    // Existing code to load local recordings
    // ...
  };
  
  // Load cloud photos
  const loadCloudPhotos = async () => {
    try {
      const response = await API.get('/api/gallery');
      if (response.success) {
        setCloudPhotos(response.photos);
      }
    } catch (error) {
      console.error('Error loading cloud photos:', error);
    }
  };
  
  // Load appropriate gallery based on active tab
  useEffect(() => {
    setIsLoading(true);
    if (activeTab === 'device') {
      loadDeviceRecordings().finally(() => setIsLoading(false));
    } else {
      loadCloudPhotos().finally(() => setIsLoading(false));
    }
  }, [activeTab]);
  
  // Render tabs
  return (
    <View style={styles.container}>
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'device' && styles.activeTab]}
          onPress={() => setActiveTab('device')}>
          <Text style={styles.tabText}>Device</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'cloud' && styles.activeTab]}
          onPress={() => setActiveTab('cloud')}>
          <Text style={styles.tabText}>Cloud</Text>
        </TouchableOpacity>
      </View>
      
      {/* Render appropriate gallery based on active tab */}
      {activeTab === 'device' ? (
        <DeviceGallery recordings={deviceRecordings} isLoading={isLoading} />
      ) : (
        <CloudGallery photos={cloudPhotos} isLoading={isLoading} />
      )}
    </View>
  );
};

// Sub-components for device and cloud galleries
const DeviceGallery = ({ recordings, isLoading }) => {
  // Existing device gallery implementation
  // ...
};

const CloudGallery = ({ photos, isLoading }) => {
  // New cloud gallery implementation
  // Similar to device gallery but renders cloud photos
  // Includes delete functionality
  // ...
};
```

## 7. Version 2.0 Features (Future)

### 7.1 CloudFlare R2 Storage Integration
```typescript
// storage/cloudflare-r2.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';

// Initialize R2 client
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  }
});

// Upload file to R2
export async function uploadToR2(filePath: string, key: string, contentType: string): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  
  await r2Client.send(new PutObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType
  }));
  
  // Return public URL
  return `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${key}`;
}

// Generate signed URL for temporary access
export async function generateSignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET,
    Key: key
  });
  
  return getSignedUrl(r2Client, command, { expiresIn });
}

// Delete file from R2
export async function deleteFromR2(key: string): Promise<void> {
  await r2Client.send(new DeleteObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET,
    Key: key
  }));
}
```

### 7.2 Pagination for Gallery Endpoint
```typescript
// For V2.0
app.get('/api/gallery', authenticateCoreToken, async (req, res) => {
  try {
    const userId = getUserIdFromToken(req.token);
    const { page = 1, limit = 20, app_id } = req.query;
    
    // Add pagination and filtering
    const options = {
      skip: (page - 1) * limit,
      limit: parseInt(limit),
      filter: app_id ? { app_id } : {}
    };
    
    const photos = await getUserGalleryPhotos(userId, options);
    const total = await countUserGalleryPhotos(userId, options.filter);
    
    res.json({
      success: true,
      photos,
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total_items: total,
        total_pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch gallery' });
  }
});
```

## 8. Testing Plan

1. **SDK Testing**
   - Verify new `save_to_gallery` parameter works correctly
   - Test both true and false values

2. **Backend Testing**
   - Verify request handling with and without `save_to_gallery` flag
   - Test gallery storage functionality
   - Test REST API endpoints

3. **Client Testing**
   - Verify photo capture and upload with `save_to_gallery` flag
   - Test response handling for different scenarios

4. **UI Testing**
   - Test device/cloud tab switching
   - Verify correct loading and display of both galleries
   - Test photo viewing and deletion

5. **End-to-End Testing**
   - Full flow from TPA photo request to gallery display
   - Verify correct handling of all error cases

## 9. Documentation Updates

1. Update TPA SDK documentation to include new `save_to_gallery` parameter
2. Update developer guides with gallery integration details
3. Document REST API endpoints for gallery management
4. Update user documentation for new gallery features