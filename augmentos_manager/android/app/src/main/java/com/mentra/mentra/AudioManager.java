package com.mentra.mentra;

import android.content.Context;
import android.util.Log;

import androidx.media3.common.MediaItem;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.common.Player;

import java.util.HashMap;
import java.util.Map;

/**
 * AudioManager handles audio playback requests for the AugmentOS Manager
 * Supports URL-based audio playback using ExoPlayer
 */
public class AudioManager {
    private static final String TAG = "AudioManager";
    private static AudioManager instance;

    private Context context;
    private Map<String, ExoPlayer> players = new HashMap<>();

    // Callback interface for sending responses
    public interface ResponseCallback {
        void onAudioPlayResponse(String requestId, boolean success, String error, Long duration);
    }

    private ResponseCallback responseCallback;

    private AudioManager(Context context) {
        this.context = context.getApplicationContext();
    }

    public static synchronized AudioManager getInstance(Context context) {
        if (instance == null) {
            instance = new AudioManager(context);
        }
        return instance;
    }

    /**
     * Set the callback for audio play responses
     */
    public void setResponseCallback(ResponseCallback callback) {
        this.responseCallback = callback;
    }

    public void playAudio(
            String requestId,
            String audioUrl,
            float volume,
            boolean stopOtherAudio
    ) {
        Log.d(TAG, "playAudio called for requestId: " + requestId);

        if (stopOtherAudio) {
            stopAllAudio();
        }

        if (audioUrl == null || audioUrl.isEmpty()) {
            sendAudioPlayResponse(requestId, false, "Audio URL must be provided", null);
            return;
        }

        playAudioFromUrl(requestId, audioUrl, volume);
    }

    private void playAudioFromUrl(String requestId, String audioUrl, float volume) {
        try {
            ExoPlayer player = new ExoPlayer.Builder(context).build();
            MediaItem mediaItem = MediaItem.fromUri(audioUrl);
            player.setMediaItem(mediaItem);
            player.setVolume(volume);

            player.addListener(new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int playbackState) {
                    if (playbackState == Player.STATE_ENDED) {
                        players.remove(requestId);
                        sendAudioPlayResponse(requestId, true, null, player.getDuration());
                        player.release();
                    } else if (playbackState == Player.STATE_IDLE) {
                        players.remove(requestId);
                        sendAudioPlayResponse(requestId, false, "Playback failed", null);
                        player.release();
                    }
                }
            });

            players.put(requestId, player);
            player.prepare();
            player.play();

        } catch (Exception e) {
            sendAudioPlayResponse(requestId, false, e.getMessage(), null);
        }
    }

    public void stopAudio(String requestId) {
        ExoPlayer player = players.get(requestId);
        if (player != null) {
            player.stop();
            player.release();
            players.remove(requestId);
        }

        Log.d(TAG, "Stopped audio for requestId: " + requestId);
    }

    public void stopAllAudio() {
        for (ExoPlayer player : players.values()) {
            player.stop();
            player.release();
        }
        players.clear();

        Log.d(TAG, "Stopped all audio");
    }

    private void sendAudioPlayResponse(String requestId, boolean success, String error, Long duration) {
        Log.d(TAG, "Audio play response - requestId: " + requestId + ", success: " + success + ", error: " + error);

        if (responseCallback != null) {
            responseCallback.onAudioPlayResponse(requestId, success, error, duration);
        } else {
            Log.w(TAG, "No response callback set, response lost for requestId: " + requestId);
        }
    }
}