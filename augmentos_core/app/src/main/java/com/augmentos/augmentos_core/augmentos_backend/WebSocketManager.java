package com.augmentos.augmentos_core.augmentos_backend;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

/**
 * Low-level OkHttp WebSocket wrapper. This class holds the actual connection,
 * calls "onIncomingMessage" when JSON arrives, etc.
 *
 * ServerComms uses this, so we only have ONE WebSocket in the entire system.
 */
public class WebSocketManager extends WebSocketListener {
    private static final String TAG = "WearableAi_WebSocketManager";
    private static final int MAX_RETRY_ATTEMPTS = 9999999;
    private static final long INITIAL_RETRY_DELAY_MS = 1000; // Start with 1 second
    private static final long MAX_RETRY_DELAY_MS = 30000;    // Max 30 seconds

    // Callback interface to push messages/events back to ServerComms
    public interface IncomingMessageHandler {
        void onIncomingMessage(JSONObject msg);
        void onConnectionOpen();
        void onConnectionClosed();
        void onError(String error);
    }

    private final IncomingMessageHandler handler;
    private OkHttpClient client;
    private WebSocket webSocket;
    private boolean connected = false;
    private String serverUrl;
    private int retryAttempts = 0;
    private boolean intentionalDisconnect = false;
    private final Handler reconnectHandler = new Handler(Looper.getMainLooper());

    // Exponential backoff runnable
    private final Runnable reconnectRunnable = new Runnable() {
        @Override
        public void run() {
            if (!intentionalDisconnect && !connected && retryAttempts < MAX_RETRY_ATTEMPTS) {
                Log.d(TAG, "Attempting to reconnect... Attempt " + (retryAttempts + 1));
                connectInternal();
            }
        }
    };

    public WebSocketManager(IncomingMessageHandler handler) {
        this.handler = handler;
    }

    /**
     * Opens a connection to the given WebSocket URL.
     */
    public void connect(String url) {
        this.serverUrl = url;
        this.intentionalDisconnect = false;
        this.retryAttempts = 0;
        connectInternal();
    }

    private void connectInternal() {
        if (connected) {
            Log.d(TAG, "Already connected.");
            return;
        }

        cleanup(); // Clean up any existing connections

        client = new OkHttpClient.Builder()
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .pingInterval(15, TimeUnit.SECONDS)
                .build();

        Request request = new Request.Builder().url(serverUrl).build();
        webSocket = client.newWebSocket(request, this);
    }

    /**
     * Closes the connection gracefully.
     */
    public void disconnect() {
        intentionalDisconnect = true;
        reconnectHandler.removeCallbacks(reconnectRunnable);
        if (webSocket != null && connected) {
            webSocket.close(1000, "Normal closure");
        }
        cleanup();
    }

    /**
     * True if currently connected/open.
     */
    public boolean isConnected() {
        return connected;
    }

    /**
     * Send text (JSON) over the WebSocket.
     */
    public void sendText(String text) {
        if (webSocket != null && connected) {
            webSocket.send(text);
        } else {
            Log.e(TAG, "Cannot send text; WebSocket not open.");
        }
    }

    /**
     * Send binary data over the WebSocket (e.g. raw PCM audio).
     */
    public void sendBinary(byte[] data) {
        if (webSocket != null && connected) {
            webSocket.send(ByteString.of(data));
        } else {
            Log.e(TAG, "Cannot send binary; WebSocket not open.");
        }
    }

    private void scheduleReconnect() {
        if (intentionalDisconnect || connected || retryAttempts >= MAX_RETRY_ATTEMPTS) {
            return;
        }

        // Exponential backoff with jitter
        long delay = Math.min(
                INITIAL_RETRY_DELAY_MS * (long) Math.pow(2, retryAttempts) +
                        (long) (Math.random() * 1000), // Add random jitter
                MAX_RETRY_DELAY_MS
        );

        Log.d(TAG, "Scheduling reconnect attempt " + (retryAttempts + 1) +
                " in " + delay + "ms");

        reconnectHandler.postDelayed(reconnectRunnable, delay);
        retryAttempts++;
    }

    // -------------------------------------------
    // WebSocketListener callbacks
    // -------------------------------------------

    @Override
    public void onOpen(WebSocket webSocket, Response response) {
        connected = true;
        retryAttempts = 0; // Reset retry counter on successful connection
        Log.d(TAG, "WebSocket opened: " + response);
        if (handler != null) {
            handler.onConnectionOpen();
        }
    }

    @Override
    public void onMessage(WebSocket webSocket, String text) {
        // A text message (likely JSON).
        try {
            JSONObject json = new JSONObject(text);
            if (handler != null) {
                handler.onIncomingMessage(json);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error parsing message: " + text, e);
        }
    }

    @Override
    public void onMessage(WebSocket webSocket, ByteString bytes) {
        // Binary message, if the server sends any. In many cases, you won't get these.
        Log.d(TAG, "Received binary message, size=" + bytes.size());
        // If needed, handle or convert to JSON. Otherwise ignore.
    }

    @Override
    public void onClosing(WebSocket webSocket, int code, String reason) {
        Log.d(TAG, "WebSocket closing: code=" + code + ", reason=" + reason);
        connected = false;
        if (handler != null) {
            handler.onConnectionClosed();
        }
        cleanup();
        scheduleReconnect();
    }

    @Override
    public void onFailure(WebSocket webSocket, Throwable t, Response response) {
        Log.e(TAG, "WebSocket failure: " + t.getMessage(), t);
        connected = false;
        if (handler != null) {
            handler.onError("WebSocket failure: " + t.getMessage());
        }
        cleanup();
        scheduleReconnect();
    }

    /**
     * Shuts down OkHttp resources, if needed.
     */
    private void cleanup() {
        connected = false;
        if (webSocket != null) {
            webSocket = null;
        }
        if (client != null) {
            client.dispatcher().executorService().shutdown();
            client.connectionPool().evictAll();
            client = null;
        }
    }
}