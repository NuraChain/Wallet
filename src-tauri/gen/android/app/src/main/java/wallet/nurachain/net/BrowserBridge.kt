package wallet.nurachain.net

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
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

class BrowserBridge(private val activity: Activity, private val host: WebView) {

    private val pages = LinkedHashMap<String, WebView>()

    private var desktop: Boolean = false

    private var dappScript: String = ""

    private val scripts = LinkedHashMap<String, ScriptHandler>()

    companion object {
        private const val SOLE = "sole"

        private const val DESKTOP_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
    }

    private val density get() = activity.resources.displayMetrics.density

    private fun px(value: Double) = (value * density).toInt()

    private fun isWeb(scheme: String?) = scheme?.lowercase() == "https" || scheme?.lowercase() == "http"

    private fun originOf(url: String?): String {
        val uri = runCatching { android.net.Uri.parse(url ?: "") }.getOrNull() ?: return ""

        val scheme = uri.scheme?.lowercase() ?: return ""

        if (!isWeb(scheme)) {
            return ""
        }

        val host = uri.host ?: return ""

        val port = uri.port
        val standard = if (scheme == "https") 443 else 80

        return if (port < 0 || port == standard) "$scheme://$host" else "$scheme://$host:$port"
    }

    private inner class Provider(private val id: String, private val view: WebView) {

        @JavascriptInterface
        fun request(payload: String) {
            activity.runOnUiThread {
                val origin = originOf(view.url)

                if (origin.isEmpty()) {
                    return@runOnUiThread
                }

                val message = JSONObject()
                    .put("label", id)
                    .put("origin", origin)
                    .put("payload", payload)

                val literal = JSONObject.quote(message.toString())

                host.evaluateJavascript("window.__nuraDappRequest && window.__nuraDappRequest($literal)", null)
            }
        }
    }

    private fun applyScript(id: String, view: WebView) {
        if (dappScript.isEmpty() || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            return
        }

        scripts.remove(id)?.remove()

        scripts[id] = WebViewCompat.addDocumentStartJavaScript(view, dappScript, setOf("*"))
    }

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

    private fun applyAgent(view: WebView) {
        if (desktop) {
            view.settings.userAgentString = DESKTOP_AGENT
        } else {
            view.settings.userAgentString = WebSettings.getDefaultUserAgent(activity).replace("; wv", "")
        }

        view.settings.useWideViewPort = true
        view.settings.loadWithOverviewMode = true
    }

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

        view.settings.allowFileAccess = false
        view.settings.allowContentAccess = false
        view.settings.allowFileAccessFromFileURLs = false
        view.settings.allowUniversalAccessFromFileURLs = false
        view.settings.setGeolocationEnabled(false)

        view.setBackgroundColor(Color.WHITE)

        CookieManager.getInstance().setAcceptThirdPartyCookies(view, true)

        view.addJavascriptInterface(Provider(id, view), "__nuraEthereum")

        applyScript(id, view)

        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (isWeb(request.url.scheme)) {
                    return false
                }

                // A scheme this WebView cannot load is a link meant for a wallet app: a
                // WalletConnect pairing, or another wallet's deep link. The page's navigation is
                // dropped and the wallet is offered the URL, which knows what a pairing is.
                val literal = JSONObject.quote(request.url.toString())

                host.post {
                    host.evaluateJavascript("window.__nuraDappLink && window.__nuraDappLink($literal)", null)
                }

                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                if (dappScript.isNotEmpty() && !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                    view.evaluateJavascript(dappScript, null)
                }

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
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                publish(id, view, newProgress < 100, newProgress)
            }
        }

        return view
    }


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

    @JavascriptInterface
    fun openTab(id: String, url: String, visible: Boolean, x: Double, y: Double, width: Double, height: Double) {
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

    @JavascriptInterface
    fun closeAll() {
        activity.runOnUiThread {
            scripts.clear()

            for ((_, view) in pages) {
                (view.parent as? ViewGroup)?.removeView(view)

                view.stopLoading()
                view.destroy()
            }

            pages.clear()
        }
    }

    @JavascriptInterface
    fun closeTab(id: String) {
        activity.runOnUiThread {
            scripts.remove(id)

            pages.remove(id)?.let { view ->
                (view.parent as? ViewGroup)?.removeView(view)

                view.stopLoading()
                view.destroy()
            }
        }
    }

    @JavascriptInterface
    fun setDappScript(script: String) {
        activity.runOnUiThread {
            dappScript = script

            for ((id, view) in pages) {
                applyScript(id, view)
            }
        }
    }

    @JavascriptInterface
    fun dappReply(id: String, payload: String) {
        activity.runOnUiThread {
            val literal = JSONObject.quote(payload)

            pages[id]?.evaluateJavascript("window.__nuraWalletReply && window.__nuraWalletReply($literal)", null)
        }
    }

    @JavascriptInterface
    fun dappEmit(id: String, payload: String) {
        activity.runOnUiThread {
            val literal = JSONObject.quote(payload)

            pages[id]?.evaluateJavascript("window.__nuraWalletEvent && window.__nuraWalletEvent($literal)", null)
        }
    }

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
