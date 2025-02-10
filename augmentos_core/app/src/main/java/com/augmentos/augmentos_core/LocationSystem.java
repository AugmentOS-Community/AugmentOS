package com.augmentos.augmentos_core;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.augmentos.augmentos_core.augmentos_backend.ServerComms;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.tasks.OnSuccessListener;

public class LocationSystem {
    private Context context;
    public double lat = 0;
    public double lng = 0;

    public double latestAccessedLat = 0;
    public double latestAccessedLong = 0;
    private FusedLocationProviderClient fusedLocationProviderClient;
    private LocationCallback locationCallback;

    private final Handler locationSendingLoopHandler = new Handler(Looper.getMainLooper());
    private Runnable locationSendingRunnableCode;
    private final long locationSendTime = 1000 * 10; // define in milliseconds


    public LocationSystem(Context context) {
        this.context = context;
        fusedLocationProviderClient = LocationServices.getFusedLocationProviderClient(context);
        getUserLocation();
    }

    public void getUserLocation() {
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED && ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            // TODO: Consider calling ActivityCompat#requestPermissions here.
            return;
        }

        fusedLocationProviderClient.getLastLocation().addOnSuccessListener(new OnSuccessListener<Location>() {
            @Override
            public void onSuccess(Location location) {
                // Got last known location. In some rare situations, this can be null.
                if (location != null) {
                    lat = location.getLatitude();
                    lng = location.getLongitude();
                }
            }
        });

        LocationRequest locationRequest = LocationRequest.create();
        locationRequest.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY);
        locationRequest.setInterval(10000); // 10 seconds
        locationRequest.setFastestInterval(5000); // 5 seconds

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                if (locationResult == null) {
                    return;
                }
                for (Location location : locationResult.getLocations()) {
                    lat = location.getLatitude();
                    lng = location.getLongitude();
                }
            }
        };

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            fusedLocationProviderClient.requestLocationUpdates(locationRequest, locationCallback, null /* Looper */);
        }
    }

    public void stopLocationUpdates() {
        if (fusedLocationProviderClient != null && locationCallback != null) {
            fusedLocationProviderClient.removeLocationUpdates(locationCallback);
        }

        locationSendingLoopHandler.removeCallbacks(locationSendingRunnableCode);
        locationSendingLoopHandler.removeCallbacksAndMessages(null);
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

    public void startLocationSending() {
        locationSendingLoopHandler.removeCallbacksAndMessages(this);

        locationSendingRunnableCode = new Runnable() {
            @Override
            public void run() {
                    sendLocationToServer();
                locationSendingLoopHandler.postDelayed(this, locationSendTime);
            }
        };
        locationSendingLoopHandler.post(locationSendingRunnableCode);
    }

    private void sendLocationToServer(){
        double latitude = getNewLat();
        double longitude = getNewLng();

        if(latitude == -1 && longitude == -1) return;

        ServerComms.getInstance().sendLocationUpdate(latitude, longitude);
    }
}

