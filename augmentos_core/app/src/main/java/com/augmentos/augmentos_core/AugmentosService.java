package com.augmentos.augmentos_core;

import static com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.EvenRealitiesG1SGC.deleteEvenSharedPreferences;
import static com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.EvenRealitiesG1SGC.savePreferredG1DeviceId;
import static com.augmentos.augmentos_core.smarterglassesmanager.smartglassesconnection.SmartGlassesAndroidService.getSmartGlassesDeviceFromModelName;
import static com.augmentos.augmentos_core.smarterglassesmanager.smartglassesconnection.SmartGlassesAndroidService.savePreferredWearable;
import static com.augmentos.augmentos_core.statushelpers.CoreVersionHelper.getCoreVersion;
import static com.augmentos.augmentoslib.AugmentOSGlobalConstants.AugmentOSManagerPackageName;
import static com.augmentos.augmentos_core.BatteryOptimizationHelper.handleBatteryOptimization;
import static com.augmentos.augmentos_core.BatteryOptimizationHelper.isSystemApp;
import static com.augmentos.augmentos_core.Constants.notificationFilterKey;
import static com.augmentos.augmentos_core.Constants.newsSummaryKey;
import static com.augmentos.augmentos_core.Constants.augmentOsMainServiceNotificationId;
import static com.augmentos.augmentos_core.statushelpers.JsonHelper.convertJsonToMap;


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
import android.hardware.display.VirtualDisplay;
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
import androidx.preference.PreferenceManager;

import com.augmentos.augmentos_core.augmentos_backend.AuthHandler;
import com.augmentos.augmentos_core.augmentos_backend.HTTPServerComms;
import com.augmentos.augmentos_core.augmentos_backend.ServerComms;
import com.augmentos.augmentos_core.augmentos_backend.ServerCommsCallback;
import com.augmentos.augmentos_core.augmentos_backend.ThirdPartyCloudApp;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.BatteryLevelEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.BrightnessLevelEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.DisplayGlassesDashboardEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchDiscoverEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchStopEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesHeadDownEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesHeadUpEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.SetSensingEnabledEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassesconnection.SmartGlassesAndroidService;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesDisplayPowerEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.SmartGlassesConnectionStateChangedEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.HeadUpAngleEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.SpeechRecSwitchSystem;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesDevice;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.SmartGlassesConnectionState;
import com.posthog.java.PostHog;
import com.augmentos.augmentoslib.PhoneNotification;
import com.augmentos.augmentoslib.ThirdPartyApp;
import com.augmentos.augmentos_core.comms.AugmentOsActionsCallback;
import com.augmentos.augmentos_core.comms.AugmentosBlePeripheral;
import com.augmentos.augmentos_core.events.AugmentosSmartGlassesDisconnectedEvent;
import com.augmentos.augmentos_core.augmentos_backend.OldBackendServerComms;
import com.augmentos.augmentos_core.events.NewScreenImageEvent;
import com.augmentos.augmentos_core.events.ThirdPartyAppErrorEvent;
import com.augmentos.augmentos_core.events.TriggerSendStatusToAugmentOsManagerEvent;
import com.augmentos.augmentos_core.statushelpers.BatteryStatusHelper;
import com.augmentos.augmentos_core.statushelpers.DeviceInfo;
import com.augmentos.augmentos_core.statushelpers.GsmStatusHelper;
import com.augmentos.augmentos_core.statushelpers.WifiStatusHelper;
import com.augmentos.augmentos_core.tpa.TPASystem;


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
import java.util.Map;
import java.util.Collections;
import java.util.List;
//SpeechRecIntermediateOutputEvent
import com.augmentos.augmentos_core.smarterglassesmanager.utils.EnvHelper;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;


public class AugmentosService extends Service implements AugmentOsActionsCallback {
    public static final String TAG = "AugmentOS_AugmentOSService";

    private final IBinder binder = new LocalBinder();

    private static final String POSTHOG_API_KEY = "phc_J7nhqRlkNVoUjKxQZnpYtqRoyEeLl3gFCwYsajxFvpc";
    private static final String POSTHOG_HOST = "https://us.i.posthog.com";
//    private FirebaseAuth firebaseAuth;
//    private FirebaseAuth.AuthStateListener authStateListener;
//    private FirebaseAuth.IdTokenListener idTokenListener;

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

