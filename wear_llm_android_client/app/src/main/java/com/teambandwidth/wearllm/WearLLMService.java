package com.teambandwidth.wearllm;

import android.content.Intent;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import com.teambandwidth.wearllm.wearllmbackend.BackendServerComms;
import com.teambandwidth.wearllm.wearllmbackend.VolleyJsonCallback;
import com.teamopensmartglasses.sgmlib.DataStreamType;
import com.teamopensmartglasses.sgmlib.FocusStates;
import com.teamopensmartglasses.sgmlib.SGMCommand;
import com.teamopensmartglasses.sgmlib.SGMLib;
import com.teamopensmartglasses.sgmlib.SmartGlassesAndroidService;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.UUID;

public class WearLLMService extends SmartGlassesAndroidService {
    public final String TAG = "WearLLM_WearLLMService";

    private final IBinder binder = new LocalBinder();
    public static final String ACTION_START_FOREGROUND_SERVICE = "WEARLLM_ACTION_START_FOREGROUND_SERVICE";
    public static final String ACTION_STOP_FOREGROUND_SERVICE = "WEARLLM_ACTION_STOP_FOREGROUND_SERVICE";

    //our instance of the SGM library
    public SGMLib sgmLib;

    //WearLLM stuff
    private BackendServerComms backendServerComms;
    ArrayList<String> responses;
    private Handler handler = new Handler(Looper.getMainLooper());
    private Runnable runnableCode;
    static final String userId = "alex";
    static final String deviceId = "android";
    static final String features = "contextual_search_engine";

    public WearLLMService() {
        super(MainActivity.class,
                "wear_llm_app",
                3288,
                "WearLLM",
                "Wearable intelligence upgrades. By Team Bandwidth.", R.drawable.ic_launcher_background);
    }

    @Override
    public void onCreate() {
        super.onCreate();

        //make responses holder
        responses = new ArrayList<>();
        responses.add("Welcome to WearLLM - ask Jarvis questions, ask what you were talking about, request summary of <n> minutes.");

        //Create SGMLib instance with context: this
        sgmLib = new SGMLib(this);

        //Define command with a UUID
        UUID commandUUID = UUID.fromString("5b824bb6-d3b3-417d-8c74-3b103efb403f");
        SGMCommand command = new SGMCommand("WearLLM", commandUUID, new String[]{"WearLLM", "wearable intelligence"}, "AI wearable intelligence.");

        //Register the command
        Log.d(TAG, "Registering WearLLM command with SGMLib");
        sgmLib.registerCommand(command, this::wearLlmStartCommandCallback);

        //setup backend comms
        backendServerComms = new BackendServerComms(this);

        Log.d(TAG, "WearLLM SERVICE STARTED");

        setUpCsePolling();
    }

    public void setUpCsePolling(){
        runnableCode = new Runnable() {
            @Override
            public void run() {
                requestContextualSearchEngine();
                handler.postDelayed(this, 1000);
            }
        };
        handler.post(runnableCode);
    }
    @Override
    public void onDestroy(){
        super.onDestroy();
        handler.removeCallbacks(runnableCode);
    }

    public void wearLlmStartCommandCallback(String args, long commandTriggeredTime){
        Log.d("TAG","WearLLM start callback called");

        //request to be the in focus app so we can continue to show transcripts
        sgmLib.requestFocus(this::focusChangedCallback);

        //Subscribe to transcription stream
        sgmLib.subscribe(DataStreamType.TRANSCRIPTION_ENGLISH_STREAM, this::processTranscriptionCallback);
    }

    public void focusChangedCallback(FocusStates focusState){
        Log.d(TAG, "Focus callback called with state: " + focusState);
        this.focusState = focusState;
    }

    public void processTranscriptionCallback(String transcript, long timestamp, boolean isFinal){
        Log.d(TAG, "PROCESS TRANSCRIPTION CALLBACK. IS IT FINAL? " + isFinal + " " + transcript);

        sendFinalTranscriptToActivity(transcript);
        sendLLMQueryRequest(transcript, isFinal);
    }

    public void sendLLMQueryRequest(String query, boolean isFinal){
        try{
            JSONObject jsonQuery = new JSONObject();
            jsonQuery.put("text", query);
            jsonQuery.put("userId", userId);
            jsonQuery.put("isFinal", isFinal);
            jsonQuery.put("timestamp", System.currentTimeMillis() / 1000);
            backendServerComms.restRequest(BackendServerComms.LLM_QUERY_ENDPOINT, jsonQuery, new VolleyJsonCallback(){
                @Override
                public void onSuccess(JSONObject result){
                    try {
                        Log.d(TAG, "CALLING on Success");
                        parseLLMQueryResult(result);
                    } catch (JSONException e) {
                        throw new RuntimeException(e);
                    }
                }
                @Override
                public void onFailure(){
                    Log.d(TAG, "SOME FAILURE HAPPENED");
                }

            });
        } catch (JSONException e){
            e.printStackTrace();
        }
    }

