package com.augmentos.augmentos_core;

import static com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.EvenRealitiesG1SGC.deleteEvenSharedPreferences;
import static com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.EvenRealitiesG1SGC.savePreferredG1DeviceId;
// No longer need imports from SmartGlassesAndroidService as we use SmartGlassesManager
import static com.augmentos.augmentos_core.statushelpers.CoreVersionHelper.getCoreVersion;
import static com.augmentos.augmentos_core.statushelpers.JsonHelper.processJSONPlaceholders;
import static com.augmentos.augmentoslib.AugmentOSGlobalConstants.AUGMENTOS_NOTIFICATION_ID;
import static com.augmentos.augmentoslib.AugmentOSGlobalConstants.AugmentOSAsgClientPackageName;
import static com.augmentos.augmentoslib.AugmentOSGlobalConstants.AugmentOSManagerPackageName;
import static com.augmentos.augmentos_core.BatteryOptimizationHelper.handleBatteryOptimization;
import static com.augmentos.augmentos_core.BatteryOptimizationHelper.isSystemApp;
import static com.augmentos.augmentos_core.Constants.notificationFilterKey;
import static com.augmentos.augmentos_core.Constants.newsSummaryKey;
import static com.augmentos.augmentos_core.Constants.augmentOsMainServiceNotificationId;
import static com.augmentos.augmentoslib.AugmentOSGlobalConstants.GROUP_SUMMARY_NOTIFICATION_ID;
import static com.augmentos.augmentoslib.AugmentOSGlobalConstants.SERVICE_CORE_NOTIFICATION_ID;


import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.hardware.display.VirtualDisplay;
import android.icu.util.TimeZone;
import android.media.projection.MediaProjection;
import android.os.Binder;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.service.notification.NotificationListenerService;
import android.util.Log;

import java.io.IOException;

import androidx.core.app.NotificationCompat;
import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.LifecycleOwner;
import androidx.lifecycle.LifecycleService;
import androidx.preference.PreferenceManager;

import com.augmentos.augmentos_core.augmentos_backend.AuthHandler;
import com.augmentos.augmentos_core.augmentos_backend.HTTPServerComms;
import com.augmentos.augmentos_core.augmentos_backend.ServerComms;
import com.augmentos.augmentos_core.augmentos_backend.ServerCommsCallback;
import com.augmentos.augmentos_core.augmentos_backend.ThirdPartyCloudApp;
import com.augmentos.augmentos_core.augmentos_backend.WebSocketLifecycleManager;
import com.augmentos.augmentos_core.augmentos_backend.WebSocketManager;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.BatteryLevelEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.BrightnessLevelEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.DisplayGlassesDashboardEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchDiscoverEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchStopEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesHeadDownEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesHeadUpEvent;
// No longer need SmartGlassesAndroidService import
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesDisplayPowerEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.SmartGlassesConnectionStateChangedEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.HeadUpAngleEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesDevice;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.BitmapJavaUtils;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.SmartGlassesConnectionState;
import com.augmentos.augmentoslib.ThirdPartyEdgeApp;
import com.augmentos.augmentos_core.comms.AugmentOsActionsCallback;
import com.augmentos.augmentos_core.comms.AugmentosBlePeripheral;
import com.augmentos.augmentos_core.events.AugmentosSmartGlassesDisconnectedEvent;
import com.augmentos.augmentos_core.events.NewScreenImageEvent;
import com.augmentos.augmentos_core.events.ThirdPartyEdgeAppErrorEvent;
import com.augmentos.augmentos_core.events.TriggerSendStatusToAugmentOsManagerEvent;
import com.augmentos.augmentos_core.statushelpers.BatteryStatusHelper;
import com.augmentos.augmentos_core.statushelpers.GsmStatusHelper;
import com.augmentos.augmentos_core.statushelpers.WifiStatusHelper;
import com.augmentos.augmentos_core.tpa.EdgeTPASystem;


import com.augmentos.augmentoslib.events.GlassesTapOutputEvent;
import com.augmentos.augmentoslib.events.SmartRingButtonOutputEvent;

import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.Subscribe;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Locale;
import java.util.Collections;
import java.util.List;
import java.util.Map;
//SpeechRecIntermediateOutputEvent
import com.augmentos.augmentos_core.smarterglassesmanager.utils.EnvHelper;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;


public class AugmentosService extends LifecycleService implements AugmentOsActionsCallback {
    public static final String TAG = "AugmentOS_AugmentOSService";

   private final IBinder binder = new LocalBinder();

    private final String notificationAppName = "AugmentOS Core";
    private final String notificationDescription = "Running in foreground";
    private final String myChannelId = "augmentos_core";
    public static final String ACTION_START_CORE = "ACTION_START_CORE";
    public static final String ACTION_STOP_CORE = "ACTION_STOP_CORE";

    public static final String ACTION_START_FOREGROUND_SERVICE = "MY_ACTION_START_FOREGROUND_SERVICE";
    public static final String ACTION_STOP_FOREGROUND_SERVICE = "MY_ACTION_STOP_FOREGROUND_SERVICE";

    private BatteryStatusHelper batteryStatusHelper;
    private WifiStatusHelper wifiStatusHelper;
    private GsmStatusHelper gsmStatusHelper;

    private AuthHandler authHandler;
    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private final Handler screenCaptureHandler = new Handler();
    private Runnable screenCaptureRunnable;
    private LocationSystem locationSystem;
    private long currTime = 0;
    private long lastPressed = 0;
    private final long lastTapped = 0;

    // Double clicking constants
    private final long doublePressTimeConst = 420;
    private final long doubleTapTimeConst = 600;

    public EdgeTPASystem edgeTpaSystem;

    private String userId;
    public SmartGlassesConnectionState previousSmartGlassesConnectionState = SmartGlassesConnectionState.DISCONNECTED;


    public AugmentosBlePeripheral blePeripheral;

    // SmartGlassesManager instead of AugmentosSmartGlassesService
    public com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager smartGlassesManager;
    private final List<Runnable> smartGlassesReadyListeners = new ArrayList<>();
    private NotificationSystem notificationSystem;
    private CalendarSystem calendarSystem;