    //AugmentOS stuff
    String authToken = "";
    private OldBackendServerComms oldBackendServerComms;
    private AuthHandler authHandler;
    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private final Handler screenCaptureHandler = new Handler();
    private Runnable screenCaptureRunnable;
    private long lastDataSentTime = 0;
    private final long POLL_INTERVAL_ACTIVE = 200; // 200ms when actively sending data
    private final long POLL_INTERVAL_INACTIVE = 5000; // 5000ms (5s) when inactive
    private final long DATA_SENT_THRESHOLD = 90000; // 90 seconds
    private LocationSystem locationSystem;
    static final String deviceId = "android";
    long previousWakeWordTime = -1; // Initialize this at -1
    private long currTime = 0;
    private long lastPressed = 0;
    private final long lastTapped = 0;

    // Double clicking constants
    private final long doublePressTimeConst = 420;
    private final long doubleTapTimeConst = 600;

    public TPASystem tpaSystem;

    public static PostHog postHog;

    private String userId;
    public SmartGlassesConnectionState previousSmartGlassesConnectionState = SmartGlassesConnectionState.DISCONNECTED;


    private AugmentosBlePeripheral blePeripheral;

    public AugmentosSmartGlassesService smartGlassesService;
    private boolean isSmartGlassesServiceBound = false;
    private final List<Runnable> serviceReadyListeners = new ArrayList<>();
    private NotificationSystem notificationSystem;
    private CalendarSystem calendarSystem;

    private Integer batteryLevel;
    private Integer brightnessLevel;
    private Integer headUpAngle;

    private final boolean showingDashboardNow = false;
    private boolean contextualDashboardEnabled;
    private AsrPlanner asrPlanner;
    private HTTPServerComms httpServerComms;

    public AugmentosService() {
    }

    private final ServiceConnection connection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            AugmentosSmartGlassesService.LocalBinder binder = (AugmentosSmartGlassesService.LocalBinder) service;
            smartGlassesService = (AugmentosSmartGlassesService) binder.getService();
            isSmartGlassesServiceBound = true;
            tpaSystem.setSmartGlassesService(smartGlassesService);
            for (Runnable action : serviceReadyListeners) {
                action.run();
            }
            serviceReadyListeners.clear();
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            Log.d(TAG,"SMART GLASSES SERVICE DISCONNECTED!!!!");
            isSmartGlassesServiceBound = false;
            smartGlassesService = null;
            tpaSystem.setSmartGlassesService(smartGlassesService);

