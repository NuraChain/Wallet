package io.nurawallet.android

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
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

    /** Whether pages are asked for the desktop layout; set from the browser's settings dialog. */
    private var desktop: Boolean = false

    companion object {
        /**
         * The agent used while desktop mode is on.
         *
         * Sites branch on the `Mobile` token, so the switch is a matter of which string is sent, not
         * of the window changing size. It mirrors the desktop agent the Windows child webview uses
         * (see `desktopAgent` in layout/webview.tsx) so one setting means one layout on both.
         */
        private const val DESKTOP_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
    }

    /** Density used to turn the CSS pixels the layout reports into device pixels. */
    private val density get() = activity.resources.displayMetrics.density

    private fun px(value: Double) = (value * density).toInt()

    /** Only plain web schemes are ever loaded; see `shouldOverrideUrlLoading`. */
    private fun isWeb(scheme: String?) = scheme?.lowercase() == "https" || scheme?.lowercase() == "http"

    /** Pushes navigation state back into the app so the toolbar can reflect it. */
    private fun publish(view: WebView, loading: Boolean, progress: Int) {
        val state = JSONObject()
            .put("url", view.url ?: "")
            .put("title", view.title ?: "")
            .put("canBack", view.canGoBack())
            .put("canForward", view.canGoForward())
            .put("loading", loading)
            .put("progress", progress)

        host.post {
            host.evaluateJavascript("window.__nuraBrowserState && window.__nuraBrowserState($state)", null)
        }
    }

    /**
     * Puts the current mode's agent on a view.
     *
     * Mobile is whatever the system WebView already reports (minus the `; wv` marker `build` strips),
     * so turning desktop mode off restores the device's own string rather than a guess at it.
     */
    private fun applyAgent(view: WebView) {
        if (desktop) {
            view.settings.userAgentString = DESKTOP_AGENT
        } else {
            // Dropping the "; wv" marker makes this read as ordinary Chrome for Android rather than
            // an embedded WebView, which some sites serve a stripped-down page to. The string still
            // carries "Mobile", so the mobile layout is what arrives.
            view.settings.userAgentString = WebSettings.getDefaultUserAgent(activity).replace("; wv", "")
        }

        // A desktop page laid out for a 1280px window has to be scaled into a phone-width view, which
        // is what these two do together; on mobile they are harmless and already the defaults here.
        view.settings.useWideViewPort = true
        view.settings.loadWithOverviewMode = true
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
        applyAgent(view)

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
                publish(view, true, 0)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                publish(view, false, 100)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    publish(view, false, 100)
                }
            }
        }

        view.webChromeClient = object : WebChromeClient() {
            // The real driver of the progress bar: every tick is forwarded, not just completion, so
            // the UI can show how far along the load actually is.
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                publish(view, newProgress < 100, newProgress)
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

            // A page being opened is a page meant to be seen. Without this a view left hidden by
            // `setVisible` would take the new address and stay off screen.
            view.visibility = View.VISIBLE
            view.onResume()

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

    /**
     * Takes the page off screen without discarding it.
     *
     * This view is a sibling of the app's own webview, not something drawn inside it, so no amount of
     * layout on the React side can cover it — leaving the browser tab or opening a dialog over it has
     * to say so here. It used to be `close`d for that, which also threw the page away: coming back
     * reloaded the site from its address and lost the scroll position, anything typed into it and any
     * state a dApp was holding. Hiding keeps the instance, so returning is instant.
     *
     * `onPause` stops the hidden page's timers, animation and media. It is the per-view call, not
     * `pauseTimers`, which is process-wide and would stop the app's own webview along with it.
     */
    @JavascriptInterface
    fun setVisible(visible: Boolean) {
        activity.runOnUiThread {
            page?.let { view ->
                view.visibility = if (visible) View.VISIBLE else View.GONE

                if (visible) {
                    view.onResume()
                } else {
                    view.onPause()
                }
            }
        }
    }

    /**
     * Switches the layout pages are asked for.
     *
     * Called before `open`, so a page that has not been created yet simply comes up in the right
     * mode. A page already on screen is reloaded, since the agent is only read when a request is
     * made and the one on screen was fetched under the old one.
     */
    @JavascriptInterface
    fun setDesktop(desktop: Boolean) {
        if (this.desktop == desktop) {
            return
        }

        this.desktop = desktop

        activity.runOnUiThread {
            page?.let { view ->
                applyAgent(view)

                view.reload()
            }
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