    private Integer batteryLevel;
    private Integer brightnessLevel;
    private Integer headUpAngle;

    private final boolean showingDashboardNow = false;
    private boolean contextualDashboardEnabled;
    private AsrPlanner asrPlanner;
    private HTTPServerComms httpServerComms;

    JSONObject cachedDashboardDisplayObject;
    List<ThirdPartyCloudApp> cachedThirdPartyAppList = new ArrayList<>(); // Initialize here to avoid NPE
    private WebSocketManager.IncomingMessageHandler.WebSocketStatus webSocketStatus = WebSocketManager.IncomingMessageHandler.WebSocketStatus.DISCONNECTED;
    private final Handler serverCommsHandler = new Handler(Looper.getMainLooper());

    private WebSocketLifecycleManager webSocketLifecycleManager;

    public AugmentosService() {
    }

    // Smart glasses event handler
    private final com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager.SmartGlassesEventHandler smartGlassesEventHandler = 
        new com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager.SmartGlassesEventHandler() {
            @Override
            public void onGlassesConnectionStateChanged(SmartGlassesDevice device, SmartGlassesConnectionState connectionState) {
                if (connectionState != previousSmartGlassesConnectionState) {
                    previousSmartGlassesConnectionState = connectionState;
                    webSocketLifecycleManager.updateSmartGlassesState(connectionState);
                    
                    if (device != null) {
                        ServerComms.getInstance().sendGlassesConnectionState(device.deviceModelName, connectionState.name());
                    }
                    
                    if (connectionState == SmartGlassesConnectionState.CONNECTED) {
                        Log.d(TAG, "Got event for onGlassesConnected.. CONNECTED ..");
                        Log.d(TAG, "****************** SENDING REFERENCE CARD: CONNECTED TO AUGMENT OS");
                        playStartupSequenceOnSmartGlasses();
                        asrPlanner.updateAsrLanguages();
                    } else if (connectionState == SmartGlassesConnectionState.DISCONNECTED) {
                        edgeTpaSystem.stopAllThirdPartyApps();
                    }
                    
                    sendStatusToAugmentOsManager();
                }
            }
        };

    @Subscribe
    public void onAugmentosSmartGlassesDisconnectedEvent(AugmentosSmartGlassesDisconnectedEvent event){
        // TODO: For now, stop all apps on disconnection
        // TODO: Future: Make this nicer
        webSocketLifecycleManager.updateSmartGlassesState(SmartGlassesConnectionState.DISCONNECTED);
        edgeTpaSystem.stopAllThirdPartyApps();
        sendStatusToAugmentOsManager();
    }

    public void onTriggerSendStatusToAugmentOsManagerEvent(TriggerSendStatusToAugmentOsManagerEvent event) {
        sendStatusToAugmentOsManager();
    }

    @Subscribe
    public void onGlassesHeadUpEvent(GlassesHeadUpEvent event){
        ServerComms.getInstance().sendHeadPosition("up");
        EventBus.getDefault().post(new DisplayGlassesDashboardEvent());
    }

    @Subscribe
    public void onGlassesHeadDownEvent(GlassesHeadDownEvent event){
        ServerComms.getInstance().sendHeadPosition("down");
        if (smartGlassesManager != null)
            smartGlassesManager.windowManager.hideDashboard();
    }

    @Subscribe
    public void onGlassesTapSideEvent(GlassesTapOutputEvent event) {
        int numTaps = event.numTaps;
        boolean sideOfGlasses = event.sideOfGlasses;
        long time = event.timestamp;

        Log.d(TAG, "GLASSES TAPPED X TIMES: " + numTaps + " SIDEOFGLASSES: " + sideOfGlasses);
        if (smartGlassesManager == null) return;
        if (numTaps == 2 || numTaps == 3) {
            if (smartGlassesManager.windowManager.isDashboardShowing()) {
                smartGlassesManager.windowManager.hideDashboard();
            } else {
                Log.d(TAG, "GOT A DOUBLE+ TAP");
                EventBus.getDefault().post(new DisplayGlassesDashboardEvent());
            }
        }
    }

    @Subscribe
    public void onThirdPartyAppErrorEvent(ThirdPartyEdgeAppErrorEvent event) {
        if (blePeripheral != null) {
            blePeripheral.sendNotifyManager(event.text, "error");
        }
        if (edgeTpaSystem != null) {
            edgeTpaSystem.stopThirdPartyAppByPackageName(event.packageName);
        }
        if (smartGlassesManager != null) {
            smartGlassesManager.windowManager.showAppLayer("system", () -> smartGlassesManager.sendReferenceCard("App error", event.text), 10);
        }
        sendStatusToAugmentOsManager();
    }

    //TODO NO MORE PASTA
    public ArrayList<String> notificationList = new ArrayList<String>();
    public JSONArray latestNewsArray = new JSONArray();
    private int latestNewsIndex = 0;
    @Subscribe
    public void onDisplayGlassesDashboardEvent(DisplayGlassesDashboardEvent event) throws JSONException {
        if (!contextualDashboardEnabled) {
            return;
        }

        if (cachedDashboardDisplayObject != null) {
            if (smartGlassesManager != null) {
                Runnable dashboardDisplayRunnable = parseDisplayEventMessage(cachedDashboardDisplayObject);

                smartGlassesManager.windowManager.showDashboard(dashboardDisplayRunnable,
                        -1
                );
            }
            if(cachedDashboardDisplayObject != null && blePeripheral != null) {
                blePeripheral.sendGlassesDisplayEventToManager(cachedDashboardDisplayObject);
            }
            return;
        }

        // SHOW FALLBACK DASHBOARD

        // --- Build date/time line ---
        SimpleDateFormat currentTimeFormat = new SimpleDateFormat("h:mm", Locale.getDefault());
        SimpleDateFormat currentDateFormat = new SimpleDateFormat("MMM d", Locale.getDefault());
        String currentTime = currentTimeFormat.format(new Date());
        String currentDate = currentDateFormat.format(new Date());

        // Battery, date/time, etc.
        String leftHeaderLine = String.format(Locale.getDefault(), "◌ %s %s, %d%%\n", currentTime, currentDate, batteryLevel);

        String connString = webSocketStatus == null ? "Not connected" : webSocketStatus.name();;

        if (smartGlassesManager != null) {
            smartGlassesManager.windowManager.showDashboard(() ->
                            smartGlassesManager.sendDoubleTextWall(leftHeaderLine, connString),
                    -1
            );
        }
    }

