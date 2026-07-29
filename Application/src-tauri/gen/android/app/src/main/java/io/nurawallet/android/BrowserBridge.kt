package io.nurawallet.android

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import org.json.JSONObject

/**
 * A real Android WebView for the app's browser tab.
 *
 * Tauri's child-webview API is desktop only — on Android wry's `new_as_child` just delegates to
 * `new`, so there is no positioned child surface to paint a page into. The browser tab therefore fell
 * back to an `<iframe>`, and essentially every site worth visiting refuses to be framed
 * (`X-Frame-Options` / `frame-ancestors`), which is why pages came up blank.
 *
 * This owns a plain `android.webkit.WebView` added on top of the Tauri webview and positioned to the
 * rectangle the layout reserves for it. It is the same engine Chrome uses, so pages behave normally.
 *
 * The bridge is attached only to the app's own webview, never to the page webview this creates, so a
 * visited site cannot reach it.
 */
class BrowserBridge(private val activity: Activity, private val host: WebView) {

    private var page: WebView? = null

    /** Density used to turn the CSS pixels the layout reports into device pixels. */
    private val density get() = activity.resources.displayMetrics.density

    private fun px(value: Double) = (value * density).toInt()

    /** Only plain web schemes are ever loaded; see `shouldOverrideUrlLoading`. */
    private fun isWeb(scheme: String?) = scheme?.lowercase() == "https" || scheme?.lowercase() == "http"

    /** Pushes navigation state back into the app so the toolbar can reflect it. */
    private fun publish(view: WebView, loading: Boolean) {
        val state = JSONObject()
            .put("url", view.url ?: "")
            .put("title", view.title ?: "")
            .put("canBack", view.canGoBack())
            .put("canForward", view.canGoForward())
            .put("loading", loading)

        host.post {
            host.evaluateJavascript("window.__nuraBrowserState && window.__nuraBrowserState($state)", null)
        }
    }

    private fun layout(view: WebView, x: Double, y: Double, width: Double, height: Double) {
        val params = FrameLayout.LayoutParams(px(width), px(height))

        params.leftMargin = px(x)
        params.topMargin = px(y)

        view.layoutParams = params
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun build(): WebView {
        val view = WebView(activity)

        view.settings.javaScriptEnabled = true
        view.settings.domStorageEnabled = true
        view.settings.databaseEnabled = true
        view.settings.loadWithOverviewMode = true
        view.settings.useWideViewPort = true
        view.settings.builtInZoomControls = true
        view.settings.displayZoomControls = false
        view.settings.mediaPlaybackRequiresUserGesture = false
        view.settings.javaScriptCanOpenWindowsAutomatically = true
        // Without a desktop-shaped UA some sites serve a stripped WebView experience.
        view.settings.userAgentString = view.settings.userAgentString?.replace("; wv", "")

        // This view renders untrusted pages, and the app's private storage next door holds the
        // encrypted mnemonic. Nothing here is allowed to touch the filesystem or content providers.
        // These are the defaults at this targetSdk, but they are set explicitly so that lowering
        // targetSdk later cannot silently re-enable them.
        view.settings.allowFileAccess = false
        view.settings.allowContentAccess = false
        view.settings.allowFileAccessFromFileURLs = false
        view.settings.allowUniversalAccessFromFileURLs = false
        view.settings.setGeolocationEnabled(false)

        view.setBackgroundColor(Color.WHITE)

        CookieManager.getInstance().setAcceptThirdPartyCookies(view, true)

        view.webViewClient = object : WebViewClient() {
            // Plain web navigation stays in this view; anything else is refused outright. Returning
            // `true` without acting cancels the load, so a page cannot use `intent://` to reach
            // another app component, `file://` to read local storage, or a custom scheme to hand
            // itself to some other installed app.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = !isWeb(request.url.scheme)

            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                publish(view, true)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                publish(view, false)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    publish(view, false)
                }
            }
        }

        view.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                if (newProgress >= 100) {
                    publish(view, false)
                }
            }
        }

        return view
    }

    @JavascriptInterface
    fun open(url: String, x: Double, y: Double, width: Double, height: Double) {
        // The very first load bypasses `shouldOverrideUrlLoading`, so the scheme is checked here too.
        if (!isWeb(runCatching { android.net.Uri.parse(url).scheme }.getOrNull())) {
            return
        }

        activity.runOnUiThread {
            val root = activity.findViewById<ViewGroup>(android.R.id.content)
            val view = page ?: build().also {
                page = it
                root.addView(it)
            }

            layout(view, x, y, width, height)

            if (view.url != url) {
                view.loadUrl(url)
            }
        }
    }

    @JavascriptInterface
    fun setBounds(x: Double, y: Double, width: Double, height: Double) {
        activity.runOnUiThread { page?.let { layout(it, x, y, width, height) } }
    }

    @JavascriptInterface
    fun close() {
        activity.runOnUiThread {
            page?.let { view ->
                (view.parent as? ViewGroup)?.removeView(view)

                view.stopLoading()
                view.destroy()
            }

            page = null
        }
    }

    @JavascriptInterface
    fun reload() {
        activity.runOnUiThread { page?.reload() }
    }

    @JavascriptInterface
    fun back() {
        activity.runOnUiThread { page?.let { if (it.canGoBack()) it.goBack() } }
    }

    @JavascriptInterface
    fun forward() {
        activity.runOnUiThread { page?.let { if (it.canGoForward()) it.goForward() } }
    }
}