    public void requestContextualSearchEngine(){
        try{
            JSONObject jsonQuery = new JSONObject();
            jsonQuery.put("userId", userId);
            jsonQuery.put("deviceId", deviceId);
            jsonQuery.put("features", features);
            backendServerComms.restRequest(BackendServerComms.CSE_ENDPOINT, jsonQuery, new VolleyJsonCallback(){
                @Override
                public void onSuccess(JSONObject result){
                    try {
                        Log.d(TAG, "CALLING on Success");
                        Log.d(TAG, "Result: " + result.toString());
                        parseCSEResult(result);
                    } catch (JSONException e) {
                        throw new RuntimeException(e);
                    }
                }
                @Override
                public void onFailure(){
                    Log.d(TAG, "SOME FAILURE HAPPENED");
                }

            });
        } catch (JSONException e){
            e.printStackTrace();
        }
    }

    public void parseLLMQueryResult(JSONObject response) throws JSONException {
        Log.d(TAG, "Got result from server: " + response.toString());
        String message = response.getString("message");
        if (!message.equals("")) {
            responses.add(message);
            sendUiUpdateSingle(message);
            speakTTS(message);
        }
    }

    public void parseCSEResult(JSONObject response) throws JSONException {
        Log.d(TAG, "GOT CSE RESULT: " + response.toString());
        JSONObject in_response = response.getJSONObject("result");
        JSONArray keys = in_response.names();
        if (keys == null){
            return;
        }
        sgmLib.startScrollingText("Contextual Search: ");

        for (int i = 0; i < keys.length(); i++) {
            try {
                String name = keys.getString(i); // Here's your key
                String body = in_response.getJSONObject(name).getString("summary");
                String combined = name + ": " + body;
                Log.d(TAG, name);
                Log.d(TAG, "--- " + body);
                sgmLib.pushScrollingText(combined);
                responses.add(combined);
                sendUiUpdateSingle(combined);
                speakTTS(combined);

            } catch (JSONException e){
                e.printStackTrace();
            }
            return;
        }
    }

    public void speakTTS(String toSpeak){
        sgmLib.sendTextLine(toSpeak);
    }

    public void sendUiUpdateFull(){
        Intent intent = new Intent();
        intent.setAction(MainActivity.UI_UPDATE_FULL);
        intent.putStringArrayListExtra(MainActivity.WEARLLM_MESSAGE_STRING, responses);
        sendBroadcast(intent);
    }

    public void sendUiUpdateSingle(String message) {
        Intent intent = new Intent();
        intent.setAction(MainActivity.UI_UPDATE_SINGLE);
        intent.putExtra(MainActivity.WEARLLM_MESSAGE_STRING, message);
        sendBroadcast(intent);
    }

    public void sendFinalTranscriptToActivity(String transcript){
        Intent intent = new Intent();
        intent.setAction(MainActivity.UI_UPDATE_FINAL_TRANSCRIPT);
        intent.putExtra(MainActivity.FINAL_TRANSCRIPT, transcript);
        sendBroadcast(intent);
    }

    public void buttonDownEvent(int buttonNumber, boolean downUp){ //downUp if true if down, false if up
        if (!downUp){
            return;
        }

        try{
            JSONObject jsonQuery = new JSONObject();
            jsonQuery.put("button_num", buttonNumber);
            jsonQuery.put("button_activity", downUp);
            jsonQuery.put("userId", userId);
            jsonQuery.put("timestamp", System.currentTimeMillis() / 1000);
            backendServerComms.restRequest(BackendServerComms.BUTTON_EVENT_ENDPOINT, jsonQuery, new VolleyJsonCallback(){
                @Override
                public void onSuccess(JSONObject result){
                    try {
                        Log.d(TAG, "GOT BUTTON RESULT: " + result.toString());
                        String query_answer = result.getString("message");
                        sendUiUpdateSingle(query_answer);
                        speakTTS(query_answer);
                    } catch (JSONException e) {
                        throw new RuntimeException(e);
                    }
                }
                @Override
                public void onFailure(){
                    Log.d(TAG, "SOME FAILURE HAPPENED");
                }

            });
        } catch (JSONException e){
            e.printStackTrace();
        }
    }
}