    @Subscribe
    public void onGlassBatteryLevelEvent(BatteryLevelEvent event) {
        if (batteryLevel != null && event.batteryLevel == batteryLevel) return;
        batteryLevel = event.batteryLevel;
        ServerComms.getInstance().sendGlassesBatteryUpdate(event.batteryLevel, false, -1);
        sendStatusToAugmentOsManager();
    }

    @Subscribe
    public void onBrightnessLevelEvent(BrightnessLevelEvent event) {
        brightnessLevel = event.brightnessLevel;
        PreferenceManager.getDefaultSharedPreferences(this)
                .edit()
                .putString(this.getResources().getString(R.string.SHARED_PREF_BRIGHTNESS), String.valueOf(brightnessLevel))
                .apply();
        sendStatusToAugmentOsManager();
    }

    @Subscribe
    public void onHeadUpAngleEvent(HeadUpAngleEvent event) {
//        Log.d(TAG, "BRIGHTNESS received");
        headUpAngle = event.headUpAngle;
        PreferenceManager.getDefaultSharedPreferences(this)
                .edit()
                .putString(this.getResources().getString(R.string.HEADUP_ANGLE), String.valueOf(headUpAngle))
                .apply();
        sendStatusToAugmentOsManager();
    }

    @Override
    public void onCreate() {
        super.onCreate();

        EnvHelper.init(this);

        EventBus.getDefault().register(this);

        ServerComms.getInstance(this);

        authHandler = new AuthHandler(this);

        userId = authHandler.getUniqueIdForAnalytics();

        batteryStatusHelper = new BatteryStatusHelper(this);
        wifiStatusHelper = new WifiStatusHelper(this);
        gsmStatusHelper = new GsmStatusHelper(this);

        notificationSystem = new NotificationSystem(this, userId);
        calendarSystem = CalendarSystem.getInstance(this);

        brightnessLevel = Integer.parseInt(PreferenceManager.getDefaultSharedPreferences(this).getString(getResources().getString(R.string.SHARED_PREF_BRIGHTNESS), "50"));
        headUpAngle = Integer.parseInt(PreferenceManager.getDefaultSharedPreferences(this).getString(getResources().getString(R.string.HEADUP_ANGLE), "20"));

        contextualDashboardEnabled = getContextualDashboardEnabled();

        edgeTpaSystem = new EdgeTPASystem(this, null); // We'll set smartGlassesManager after it's created
        asrPlanner = new AsrPlanner(edgeTpaSystem);

        // Initialize BLE Peripheral
        blePeripheral = new AugmentosBlePeripheral(this, this);

        // If this is the ASG client, start the peripheral
        if (getPackageName().equals(AugmentOSAsgClientPackageName)) {
        //    blePeripheral.start();
        }

        // Whitelist AugmentOS from battery optimization when system app
        // If not system app, bring up the settings menu
        if (isSystemApp(this)) {
            handleBatteryOptimization(this);
        }

        // Automatically connect to glasses on service start
        String preferredWearable = com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager.getPreferredWearable(this);
        if(!preferredWearable.isEmpty()) {
            SmartGlassesDevice preferredDevice = com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager.getSmartGlassesDeviceFromModelName(preferredWearable);
            if (preferredDevice != null) {
                // Initialize SmartGlassesManager
                startSmartGlassesManager();
                // Connect to glasses
                smartGlassesManager.connectToSmartGlasses(preferredDevice);
                sendStatusToAugmentOsManager();
            } else {
                // We have some invalid device saved... delete from preferences
                com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager.savePreferredWearable(this, "");
            }
        }

        // cachedThirdPartyAppList is already initialized as a class member

        webSocketLifecycleManager = new WebSocketLifecycleManager(this, authHandler);

        // Set up backend comms
        this.httpServerComms = new HTTPServerComms();
        //if(authHandler.getCoreToken() != null)
        //    ServerComms.getInstance().connectWebSocket(authHandler.getCoreToken());
        initializeServerCommsCallbacks();

        httpServerComms.getApps(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e("HTTP", "GET /apps failed: " + e.getMessage());
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (response.isSuccessful()) {
                    Log.d("HTTP", "Response: ");
                }
            }
        });

        locationSystem = new LocationSystem(this);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    myChannelId,
                    notificationAppName,
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription(notificationDescription);
            channel.enableLights(false);
            channel.enableVibration(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);

        if (intent == null || intent.getAction() == null) {
            Log.e(TAG, "Received null intent or null action");
            return Service.START_STICKY; // Or handle this scenario appropriately
        }

        String action = intent.getAction();
        Bundle extras = intent.getExtras();

        switch (action) {
            case ACTION_START_CORE:
            case ACTION_START_FOREGROUND_SERVICE:
                // start the service in the foreground
                Log.d("TEST", "starting foreground");
                createNotificationChannel(); // New method to ensure one-time channel creation
                //startForeground(augmentOsMainServiceNotificationId, updateNotification());
                startForeground(AUGMENTOS_NOTIFICATION_ID, this.buildSharedForegroundNotification(this));

                // Send out the status once AugmentOS_Core is ready :)
                // tpaSystem.stopThirdPartyAppByPackageName(AugmentOSManagerPackageName);
                edgeTpaSystem.startThirdPartyAppByPackageName(AugmentOSManagerPackageName);

                if (!NewPermissionUtils.areAllPermissionsGranted(this)) {
                    blePeripheral.sendPermissionsErrorToManager();
                }

                break;
            case ACTION_STOP_CORE:
            case ACTION_STOP_FOREGROUND_SERVICE:
                stopForeground(true);
                stopSelf();
                break;
            default:
                Log.d(TAG, "Unknown action received in onStartCommand");
                Log.d(TAG, action);
        }
        return Service.START_STICKY;
    }

    private Notification updateNotification() {
        Context context = getApplicationContext();

        PendingIntent action = PendingIntent.getActivity(context,
                0, new Intent(context, MainActivity.class),
                PendingIntent.FLAG_CANCEL_CURRENT | PendingIntent.FLAG_MUTABLE); // Flag indicating that if the described PendingIntent already exists, the current one should be canceled before generating a new one.

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationCompat.Builder builder;

        String CHANNEL_ID = myChannelId;

        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, notificationAppName,
                NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(notificationDescription);
        channel.enableVibration(false);
        channel.enableLights(false);
        manager.createNotificationChannel(channel);

        builder = new NotificationCompat.Builder(this, CHANNEL_ID);

        return builder.setContentIntent(action)
                .setContentTitle(notificationAppName)
                .setContentText(notificationDescription)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setTicker("...")
                .setContentIntent(action)
                .setOngoing(true).build();
    }
    
    // Replacement for buildSharedForegroundNotification that was previously imported from AugmentOSLib
    private Notification buildSharedForegroundNotification(Context context) {
        // Create a notification similar to updateNotification
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        
        // Create the notification channel if it doesn't exist
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    myChannelId,
                    notificationAppName,
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription(notificationDescription);
            channel.enableLights(false);
            channel.enableVibration(false);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
        
        // Create the intent for when notification is tapped
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                0,
                new Intent(context, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
        );
        
        // Build the notification
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, myChannelId)
                .setContentTitle(notificationAppName)
                .setContentText(notificationDescription)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pendingIntent)
                .setOngoing(true);
                
        return builder.build();
    }

    // Method to initialize the SmartGlassesManager
    public void startSmartGlassesManager() {
        if (smartGlassesManager == null) {
            // Now we can pass 'this' as the LifecycleOwner since we extend LifecycleService
            smartGlassesManager = new com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager(this, this, smartGlassesEventHandler);
            edgeTpaSystem.setSmartGlassesManager(smartGlassesManager);
            // Execute any pending actions
            for (Runnable action : smartGlassesReadyListeners) {
                action.run();
            }
            smartGlassesReadyListeners.clear();
        }
    }

    // Method to clean up the SmartGlassesManager
    public void stopSmartGlassesManager() {
        if (smartGlassesManager != null) {
            smartGlassesManager.cleanup();
            smartGlassesManager = null;
            edgeTpaSystem.setSmartGlassesManager(null);
            webSocketLifecycleManager.updateSmartGlassesState(SmartGlassesConnectionState.DISCONNECTED);
        }
    }

    @Subscribe
    public void onGlassesDisplayPowerEvent(GlassesDisplayPowerEvent event) {
        if (smartGlassesManager == null) return;
        if (event.turnedOn) {
            smartGlassesManager.windowManager.showAppLayer("system", () -> smartGlassesManager.sendReferenceCard("AugmentOS Connected", "Screen back on"), 4);
        }
    }

    @Subscribe
    public void onSmartGlassesConnnectionEvent(SmartGlassesConnectionStateChangedEvent event) {
        if (event.connectionState == previousSmartGlassesConnectionState) return;
        webSocketLifecycleManager.updateSmartGlassesState(event.connectionState);
        ServerComms.getInstance().sendGlassesConnectionState(event.device.deviceModelName, event.connectionState.name());
        sendStatusToAugmentOsManager();
        if (event.connectionState == SmartGlassesConnectionState.CONNECTED) {
            Log.d(TAG, "Got event for onGlassesConnected.. CONNECTED ..");

            Log.d(TAG, "****************** SENDING REFERENCE CARD: CONNECTED TO AUGMENT OS");
            if (smartGlassesManager != null)
                playStartupSequenceOnSmartGlasses();

            //start transcribing
            asrPlanner.updateAsrLanguages();
        }
    }

    private static final String[] ARROW_FRAMES = {
           // "↑", "↗", "–", "↘", "↓", "↙", "–", "↖"
            "↑", "↗", "↑", "↖"
    };

    private void playStartupSequenceOnSmartGlasses() {
        if (smartGlassesManager == null || smartGlassesManager.windowManager == null) return;

        Handler handler = new Handler(Looper.getMainLooper());
        int delay = 250; // Frame delay
        int totalFrames = ARROW_FRAMES.length;
        int totalCycles = 4;

        Runnable animate = new Runnable() {
            int frameIndex = 0;
            int cycles = 0;

            @Override
            public void run() {
                // Check for null each time before updating the UI
                if (smartGlassesManager == null || smartGlassesManager.windowManager == null) {
                    return;
                }

                if (cycles >= totalCycles) {
                    // End animation with final message
                    smartGlassesManager.windowManager.showAppLayer(
                            "system",
                            () -> smartGlassesManager.sendTextWall("                  /// AugmentOS Connected \\\\\\"),
                            6
                    );
                    return; // Stop looping
                }

                // Send current frame
                smartGlassesManager.windowManager.showAppLayer(
                        "system",
                        () -> {
                                smartGlassesManager.sendTextWall("                    " + ARROW_FRAMES[frameIndex] + " AugmentOS Booting " + ARROW_FRAMES[frameIndex]);
//                            if (frameIndex % 2 == 0) {
//                                smartGlassesManager.sendTextWall("                    " + ARROW_FRAMES[frameIndex] + " AugmentOS Booting " + ARROW_FRAMES[frameIndex]);
//                            } else {
//                                smartGlassesManager.sendTextWall("                  /// AugmentOS Connected \\\\\\");
//                            }
                        },
                        6
                );

                // Move to next frame
                frameIndex = (frameIndex + 1) % totalFrames;

                // Count full cycles
                if (frameIndex == 0) cycles++;

                // Schedule next frame
                handler.postDelayed(this, delay);
            }
        };

        handler.postDelayed(animate, 350); // Start animation
    }

    @Subscribe
    public void onSmartRingButtonEvent(SmartRingButtonOutputEvent event) {
        int buttonId = event.buttonId;
        long time = event.timestamp;
        boolean isDown = event.isDown;

        if(!isDown || buttonId != 1) return;
        Log.d(TAG,"DETECTED BUTTON PRESS W BUTTON ID: " + buttonId);
        currTime = System.currentTimeMillis();

        ServerComms.getInstance().sendButtonPress("ring", "single");

        //Detect double presses
        if(isDown && currTime - lastPressed < doublePressTimeConst) {
            Log.d(TAG, "Double tap - CurrTime-lastPressed: "+ (currTime-lastPressed));
            ServerComms.getInstance().sendButtonPress("ring", "double");
        }

        if(isDown) {
            lastPressed = System.currentTimeMillis();
        }
    }

    private void parseAugmentosResults(JSONObject jsonResponse) throws JSONException {
        JSONArray notificationArray = jsonResponse.getJSONArray(notificationFilterKey);
        JSONArray newsSummaryArray = jsonResponse.getJSONArray(newsSummaryKey);

        if (notificationArray.length() > 0) {
            JSONArray notifications = notificationArray.getJSONObject(0).getJSONArray("notification_data");
            Log.d(TAG, "Got notifications: " + notifications);

            List<JSONObject> sortedNotifications = new ArrayList<>();
            for (int i = 0; i < notifications.length(); i++) {
                sortedNotifications.add(notifications.getJSONObject(i));
            }

            Collections.sort(sortedNotifications, new Comparator<JSONObject>() {
                @Override
                public int compare(JSONObject a, JSONObject b) {
                    try {
                        return Integer.compare(a.getInt("rank"), b.getInt("rank"));
                    } catch (JSONException e) {
                        // If a rank is missing or unparsable, treat as equal
                        return 0;
                    }
                }
            });

            notificationList.clear();
//        Log.d(TAG, "Got notifications: " + sortedNotifications.toString());

            for (int i = 0; i < sortedNotifications.size(); i++) {
                JSONObject notification = sortedNotifications.get(i);
                String summary = notification.getString("summary");
                notificationList.add(summary);
            }
        }

        if (newsSummaryArray.length() > 0) {
            JSONObject newsSummary = newsSummaryArray.getJSONObject(0);
            latestNewsArray = newsSummary.getJSONObject("news_data").getJSONArray("news_summaries");
            Log.d(TAG, "Latest news: " + latestNewsArray);
        }
    }

    public Runnable parseDisplayEventMessage(JSONObject rawMsg) {
            try {
                // Process all placeholders in the entire JSON structure in a single pass
                SimpleDateFormat sdf = new SimpleDateFormat("M/dd, h:mm");
                String formattedDate = sdf.format(new Date());

                // 12-hour time format (with leading zeros for hours)
                SimpleDateFormat time12Format = new SimpleDateFormat("hh:mm");
                String time12 = time12Format.format(new Date());

                // 24-hour time format
                SimpleDateFormat time24Format = new SimpleDateFormat("HH:mm");
                String time24 = time24Format.format(new Date());

                // Current date with format MM/dd
                SimpleDateFormat dateFormat = new SimpleDateFormat("MM/dd");
                String currentDate = dateFormat.format(new Date());

                Map<String, String> placeholders = new HashMap<>();
                placeholders.put("$no_datetime$", formattedDate);
                placeholders.put("$DATE$", currentDate);
                placeholders.put("$TIME12$", time12);
                placeholders.put("$TIME24$", time24);
                placeholders.put("$GBATT$", (batteryLevel == null ? "" : batteryLevel + "%"));

                JSONObject msg = processJSONPlaceholders(rawMsg, placeholders);


                JSONObject layout = msg.getJSONObject("layout");
                String layoutType = layout.getString("layoutType");
                String title;
                String text;
                switch (layoutType) {
                    case "reference_card":
                        title = layout.getString("title");
                        text = layout.getString("text");
                        return () -> smartGlassesManager.sendReferenceCard(title, text);
                    case "text_wall":
                    case "text_line":
                        text = layout.getString("text");
                        return () -> smartGlassesManager.sendTextWall(text);
                    case "double_text_wall":
                        String topText = layout.getString("topText");
                        String bottomText = layout.getString("bottomText");
                        return () -> smartGlassesManager.sendDoubleTextWall(topText, bottomText);
                    case "text_rows":
                        JSONArray rowsArray = layout.getJSONArray("text");
                        String[] stringsArray = new String[rowsArray.length()];
                        for (int k = 0; k < rowsArray.length(); k++)
                            stringsArray[k] = rowsArray.getString(k);
                        return () -> smartGlassesManager.sendRowsCard(stringsArray);
                    case "bitmap_view":
                        String base64Data = layout.getString("data");
                        byte[] decodedBytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT);
                        Bitmap bmp = BitmapJavaUtils.bytesToBitmap(decodedBytes);
                        return () -> smartGlassesManager.sendBitmap(bmp);
                    default:
                        Log.d(TAG, "ISSUE PARSING LAYOUT");
                }
            } catch (JSONException e) {
                e.printStackTrace();
            }
            return () -> {};
    }

    @Subscribe
    public void onGlassesBluetoothSearchDiscoverEvent(GlassesBluetoothSearchDiscoverEvent event){
        blePeripheral.sendGlassesBluetoothDiscoverResultToManager(event.modelName, event.deviceName);
    }

    @Subscribe
    public void onGlassesBluetoothSearchStopEvent(GlassesBluetoothSearchStopEvent event){
        blePeripheral.sendGlassesBluetoothStopToManager(event.modelName);
    }

    @Subscribe
    public void onNewScreenImageEvent(NewScreenImageEvent event) {
        if (smartGlassesManager != null)
            smartGlassesManager.windowManager.showAppLayer("server", () -> smartGlassesManager.sendBitmap(event.bmp), -1);
    }

    private void startNotificationService() {
        Intent notificationServiceIntent = new Intent(this, MyNotificationListeners.class);
        startService(notificationServiceIntent);

        NotificationListenerService.requestRebind(
                new ComponentName(this, MyNotificationListeners.class));
    }

    private void stopNotificationService() {
        Intent notificationServiceIntent = new Intent(this, MyNotificationListeners.class);
        stopService(notificationServiceIntent);
    }

    public boolean getIsSearchingForGlasses() {
        return smartGlassesManager != null
                && smartGlassesManager.getSmartGlassesConnectState() != SmartGlassesConnectionState.DISCONNECTED
                && smartGlassesManager.getSmartGlassesConnectState() != SmartGlassesConnectionState.CONNECTED;
    }

    private void executeOnceSmartGlassesManagerReady(Context context, Runnable action) {
        if (smartGlassesManager != null) {
            // If the manager is already initialized, execute the action immediately
            action.run();
            return;
        }

        // Add the action to the queue
        smartGlassesReadyListeners.add(action);

        // Ensure the manager is started
        startSmartGlassesManager();
    }

    public JSONObject generateStatusJson() {
        try {
            // Creating the main status object
            JSONObject status = new JSONObject();

            // Adding puck battery life and charging status
            JSONObject coreInfo = new JSONObject();
            coreInfo.put("augmentos_core_version", getCoreVersion(this));
            coreInfo.put("core_token", authHandler.getCoreToken());
            coreInfo.put("cloud_connection_status", webSocketStatus.name());
            coreInfo.put("puck_battery_life", batteryStatusHelper.getBatteryLevel());
            coreInfo.put("charging_status", batteryStatusHelper.isBatteryCharging());
            coreInfo.put("sensing_enabled", com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager.getSensingEnabled(this));
            coreInfo.put("contextual_dashboard_enabled", this.contextualDashboardEnabled);
            coreInfo.put("force_core_onboard_mic", com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager.getForceCoreOnboardMic(this));
            coreInfo.put("default_wearable", com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager.getPreferredWearable(this));
            status.put("core_info", coreInfo);
            //Log.d(TAG, "PREFER - Got default wearable: " + com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager.getPreferredWearable(this));

            // Adding connected glasses object
            JSONObject connectedGlasses = new JSONObject();
            if(smartGlassesManager != null && smartGlassesManager.getConnectedSmartGlasses() != null) {
                connectedGlasses.put("model_name", smartGlassesManager.getConnectedSmartGlasses().deviceModelName);
                connectedGlasses.put("battery_life", (batteryLevel == null) ? -1: batteryLevel); //-1 if unknown
                String brightnessString;
                if (brightnessLevel == null) {
                    brightnessString = "-";
                } else if (brightnessLevel == -1){
                    brightnessString = "AUTO";
                } else {
                    brightnessString = brightnessLevel + "%";
                }
                connectedGlasses.put("brightness", brightnessString);
//                Log.d(TAG, "Connected glasses info: " + headUpAngle);
                if (headUpAngle == null) {
                    headUpAngle = 20;
                }
                connectedGlasses.put("headUp_angle", headUpAngle);
            }
            else {
                connectedGlasses.put("is_searching", getIsSearchingForGlasses());
            }
            status.put("connected_glasses", connectedGlasses);

            // Adding wifi status
            JSONObject wifi = new JSONObject();
            wifi.put("is_connected", wifiStatusHelper.isWifiConnected());
            wifi.put("ssid", wifiStatusHelper.getSSID());
            wifi.put("signal_strength", wifiStatusHelper.getSignalStrength());
            status.put("wifi", wifi);

            // Adding gsm status
            JSONObject gsm = new JSONObject();
            gsm.put("is_connected", gsmStatusHelper.isConnected());
            gsm.put("carrier", gsmStatusHelper.getNetworkType());
            gsm.put("signal_strength", gsmStatusHelper.getSignalStrength());
            status.put("gsm", gsm);

            // Adding apps array
            JSONArray apps = new JSONArray();

//            for (ThirdPartyEdgeApp tpa : edgeTpaSystem.getThirdPartyApps()) {
//                if(tpa.appType != ThirdPartyAppType.APP) continue;
//
//                JSONObject tpaObj = tpa.toJson(false);
//                tpaObj.put("is_running", edgeTpaSystem.checkIsThirdPartyAppRunningByPackageName(tpa.packageName));
//                tpaObj.put("is_foreground", edgeTpaSystem.checkIsThirdPartyAppRunningByPackageName(tpa.packageName));
//                apps.put(tpaObj);
//            }

            // Check if cachedThirdPartyAppList is not null before iterating
            if (cachedThirdPartyAppList != null) {
                for (ThirdPartyCloudApp tpa : cachedThirdPartyAppList) {
                    JSONObject tpaObj = tpa.toJson(false);
                    tpaObj.put("is_foreground", false);//tpaSystem.checkIsThirdPartyAppRunningByPackageName(tpa.packageName));
                    apps.put(tpaObj);
                }
            }

            // Adding apps array to the status object
            status.put("apps", apps);

            // Add auth to status object
            status.put("auth", authHandler.toJson());

            // Wrapping the status object inside a main object (as shown in your example)
            JSONObject mainObject = new JSONObject();
            mainObject.put("status", status);

            return mainObject;
        } catch (JSONException e) {
            throw new RuntimeException(e);
        }
    }

    public void initializeServerCommsCallbacks() {
        ServerComms.getInstance().setServerCommsCallback(new ServerCommsCallback() {
            @Override
            public void onConnectionAck() {
                serverCommsHandler.postDelayed(() -> locationSystem.sendLocationToServer(), 500);
            }
            @Override
            public void onAppStateChange(List<ThirdPartyCloudApp> appList) {
                cachedThirdPartyAppList = appList;
                sendStatusToAugmentOsManager();
            }

            @Override
            public void onDisplayEvent(JSONObject displayData) {
                Runnable newRunnable = parseDisplayEventMessage(displayData);
                if (smartGlassesManager != null)
                    smartGlassesManager.windowManager.showAppLayer("serverappid", newRunnable, -1);
                if (blePeripheral != null)
                    blePeripheral.sendGlassesDisplayEventToManager(displayData);  //THIS LINE RIGHT HERE ENDS UP TRIGGERING IT
            }

            @Override
            public void onDashboardDisplayEvent(JSONObject dashboardDisplayData) {
                cachedDashboardDisplayObject = dashboardDisplayData;
            }

            @Override
            public void onConnectionError(String errorMsg) {
                if(blePeripheral != null) {
                    blePeripheral.sendNotifyManager("Connection error: " + errorMsg, "error");
                }
            }

            @Override
            public void onAuthError() {
                // TODO: do a thing
                // TODO: is this the way we want to do it? should just be in status maybe???
                // blePeripheral.sendAuthErrorToManager();
                authHandler.deleteAuthSecretKey();
                sendStatusToAugmentOsManager();
            }

            @Override
            public void onMicrophoneStateChange(boolean microphoneEnabled) {
                if (smartGlassesManager != null  && com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager.getSensingEnabled(getApplicationContext())) {
                    smartGlassesManager.changeMicrophoneState(microphoneEnabled);
                }
            }

            @Override
            public void onConnectionStatusChange(WebSocketManager.IncomingMessageHandler.WebSocketStatus status) {
                webSocketStatus = status;
                sendStatusToAugmentOsManager();
            }

            @Override
            public void onRequestSingle(String dataType) {
                switch (dataType) {
                    case "core_status":
                        Log.d(TAG, "Server wants a core_status");
                        sendStatusToBackend();
                    break;
                    case "photo":
                        Log.d(TAG, "Server wants a photo");
                    default:
                        Log.d(TAG, "Unknown onRequestSingle dataType: " + dataType);
                        break;
                }
            }
        });
    }

    // AugmentOS_Manager Comms Callbacks
    public void sendStatusToBackend() {
        JSONObject status = generateStatusJson();
        ServerComms.getInstance().sendCoreStatus(status);
    }
    public void sendStatusToAugmentOsManager(){
        JSONObject status = generateStatusJson();
        blePeripheral.sendDataToAugmentOsManager(status.toString());
    }

    @Override
    public void requestPing() {
        blePeripheral.sendPing();
    }

    @Override
    public void requestStatus() {
        sendStatusToAugmentOsManager();
    }

    @Override
    public void searchForCompatibleDeviceNames(String modelName) {
        Log.d("AugmentOsService", "Searching for compatible device names for model: " + modelName);
        SmartGlassesDevice device = com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager.getSmartGlassesDeviceFromModelName(modelName);
        if (device == null) {
            blePeripheral.sendNotifyManager("Incorrect model name: " + modelName, "error");
            return;
        }

        executeOnceSmartGlassesManagerReady(this, () -> {
            smartGlassesManager.findCompatibleDeviceNames(device);
            // blePeripheral.sendGlassesSearchResultsToManager(modelName, compatibleDeviceNames);
        });
    }

    @Override
    public void connectToWearable(String modelName, String deviceName) {
        Log.d("AugmentOsService", "Connecting to wearable: " + modelName + ". DeviceName: " + deviceName + ".");
        
        SmartGlassesDevice device = com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager.getSmartGlassesDeviceFromModelName(modelName);
        if (device == null) {
            blePeripheral.sendNotifyManager("Incorrect model name: " + modelName, "error");
            return;
        }

        // TODO: Good lord this is hacky
        // TODO: Find a good way to conditionally send a glasses bt device name to SGC
        if (!deviceName.isEmpty() && modelName.contains("Even Realities"))
            savePreferredG1DeviceId(this, deviceName);

        executeOnceSmartGlassesManagerReady(this, () -> {
            smartGlassesManager.connectToSmartGlasses(device);
            sendStatusToAugmentOsManager();
        });
    }

    @Override
    public void disconnectWearable(String wearableId) {
        Log.d("AugmentOsService", "Disconnecting from wearable: " + wearableId);
        // Instead of stopping the service, reset the state
        if (smartGlassesManager != null) {
            smartGlassesManager.resetState();
        }
        sendStatusToAugmentOsManager();
    }

    @Override
    public void forgetSmartGlasses() {
        Log.d("AugmentOsService", "Forgetting wearable");
        com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager.savePreferredWearable(this, "");
        deleteEvenSharedPreferences(this);
        brightnessLevel = null;
        batteryLevel = null;
        
        // Reset instead of stopping
        if (smartGlassesManager != null) {
            smartGlassesManager.resetState();
        }
        
        sendStatusToAugmentOsManager();
    }

    // TODO: Can remove this?
    @Override
    public void startApp(String packageName) {
        Log.d("AugmentOsService", "Starting app: " + packageName);
        // Logic to start the app by package name

        ServerComms.getInstance().startApp(packageName);
        if (smartGlassesManager == null || smartGlassesManager.getConnectedSmartGlasses() == null) {
        //    blePeripheral.sendNotifyManager("Connect glasses to use your app", "success");
        }
    }

    // TODO: Can remove this?
    @Override
    public void stopApp(String packageName) {
        Log.d("AugmentOsService", "Stopping app: " + packageName);
        ServerComms.getInstance().stopApp(packageName);
    }

    @Override
    public void setForceCoreOnboardMic(boolean toForceCoreOnboardMic) {
        com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager.saveForceCoreOnboardMic(this, toForceCoreOnboardMic);
        if(smartGlassesManager != null && smartGlassesManager.getConnectedSmartGlasses() != null) {
            blePeripheral.sendNotifyManager(this.getResources().getString(R.string.SETTING_WILL_APPLY_ON_NEXT_GLASSES_CONNECTION), "success");
        }
        sendStatusToBackend();
    }

    @Override
    public void setSensingEnabled(boolean sensingEnabled) {
        com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager.saveSensingEnabled(this, sensingEnabled);
        if(smartGlassesManager != null && smartGlassesManager.getConnectedSmartGlasses() != null) {
            blePeripheral.sendNotifyManager(this.getResources().getString(R.string.SETTING_WILL_APPLY_ON_NEXT_GLASSES_CONNECTION), "success");
        }
        sendStatusToBackend();
    }

    @Override
    public void setContextualDashboardEnabled(boolean contextualDashboardEnabled) {
        saveContextualDashboardEnabled(contextualDashboardEnabled);
        this.contextualDashboardEnabled = contextualDashboardEnabled;
    }

    public boolean getContextualDashboardEnabled() {
        return this.getSharedPreferences("AugmentOSPrefs", Context.MODE_PRIVATE).getBoolean("contextual_dashboard_enabled", true);
    }

    public void saveContextualDashboardEnabled(boolean enabled) {
        SharedPreferences sharedPreferences = this.getSharedPreferences("AugmentOSPrefs", Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = sharedPreferences.edit();
        editor.putBoolean("contextual_dashboard_enabled", enabled);
        editor.apply();
    }

    // TODO: Can remove this?
    @Override
    public void installAppFromRepository(String repository, String packageName) throws JSONException {
        Log.d("AugmentOsService", "Installing app from repository: " + packageName);
        blePeripheral.sendNotifyManager("Not implemented", "error");
    }

    // TODO: Can remove this?
    @Override
    public void uninstallApp(String uninstallPackageName) {
        Log.d(TAG, "uninstallApp not implemented");
        blePeripheral.sendNotifyManager("Not implemented", "error");
    }

    @Override
    public void requestAppInfo(String packageNameToGetDetails) {
        ThirdPartyEdgeApp tpa = edgeTpaSystem.getThirdPartyAppByPackageName(packageNameToGetDetails);
        if (tpa == null) {
            blePeripheral.sendNotifyManager("Could not find app", "error");
            sendStatusToAugmentOsManager();
            return;
        }
        JSONArray settings = tpa.getSettings(this);
        if (settings == null) {
            blePeripheral.sendNotifyManager("Could not get app's details", "error");
            return;
        }
        blePeripheral.sendAppInfoToManager(tpa);
    }

    @Override
    public void handleNotificationData(JSONObject notificationData){
        try {
            if (notificationData != null) {
                String appName = notificationData.getString("appName");
                String title = notificationData.getString("title");
                String text = notificationData.getString("text");
                long timestamp = notificationData.getLong("timestamp");
                String uuid = notificationData.getString("uuid");

                ServerComms.getInstance().sendPhoneNotification(uuid, appName, title, text, "high");

                //EventBus.getDefault().post(new NotificationEvent(title, text, appName, timestamp, uuid));
            } else {
                System.out.println("Notification Data is null");
            }
        } catch (JSONException e) {
            Log.d(TAG, "JSONException occurred while handling notification data: " + e.getMessage());
        }
    }

    @Override
    public void updateGlassesBrightness(int brightness) {
        Log.d("AugmentOsService", "Updating glasses brightness: " + brightness);
        if (smartGlassesManager != null) {
            String title = "Brightness Adjustment";
            String body = "Updating glasses brightness to " + brightness + "%.";
            smartGlassesManager.windowManager.showAppLayer("system", () -> smartGlassesManager.sendReferenceCard(title, body), 6);
            smartGlassesManager.updateGlassesBrightness(brightness);
        } else {
            blePeripheral.sendNotifyManager("Connect glasses to update brightness", "error");
        }
    }

    @Override
    public void updateGlassesHeadUpAngle(int headUpAngle) {
        Log.d("AugmentOsService", "Updating glasses head up angle: " + headUpAngle);
        if (smartGlassesManager != null) {
            smartGlassesManager.updateGlassesHeadUpAngle(headUpAngle);
        } else {
            blePeripheral.sendNotifyManager("Connect glasses to update head up angle", "error");
        }
    }

    @Override
    public void setAuthSecretKey(String uniqueUserId, String authSecretKey) {
        Log.d("AugmentOsService", "Setting auth secret key: " + authSecretKey);
        if (authHandler.getCoreToken() == null ||!authHandler.getCoreToken().equals(authSecretKey)) {
            authHandler.setAuthSecretKey(authSecretKey);
            ServerComms.getInstance().disconnectWebSocket();
            ServerComms.getInstance().connectWebSocket(authHandler.getCoreToken());
        }
        authHandler.verifyAuthSecretKey(uniqueUserId);
        sendStatusToAugmentOsManager();
    }

    @Override
    public void verifyAuthSecretKey() {
        Log.d("AugmentOsService", "verify auth secret key");
    }

    @Override
    public void deleteAuthSecretKey() {
        Log.d("AugmentOsService", "Deleting auth secret key");
        authHandler.deleteAuthSecretKey();
        sendStatusToAugmentOsManager();
    }

    @Override
    public void updateAppSettings(String targetApp, JSONObject settings) {
        Log.d("AugmentOsService", "Updating settings for app: " + targetApp);
        ThirdPartyEdgeApp tpa = edgeTpaSystem.getThirdPartyAppByPackageName(targetApp);
        if (tpa == null) {
            blePeripheral.sendNotifyManager("Could not find app", "error");
            return;
        }

        boolean allSuccess = true;
        try {
            // New loop over all keys in the settings object
            Iterator<String> keys = settings.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                Object value = settings.get(key);
                if(!tpa.updateSetting(this, key, value)) {
                    allSuccess = false;
                }
            }
        } catch (JSONException e) {
            Log.e("AugmentOsService", "Failed to parse settings object", e);
            allSuccess = false;
        }

        if (!allSuccess) {
            blePeripheral.sendNotifyManager("Error updating settings", "error");
        }
    }

    @Override
    public void onDestroy(){
        locationSystem.stopLocationUpdates();
        screenCaptureHandler.removeCallbacks(screenCaptureRunnable);
        if (virtualDisplay != null) virtualDisplay.release();
        if (mediaProjection != null) mediaProjection.stop();
        EventBus.getDefault().unregister(this);

        if (blePeripheral != null) {
            blePeripheral.destroy();
        }

        if (smartGlassesManager != null) {
            smartGlassesManager.cleanup();
            smartGlassesManager = null;
            edgeTpaSystem.setSmartGlassesManager(null);
            webSocketLifecycleManager.updateSmartGlassesState(SmartGlassesConnectionState.DISCONNECTED);
        }

        if(edgeTpaSystem != null) {
            edgeTpaSystem.destroy();
        }

        if (webSocketLifecycleManager != null) {
            webSocketLifecycleManager.cleanup();
        }

        ServerComms.getInstance().disconnectWebSocket();
        super.onDestroy();
    }


    public class LocalBinder extends Binder {
        public AugmentosService getService() {
            // Return this instance of LocalService so clients can call public methods
            return AugmentosService.this;
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        Log.d(TAG, "Something bound");
        return binder;
    }
}