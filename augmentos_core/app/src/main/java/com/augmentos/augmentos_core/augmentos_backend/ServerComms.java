package com.augmentos.augmentos_core.augmentos_backend;

import android.util.Log;

import com.augmentos.augmentos_core.augmentos_backend.WebSocketManager;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.AsrStreamKey;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.augmentos.SpeechRecAugmentos;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.EnvHelper;
import com.augmentos.augmentoslib.enums.AsrStreamType;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.List;

/**
 * ServerComms is the single facade for all WebSocket interactions in AugmentOS_Core.
 * It delegates the low-level socket to WebSocketManager, handles handshake, routing messages,
 * and provides methods to send audio, VAD, phone notifications, hardware events, etc.
 *
 * This class also calls back into SpeechRecAugmentos for "interim"/"final" messages.
 */
public class ServerComms {
    private static final String TAG = "WearableAi_ServerComms";

    private final WebSocketManager wsManager;
    private SpeechRecAugmentos speechRecAugmentos; // callback for speech messages
    private ServerCommsCallback serverCommsCallback;
    // 1) Keep a private static reference
    private static ServerComms instance;

    // 2) Provide a global accessor
    public static synchronized ServerComms getInstance() {
        if (instance == null) {
            instance = new ServerComms(); // calls private constructor
        }
        return instance;
    }

    public void setServerCommsCallback(ServerCommsCallback callback) {
        this.serverCommsCallback = callback;
    }

    private ServerComms() {
        // Create the underlying WebSocketManager (OkHttp-based).
        this.wsManager = new WebSocketManager(new WebSocketManager.IncomingMessageHandler() {
            @Override
            public void onIncomingMessage(JSONObject msg) {
                handleIncomingMessage(msg);
            }

            @Override
            public void onConnectionOpen() {
                // As soon as the connection is open, send the "connection_init" message
                // that your server expects.
                try {
                    JSONObject initMsg = new JSONObject();
                    initMsg.put("type", "connection_init");
                    // You can send any additional fields if your server needs them, e.g. "userId".
                    initMsg.put("userId", "myUser123");
                    // add more fields if needed, e.g. initMsg.put("someField", "someValue");

                    // Send the JSON over the WebSocket
                    wsManager.sendText(initMsg.toString());

                } catch (JSONException e) {
                    Log.e(TAG, "Error building connection_init JSON", e);
                }
            }

            @Override
            public void onConnectionClosed() {
                // Optional: place logic if needed on close
            }

            @Override
            public void onError(String error) {
                // Log errors
                Log.e(TAG, "WebSocket error: " + error);
            }
        });
    }

    /**
     * We can have a reference to the SpeechRecAugmentos module
     * so we can call it when we receive transcription/translation messages.
     */
    public void setSpeechRecAugmentos(SpeechRecAugmentos sr) {
        this.speechRecAugmentos = sr;
    }

    /**
     * Opens the WebSocket to the given URL (e.g. "ws://localhost:7002/glasses-ws").
     */
    public void connectWebSocket() {
        wsManager.connect(getServerUrl());
    }

    /**
     * Disconnects the WebSocket (normal closure).
     */
    public void disconnectWebSocket() {
        wsManager.disconnect();
    }

    /**
     * Checks if we are currently connected.
     */
    public boolean isWebSocketConnected() {
        return wsManager.isConnected();
    }

    // ------------------------------------------------------------------------
    // AUDIO / VAD
    // ------------------------------------------------------------------------

    /**
     * Sends a raw PCM audio chunk as binary data.
     */
    public void sendAudioChunk(byte[] audioData) {
        wsManager.sendBinary(audioData);
    }

    /**
     * Sends a VAD message to indicate speaking or not.
     */
    public void sendVadStatus(boolean isSpeaking) {
        JSONObject vadMsg = new JSONObject();
        try {
            vadMsg.put("type", "VAD");
            vadMsg.put("status", isSpeaking ? "true" : "false");
            wsManager.sendText(vadMsg.toString());
        } catch (JSONException e) {
            Log.e(TAG, "Error building VAD JSON", e);
        }
    }

    /**
     * If you want to update your ASR config (list of languages, translations),
     * call this from SpeechRecAugmentos.
     */
    public void updateAsrConfig(List<AsrStreamKey> languages) {
        if (!wsManager.isConnected()) {
            Log.e(TAG, "Cannot send ASR config: not connected.");
            return;
        }

        try {
            JSONObject configMsg = new JSONObject();
            configMsg.put("type", "config");

            JSONArray streamsArray = new JSONArray();
            for (AsrStreamKey key : languages) {
                JSONObject streamObj = new JSONObject();
                if (key.streamType == AsrStreamType.TRANSCRIPTION) {
                    streamObj.put("streamType", "transcription");
                } else {
                    streamObj.put("streamType", "translation");
                }
                streamObj.put("transcribeLanguage", key.transcribeLanguage);
                if (key.streamType == AsrStreamType.TRANSLATION) {
                    streamObj.put("translateLanguage", key.translateLanguage);
                }
                streamsArray.put(streamObj);
            }
            configMsg.put("streams", streamsArray);

            wsManager.sendText(configMsg.toString());
        } catch (JSONException e) {
            Log.e(TAG, "Error building config message", e);
        }
    }

    // ------------------------------------------------------------------------
    // APP LIFECYCLE (if needed)
    // ------------------------------------------------------------------------

