package com.augmentos.augmentos_core.augmentos_backend;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * ThirdPartyCloudApp represents an app fetched from the server.
 */
public class ThirdPartyCloudApp {
    String packageName;
    String appName;
    String description;
    String webhookURL;
    String logoURL;
    String appDescription;
    String appInstructions;
    public String version;
    String appType;

    public ThirdPartyCloudApp(String packageName, String appName, String description, String webhookURL, String logoURL) {
        this.packageName = packageName;
        this.appName = appName;
        this.description = description;
        this.webhookURL = webhookURL;
        this.logoURL = logoURL;

        this.version = "1.0.0";
        this.appInstructions = "";
    }

    @Override
    public String toString() {
        return "{\"packageName\":\"" + packageName + "\", \"name\":\"" + appName + "\", \"description\":\"" + description + "\", \"webhookURL\":\"" + webhookURL + "\", \"logoURL\":\"" + logoURL + "\"}";
    }

    public JSONObject toJson(boolean includeSettings) {
        JSONObject tpaObj = new JSONObject();
        try {
            tpaObj.put("name", appName);
            tpaObj.put("description", appDescription);
            tpaObj.put("instructions", appInstructions);
            tpaObj.put("version", version);
            tpaObj.put("packageName", packageName);
            tpaObj.put("type", appType);

            if(includeSettings) {
                //tpaObj.put("settings", settings);
            }
        } catch (JSONException e) {
            throw new RuntimeException(e);
        }
        return tpaObj;
    }
}