            // TODO: For now, stop all apps on disconnection
            // TODO: Future: Make this nicer
            tpaSystem.stopAllThirdPartyApps();
            sendStatusToAugmentOsManager();
        }
    };

    @Subscribe
    public void onAugmentosSmartGlassesDisconnectedEvent(AugmentosSmartGlassesDisconnectedEvent event){
        // TODO: For now, stop all apps on disconnection
        // TODO: Future: Make this nicer
        tpaSystem.stopAllThirdPartyApps();
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
        if (smartGlassesService != null)
            smartGlassesService.windowManager.hideDashboard();
    }

    @Subscribe
    public void onGlassesTapSideEvent(GlassesTapOutputEvent event) {
        int numTaps = event.numTaps;
        boolean sideOfGlasses = event.sideOfGlasses;
        long time = event.timestamp;

        Log.d(TAG, "GLASSES TAPPED X TIMES: " + numTaps + " SIDEOFGLASSES: " + sideOfGlasses);
        if (smartGlassesService == null) return;
        if (numTaps == 2 || numTaps == 3) {
            if (smartGlassesService.windowManager.isDashboardShowing()) {
                smartGlassesService.windowManager.hideDashboard();
            } else {
                Log.d(TAG, "GOT A DOUBLE+ TAP");
                EventBus.getDefault().post(new DisplayGlassesDashboardEvent());
            }
        }
    }

    @Subscribe
    public void onThirdPartyAppErrorEvent(ThirdPartyAppErrorEvent event) {
        if (blePeripheral != null) {
            blePeripheral.sendNotifyManager(event.text, "error");
        }
        if (tpaSystem != null) {
            tpaSystem.stopThirdPartyAppByPackageName(event.packageName);
        }
        if (smartGlassesService != null) {
            smartGlassesService.windowManager.showAppLayer("system", () -> AugmentosSmartGlassesService.sendReferenceCard("App error", event.text), 10);
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

        // Retrieve the next upcoming event
        CalendarItem calendarItem = calendarSystem.getNextUpcomingEvent();

        long now = System.currentTimeMillis();

        // --- Determine event display string (timeUntil) ---
        SimpleDateFormat simpleDateFormat = new SimpleDateFormat("yyyyMMdd", Locale.getDefault());
        String eventDate = simpleDateFormat.format(new Date(calendarItem.getDtStart()));
        String todayDate = simpleDateFormat.format(new Date(now));

        String timeUntil;
        if (eventDate.equals(todayDate)) {
            // Event is today -> show the time
            SimpleDateFormat timeFormat = new SimpleDateFormat("h:mma", Locale.getDefault());
            timeUntil = timeFormat.format(new Date(calendarItem.getDtStart()));
        } else if (eventDate.equals(simpleDateFormat.format(new Date(now + 24 * 60 * 60 * 1000)))) {
            // Event is tomorrow
            SimpleDateFormat timeFormat = new SimpleDateFormat("h:mma", Locale.getDefault());
            timeUntil = timeFormat.format(new Date(calendarItem.getDtStart())) + " tmrw, " ;
        } else {
            // Event is beyond tomorrow -> no time shown
            timeUntil = "";
        }

        // --- Build date/time line ---
        SimpleDateFormat currentTimeFormat = new SimpleDateFormat("h:mm", Locale.getDefault());
        SimpleDateFormat currentDateFormat = new SimpleDateFormat("MMM d", Locale.getDefault());
        String currentTime = currentTimeFormat.format(new Date());
        String currentDate = currentDateFormat.format(new Date());

        // Battery, date/time, etc.
        String leftHeaderLine = String.format(Locale.getDefault(), "◌ %s %s, %d%%\n", currentTime, currentDate, batteryLevel);

        // --- Build “left text” (notifications) ---
        StringBuilder leftBuilder = new StringBuilder();
        leftBuilder.append(leftHeaderLine);

        // Check notifications in the last 5s
        boolean recentNotificationFound = false;
        ArrayList<PhoneNotification> notifications = notificationSystem.getNotificationQueue();
        PhoneNotification mostRecentNotification = null;
        long mostRecentTime = 0;
        for (PhoneNotification notification : notifications) {
            long notificationTime = notification.getTimestamp();
            if ((notificationTime + 5000) > now) {
                if (mostRecentTime == 0 || notificationTime > mostRecentTime) {
                    mostRecentTime = notificationTime;
                    mostRecentNotification = notification;
                }
            }
        }
        if (mostRecentNotification != null) {
            String mostRecentNotificationString = String.format("%s - %s\n",
                    mostRecentNotification.getTitle(),
                    mostRecentNotification.getText());
            String wrappedRecentNotification = wrapText(mostRecentNotificationString, 25, 4);
            leftBuilder.append(wrappedRecentNotification);
            recentNotificationFound = true;
        }

        if (!recentNotificationFound) {
            // No super-recent notifications: show up to 2 from notificationList
            int notificationCount = Math.min(2, notificationList.size());
            for (int i = 0; i < notificationCount; i++) {
                String wrappedNotification = wrapText(notificationList.get(i), 25, 2);
                leftBuilder.append(String.format("| %s\n", wrappedNotification));
            }
        }

        // Finalize leftText
        String leftText = leftBuilder.toString();

        // --- Build “right text” (calendar + news + fake weather) ---
        StringBuilder rightBuilder = new StringBuilder();

        // CALENDAR
        // Calendar line (only if we have a “today/tmrw” event)
        if (!timeUntil.isEmpty()) {
            // Show a circle before the event
            rightBuilder.append("@ ").append(timeUntil).append(" ");

            // Truncate the calendar event title if needed
            String truncatedTitle = calendarItem.getTitle()
                    .replace("-", " ")
                    .replace("\n", " ")
                    .replaceAll("\\s+", " ")
                    .trim();
            if (truncatedTitle.length() > 12) {
                truncatedTitle = truncatedTitle.substring(0, 12) + "...";
            }
            rightBuilder.append(truncatedTitle).append("\n");
        }

        // NEWS
        String latestNews = null;
        if (latestNewsArray != null && latestNewsArray.length() > 0) {
            latestNewsIndex = (latestNewsIndex + 1) % latestNewsArray.length();
            latestNews = latestNewsArray.getString(latestNewsIndex);
        }

        if (latestNews != null && !latestNews.isEmpty()) {
            // Truncate if too long
            String newsToDisplay = latestNews.substring(0, Math.min(latestNews.length(), 30)).trim();
            if (latestNews.length() > 30) {
                newsToDisplay += "...";
            }
            rightBuilder.append("↑ ").append(newsToDisplay).append("\n");
        }

        // Fake weather line
//        rightBuilder.append("→ Partly Cloudy 42°F\n");

        String rightText = rightBuilder.toString();

        // --- Send the two-column text wall ---
        if (smartGlassesService != null) {
            smartGlassesService.windowManager.showDashboard(() ->
                            smartGlassesService.sendDoubleTextWall(leftText, rightText),
                    -1
            );
        }

        Log.d(TAG, "Dashboard displayed:\nLeft:\n" + leftText + "\nRight:\n" + rightText);
    }

    public static String wrapText(String text, int maxLineLength, int maxLines) {
        StringBuilder wrappedText = new StringBuilder();
        int start = 0;
        int lineCount = 0;
        int textLength = text.length();

        while (start < textLength && lineCount < maxLines) {
            // Tentative end index for this line
            int end = Math.min(start + maxLineLength, textLength);

            // If we've reached the end of the text, append the rest.
            if (end == textLength) {
                wrappedText.append(text.substring(start, end));
                start = end;
                lineCount++;
                break;
            }

            // If the character at 'end' isn't a space, backtrack to the last space
            if (text.charAt(end) != ' ') {
                int lastSpace = text.lastIndexOf(' ', end);
                if (lastSpace > start) {
                    end = lastSpace;
                }
            }

            // Append the segment for the current line
            wrappedText.append(text.substring(start, end).trim());
            lineCount++;

            // Skip any additional spaces for the next line
            start = end;
            while (start < textLength && text.charAt(start) == ' ') {
                start++;
            }

            // If we haven't reached the maximum lines and there is more text, add a newline
            if (lineCount < maxLines && start < textLength) {
                wrappedText.append("\n");
            }
        }

        // If there's any remaining text, append "..." to indicate truncation.
        if (start < textLength) {
            wrappedText.append("...");
        }

        return wrappedText.toString();
    }

    @Subscribe
    public void onGlassBatteryLevelEvent(BatteryLevelEvent event) {
        batteryLevel = event.batteryLevel;
        ServerComms.getInstance().sendBatteryUpdate(event.batteryLevel, false, -1);
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

        authHandler = new AuthHandler(this);

        userId = authHandler.getUniqueIdForAnalytics();
        postHog = new PostHog.Builder(POSTHOG_API_KEY).host(POSTHOG_HOST).build();
        Map<String, Object> props = new HashMap<>();
        props.put("timestamp", System.currentTimeMillis());
        props.put("device_info", DeviceInfo.getDeviceInfo());
        postHog.capture(authHandler.getUniqueIdForAnalytics(), "augmentos_service_started", props);

        //setup backend comms
        oldBackendServerComms = OldBackendServerComms.getInstance(this);
        batteryStatusHelper = new BatteryStatusHelper(this);
        wifiStatusHelper = new WifiStatusHelper(this);
        gsmStatusHelper = new GsmStatusHelper(this);

        notificationSystem = new NotificationSystem(this, userId);
        calendarSystem = CalendarSystem.getInstance(this);

        brightnessLevel = Integer.parseInt(PreferenceManager.getDefaultSharedPreferences(this).getString(getResources().getString(R.string.SHARED_PREF_BRIGHTNESS), "50"));
        headUpAngle = Integer.parseInt(PreferenceManager.getDefaultSharedPreferences(this).getString(getResources().getString(R.string.HEADUP_ANGLE), "20"));

        contextualDashboardEnabled = getContextualDashboardEnabled();

        tpaSystem = new TPASystem(this, smartGlassesService);
        asrPlanner = new AsrPlanner(tpaSystem);

        // Initialize BLE Peripheral
        blePeripheral = new AugmentosBlePeripheral(this, this);
        if (!tpaSystem.isAppInstalled(AugmentOSManagerPackageName)) {
            // TODO: While we use simulated puck, disable the BLE Peripheral for testing
            // TODO: For now, just disable peripheral if manager is installed on same device
            // blePeripheral.start();
        }

        // Whitelist AugmentOS from battery optimization when system app
        // If not system app, bring up the settings menu
        if (isSystemApp(this)) {
            handleBatteryOptimization(this);
        }

        // Automatically connect to glasses on service start
        String preferredWearable = AugmentosSmartGlassesService.getPreferredWearable(this);
        if(!preferredWearable.isEmpty()) {
            SmartGlassesDevice preferredDevice = getSmartGlassesDeviceFromModelName(preferredWearable);
            if (preferredDevice != null) {
                executeOnceSmartGlassesServiceReady(this, () -> {
                    smartGlassesService.connectToSmartGlasses(preferredDevice);
                    sendStatusToAugmentOsManager();
                });
            } else {
                // We have some invalid device saved... delete from preferences
                savePreferredWearable(this, "");
            }
        }

        // Set up backend comms
        this.httpServerComms = new HTTPServerComms();
        ServerComms.getInstance().connectWebSocket();
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
        locationSystem.startLocationSending();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    myChannelId,
                    notificationAppName,
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription(notificationDescription);
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
                startForeground(augmentOsMainServiceNotificationId, updateNotification());

                // Send out the status once AugmentOS_Core is ready :)
                // tpaSystem.stopThirdPartyAppByPackageName(AugmentOSManagerPackageName);
                tpaSystem.startThirdPartyAppByPackageName(AugmentOSManagerPackageName);

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

    // Method to start the Smart Glasses Service and bind to it
    public void startSmartGlassesService() {
        Intent intent = new Intent(this, AugmentosSmartGlassesService.class);
        // startService(intent);  // Start the service if it's not already running
        bindService(intent, connection, Context.BIND_AUTO_CREATE);  // Bind to the service
    }


    public void stopSmartGlassesService() {
        if (smartGlassesService != null) {
            unbindService(connection);  // Unbind from the service
            isSmartGlassesServiceBound = false;
            smartGlassesService = null;
            tpaSystem.setSmartGlassesService(smartGlassesService);
        }
        Intent intent = new Intent(this, AugmentosSmartGlassesService.class);
        stopService(intent);  // Stop the service
    }

    @Subscribe
    public void onGlassesDisplayPowerEvent(GlassesDisplayPowerEvent event) {
        if (smartGlassesService == null) return;
        if (event.turnedOn) {
            smartGlassesService.windowManager.showAppLayer("system", () -> smartGlassesService.sendReferenceCard("AugmentOS Connected", "Screen back on"), 4);
        }
    }

    @Subscribe
    public void onSmartGlassesConnnectionEvent(SmartGlassesConnectionStateChangedEvent event) {
        if (event.connectionState == previousSmartGlassesConnectionState) return;
        ServerComms.getInstance().sendGlassesConnectionState(event.device.deviceModelName, event.connectionState.name());
        sendStatusToAugmentOsManager();
        if (event.connectionState == SmartGlassesConnectionState.CONNECTED) {
            Log.d(TAG, "Got event for onGlassesConnected.. CONNECTED ..");

            Log.d(TAG, "****************** SENDING REFERENCE CARD: CONNECTED TO AUGMENT OS");
            if (smartGlassesService != null)
                smartGlassesService.windowManager.showAppLayer("system", () -> smartGlassesService.sendReferenceCard("", "/// AugmentOS Connected \\\\\\"), 6);

            //start transcribing
            asrPlanner.updateAsrLanguages();

            Map<String, Object> props = new HashMap<>();
            props.put("glasses_model_name", event.device.deviceModelName);
            props.put("timestamp", System.currentTimeMillis());
            postHog.capture(authHandler.getUniqueIdForAnalytics(), "glasses_connected", props);
        }
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

    public void parseDisplayEventMessage(JSONObject msg) throws JSONException {
            try {
                JSONObject layout = msg.getJSONObject("layout");
                String layoutType = layout.getString("layoutType");
                String title;
                String text;
                switch (layoutType) {
                    case "reference_card":
                        title = layout.getString("title");
                        text = layout.getString("text");

                        smartGlassesService.windowManager.showAppLayer("server", () -> smartGlassesService.sendReferenceCard(title, text), -1);
                        break;
                    case "text_wall":
                    case "text_line":
                        text = layout.getString("text");
                        smartGlassesService.windowManager.showAppLayer("server", () -> smartGlassesService.sendTextWall(text), -1);
                        break;
                    case "double_text_wall":
                        String bodyTop = layout.getString("firstText");
                        String bodyBottom = layout.getString("secondText");
                        smartGlassesService.windowManager.showAppLayer("server", () -> smartGlassesService.sendDoubleTextWall(bodyTop, bodyBottom), -1);
                        break;
                    case "text_rows":
                        JSONArray rowsArray = layout.getJSONArray("text");
                        String[] stringsArray = new String[rowsArray.length()];
                        for (int k = 0; k < rowsArray.length(); k++)
                            stringsArray[k] = rowsArray.getString(k);
                        smartGlassesService.windowManager.showAppLayer("server", () -> smartGlassesService.sendRowsCard(stringsArray), -1);
                        break;
                    default:
                        Log.d(TAG, "ISSUE PARSING LAYOUT");
                }
            } catch (JSONException e) {
                e.printStackTrace();
            }
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
        if (smartGlassesService != null)
            smartGlassesService.windowManager.showAppLayer("server", () -> smartGlassesService.sendBitmap(event.bmp), -1);
    }

    private void updateLastDataSentTime() {
        lastDataSentTime = System.currentTimeMillis();
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
        //return isSmartGlassesServiceBound && smartGlassesService.getConnectedSmartGlasses() == null;
        return smartGlassesService != null
                && smartGlassesService.getSmartGlassesConnectState() != SmartGlassesConnectionState.DISCONNECTED
                && smartGlassesService.getSmartGlassesConnectState() != SmartGlassesConnectionState.CONNECTED;
    }

    private void executeOnceSmartGlassesServiceReady(Context context, Runnable action) {
        if (smartGlassesService != null && smartGlassesService != null) {
            // If the service is already bound, execute the action immediately
            action.run();
            return;
        }

        // Add the action to the queue
        serviceReadyListeners.add(action);

        // Ensure the service is started and bound
        if (smartGlassesService == null) {
            startSmartGlassesService();
        }
    }

    public JSONObject generateStatusJson() {
        try {
            // Creating the main status object
            JSONObject status = new JSONObject();

            // Adding puck battery life and charging status
            status.put("augmentos_core_version", getCoreVersion(this));
            status.put("puck_battery_life", batteryStatusHelper.getBatteryLevel());
            status.put("charging_status", batteryStatusHelper.isBatteryCharging());
            status.put("sensing_enabled", SpeechRecSwitchSystem.sensing_enabled);
            status.put("contextual_dashboard_enabled", this.contextualDashboardEnabled);
            status.put("force_core_onboard_mic", AugmentosSmartGlassesService.getForceCoreOnboardMic(this));
            status.put("default_wearable", AugmentosSmartGlassesService.getPreferredWearable(this));
            // Log.d(TAG, "PREFER - Got default wearable: " + AugmentosSmartGlassesService.getPreferredWearable(this));

            // Adding connected glasses object
            JSONObject connectedGlasses = new JSONObject();
            if(smartGlassesService != null && smartGlassesService.getConnectedSmartGlasses() != null) {
                connectedGlasses.put("model_name", smartGlassesService.getConnectedSmartGlasses().deviceModelName);
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
                Log.d(TAG, "Connected glasses info: " + headUpAngle);
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

//            for (ThirdPartyApp tpa : tpaSystem.getThirdPartyApps()) {
//                if(tpa.appType != ThirdPartyAppType.APP) continue;
//
//                JSONObject tpaObj = tpa.toJson(false);
//                //JSONObject tpaObj = new JSONObject();
//                //tpaObj.put("name", tpa.appName);
//                //tpaObj.put("description", tpa.appDescription);
//                tpaObj.put("is_running", tpaSystem.checkIsThirdPartyAppRunningByPackageName(tpa.packageName));
//                tpaObj.put("is_foreground", tpaSystem.checkIsThirdPartyAppRunningByPackageName(tpa.packageName));
//                tpaObj.put("version", tpa.version);
//                //tpaObj.put("package_name", tpa.packageName);
//                //tpaObj.put("type", tpa.appType.name());
//                apps.put(tpaObj);
//            }

            for (ThirdPartyCloudApp tpa : httpServerComms.getCachedApps()) {
                JSONObject tpaObj = tpa.toJson(false);
                tpaObj.put("is_running", false);//tpaSystem.checkIsThirdPartyAppRunningByPackageName(tpa.packageName));
                tpaObj.put("is_foreground", false);//tpaSystem.checkIsThirdPartyAppRunningByPackageName(tpa.packageName));
                apps.put(tpaObj);
            }

            // Adding apps array to the status object
            status.put("apps", apps);

            // Add auth to status object
            status.put("auth", authHandler.toJson());

            // Wrapping the status object inside a main object (as shown in your example)
            JSONObject mainObject = new JSONObject();
            mainObject.put("status", status);

            try {
                Map<String, Object> props = convertJsonToMap(status);
                postHog.capture(authHandler.getUniqueIdForAnalytics(), "status", props);
            } catch (JSONException e) {
                throw new RuntimeException(e);
            }

            return mainObject;
        } catch (JSONException e) {
            throw new RuntimeException(e);
        }
    }

    public void initializeServerCommsCallbacks() {
        ServerComms.getInstance().setServerCommsCallback(new ServerCommsCallback() {
            @Override
            public void onDisplayEvent(JSONObject displayData) throws JSONException {
                parseDisplayEventMessage(displayData);
            }

            @Override
            public void onDashboardDisplayEvent(JSONObject dashboardDisplayData) {
                // TODO: next, have parseDisplayEventMessage return a runnable
                // Save this runnable to "cachedDashboardDisplayRunnable"
            }
        });
    }

    // AugmentOS_Manager Comms Callbacks
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
        SmartGlassesDevice device = getSmartGlassesDeviceFromModelName(modelName);
        if (device == null) {
            blePeripheral.sendNotifyManager("Incorrect model name: " + modelName, "error");
            return;
        }

        executeOnceSmartGlassesServiceReady(this, () -> {
            smartGlassesService.findCompatibleDeviceNames(device);
            // blePeripheral.sendGlassesSearchResultsToManager(modelName, compatibleDeviceNames);
        });
    }

    @Override
    public void connectToWearable(String modelName, String deviceName) {
        Log.d("AugmentOsService", "Connecting to wearable: " + modelName + ". DeviceName: " + deviceName + ".");
        // Logic to connect to wearable
        SmartGlassesDevice device = getSmartGlassesDeviceFromModelName(modelName);
        if (device == null) {
            blePeripheral.sendNotifyManager("Incorrect model name: " + modelName, "error");
            return;
        }

        // TODO: Good lord this is hacky
        // TODO: Find a good way to conditionally send a glasses bt device name to SGC
        if (!deviceName.isEmpty() && modelName.contains("Even Realities"))
            savePreferredG1DeviceId(this, deviceName);

        executeOnceSmartGlassesServiceReady(this, () -> {
            smartGlassesService.connectToSmartGlasses(device);
            sendStatusToAugmentOsManager();
        });
    }

    @Override
    public void disconnectWearable(String wearableId) {
        Log.d("AugmentOsService", "Disconnecting from wearable: " + wearableId);
        // Logic to disconnect wearable
        stopSmartGlassesService();

        //reset some local variables
        brightnessLevel = null;
        batteryLevel = null;
    }

    @Override
    public void forgetSmartGlasses() {
        Log.d("AugmentOsService", "Forgetting wearable");
        savePreferredWearable(this, "");
        deleteEvenSharedPreferences(this);
        stopSmartGlassesService();
        sendStatusToAugmentOsManager();
    }

    @Override
    public void startApp(String packageName) {
        Log.d("AugmentOsService", "Starting app: " + packageName);
        // Logic to start the app by package name

        // Only allow starting apps if glasses are connected
        if (smartGlassesService != null && smartGlassesService.getConnectedSmartGlasses() != null) {
            //tpaSystem.startThirdPartyAppByPackageName(packageName);
            ServerComms.getInstance().startApp(packageName);
            sendStatusToAugmentOsManager();
        } else {
            Log.d(TAG, "Not starting app because glasses aren't connected.");
            blePeripheral.sendNotifyManager("Must connect glasses to start an app", "error");
        }

        Map<String, Object> props = new HashMap<>();
        props.put("package_name", packageName);
        props.put("timestamp", System.currentTimeMillis());
        postHog.capture(authHandler.getUniqueIdForAnalytics(), "start_app", props);
    }

    @Override
    public void stopApp(String packageName) {
        Log.d("AugmentOsService", "Stopping app: " + packageName);
        //tpaSystem.stopThirdPartyAppByPackageName(packageName);
        ServerComms.getInstance().stopApp(packageName);
        sendStatusToAugmentOsManager();

        Map<String, Object> props = new HashMap<>();
        props.put("package_name", packageName);
        props.put("timestamp", System.currentTimeMillis());
        postHog.capture(authHandler.getUniqueIdForAnalytics(), "stop_app", props);
    }

    @Override
    public void setForceCoreOnboardMic(boolean toForceCoreOnboardMic) {
        AugmentosSmartGlassesService.saveForceCoreOnboardMic(this, toForceCoreOnboardMic);
        blePeripheral.sendNotifyManager("Setting will apply next time you connect to glasses", "error");
        Map<String, Object> props = new HashMap<>();
        props.put("set_force_core_onboard_mic", toForceCoreOnboardMic);
        props.put("timestamp", System.currentTimeMillis());
        postHog.capture(authHandler.getUniqueIdForAnalytics(), "set_force_core_onboard_mic", props);
    }

    @Override
    public void setSensingEnabled(boolean sensingEnabled) {
        if (smartGlassesService != null) {
            EventBus.getDefault().post(new SetSensingEnabledEvent(sensingEnabled));
        } else {
            blePeripheral.sendNotifyManager("Connect glasses to toggle sensing", "error");
        }

        Map<String, Object> props = new HashMap<>();
        props.put("sensing_enabled", sensingEnabled);
        props.put("timestamp", System.currentTimeMillis());
        postHog.capture(authHandler.getUniqueIdForAnalytics(), "set_sensing_enabled", props);
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

    @Override
    public void installAppFromRepository(String repository, String packageName) throws JSONException {
        Log.d("AugmentOsService", "Installing app from repository: " + packageName);

        JSONObject jsonQuery = new JSONObject();
        jsonQuery.put("packageName", packageName);

        blePeripheral.sendNotifyManager("Not implemented", "error");

        Map<String, Object> props = new HashMap<>();
        props.put("timestamp", System.currentTimeMillis());
        props.put("respository", repository);
        props.put("package_name", packageName);
        postHog.capture(authHandler.getUniqueIdForAnalytics(), "install_app_from_repo", props);
    }

    @Override
    public void uninstallApp(String uninstallPackageName) {
        Log.d(TAG, "uninstallApp not implemented");
        blePeripheral.sendNotifyManager("Uninstalling is not implemented yet", "error");

        Map<String, Object> props = new HashMap<>();
        props.put("timestamp", System.currentTimeMillis());
        props.put("package_name", uninstallPackageName);
        postHog.capture(authHandler.getUniqueIdForAnalytics(), "install_app_from_repo", props);
    }

    @Override
    public void requestAppInfo(String packageNameToGetDetails) {
        ThirdPartyApp tpa = tpaSystem.getThirdPartyAppByPackageName(packageNameToGetDetails);
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

        Map<String, Object> props = new HashMap<>();
        props.put("package_name", packageNameToGetDetails);
        props.put("timestamp", System.currentTimeMillis());
        postHog.capture(authHandler.getUniqueIdForAnalytics(),"request_app_info", props);
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
        if (smartGlassesService != null) {
            String title = "Brightness Adjustment";
            String body = "Updating glasses brightness to " + brightness + "%.";
            smartGlassesService.windowManager.showAppLayer("system", () -> SmartGlassesAndroidService.sendReferenceCard(title, body), 6);
            smartGlassesService.updateGlassesBrightness(brightness);
        } else {
            blePeripheral.sendNotifyManager("Connect glasses to update brightness", "error");
        }
    }

    @Override
    public void updateGlassesHeadUpAngle(int headUpAngle) {
        Log.d("AugmentOsService", "Updating glasses head up angle: " + headUpAngle);
        if (smartGlassesService != null) {
            smartGlassesService.updateGlassesHeadUpAngle(headUpAngle);
        } else {
            blePeripheral.sendNotifyManager("Connect glasses to update head up angle", "error");
        }
    }

    @Override
    public void setAuthSecretKey(String uniqueUserId, String authSecretKey) {
        Log.d("AugmentOsService", "Setting auth secret key: " + authSecretKey);
        authHandler.setAuthSecretKey(authSecretKey);
        authHandler.verifyAuthSecretKey(uniqueUserId);
        sendStatusToAugmentOsManager();
    }

    @Override
    public void verifyAuthSecretKey() {
        Log.d("AugmentOsService", "Deleting auth secret key");
        // Logic to verify the authentication key
        // (Ping a server /login or /verify route & return the result to aosManager)
        //authHandler.verifyAuthSecretKey();
        //sendStatusToAugmentOsManager();
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
        ThirdPartyApp tpa = tpaSystem.getThirdPartyAppByPackageName(targetApp);
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

        try {
            Map<String, Object> props = new HashMap<>();
            props.put("timestamp", System.currentTimeMillis());
            props.put("package_name", targetApp);
            props.put("settings", convertJsonToMap(settings));
            postHog.capture(authHandler.getUniqueIdForAnalytics(), "update_app_settings", props);
        } catch (JSONException e) {
            Log.d(TAG, "JSONEXCEPTION IN UPDATEAPPSETTINGS???");
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

        if (smartGlassesService != null) {
            unbindService(connection);
            isSmartGlassesServiceBound = false;
            smartGlassesService = null;
            tpaSystem.setSmartGlassesService(smartGlassesService);
        }

        if(tpaSystem != null) {
            tpaSystem.destroy();
        }

        postHog.shutdown();
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
        return binder;
    }
}