package info.cosmonet.cosmocoding;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.WindowInsets;
import org.json.JSONObject;

import javax.net.ssl.HttpsURLConnection;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class WorkspaceActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String ORIGIN = "https://" + HOST;
    private static final int BACKGROUND = 0xff0d1116;
    private static final int MAX_RESPONSE_BYTES = 12_000_000;
    private static final Map<String, String> SECURITY = new HashMap<>();
    static {
        SECURITY.put("cache-control", "no-store");
        SECURITY.put("x-content-type-options", "nosniff");
        SECURITY.put("content-security-policy", "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    }
    private static final String[] HEADERS = {
        "authorization", "accept", "content-type", "x-github-api-version", "user-agent", "x-api-key",
        "anthropic-version", "x-goog-api-key"
    };

    private final ExecutorService network = Executors.newFixedThreadPool(4);
    private WebView workspace;

    @Override
    public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        workspace = new WebView(this);
        workspace.setBackgroundColor(BACKGROUND);
        getWindow().setStatusBarColor(BACKGROUND);
        getWindow().setNavigationBarColor(BACKGROUND);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            workspace.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets safe = insets.getInsets(WindowInsets.Type.systemBars()
                    | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        WebSettings settings = workspace.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        workspace.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (local(uri) && "/".equals(uri.getPath())) return false;
                if (request.isForMainFrame() && request.hasGesture() && "https".equals(uri.getScheme())
                    && ("github.com".equals(uri.getHost()) || "supabase.com".equals(uri.getHost()))) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (ActivityNotFoundException ignored) {
                    }
                }
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return bundledAsset(request);
            }
        });
        workspace.addJavascriptInterface(new ProviderBridge(), "CosmoNative");
        setContentView(workspace);
        workspace.loadUrl(ORIGIN + "/");
    }

    private static boolean local(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getEncodedAuthority());
    }

    private static String assetType(String path) {
        if (path == null) return null;
        return switch (path) {
            case "/index.html" -> "text/html";
            case "/style.css" -> "text/css";
            case "/app.js", "/api.mjs", "/template.mjs", "/upstream.mjs", "/native-transport.mjs" -> "text/javascript";
            case "/starter.json" -> "application/json";
            case "/manifest.webmanifest" -> "application/manifest+json";
            case "/cosmocoding-icon-192.png", "/cosmocoding-icon-512.png" -> "image/png";
            default -> null;
        };
    }

    private WebResourceResponse bundledAsset(WebResourceRequest request) {
        Uri target = request.getUrl();
        if (!local(target) || !"GET".equals(request.getMethod())) {
            return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", SECURITY, null);
        }
        String path = "/".equals(target.getPath()) ? "/index.html" : target.getPath();
        String mime = assetType(path);
        if (mime != null) {
            try {
                return new WebResourceResponse(mime, mime.equals("image/png") ? null : "UTF-8",
                    200, "OK", SECURITY, getAssets().open(path.substring(1)));
            } catch (IOException ignored) {
            }
        }
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", SECURITY, null);
    }

    private static boolean allowedProvider(URI target) {
        if (!"https".equals(target.getScheme()) || target.getRawUserInfo() != null
            || target.getFragment() != null || target.getHost() == null
            || (target.getPort() != -1 && target.getPort() != 443)
            || !target.normalize().equals(target)) return false;
        String path = target.getPath();
        return switch (target.getHost()) {
            case "api.github.com" -> path.equals("/user/repos") || path.startsWith("/repos/");
            case "api.openai.com" -> path.equals("/v1/models") || path.equals("/v1/responses");
            case "api.anthropic.com" -> path.equals("/v1/models") || path.equals("/v1/messages");
            case "generativelanguage.googleapis.com" -> path.equals("/v1beta/models")
                || path.matches("/v1beta/models/[A-Za-z0-9._:-]{1,100}:generateContent");
            case "api.supabase.com" -> path.equals("/v1/projects");
            default -> false;
        };
    }

    private static String readBody(InputStream input) throws IOException {
        if (input == null) return "";
        try (InputStream stream = input; ByteArrayOutputStream body = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            for (int count; (count = stream.read(buffer)) != -1;) {
                if (body.size() + count > MAX_RESPONSE_BYTES) throw new IOException("Provider response too large");
                body.write(buffer, 0, count);
            }
            return body.toString(StandardCharsets.UTF_8.name());
        }
    }

    private final class ProviderBridge {
        @JavascriptInterface
        public void send(String id, String url, String method, String headers, String body) {
            if (id == null || !id.matches("[0-9]{1,15}")) return;
            network.execute(() -> {
                HttpsURLConnection connection = null;
                int status = 0;
                String response = "";
                try {
                    URI target = URI.create(url);
                    if (!allowedProvider(target) || !("GET".equals(method) || "POST".equals(method))
                        || headers.length() > 10_000 || body.length() > 300_000) {
                        throw new IOException("Invalid provider request");
                    }
                    connection = (HttpsURLConnection) target.toURL().openConnection();
                    connection.setRequestMethod(method);
                    connection.setInstanceFollowRedirects(false);
                    connection.setConnectTimeout(15_000);
                    connection.setReadTimeout(90_000);
                    JSONObject requestHeaders = new JSONObject(headers);
                    for (String name : HEADERS) {
                        if (requestHeaders.has(name)) connection.setRequestProperty(name, requestHeaders.getString(name));
                    }
                    if ("POST".equals(method)) {
                        byte[] data = body.getBytes(StandardCharsets.UTF_8);
                        connection.setDoOutput(true);
                        connection.setFixedLengthStreamingMode(data.length);
                        try (OutputStream output = connection.getOutputStream()) { output.write(data); }
                    }
                    status = connection.getResponseCode();
                    if (status >= 300 && status < 400) throw new IOException("Provider redirected the request");
                    response = readBody(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
                } catch (Exception ignored) {
                    status = 0;
                } finally {
                    if (connection != null) connection.disconnect();
                }
                String script = "globalThis.cosmoNativeReply?.(" + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(response) + ")";
                runOnUiThread(() -> {
                    if (workspace != null && (ORIGIN + "/").equals(workspace.getUrl())) {
                        workspace.evaluateJavascript(script, null);
                    }
                });
            });
        }
    }

    @Override
    protected void onDestroy() {
        network.shutdownNow();
        if (workspace != null) {
            workspace.removeJavascriptInterface("CosmoNative");
            workspace.destroy();
            workspace = null;
        }
        super.onDestroy();
    }
}
