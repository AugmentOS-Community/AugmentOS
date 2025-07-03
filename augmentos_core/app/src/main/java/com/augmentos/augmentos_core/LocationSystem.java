package com.augmentos.augmentos_core;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

import com.augmentos.augmentos_core.augmentos_backend.ServerComms;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;


public class LocationSystem extends Service {
    private static final String TAG = "LocationSystem";
    private static final int NOTIFICATION_ID = 1004;
    private static final String CHANNEL_ID = "LocationServiceChannel";
    
    // Service binder
    private final IBinder binder = new LocationBinder();
    
    // We no longer need this context since we are a Service
    // private Context context;
    
    public double lat = 0;
    public double lng = 0;

    public double latestAccessedLat = 0;
    public double latestAccessedLong = 0;
    private FusedLocationProviderClient fusedLocationProviderClient;
    private LocationCallback locationCallback;
    private LocationCallback fastLocationCallback;

    // Store last known location
    private Location lastKnownLocation = null;
    private String currentCorrelationId = null;

    private final Handler locationSendingLoopHandler = new Handler(Looper.getMainLooper());
    private Runnable locationSendingRunnableCode;
    private final long locationSendTime = 1000 * 60 * 30; // 30 minutes

    /**
     * Class for clients to access this service
     */
    public class LocationBinder extends Binder {
        public LocationSystem getService() {
            return LocationSystem.this;
        }
    }
    
    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "LocationService created");
        createNotificationChannel();
        
        // Initialize location components
        fusedLocationProviderClient = LocationServices.getFusedLocationProviderClient(this);
        setupLocationCallbacks();
        getLastKnownLocation();
        requestFastLocationUpdate(); // Get a quick fix immediately on startup
        scheduleLocationUpdates();
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "Starting LocationService as foreground service");
        
        // Check if we have required permissions for foreground service
        if (!hasRequiredLocationPermissions()) {
            Log.w(TAG, "Missing location permissions - cannot start as foreground service");
            handleMissingLocationPermissions();
            return START_NOT_STICKY;
        }
        
        try {
            startForeground(NOTIFICATION_ID, createNotification());
            Log.d(TAG, "Successfully started LocationService as foreground service");
        } catch (SecurityException e) {
            Log.e(TAG, "SecurityException starting foreground service: " + e.getMessage());
            handleMissingLocationPermissions();
        }
        
        return START_NOT_STICKY; // Don't restart if killed
    }
    
    /**
     * Check if we have all required permissions for location foreground service
     */
    private boolean hasRequiredLocationPermissions() {
        // Check basic location permissions
        boolean hasCoarseLocation = ActivityCompat.checkSelfPermission(this, 
                Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean hasFineLocation = ActivityCompat.checkSelfPermission(this, 
                Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        
        // Check foreground service location permission (Android 14+)
        boolean hasForegroundServiceLocation = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            hasForegroundServiceLocation = ActivityCompat.checkSelfPermission(this, 
                    Manifest.permission.FOREGROUND_SERVICE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        }
        
        return (hasCoarseLocation || hasFineLocation) && hasForegroundServiceLocation;
    }
    
    /**
     * Handle the case where location permissions are missing
     */
    private void handleMissingLocationPermissions() {
        Log.w(TAG, "Location permissions missing - stopping service gracefully");
        
        // Don't try to access any location data - user removed permissions for a reason
        // Just stop the service and let the app continue without location functionality
        stopSelf();
    }
    
    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }
    
    @Override
    public void onDestroy() {
        Log.d(TAG, "LocationService destroyed");
        cleanup();
        super.onDestroy();
    }
    
    /**
     * Create notification for the foreground service
     */
    private Notification createNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                notificationIntent,
                PendingIntent.FLAG_IMMUTABLE
        );
        
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Location Service")
                .setContentText("Providing location for smart glasses")
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentIntent(pendingIntent)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build();
    }
    
    /**
     * Create the notification channel for Android O and above
     */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Location Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Used for location updates for smart glasses");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
    
    // Required no-argument constructor for Android services
    public LocationSystem() {
        // No initialization here - it will be done in onCreate()
    }
    
    // For backward compatibility - this constructor is no longer the main entry point
    // since we're now a Service, but keeping it allows existing code to work
    public LocationSystem(Context context) {
        // We don't need to do anything here since onCreate() will handle initialization
        // This is just for API compatibility
    }

    private void getLastKnownLocation() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        fusedLocationProviderClient.getLastLocation()
                .addOnSuccessListener(location -> {
                    if (location != null) {
                        // Use the last known location immediately
                        lastKnownLocation = location;
                        lat = location.getLatitude();
                        lng = location.getLongitude();
                        Log.d(TAG, "Using last known location: " + lat + ", " + lng);
                    }
                });
    }

    public void requestFastLocationUpdate() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        LocationRequest fastLocationRequest = LocationRequest.create();
        fastLocationRequest.setPriority(LocationRequest.PRIORITY_BALANCED_POWER_ACCURACY);
        fastLocationRequest.setInterval(1000);              // Update every 1 second
        fastLocationRequest.setFastestInterval(500);        // Fastest update interval 0.5 seconds
        fastLocationRequest.setMaxWaitTime(3000);           // Wait at most 3 seconds for a fix

        fusedLocationProviderClient.requestLocationUpdates(
                fastLocationRequest,
                fastLocationCallback,
                Looper.getMainLooper()
        );

        // Set a timeout to cancel this request if it takes too long
        locationSendingLoopHandler.postDelayed(() -> {
            fusedLocationProviderClient.removeLocationUpdates(fastLocationCallback);
            // If we didn't get a fast fix, request a more accurate one
            if (!firstLockAcquired) {
                requestLocationUpdate();
            }
        }, 5000); // Give up on fast fix after 5 seconds
    }

    public void requestLocationUpdate() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        LocationRequest locationRequest = LocationRequest.create();
        locationRequest.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY);
        locationRequest.setInterval(10000);              // Keep GPS on for 10 seconds
        locationRequest.setFastestInterval(5000);        // Fastest update interval 5 seconds
        locationRequest.setMaxWaitTime(15000);           // Wait up to 15 seconds for a fix (down from 60)

        fusedLocationProviderClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                Looper.getMainLooper()
        );

        // Set a timeout to cancel this request if it takes too long
        locationSendingLoopHandler.postDelayed(() -> {
            stopLocationUpdates();
        }, 20000); // Give up after 20 seconds total
    }

    public void stopLocationUpdates() {
        if (fusedLocationProviderClient != null && locationCallback != null) {
            fusedLocationProviderClient.removeLocationUpdates(locationCallback);
        }
        
        // Also remove updates from fast callback to be safe
        if (fusedLocationProviderClient != null && fastLocationCallback != null) {
            fusedLocationProviderClient.removeLocationUpdates(fastLocationCallback);
        }
    }

    public void sendLocationToServer(Location location) {
        if (location == null) {
            Log.d(TAG, "Location not available, cannot send to server");
            return;
        }

        // Pass the location accuracy and current correlationId to ServerComms
        ServerComms.getInstance().sendLocationUpdate(
            location.getLatitude(),
            location.getLongitude(),
            location.getAccuracy(),
            this.currentCorrelationId
        );

        // A single poll is complete, so we clear the correlationId.
        if (this.currentCorrelationId != null) {
            this.currentCorrelationId = null;
        }
    }

    public double getNewLat() {
        if (latestAccessedLat == lat) return -1;
        latestAccessedLat = lat;
        return latestAccessedLat;
    }

    public double getNewLng() {
        if (latestAccessedLong == lng) return -1;
        latestAccessedLong = lng;
        return latestAccessedLong;
    }

    // Add a flag and a polling interval for first lock
    private boolean firstLockAcquired = false;
    private final long firstLockPollingInterval = 5000; // 5 seconds

    public void scheduleLocationUpdates() {
        locationSendingRunnableCode = new Runnable() {
            @Override
            public void run() {
                if (!firstLockAcquired) {
                    // For first lock, try to get a fast fix first
                    requestFastLocationUpdate();
                    locationSendingLoopHandler.postDelayed(this, firstLockPollingInterval);
                } else {
                    // Once first fix is obtained, request high-accuracy location
                    requestLocationUpdate();
                    locationSendingLoopHandler.postDelayed(this, locationSendTime);
                }
            }
        };
        locationSendingLoopHandler.post(locationSendingRunnableCode);
    }

    private void setupLocationCallbacks() {
        // Fast, low-accuracy callback for initial fix
        fastLocationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                if (locationResult == null || locationResult.getLocations().isEmpty()) return;

                Location location = locationResult.getLastLocation();
                lat = location.getLatitude();
                lng = location.getLongitude();
                lastKnownLocation = location;

                Log.d(TAG, "Fast location fix obtained: " + lat + ", " + lng);

                sendLocationToServer(location);
                fusedLocationProviderClient.removeLocationUpdates(fastLocationCallback);

                if (!firstLockAcquired) {
                    firstLockAcquired = true;
                    // After getting fast fix, immediately request high accuracy fix
                    requestLocationUpdate();
                }
            }
        };

        // High-accuracy callback for better location
        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                if (locationResult == null || locationResult.getLocations().isEmpty()) return;

                Location location = locationResult.getLastLocation();
                lat = location.getLatitude();
                lng = location.getLongitude();
                lastKnownLocation = location;

                Log.d(TAG, "Accurate location fix obtained: " + lat + ", " + lng);

                sendLocationToServer(location);
                stopLocationUpdates();

                if (!firstLockAcquired) {
                    firstLockAcquired = true;
                }
            }
        };
    }

    // Get the current location - will return last known location if available
    public Location getCurrentLocation() {
        return lastKnownLocation;
    }
    
    /**
     * Call this method to cleanup all resources when the app is being destroyed
     */
    public void cleanup() {
        // Remove all pending callbacks
        if (locationSendingLoopHandler != null) {
            locationSendingLoopHandler.removeCallbacksAndMessages(null);
        }
        
        // Make sure location updates are stopped
        stopLocationUpdates();
    }

    // New methods for Intelligent Location Service
    public void setTier(String tier) {
        Log.d(TAG, "Setting location tier to: " + tier);

        LocationRequest.Builder locationRequestBuilder = new LocationRequest.Builder(10000); // Default interval

        switch (tier) {
            case "realtime":
                locationRequestBuilder.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY).setIntervalMillis(1000);
                break;
            case "high":
                locationRequestBuilder.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY).setIntervalMillis(10000);
                break;
            case "tenMeters":
                locationRequestBuilder.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY).setIntervalMillis(30000);
                break;
            case "hundredMeters":
                locationRequestBuilder.setPriority(LocationRequest.PRIORITY_BALANCED_POWER_ACCURACY).setIntervalMillis(60000);
                break;
            case "kilometer":
                locationRequestBuilder.setPriority(LocationRequest.PRIORITY_LOW_POWER).setIntervalMillis(300000);
                break;
            case "threeKilometers":
            case "reduced":
                locationRequestBuilder.setPriority(LocationRequest.PRIORITY_NO_POWER).setIntervalMillis(900000);
                break;
            default:
                locationRequestBuilder.setPriority(LocationRequest.PRIORITY_BALANCED_POWER_ACCURACY).setIntervalMillis(60000);
                break;
        }

        // Stop existing updates and start with the new request
        stopLocationUpdates();
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            fusedLocationProviderClient.requestLocationUpdates(
                locationRequestBuilder.build(),
                locationCallback,
                Looper.getMainLooper()
            );
        }
    }

    public void requestSingleUpdate(String accuracy, String correlationId) {
        Log.d(TAG, "Requesting single location update with accuracy: " + accuracy);
        this.currentCorrelationId = correlationId;

        LocationRequest.Builder locationRequestBuilder = new LocationRequest.Builder(1000); // Interval isn't as critical for single update
        locationRequestBuilder.setMaxUpdates(1); // Ensure we only get one update

        switch (accuracy) {
            case "realtime":
            case "high":
            case "tenMeters":
                locationRequestBuilder.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY);
                break;
            case "hundredMeters":
                locationRequestBuilder.setPriority(LocationRequest.PRIORITY_BALANCED_POWER_ACCURACY);
                break;
            case "kilometer":
            case "threeKilometers":
            case "reduced":
                locationRequestBuilder.setPriority(LocationRequest.PRIORITY_LOW_POWER);
                break;
            default:
                locationRequestBuilder.setPriority(LocationRequest.PRIORITY_BALANCED_POWER_ACCURACY);
                break;
        }

        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            fusedLocationProviderClient.requestLocationUpdates(
                locationRequestBuilder.build(),
                locationCallback, // We can reuse the same callback
                Looper.getMainLooper()
            );
        }
    }
}