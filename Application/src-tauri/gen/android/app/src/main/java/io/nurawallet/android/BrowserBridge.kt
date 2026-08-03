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

    /**
     * Every open tab's page, keyed by the id the frontend addresses it with.
     *
     * A map rather than the single field this started as: the browser holds tabs now, and each keeps
     * its page alive while it waits its turn so that picking a tab shows what was already there
     * instead of loading it again. Insertion-ordered so the teardown below is predictable.
     */
    private val pages = LinkedHashMap<String, WebView>()

    /** Whether pages are asked for the desktop layout; set from the browser's settings dialog. */
    private var desktop: Boolean = false

    companion object {
        /**
         * The id the single-page methods act on.
         *
         * They predate tabs and take no id, so they are kept pointing at one reserved entry in the
         * map. That is what a bundle older than this APK still calls, and it goes on working.
         */
        private const val SOLE = "sole"

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

    /**
     * Pushes navigation state back into the app so the toolbar can reflect it.
     *
     * The id rides along because several pages can be loading at once while the toolbar only ever
     * speaks for the tab in front. Without it a background tab's progress would drive the bar of
     * whichever tab happens to be showing.
     */
    private fun publish(id: String, view: WebView, loading: Boolean, progress: Int) {
        val state = JSONObject()
            .put("id", id)
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

    /**
     * Shows or hides one page.
     *
     * `onPause` stops a hidden page's timers, animation and media. It is the per-view call, not
     * `pauseTimers`, which is process-wide and would stop the app's own webview along with it.
     */
    private fun applyVisible(view: WebView, visible: Boolean) {
        view.visibility = if (visible) View.VISIBLE else View.GONE

        if (visible) {
            view.onResume()
        } else {
            view.onPause()
        }
    }

    private fun layout(view: WebView, x: Double, y: Double, width: Double, height: Double) {
        val params = FrameLayout.LayoutParams(px(width), px(height))

        params.leftMargin = px(x)
        params.topMargin = px(y)

        view.layoutParams = params
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun build(id: String): WebView {
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
                publish(id, view, true, 0)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                publish(id, view, false, 100)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    publish(id, view, false, 100)
                }
            }
        }

        view.webChromeClient = object : WebChromeClient() {
            // The real driver of the progress bar: every tick is forwarded, not just completion, so
            // the UI can show how far along the load actually is.
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                publish(id, view, newProgress < 100, newProgress)
            }
        }

        return view
    }

    // The single-page API, kept exactly as it was and pointed at one reserved entry. A bundle older
    // than this APK calls these and nothing else, and goes on working with the one tab it knows about.

    @JavascriptInterface
    fun open(url: String, x: Double, y: Double, width: Double, height: Double) = openTab(SOLE, url, true, x, y, width, height)

    @JavascriptInterface
    fun setBounds(x: Double, y: Double, width: Double, height: Double) = boundsTab(SOLE, x, y, width, height)

    @JavascriptInterface
    fun close() = closeTab(SOLE)

    @JavascriptInterface
    fun setVisible(visible: Boolean) = visibleTab(SOLE, visible)

    @JavascriptInterface
    fun reload() = reloadTab(SOLE)

    @JavascriptInterface
    fun back() = backTab(SOLE)

    @JavascriptInterface
    fun forward() = forwardTab(SOLE)

    /**
     * Opens a page in the named tab, building that tab's view the first time it is asked for.
     *
     * `visible` is passed in rather than assumed because a tab being given an address is not always a
     * tab the user is looking at — switching the desktop setting reopens every tab at once. Deciding
     * it here means a background page is never briefly painted over the one in front.
     */
    @JavascriptInterface
    fun openTab(id: String, url: String, visible: Boolean, x: Double, y: Double, width: Double, height: Double) {
        // The very first load bypasses `shouldOverrideUrlLoading`, so the scheme is checked here too.
        if (!isWeb(runCatching { android.net.Uri.parse(url).scheme }.getOrNull())) {
            return
        }

        activity.runOnUiThread {
            val root = activity.findViewById<ViewGroup>(android.R.id.content)
            val view = pages[id] ?: build(id).also {
                pages[id] = it
                root.addView(it)
            }

            layout(view, x, y, width, height)

            applyVisible(view, visible)

            if (view.url != url) {
                view.loadUrl(url)
            }
        }
    }

    @JavascriptInterface
    fun boundsTab(id: String, x: Double, y: Double, width: Double, height: Double) {
        activity.runOnUiThread { pages[id]?.let { layout(it, x, y, width, height) } }
    }

    /** Closes one tab's page. The others are untouched, which is the whole point of the map. */
    @JavascriptInterface
    fun closeTab(id: String) {
        activity.runOnUiThread {
            pages.remove(id)?.let { view ->
                (view.parent as? ViewGroup)?.removeView(view)

                view.stopLoading()
                view.destroy()
            }
        }
    }

    /**
     * Takes a page off screen without discarding it.
     *
     * These views are siblings of the app's own webview, not something drawn inside it, so no amount
     * of layout on the React side can cover them — leaving the browser, picking another tab or opening
     * a dialog has to say so here. Pages used to be closed for that, which also threw them away:
     * coming back reloaded the site and lost the scroll position, anything typed into it and any state
     * a dApp was holding. Hiding keeps the instance, so returning to a tab is instant.
     */
    @JavascriptInterface
    fun visibleTab(id: String, visible: Boolean) {
        activity.runOnUiThread { pages[id]?.let { applyVisible(it, visible) } }
    }

    @JavascriptInterface
    fun reloadTab(id: String) {
        activity.runOnUiThread { pages[id]?.reload() }
    }

    @JavascriptInterface
    fun backTab(id: String) {
        activity.runOnUiThread { pages[id]?.let { if (it.canGoBack()) it.goBack() } }
    }

    @JavascriptInterface
    fun forwardTab(id: String) {
        activity.runOnUiThread { pages[id]?.let { if (it.canGoForward()) it.goForward() } }
    }

    /**
     * Switches the layout pages are asked for.
     *
     * One setting for the whole browser rather than a property of a tab, so every open page is put on
     * the new agent and reloaded — the agent is only read when a request is made, and what is on
     * screen was fetched under the old one. Hidden tabs reload where they stand and stay hidden.
     */
    @JavascriptInterface
    fun setDesktop(desktop: Boolean) {
        if (this.desktop == desktop) {
            return
        }

        this.desktop = desktop

        activity.runOnUiThread {
            for (view in pages.values) {
                applyAgent(view)

                view.reload()
            }
        }
    }
}
