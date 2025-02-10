package com.augmentos.augmentos_core.augmentos_backend;

import org.json.JSONException;
import org.json.JSONObject;

public interface ServerCommsCallback {
    void onDisplayEvent(JSONObject displayData) throws JSONException;
    void onDashboardDisplayEvent(JSONObject dashboardDisplayData);

}
