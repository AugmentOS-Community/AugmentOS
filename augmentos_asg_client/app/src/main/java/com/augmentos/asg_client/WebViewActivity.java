package com.augmentos.asg_client;

import static com.augmentos.asg_client.Config.publicWebUrl;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.os.Handler;
import android.util.Log;
import android.view.View;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

public class WebViewActivity extends AppCompatActivity {
    private static final String TAG = "WebViewActivity";
    private WebView webView;
    private Handler handler;
    private boolean isPageLoadedSuccessfully = false;
    private Runnable refreshRunnable;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.d(TAG, "WebViewActivity launched");

        // Set the layout first instead of setting WebView directly
        setContentView(R.layout.activity_web_view);
        // Find the WebView from the layout
        webView = findViewById(R.id.webView);

        if (webView == null) {
            Log.e(TAG, "WebView is null! Check your layout.");
            return;
        }

        Log.d(TAG, "WebView found in layout");
        
        // Make sure WebView is visible - ADDED
        webView.setVisibility(View.VISIBLE);
        
        WebSettings webSettings = webView.getSettings();

        // Configure WebView
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setLoadsImagesAutomatically(true);
        webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        webSettings.setUserAgentString("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                + "AppleWebKit/537.36 (KHTML, like Gecko) "
                + "Chrome/91.0.4472.124 Safari/537.36");

        // Initialize the handler for periodic refresh
        handler = new Handler();

        // Set WebViewClient to handle loading within the app
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                Log.d(TAG, "Starting to load page: " + url);
            }
            
            @Override
            public void onLoadResource(WebView view, String url) {
                super.onLoadResource(view, url);
                Log.d(TAG, "Loading resource: " + url);
            }
            
            @Override
            public void onPageFinished(@NonNull WebView view, @NonNull String url) {
                super.onPageFinished(view, url);
                Log.d(TAG, "Page loaded successfully: " + url);
                isPageLoadedSuccessfully = true;
                
                // Make WebView visible to verify it exists
                webView.setVisibility(View.VISIBLE);
                
                // Add visual indicator if the page is empty
                if (url.equals(publicWebUrl)) {
                    view.evaluateJavascript(
                        "(function() { " +
                        "    if(document.body && document.body.innerHTML.trim() === '') {" +
                        "        document.body.style.backgroundColor = '#ffcccc';" +
                        "        document.body.innerHTML = '<div style=\"padding:20px;color:black;font-size:24px\">" +
                        "            WebView loaded but content is empty.<br>URL: " + url + "</div>';" +
                        "        return true;" +
                        "    }" +
                        "    return false;" +
                        "})();", 
                        value -> {
                            if (value != null && value.equals("true")) {
                                Log.e(TAG, "Page content is empty");
                            }
                        }
                    );
                }
            }

            @Override
            public void onReceivedError(@NonNull WebView view, @NonNull WebResourceRequest request, @NonNull WebResourceError error) {
                super.onReceivedError(view, request, error);
                Log.e(TAG, "Failed to load page. URL: " + request.getUrl() + ", Error: " + error.getDescription());
                isPageLoadedSuccessfully = false; // Mark as failed to load
                
                // Show error in WebView so we can visually confirm it's working
                String errorHtml = "<html><body style='background-color: #ffcccc; padding: 20px;'>" +
                                  "<h2>Error Loading Page</h2>" +
                                  "<p>Could not connect to server at " + publicWebUrl + "</p>" +
                                  "<p>Error: " + error.getDescription() + "</p>" +
                                  "</body></html>";
                view.loadDataWithBaseURL(null, errorHtml, "text/html", "UTF-8", null);
                
                // Delay reload by 5 seconds to avoid spamming
                handler.postDelayed(() -> {
                    Log.d(TAG, "Retrying to load the page after an error...");
                    webView.loadUrl(publicWebUrl);
                }, 5000); // 5-second delay
            }

            // For older devices
            @SuppressWarnings("deprecation")
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                super.onReceivedError(view, errorCode, description, failingUrl);
                Log.e(TAG, "Failed to load page. URL: " + failingUrl + ", Error: " + description + ", Code: " + errorCode);
                isPageLoadedSuccessfully = false;
                
                // Show error in WebView so we can visually confirm it's working
                String errorHtml = "<html><body style='background-color: #ffcccc; padding: 20px;'>" +
                                  "<h2>Error Loading Page</h2>" +
                                  "<p>Could not connect to server at " + failingUrl + "</p>" +
                                  "<p>Error: " + description + " (Code: " + errorCode + ")</p>" +
                                  "</body></html>";
                view.loadDataWithBaseURL(null, errorHtml, "text/html", "UTF-8", null);
                
                // Delay reload by 5 seconds to avoid spamming
                handler.postDelayed(() -> {
                    Log.d(TAG, "Retrying to load the page after an error...");
                    webView.loadUrl(publicWebUrl);
                }, 5000); // 5-second delay
            }
        });

        // Log URL being loaded
        Log.d(TAG, "Loading URL: " + publicWebUrl);
        
        // Load the desired URL
        webView.loadUrl(publicWebUrl);

        // Define the refresh runnable
        refreshRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isPageLoadedSuccessfully) {
                    Log.d(TAG, "Retrying to load the page...");
                    webView.loadUrl(publicWebUrl);
                } else {
                    //Log.d(TAG, "Page loaded successfully, no need to reload.");
                }
                // Schedule the next check
                handler.postDelayed(this, 5000); // 5 seconds
            }
        };

        // Schedule the first refresh
        handler.postDelayed(refreshRunnable, 5000); // 5 seconds
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (handler != null && refreshRunnable != null) {
            handler.removeCallbacks(refreshRunnable); // Stop the handler when activity is destroyed
        }
        if (webView != null) {
            webView.destroy(); // Properly destroy the WebView
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }
}
