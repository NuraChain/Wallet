package wallet.nurachain.net

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.Color
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.core.content.ContextCompat
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

class BrowserBridge(
    private val activity: Activity,
    private val host: WebView,
    /** Asks Android for the microphone on the app's behalf, and reports what it said. */
    private val askMicrophone: ((Boolean) -> Unit) -> Unit
) {

    private val pages = LinkedHashMap<String, WebView>()

    // What a page has asked for and the wallet has not answered yet, by the ticket it was handed.
    private class Ask(val tab: String, val request: PermissionRequest)

    private val asks = LinkedHashMap<String, Ask>()

    private var askCount = 0

    private var desktop: Boolean = false

    private var dappScript: String = ""

    private val scripts = LinkedHashMap<String, ScriptHandler>()

    private var mouse: ImageView? = null

    // What the mouse wears. Kept apart from the view, which the first request for it comes ahead of.
    private var mouseIcon: String = "logo"

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

    /**
     * A page asking for the microphone.
     *
     * A WebView refuses whatever its client does not answer, which is how every one of these used
     * to end: the site was told "blocked" and nobody was ever asked. The wallet is asked instead,
     * and told who is asking from the request itself — the frame the WebView says wants it — never
     * from anything the page could say.
     *
     * Only a request for the microphone alone is put to the user. The WebView takes a grant for
     * exactly what was asked or not at all, so a request that wants the camera too cannot be
     * answered in part, and is refused whole.
     */
    private fun ask(tab: String, request: PermissionRequest) {
        val origin = originOf(request.origin?.toString())
        val wanted = request.resources ?: emptyArray()

        if (origin.isEmpty() || wanted.size != 1 || wanted[0] != PermissionRequest.RESOURCE_AUDIO_CAPTURE) {
            request.deny()

            return
        }

        askCount += 1

        val ticket = askCount.toString()

        asks[ticket] = Ask(tab, request)

        val message = JSONObject()
            .put("ticket", ticket)
            .put("label", tab)
            .put("origin", origin)
            .put("kind", "microphone")

        val literal = JSONObject.quote(message.toString())

        // Nobody there to ask — a locked wallet has no dashboard listening — is a refusal, given
        // now rather than left for the page to wait on.
        host.evaluateJavascript("window.__nuraPermission ? window.__nuraPermission($literal) === true : false") { taken ->
            if (taken != "true") {
                asks.remove(ticket)?.request?.deny()
            }
        }
    }

    private fun dropAsks(keep: (Ask) -> Boolean) {
        val gone = asks.filterValues { !keep(it) }

        for ((ticket, ask) in gone) {
            asks.remove(ticket)

            ask.request.deny()
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

            override fun onPermissionRequest(request: PermissionRequest) {
                ask(id, request)
            }

            // The page gave up on it, by leaving or by being closed. An answer that comes for the
            // ticket later finds nothing to give it to.
            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                asks.entries.removeAll { it.value.request === request }
            }
        }

        return view
    }

    private fun place(view: View, x: Float, y: Float) {
        val parent = view.parent as? View ?: return

        view.x = x.coerceIn(0f, (parent.width - view.width).coerceAtLeast(0).toFloat())
        view.y = y.coerceIn(0f, (parent.height - view.height).coerceAtLeast(0).toFloat())
    }

    private fun report(action: String) {
        host.post {
            host.evaluateJavascript("window.__nuraMouse && window.__nuraMouse('$action')", null)
        }
    }

    private fun mouseImage() = if (mouseIcon == "browser") R.drawable.nura_browser else R.drawable.nura_logo

    // The floating mouse: a view of its own above the wallet and every tab. A raised Z keeps it
    // over tabs added after it, for drawing and for touches alike, so nothing has to re-stack it.
    @SuppressLint("ClickableViewAccessibility")
    private fun buildMouse(root: ViewGroup): ImageView {
        val size = px(40.0)
        val view = ImageView(activity)

        view.setImageResource(mouseImage())
        view.contentDescription = "Nura Wallet"
        view.layoutParams = FrameLayout.LayoutParams(size, size)
        view.translationZ = 1000f

        val slop = ViewConfiguration.get(activity).scaledTouchSlop
        val wait = ViewConfiguration.getDoubleTapTimeout().toLong()

        var downX = 0f
        var downY = 0f
        var fromX = 0f
        var fromY = 0f
        var dragging = false
        var pending: Runnable? = null

        // Taps are told apart by hand: the view follows the finger, so its own coordinates never
        // leave the tap region and a gesture detector would call every drag a tap.
        view.setOnTouchListener { touched, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = event.rawX
                    downY = event.rawY
                    fromX = touched.x
                    fromY = touched.y
                    dragging = false
                }

                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - downX
                    val dy = event.rawY - downY

                    if (!dragging && Math.hypot(dx.toDouble(), dy.toDouble()) > slop) {
                        dragging = true
                    }

                    if (dragging) {
                        place(touched, fromX + dx, fromY + dy)
                    }
                }

                MotionEvent.ACTION_UP -> if (!dragging) {
                    val waiting = pending

                    if (waiting != null) {
                        touched.removeCallbacks(waiting)
                        pending = null
                        report("double")
                    } else {
                        val single = Runnable {
                            pending = null
                            report("click")
                        }

                        pending = single
                        touched.postDelayed(single, wait)
                    }
                }
            }

            true
        }

        // Only reached through accessibility services, since the touch listener takes the rest.
        view.setOnClickListener { report("click") }

        root.addView(view)

        // Kept on screen through rotation and resizes: in full screen it is the only way back out.
        root.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> place(view, view.x, view.y) }

        root.post { place(view, (root.width - size - px(16.0)).toFloat(), root.height * 0.7f) }

        return view
    }

    @JavascriptInterface
    fun showMouse(opacity: Double) {
        activity.runOnUiThread {
            val view = mouse ?: buildMouse(activity.findViewById(android.R.id.content)).also { mouse = it }

            view.alpha = opacity.toFloat()
            view.visibility = View.VISIBLE
        }
    }

    @JavascriptInterface
    fun hideMouse() {
        activity.runOnUiThread { mouse?.visibility = View.GONE }
    }

    @JavascriptInterface
    fun setMouseOpacity(opacity: Double) {
        activity.runOnUiThread { mouse?.alpha = opacity.toFloat() }
    }

    @JavascriptInterface
    fun setMouseIcon(icon: String) {
        activity.runOnUiThread {
            mouseIcon = icon

            mouse?.setImageResource(mouseImage())
        }
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

    /**
     * The wallet's answer to a page's request for the microphone. A yes from the user covers the
     * site; Android has its own say over the app, asked the first time and remembered by it after.
     */
    @JavascriptInterface
    fun permissionReply(ticket: String, allowed: Boolean) {
        activity.runOnUiThread {
            val request = asks.remove(ticket)?.request ?: return@runOnUiThread

            if (!allowed) {
                request.deny()

                return@runOnUiThread
            }

            val grant = { request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) }

            if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                grant()
            } else {
                askMicrophone { granted -> if (granted) grant() else request.deny() }
            }
        }
    }

    @JavascriptInterface
    fun closeAll() {
        activity.runOnUiThread {
            mouse?.visibility = View.GONE

            scripts.clear()

            dropAsks { false }

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

            dropAsks { it.tab != id }

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
