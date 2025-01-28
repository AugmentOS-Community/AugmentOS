package com.teamopensmartglasses.convoscope.tpa;

import static com.teamopensmartglasses.augmentoslib.AugmentOSGlobalConstants.AugmentOSManagerPackageName;
import static com.teamopensmartglasses.augmentoslib.SmartGlassesAndroidService.INTENT_ACTION;

import android.app.ActivityManager;
import android.content.BroadcastReceiver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.ResolveInfo;
import android.content.pm.ServiceInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.util.Log;
import android.content.pm.PackageManager;
import android.widget.Toast;

import com.google.gson.Gson;
import com.teamopensmartglasses.augmentoslib.AugmentOSCommand;
import com.teamopensmartglasses.augmentoslib.DataStreamType;
import com.teamopensmartglasses.augmentoslib.ThirdPartyApp;
import com.teamopensmartglasses.augmentoslib.ThirdPartyAppType;
import com.teamopensmartglasses.augmentoslib.events.BulletPointListViewRequestEvent;
import com.teamopensmartglasses.augmentoslib.events.CommandTriggeredEvent;
import com.teamopensmartglasses.augmentoslib.events.CoreToManagerOutputEvent;
import com.teamopensmartglasses.augmentoslib.events.DisplayCustomContentRequestEvent;
import com.teamopensmartglasses.augmentoslib.events.DoubleTextWallViewRequestEvent;
import com.teamopensmartglasses.augmentoslib.events.FinalScrollingTextRequestEvent;
import com.teamopensmartglasses.augmentoslib.events.GlassesTapOutputEvent;
import com.teamopensmartglasses.augmentoslib.events.HomeScreenEvent;
import com.teamopensmartglasses.augmentoslib.events.IntermediateScrollingTextRequestEvent;
import com.teamopensmartglasses.augmentoslib.events.KillTpaEvent;
import com.teamopensmartglasses.augmentoslib.events.NotificationEvent;
import com.teamopensmartglasses.augmentoslib.events.ReferenceCardImageViewRequestEvent;
import com.teamopensmartglasses.augmentoslib.events.ReferenceCardSimpleViewRequestEvent;
import com.teamopensmartglasses.augmentoslib.events.RegisterCommandRequestEvent;
import com.teamopensmartglasses.augmentoslib.events.RegisterTpaRequestEvent;
import com.teamopensmartglasses.augmentoslib.events.ScrollingTextViewStartRequestEvent;
import com.teamopensmartglasses.augmentoslib.events.ScrollingTextViewStopRequestEvent;
import com.teamopensmartglasses.augmentoslib.events.SmartRingButtonOutputEvent;
import com.teamopensmartglasses.augmentoslib.events.SpeechRecOutputEvent;
import com.teamopensmartglasses.augmentoslib.events.StartAsrStreamRequestEvent;
import com.teamopensmartglasses.augmentoslib.events.StopAsrStreamRequestEvent;
import com.teamopensmartglasses.augmentoslib.events.SubscribeDataStreamRequestEvent;
import com.teamopensmartglasses.augmentoslib.events.TextLineViewRequestEvent;
import com.teamopensmartglasses.augmentoslib.events.TextWallViewRequestEvent;
import com.teamopensmartglasses.augmentoslib.events.TranslateOutputEvent;
import com.teamopensmartglasses.convoscope.AugmentosSmartGlassesService;
import com.teamopensmartglasses.convoscope.events.TriggerSendStatusToAugmentOsManagerEvent;
import com.teamopensmartglasses.convoscope.tpa.eventbusmessages.TPARequestEvent;

