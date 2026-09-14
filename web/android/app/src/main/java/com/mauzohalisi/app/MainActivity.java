package com.mauzohalisi.app;

import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

import com.getcapacitor.BridgeActivity;

/**
 * The app shell.
 *
 * The WebView renders the live site, so everything the web app can do, the
 * Android app can do, and a web deploy updates both. The only thing the shell
 * has to answer for is what happens when the site cannot be reached, which on a
 * Tanzanian mobile connection is not an edge case.
 *
 * Left alone, a failed load leaves a blank white screen with no explanation and
 * no way back. This replaces that with a native screen that says what happened
 * and offers to retry.
 */
public class MainActivity extends BridgeActivity {

    private View offlineView;
    private TextView offlineBody;
    private TextView retryButton;

    /**
     * Set when a load fails and cleared when one succeeds.
     *
     * Needed because onPageFinished fires even for a failed navigation: without
     * it, the error screen appears and is then immediately dismissed by the
     * finish callback for the very load that failed.
     */
    private boolean loadFailed = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Inflated over Capacitor's own view hierarchy. BridgeActivity does not
        // inflate activity_main.xml, so anything declared there is never created
        // and findViewById returns null.
        ViewGroup root = findViewById(android.R.id.content);
        offlineView = LayoutInflater.from(this).inflate(R.layout.view_offline, root, false);
        root.addView(offlineView);

        offlineBody = offlineView.findViewById(R.id.offline_body);
        retryButton = offlineView.findViewById(R.id.offline_retry);

        final WebView webView = getBridge().getWebView();

        retryButton.setOnClickListener(v -> {
            retryButton.setText(R.string.offline_retrying);
            retryButton.setEnabled(false);
            loadFailed = false;
            // reload() on a page that never loaded retries about:blank, so go
            // back to the start URL explicitly.
            webView.loadUrl(getBridge().getServerUrl() != null
                    ? getBridge().getServerUrl()
                    : webView.getUrl());
        });

        // Capacitor installs its own client, so wrap rather than replace it:
        // dropping Capacitor's would break the JavaScript bridge and every
        // plugin with it.
        final WebViewClient existing = new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                loadFailed = false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!loadFailed) hideOffline();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // Only a failure of the page itself matters. A missing image or a
                // third-party font failing must not replace a working till.
                if (request != null && request.isForMainFrame()) {
                    loadFailed = true;
                    showOffline();
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request,
                                            WebResourceResponse response) {
                if (request != null && request.isForMainFrame()
                        && response != null && response.getStatusCode() >= 500) {
                    loadFailed = true;
                    showOffline();
                }
            }
        };
        webView.setWebViewClient(existing);
    }

    private void showOffline() {
        runOnUiThread(() -> {
            // The wording distinguishes a handset with no signal from a server
            // that is down, because the two need different actions from the shop.
            offlineBody.setText(hasNetwork() ? R.string.offline_body_server : R.string.offline_body);
            retryButton.setText(R.string.offline_retry);
            retryButton.setEnabled(true);
            offlineView.setVisibility(View.VISIBLE);
        });
    }

    private void hideOffline() {
        runOnUiThread(() -> {
            retryButton.setText(R.string.offline_retry);
            retryButton.setEnabled(true);
            offlineView.setVisibility(View.GONE);
        });
    }

    private boolean hasNetwork() {
        ConnectivityManager cm =
                (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }
}