    public void startApp(String packageName) {
        try {
            JSONObject msg = new JSONObject();
            msg.put("type", "start_app");
            msg.put("packageName", packageName);
            msg.put("timestamp", System.currentTimeMillis());
            wsManager.sendText(msg.toString());
        } catch (JSONException e) {
            Log.e(TAG, "Error building start_app JSON", e);
        }
    }

    public void stopApp(String packageName) {
        try {
            JSONObject msg = new JSONObject();
            msg.put("type", "stop_app");
            msg.put("packageName", packageName);
            msg.put("timestamp", System.currentTimeMillis());
            wsManager.sendText(msg.toString());
        } catch (JSONException e) {
            Log.e(TAG, "Error building stop_app JSON", e);
        }
    }

    // ------------------------------------------------------------------------
    // PHONE NOTIFICATIONS (if needed)
    // ------------------------------------------------------------------------

    public void sendPhoneNotification(String notificationId, String app, String title, String content, String priority) {
        try {
            JSONObject event = new JSONObject();
            event.put("type", "phone_notification");
            event.put("notificationId", notificationId);
            event.put("app", app);
            event.put("title", title);
            event.put("content", content);
            event.put("priority", priority);
            event.put("timestamp", System.currentTimeMillis());
            wsManager.sendText(event.toString());
        } catch (JSONException e) {
            Log.e(TAG, "Error building phone_notification JSON", e);
        }
    }

    // ------------------------------------------------------------------------
    // HARDWARE EVENTS (if needed)
    // ------------------------------------------------------------------------

    public void sendButtonPress(String buttonId, String pressType) {
        try {
            JSONObject event = new JSONObject();
            event.put("type", "button_press");
            event.put("buttonId", buttonId);
            event.put("pressType", pressType);
            event.put("timestamp", System.currentTimeMillis());
            wsManager.sendText(event.toString());
        } catch (JSONException e) {
            Log.e(TAG, "Error building button_press JSON", e);
        }
    }

    public void sendHeadPosition(String position) {
        try {
            JSONObject event = new JSONObject();
            event.put("type", "head_position");
            event.put("position", position);
            event.put("timestamp", System.currentTimeMillis());
            wsManager.sendText(event.toString());
        } catch (JSONException e) {
            Log.e(TAG, "Error building head_position JSON", e);
        }
    }

    public void sendBatteryUpdate(int level, boolean charging, Integer timeRemaining) {
        try {
            JSONObject event = new JSONObject();
            event.put("type", "battery_update");
            event.put("level", level);
            event.put("charging", charging);
            event.put("timestamp", System.currentTimeMillis());
            if (timeRemaining != null) {
                event.put("timeRemaining", timeRemaining);
            }
            wsManager.sendText(event.toString());
        } catch (JSONException e) {
            Log.e(TAG, "Error building battery_update JSON", e);
        }
    }

    public void sendGlassesConnectionState(String modelName, String status) {
        try {
            JSONObject event = new JSONObject();
            event.put("type", "glasses_connection_state");
            event.put("modelName", modelName);
            event.put("status", status);
            event.put("timestamp", System.currentTimeMillis());
            wsManager.sendText(event.toString());
        } catch (JSONException e) {
            Log.e(TAG, "Error building button_press JSON", e);
        }
    }

    public void sendLocationUpdate(double lat, double lng) {
        try {
            JSONObject event = new JSONObject();
            event.put("type", "location_update");
            event.put("lat", lat);
            event.put("lng", lng);
            event.put("timestamp", System.currentTimeMillis());
            wsManager.sendText(event.toString());
        } catch (JSONException e) {
            Log.e(TAG, "Error building location_update JSON", e);
        }
    }

    // ------------------------------------------------------------------------
    // INTERNAL: Message Handling
    // ------------------------------------------------------------------------

    /**
     * Called by wsManager when a new JSON message arrives.
     */
    private void handleIncomingMessage(JSONObject msg) {
        String type = msg.optString("type", "");
        try {
            switch (type) {
                case "connection_ack":
                    Log.d(TAG, "Received connection_ack. Possibly store sessionId if needed.");
                    // String sessionId = msg.optString("sessionId", null);
                    break;

                case "connection_error":
                    String errorMsg = msg.optString("message", "Unknown error");
                    Log.e(TAG, "connection_error from server: " + errorMsg);
                    break;

                case "display_event":
                    Log.d(TAG, "Received display_event: " + msg.toString());
                    if (serverCommsCallback != null)
                        serverCommsCallback.onDisplayEvent(msg);
                    break;

                case "interim":
                case "final":
                    // Pass speech messages to SpeechRecAugmentos
                    if (speechRecAugmentos != null) {
                        speechRecAugmentos.handleSpeechJson(msg);
                    } else {
                        Log.w(TAG, "Received speech message but speechRecAugmentos is null!");
                    }
                    break;

                default:
                    Log.w(TAG, "Unknown message type: " + type + " / full: " + msg.toString());
                    break;
            }
        } catch (JSONException e) {
            Log.d(TAG, "Error parsing incomming websocket json: " + e.toString());
        }
    }

    private String getServerUrl() {
        String host = EnvHelper.getEnv("AUGMENTOS_HOST");
        String port = EnvHelper.getEnv("AUGMENTOS_PORT");
        boolean secureServer = Boolean.parseBoolean(EnvHelper.getEnv("AUGMENTOS_SECURE"));
        if (host == null || port == null) {
            throw new IllegalStateException("AugmentOS Server Config Not Found");
        }
        // Could do "ws://" for dev or "wss://" for secure
        return String.format("%s://%s:%s/glasses-ws", secureServer ? "wss" : "ws", host, port);
    }

}