import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.Subscribe;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public class TPASystem {
    private String TAG = "WearableAi_TPASystem";
    private Context mContext;
    private AugmentOSLibBroadcastSender augmentOsLibBroadcastSender;
    private AugmentOSLibBroadcastReceiver augmentOsLibBroadcastReceiver;

    private static final String PREFS_NAME = "AugmentOSPrefs";
    private static final String APPS_KEY = "thirdPartyApps";
    private static final String DASHBOARD_APP_KEY = "dashboardApp";


    private BroadcastReceiver packageInstallReceiver;

    private SharedPreferences sharedPreferences;
    private Gson gson;
    private Map<String, ThirdPartyApp> thirdPartyApps;
    private String dashboardAppPackageName;
    private Set<String> runningApps;

    private static final int HEALTH_CHECK_INTERVAL_MS = 5000;  // 5 seconds
    private Handler healthCheckHandler;
    private Runnable healthCheckRunnable;
    private AugmentosSmartGlassesService smartGlassesService;

    public TPASystem(Context context, AugmentosSmartGlassesService smartGlassesService){
        mContext = context;
        this.smartGlassesService = smartGlassesService;
        augmentOsLibBroadcastSender = new AugmentOSLibBroadcastSender(mContext);
        augmentOsLibBroadcastReceiver = new AugmentOSLibBroadcastReceiver(mContext);
        runningApps = new HashSet<>();

        //subscribe to event bus events
        EventBus.getDefault().register(this);

        sharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        gson = new Gson();
        thirdPartyApps = new HashMap<>();
        loadThirdPartyAppsFromStorage();
        setupPackageInstallReceiver();

        healthCheckHandler = new Handler();
        healthCheckRunnable = new Runnable() {
            @Override
            public void run() {
                performHealthCheck();
                healthCheckHandler.postDelayed(this, HEALTH_CHECK_INTERVAL_MS);
            }
        };

        // TODO: Complete the healthCheck system..
        // healthCheckHandler.post(healthCheckRunnable);
    }

    public void setSmartGlassesService(AugmentosSmartGlassesService smartGlassesService) {
        this.smartGlassesService = smartGlassesService;
    }

    private void setupPackageInstallReceiver() {
        packageInstallReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (Intent.ACTION_PACKAGE_ADDED.equals(intent.getAction())) {
                    String packageName = intent.getData().getSchemeSpecificPart();
                    Log.d(TAG, "New app installed: " + packageName);

                    // This will pick up any installed but unregistered apps
                    loadThirdPartyAppsFromStorage();

                    EventBus.getDefault().post(new TriggerSendStatusToAugmentOsManagerEvent());
                }
            }
        };

        IntentFilter filter = new IntentFilter(Intent.ACTION_PACKAGE_ADDED);
        filter.addDataScheme("package");
        mContext.registerReceiver(packageInstallReceiver, filter);
    }

    private ThirdPartyApp getThirdPartyAppIfAppIsAugmentOsThirdPartyApp(String packageName, Context context) {
        PackageManager packageManager = context.getPackageManager();
        Intent augmentOsIntent = new Intent(INTENT_ACTION);
        String thisAppPackageName = context.getPackageName();


        // Query services with the specified action
        List<ResolveInfo> services = packageManager.queryIntentServices(augmentOsIntent, 0);

        for (ResolveInfo resolveInfo : services) {
            if (resolveInfo.serviceInfo != null && resolveInfo.serviceInfo.packageName.equals(packageName)) {
                if (resolveInfo.serviceInfo.packageName.equals(thisAppPackageName)) {
                    Log.d(TAG, "Skipping Core app: " + packageName);
                    continue;
                }

                Log.d(TAG, "AugmentOS TPA detected: " + packageName);

                String authority = packageName + ".augmentosconfigprovider";
                Uri uri = Uri.parse("content://" + authority + "/config");

                Cursor cursor = context.getContentResolver().query(uri, null, null, null, null);
                if (cursor != null) {
                    if (cursor.moveToFirst()) {
                        int jsonColumnIndex = cursor.getColumnIndex("json");
                        if (jsonColumnIndex != -1) {
                            String jsonStr = cursor.getString(jsonColumnIndex);
                            // parse jsonStr, do whatever
                            Log.d(TAG, "WOAH\n\n\n\n\n");
                            Log.d(TAG, "Str: " + jsonStr);
                            Log.d(TAG, "\nEND JSON STR\n\n\n");

                            try {
                                JSONObject jsonObject = new JSONObject(jsonStr); // Parse the jsonStr into a JSONObject
                                String version = jsonObject.has("version") ? jsonObject.getString("version") : "0.0.0";
                                JSONArray settings = jsonObject.has("settings") ? jsonObject.getJSONArray("settings") : new JSONArray();
                                String instructions = jsonObject.has("instructions") ? jsonObject.getString("instructions") : "";
                                return new ThirdPartyApp(
                                        jsonObject.getString("name"),
                                        jsonObject.getString("description"),
                                        instructions,
                                        resolveInfo.serviceInfo.packageName,
                                        resolveInfo.serviceInfo.name,
                                        version,
                                        resolveInfo.serviceInfo.packageName.equals(AugmentOSManagerPackageName) ? ThirdPartyAppType.CORE_SYSTEM : ThirdPartyAppType.APP,
                                        settings,
                                        new AugmentOSCommand[]{}
                                );
                            } catch (Exception e) {
                                Log.e(TAG, "Error parsing JSON: " + e.getMessage(), e);
                            }
                        }
                    }
                    cursor.close();
                }
            }
        }
        return null;
    }

    public ThirdPartyApp getDefaultDashboardApp() {
        ThirdPartyApp defaultDashboard = new ThirdPartyApp(
                "Default Dashboard",
                "A default dashboard",
                "",
                "packageName",
                "serviceName",
                "1.0.0",
                ThirdPartyAppType.DASHBOARD,
                new JSONArray(),
                new AugmentOSCommand[]{}
        );
        return defaultDashboard;
    }

    public ThirdPartyApp getSelectedDashboardApp() {
        return thirdPartyApps.get(dashboardAppPackageName);
    }
    public boolean checkIsThirdPartyAppRunningByPackageName(String packageName) {
        return runningApps.contains(packageName);
    }

    public Set<String> getRunningApps() {
        return new HashSet<>(runningApps);
    }

    public boolean startThirdPartyAppByPackageName(String packageName){
        if(runningApps.contains(packageName))
            return false;

        if (thirdPartyApps.containsKey(packageName) && isAppInstalled(packageName)) {
            ThirdPartyApp tpa = thirdPartyApps.get(packageName);
            if(augmentOsLibBroadcastSender.startThirdPartyApp(Objects.requireNonNull(tpa))) {
                runningApps.add(packageName);
                if(smartGlassesService != null)
                    smartGlassesService.windowManager.showAppLayer("system", () -> smartGlassesService.sendReferenceCard("AugmentOS started app:", tpa.appName), 6);
                return true;
            }
        } else {
            Log.d(TAG, "App " + packageName + " is not installed. Removing from list.");
            unregisterThirdPartyAppByPackageName(packageName);
        }
        return false;
    }

    public void stopThirdPartyAppByPackageName(String packageName){
        if (thirdPartyApps.containsKey(packageName)) {
                runningApps.remove(packageName);
                augmentOsLibBroadcastSender.killThirdPartyApp(Objects.requireNonNull(thirdPartyApps.get(packageName)));
        }
    }

    public ThirdPartyApp getThirdPartyAppByPackageName(String packageName){
        if (thirdPartyApps.containsKey(packageName)){
            return thirdPartyApps.get(packageName);
        }
        return null;
    }

    public void stopAllThirdPartyApps(){
        for (ThirdPartyApp tpa : thirdPartyApps.values()) stopThirdPartyAppByPackageName(tpa.packageName);
    }

    public boolean isAppInstalled(String packageName) {
        PackageManager packageManager = mContext.getPackageManager();
        try {
            packageManager.getPackageInfo(packageName, 0);
            return true;  // Package is installed
        } catch (PackageManager.NameNotFoundException e) {
            return false;  // Package not installed
        }
    }

    @Subscribe
    public void onRegisterTpaRequestEvent(RegisterTpaRequestEvent e){
        registerThirdPartyApp((ThirdPartyApp) e.thirdPartyApp);
    }

    @Subscribe
    public void onCommandTriggeredEvent(CommandTriggeredEvent receivedEvent){
        // TODO: Sort out new implementatation
        //        Log.d(TAG, "Command was triggered: " + receivedEvent.command.getName());
//        AugmentOSCommand command = receivedEvent.command;
//        String args = receivedEvent.args;
//        long commandTriggeredTime = receivedEvent.commandTriggeredTime;
//        if (command != null) {
//            if (command.packageName != null){
//                augmentOsLibBroadcastSender.sendEventToTPAs(CommandTriggeredEvent.eventId, new CommandTriggeredEvent(command, args, commandTriggeredTime));
//            }
//        }
    }

    @Subscribe
    public void onKillTpaEvent(KillTpaEvent killTpaEvent) {
        augmentOsLibBroadcastSender.sendEventToTPAs(KillTpaEvent.eventId, killTpaEvent, killTpaEvent.tpa.packageName);
    }

