package com.teamopensmartglasses.convoscope.comms;

import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;


public class AugmentOsManagerMessageParser {
    private static final String TAG = "AugmentOsMessageParser";
    private final AugmentOsActionsCallback callback;

    public AugmentOsManagerMessageParser(AugmentOsActionsCallback callback) {
        this.callback = callback;  // Store the callback reference for triggering actions
    }

    public void parseMessage(String json) throws JSONException {
            JSONObject commandObject = new JSONObject(json);
            String command = commandObject.getString("command");

            switch (command) {
                case "ping":
                    callback.requestPing();
                    break;

                case "request_status":
                    callback.requestStatus();
                    break;

                case "search_for_compatible_device_names":
                    String modelNameToFind = commandObject.getJSONObject("params").getString("model_name");
                    callback.searchForCompatibleDeviceNames(modelNameToFind);
                break;

                case "connect_wearable":
                    String modelName = commandObject.getJSONObject("params").getString("model_name");
                    String deviceName = commandObject.getJSONObject("params").getString("device_name");
                    callback.connectToWearable(modelName, deviceName);
                    break;

                case "forget_smart_glasses":
                    callback.forgetSmartGlasses();
                    break;

                case "disconnect_wearable":
                    // String disconnectId = commandObject.getJSONObject("params").getString("target");
                    String disconnectId = "notImplemented";
                    callback.disconnectWearable(disconnectId);
                    break;

                case "start_app":
                    String packageName = commandObject.getJSONObject("params").getString("target");
                    callback.startApp(packageName);
                    break;

                case "stop_app":
                    String stopPackage = commandObject.getJSONObject("params").getString("target");
                    callback.stopApp(stopPackage);
                    break;

                case "enable_sensing":
                    boolean sensingEnabled = commandObject.getJSONObject("params").getBoolean("enabled");
                    callback.setSensingEnabled(sensingEnabled);
                    break;

                case "enable_contextual_dashboard":
                    boolean dashboardEnabled = commandObject.getJSONObject("params").getBoolean("enabled");
                    callback.setContextualDashboardEnabled(dashboardEnabled);
                    break;

                case "install_app_from_repository": // TODO: Implement repository handling
//                    String repo = commandObject.getJSONObject("params").getString("repository");
                    String packageNameToInstall = commandObject.getJSONObject("params").getString("target");
                    callback.installAppFromRepository("repo", packageNameToInstall);
                    break;

                case "uninstall_app":
                    String uninstallPackage = commandObject.getJSONObject("params").getString("target");
                    callback.uninstallApp(uninstallPackage);
                    break;

                case "phone_notification":
                    JSONObject notificationData = commandObject.getJSONObject("params");
                    callback.handleNotificationData(notificationData);
                    break;

                case "set_auth_secret_key":
                    String authKey = commandObject.getJSONObject("params").getString("authSecretKey");
                    callback.setAuthSecretKey(authKey);
                    break;

                case "verify_auth_secret_key":
                    callback.verifyAuthSecretKey();
                    break;

                case "delete_auth_secret_key":
                    callback.deleteAuthSecretKey();
                    break;

                case "update_app_settings":
                    String targetApp = commandObject.getJSONObject("params").getString("target");
                    JSONObject settings = commandObject.getJSONObject("params").getJSONObject("settings");
                    callback.updateAppSettings(targetApp, settings);
                    break;
                case "request_app_info":
                    String packageNameToGetDetails = commandObject.getJSONObject("params").getString("target");
                    callback.requestAppInfo(packageNameToGetDetails);
                    break;

                case "update_glasses_brightness":
                    int brightnessLevel = commandObject.getJSONObject("params").getInt("brightness");
                    callback.updateGlassesBrightness(brightnessLevel);
                    break;

                default:
                    Log.w(TAG, "Unknown command: " + command);
            }
    }
}
