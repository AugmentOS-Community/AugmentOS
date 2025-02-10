package com.augmentos.augmentos_core.augmentos_backend;

import android.util.Log;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import okhttp3.*;

/**
 * HTTPServerComms handles all standard HTTP requests such as GET and POST.
 * This class can be expanded to support authentication, retries, and headers.
 */
public class HTTPServerComms {
    private static final String TAG = "HTTPServerComms";
    private final OkHttpClient client;
    private final String BASE_URL = "http://localhost:7002";
    private List<ThirdPartyCloudApp> cachedApps = new ArrayList<>(); // Cache apps list in memory

    public HTTPServerComms() {
        this.client = new OkHttpClient();
    }

    /**
     * Perform a GET request to the /apps endpoint and update cache
     */
    public void getApps(Callback callback) {
        String url = BASE_URL + "/apps";
        Request request = new Request.Builder()
                .url(url)
                .get()
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "GET /apps failed: " + e.getMessage());
                callback.onFailure(call, e);
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (response.isSuccessful()) {
                    try {
                        String responseData = response.body().string();
                        JSONArray appsArray = new JSONArray(responseData);
                        List<ThirdPartyCloudApp> appList = new ArrayList<>();

                        for (int i = 0; i < appsArray.length(); i++) {
                            JSONObject appJson = appsArray.getJSONObject(i);
                            ThirdPartyCloudApp app = new ThirdPartyCloudApp(
                                    appJson.optString("packageName", "unknown.package"),
                                    appJson.optString("name", "Unknown App"),
                                    appJson.optString("description", "No description available."),
                                    appJson.optString("webhookURL", ""),
                                    appJson.optString("logoURL", "")
                            );
                            appList.add(app);
                        }
                        cachedApps = appList; // Update cached apps
                        Log.d(TAG, "Updated apps list: " + cachedApps.toString());
                    } catch (JSONException e) {
                        Log.e(TAG, "Error parsing apps JSON", e);
                    }
                }
                callback.onResponse(call, response);
            }
        });
    }

    /**
     * Get the cached apps list (fallback to empty if not yet fetched)
     */
    public List<ThirdPartyCloudApp> getCachedApps() {
        return cachedApps;
    }

    /**
     * General method to perform GET requests
     */
    public void sendGetRequest(String endpoint, Callback callback) {
        String url = BASE_URL + endpoint;
        Request request = new Request.Builder()
                .url(url)
                .get()
                .build();

        client.newCall(request).enqueue(callback);
    }

    /**
     * General method to perform POST requests with a JSON body
     */
    public void sendPostRequest(String endpoint, JSONObject jsonBody, Callback callback) {
        String url = BASE_URL + endpoint;
        RequestBody body = RequestBody.create(
                jsonBody.toString(), MediaType.get("application/json; charset=utf-8")
        );

        Request request = new Request.Builder()
                .url(url)
                .post(body)
                .build();

        client.newCall(request).enqueue(callback);
    }
}