//    @Subscribe
//    public void onIntermediateTranscript(SpeechRecIntermediateOutputEvent event){
//        boolean tpaIsSubscribed = true; //TODO: Hash out implementation
//        if(tpaIsSubscribed){
//            augmentOsLibBroadcastSender.sendEventToTPAs(SpeechRecIntermediateOutputEvent.eventId, event);
//        }
//    }
//
////    @Subscribe
////    public void onFocusChanged(FocusChangedEvent receivedEvent) {
////        augmentOsLibBroadcastSender.sendEventToTPAs(FocusChangedEvent.eventId, receivedEvent, receivedEvent.appPackage);
////    }
//
//    @Subscribe
//    public void onFinalTranscript(SpeechRecFinalOutputEvent event){
//        boolean tpaIsSubscribed = true; //TODO: Hash out implementation
//        if(tpaIsSubscribed){
//            augmentOsLibBroadcastSender.sendEventToTPAs(SpeechRecFinalOutputEvent.eventId, event);
//        }
//    }

    @Subscribe
    public void onCoreToManagerOutputEvent(CoreToManagerOutputEvent event){
        augmentOsLibBroadcastSender.sendEventToTPAs(CoreToManagerOutputEvent.eventId, event, AugmentOSManagerPackageName);
    }

    public void sendTranscriptEventToTpa(SpeechRecOutputEvent event, String packageName) {
        augmentOsLibBroadcastSender.sendEventToTPAs(SpeechRecOutputEvent.eventId, event, packageName);
    }

    public void sendTranslateEventToTpa(TranslateOutputEvent event, String packageName) {
        augmentOsLibBroadcastSender.sendEventToTPAs(TranslateOutputEvent.eventId, event, packageName);
    }

    @Subscribe
    public void onNotificationEvent(NotificationEvent event){
        augmentOsLibBroadcastSender.sendEventToAllTPAs(NotificationEvent.eventId, event);
    }

    @Subscribe
    public void onSmartRingButtonEvent(SmartRingButtonOutputEvent event){
        boolean tpaIsSubscribed = true; //TODO: Hash out implementation
        if(tpaIsSubscribed){
            augmentOsLibBroadcastSender.sendEventToAllTPAs(SmartRingButtonOutputEvent.eventId, event);
        }
    }

    @Subscribe
    public void onGlassesTapEvent(GlassesTapOutputEvent event){
        boolean tpaIsSubscribed = true; //TODO: Hash out implementation
        if(tpaIsSubscribed){
            augmentOsLibBroadcastSender.sendEventToAllTPAs(GlassesTapOutputEvent.eventId, event);
        }
    }

    public void registerThirdPartyApp(ThirdPartyApp app) {
        ThirdPartyApp oldTpa = getThirdPartyAppByPackageName(app.packageName);
        if (oldTpa != null) {
            Log.d(TAG, "Replacing third party app:" + app.packageName);
            Toast.makeText(mContext, "Replacing third party app:" + app.packageName, Toast.LENGTH_LONG);
            thirdPartyApps.remove(oldTpa.packageName);
        }

        thirdPartyApps.put(app.packageName, app);
        saveThirdPartyAppsToStorage();

        // TODO: Evaluate if we should be doing this
        // Manually triggering these status updates seems like it will lead to chaotic spaghetti slot
        // I *think* status updates should be 99% manager-controlled, basically REST API pattern.
        // EventBus.getDefault().post(new TriggerSendStatusToAugmentOsManagerEvent());
    }

    public void unregisterThirdPartyAppByPackageName(String packageName) {
        runningApps.remove(packageName);
        stopThirdPartyAppByPackageName(packageName);
        thirdPartyApps.remove(packageName);
        saveThirdPartyAppsToStorage();
    }

    private void saveThirdPartyAppsToStorage() {
        // Convert the list to JSON and save to SharedPreferences
        String json = gson.toJson(thirdPartyApps);
        sharedPreferences.edit().putString(APPS_KEY, json).apply();
        sharedPreferences.edit().putString(DASHBOARD_APP_KEY, dashboardAppPackageName).apply();
    }

    public void loadThirdPartyAppsFromStorage() {
        HashMap<String, ThirdPartyApp> newThirdPartyAppList = new HashMap<>();

        ArrayList<String> preinstalledPackageNames = getAllInstalledPackageNames(mContext);
        for (String packageName : preinstalledPackageNames){
            ThirdPartyApp foundTpa = getThirdPartyAppIfAppIsAugmentOsThirdPartyApp(packageName, mContext);
            if(foundTpa != null) {
                Log.d(TAG, "Discovered an unregistered TPA on device: " + packageName);
                // Toast.makeText(mContext, "Discovered an unregistered TPA on device: " + packageName, Toast.LENGTH_LONG).show();
                newThirdPartyAppList.put(foundTpa.packageName, foundTpa);
            }
        }

        // TODO Finish dashboard system
        dashboardAppPackageName = sharedPreferences.getString(DASHBOARD_APP_KEY, null);

        thirdPartyApps = newThirdPartyAppList;

        // Save the filtered list back to storage
        saveThirdPartyAppsToStorage();
    }

    public static ArrayList<String> getAllInstalledPackageNames(Context context) {
        ArrayList<String> packageNames = new ArrayList<>();
        PackageManager packageManager = context.getPackageManager();
        List<PackageInfo> packages = packageManager.getInstalledPackages(0);

        for (PackageInfo packageInfo : packages) {
            packageNames.add(packageInfo.packageName);
        }

        return packageNames;
    }

    public ArrayList<ThirdPartyApp> getThirdPartyApps() {
        return new ArrayList<>(thirdPartyApps.values());
    }

    //respond and approve events below
    @Subscribe
    public void onTPARequestEvent(TPARequestEvent receivedEvent) {
        //map from id to event for all events that don't need permissions
        switch (receivedEvent.eventId) {
            case RegisterCommandRequestEvent.eventId:
                Log.d(TAG, "Resending register command request event");
                EventBus.getDefault().post((RegisterCommandRequestEvent) receivedEvent.serializedEvent);
                return;
            case RegisterTpaRequestEvent.eventId:
                Log.d(TAG, "Resending register TPA request event");
                EventBus.getDefault().post((RegisterTpaRequestEvent) receivedEvent.serializedEvent);
                return;
        }

        //  Check if this TPA should even be running
        if (!checkIsThirdPartyAppRunningByPackageName(receivedEvent.sendingPackage)) {
            Log.d(TAG, "Non-running app '" + receivedEvent.serializedEvent + "' attempting request... weird");
            stopThirdPartyAppByPackageName(receivedEvent.sendingPackage);
            return;
        }

        switch (receivedEvent.eventId) {
            case StartAsrStreamRequestEvent.eventId:
                StartAsrStreamRequestEvent oldStartAsrEvent = (StartAsrStreamRequestEvent) receivedEvent.serializedEvent;

                StartAsrStreamRequestEvent enrichedStartAsrEvent = oldStartAsrEvent.withPackageName(receivedEvent.sendingPackage);
                EventBus.getDefault().post((StartAsrStreamRequestEvent) enrichedStartAsrEvent);
                break;
            case StopAsrStreamRequestEvent.eventId:
                StopAsrStreamRequestEvent oldStopAsrEvent = (StopAsrStreamRequestEvent) receivedEvent.serializedEvent;

                StopAsrStreamRequestEvent enrichedStopAsrEvent = oldStopAsrEvent.withPackageName(receivedEvent.sendingPackage);
                EventBus.getDefault().post((StopAsrStreamRequestEvent) enrichedStopAsrEvent);
                break;
        }

        // For display-related commands
        if (smartGlassesService != null) {
            switch (receivedEvent.eventId) {
                case ReferenceCardSimpleViewRequestEvent.eventId:
                    smartGlassesService.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((ReferenceCardSimpleViewRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((ReferenceCardSimpleViewRequestEvent) receivedEvent.serializedEvent);
                    break;
                case TextWallViewRequestEvent.eventId:
                    smartGlassesService.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((TextWallViewRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((TextWallViewRequestEvent) receivedEvent.serializedEvent);
                    break;
                case DoubleTextWallViewRequestEvent.eventId:
                    smartGlassesService.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((DoubleTextWallViewRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((DoubleTextWallViewRequestEvent) receivedEvent.serializedEvent);
                    break;
                case HomeScreenEvent.eventId:
                    smartGlassesService.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((HomeScreenEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((HomeScreenEvent) receivedEvent.serializedEvent);
                    break;
                case ReferenceCardImageViewRequestEvent.eventId:
                    smartGlassesService.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((ReferenceCardImageViewRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((ReferenceCardImageViewRequestEvent) receivedEvent.serializedEvent);
                    break;
                case BulletPointListViewRequestEvent.eventId:
                    smartGlassesService.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((BulletPointListViewRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((BulletPointListViewRequestEvent) receivedEvent.serializedEvent);
                    break;
                case ScrollingTextViewStartRequestEvent.eventId: //mode start command - gives app focus
                    smartGlassesService.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((ScrollingTextViewStartRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((ScrollingTextViewStartRequestEvent) receivedEvent.serializedEvent);
                    break;
                case ScrollingTextViewStopRequestEvent.eventId:
                    smartGlassesService.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((ScrollingTextViewStopRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((ScrollingTextViewStopRequestEvent) receivedEvent.serializedEvent);
                    break;
                case FinalScrollingTextRequestEvent.eventId:
                    smartGlassesService.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((FinalScrollingTextRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((FinalScrollingTextRequestEvent) receivedEvent.serializedEvent);
                    break;
                case IntermediateScrollingTextRequestEvent.eventId:
                    smartGlassesService.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((IntermediateScrollingTextRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((IntermediateScrollingTextRequestEvent) receivedEvent.serializedEvent);
                    break;
                case TextLineViewRequestEvent.eventId:
                    smartGlassesService.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((TextLineViewRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((TextLineViewRequestEvent) receivedEvent.serializedEvent);
                    break;
                case DisplayCustomContentRequestEvent.eventId:
                    smartGlassesService.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((DisplayCustomContentRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((DisplayCustomContentRequestEvent) receivedEvent.serializedEvent);
            }
        } else {
            Log.d(TAG, "smartGlassesService in TPASystem is null!");
        }
    }

    public void performHealthCheck() {
        boolean deltaFound = false;
        Log.d(TAG, "Performing health check") ;
        for (ThirdPartyApp tpa : thirdPartyApps.values()) {
            if (runningApps.contains(tpa.packageName) && !isThirdPartyAppServiceRunning(tpa)) {
                Log.d(TAG, "Health Check: TPA " + tpa.packageName + " not matching expected state... " +
                        "expected: " + runningApps.contains(tpa.packageName) + ". " +
                        "Removing TPA from running list to repair state...");
                //startThirdPartyAppByPackageName(tpa.packageName);
                runningApps.remove(tpa.packageName);
                deltaFound = true;
            } else if (!runningApps.contains(tpa.packageName) && isThirdPartyAppServiceRunning(tpa)) {
                Log.d(TAG, "Health Check: TPA " + tpa.packageName + " not matching " +
                        "expected state... expected: " + runningApps.contains(tpa.packageName) + ". " +
                        "Killing TPA to repair state...");
                stopThirdPartyAppByPackageName(tpa.packageName);
                deltaFound = true;
            }
        }

        if (deltaFound) {
            // TODO: SEND THIS DELTA OUT AS A STATUS TO MANAGER???
            //EventBus.getDefault().post(new );
            //sendStatusToManager(); // Send consolidated status to the Manager
        }
    }

    private boolean isThirdPartyAppServiceRunning(ThirdPartyApp tpa) {
        ActivityManager manager = (ActivityManager) mContext.getSystemService(Context.ACTIVITY_SERVICE);
        for (ActivityManager.RunningServiceInfo service : manager.getRunningServices(Integer.MAX_VALUE)) {
            if (tpa.packageName.equals(service.service.getPackageName()) &&
                    tpa.serviceName.equals(service.service.getClassName())) {
                return true; // Service matches both packageName and serviceName
            }
        }
        return false;
    }

    public void destroy(){
        augmentOsLibBroadcastReceiver.unregister();
        mContext.unregisterReceiver(packageInstallReceiver);
        EventBus.getDefault().unregister(this);
        if (healthCheckHandler != null) {
            healthCheckHandler.removeCallbacks(healthCheckRunnable);
        }
        Log.d(TAG, "TPASystem destroyed.");
    }
}