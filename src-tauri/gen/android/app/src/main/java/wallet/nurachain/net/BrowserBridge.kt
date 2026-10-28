package wallet.nurachain.net

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.Build
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.animation.AccelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.view.inputmethod.InputMethodManager
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebViewDatabase
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.core.content.ContextCompat
import androidx.core.graphics.Insets
import androidx.core.view.DisplayCutoutCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONArray
import org.json.JSONObject

class BrowserBridge(
    private val activity: Activity,
    private val host: WebView,
    private val askAndroid: (Array<String>, (Boolean) -> Unit) -> Unit
) {

    private val pages = LinkedHashMap<String, WebView>()

    private class Ask(val tab: String, val request: PermissionRequest)

    private val asks = LinkedHashMap<String, Ask>()

    private var askCount = 0

    private var desktop: Boolean = false

    private var dappScript: String = ""

    private val scripts = LinkedHashMap<String, ScriptHandler>()

    private var mouse: ImageView? = null

    // Kept apart from the view: the first request for an icon can come before the view exists.
    private var mouseIcon: String = "logo"

    // The mouse's menu while it is open: a layer over every page, just under the mouse, holding its buttons.
    // A press on the layer outside them closes it, and the page under it is never touched.
    private var menu: FrameLayout? = null

    // The system's own status-bar ink, captured once so leaving a site restores it exactly.
    private var systemBarInk: Boolean? = null

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

    private fun deviceOf(resource: String) = when (resource) {
        PermissionRequest.RESOURCE_AUDIO_CAPTURE -> "microphone"
        PermissionRequest.RESOURCE_VIDEO_CAPTURE -> "camera"
        else -> null
    }

    private fun permissionOf(resource: String) = when (resource) {
        PermissionRequest.RESOURCE_AUDIO_CAPTURE -> Manifest.permission.RECORD_AUDIO
        PermissionRequest.RESOURCE_VIDEO_CAPTURE -> Manifest.permission.CAMERA
        else -> null
    }

    /**
     * The origin comes from the request's frame, never from the page. WebView grants all or nothing,
     * so a request holding anything but camera or microphone is refused whole.
     */
    private fun ask(tab: String, request: PermissionRequest) {
        val origin = originOf(request.origin?.toString())
        val wanted = request.resources ?: emptyArray()
        val kinds = wanted.mapNotNull { deviceOf(it) }

        if (origin.isEmpty() || kinds.isEmpty() || kinds.size != wanted.size) {
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
            .put("kinds", JSONArray(kinds))

        val literal = JSONObject.quote(message.toString())

        // No listener (a locked wallet) is refused now rather than left for the page to wait on.
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

        val last = view.layoutParams as? FrameLayout.LayoutParams

        view.layoutParams = params

        if (last == null || last.leftMargin != params.leftMargin || last.topMargin != params.topMargin ||
            last.width != params.width || last.height != params.height
        ) {
            ViewCompat.requestApplyInsets(view)
        }
    }

    /**
     * A tab is handed the window's insets whole, wherever it sits, and the page pads for them through
     * `env(safe-area-inset-*)`: under the wallet's toolbar a site made room for a status bar and a
     * cutout it was nowhere near. Each edge keeps only the part that reaches into the tab. Measured
     * from the layout params, since insets are dispatched before the new bounds are laid out.
     */
    private fun overlap(view: View, insets: WindowInsetsCompat): WindowInsetsCompat {
        val parent = view.parent as? View ?: return insets
        val params = view.layoutParams as? FrameLayout.LayoutParams ?: return insets
        val window = view.rootView

        if (window.width == 0 || window.height == 0) {
            return insets
        }

        val origin = IntArray(2).also { parent.getLocationInWindow(it) }

        val left = origin[0] + params.leftMargin
        val top = origin[1] + params.topMargin
        val right = window.width - (left + params.width)
        val bottom = window.height - (top + params.height)

        fun clip(edges: Insets) = Insets.of(
            (edges.left - left).coerceAtLeast(0),
            (edges.top - top).coerceAtLeast(0),
            (edges.right - right).coerceAtLeast(0),
            (edges.bottom - bottom).coerceAtLeast(0)
        )

        val builder = WindowInsetsCompat.Builder(insets)

        for (type in listOf(
            WindowInsetsCompat.Type.systemBars(),
            WindowInsetsCompat.Type.displayCutout(),
            WindowInsetsCompat.Type.tappableElement(),
            WindowInsetsCompat.Type.systemGestures(),
            WindowInsetsCompat.Type.mandatorySystemGestures()
        )) {
            builder.setInsets(type, clip(insets.getInsets(type)))
        }

        // The page reads a cutout from the cutout itself, not from its inset.
        val cutout = insets.displayCutout

        if (cutout != null) {
            val safe = clip(Insets.of(cutout.safeInsetLeft, cutout.safeInsetTop, cutout.safeInsetRight, cutout.safeInsetBottom))

            builder.setDisplayCutout(
                if (safe == Insets.NONE) null
                else DisplayCutoutCompat(Rect(safe.left, safe.top, safe.right, safe.bottom), cutout.boundingRects)
            )
        }

        return builder.build()
    }

    @SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
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

        ViewCompat.setOnApplyWindowInsetsListener(view) { target, insets ->
            ViewCompat.onApplyWindowInsets(target, overlap(target, insets))
        }

        // A tap on a site never reaches the wallet's page, so a field there (the address bar) kept
        // its focus and the keyboard stayed up. Checked on the way down, before the tab takes focus.
        view.setOnTouchListener { _, event ->
            if (event.actionMasked == MotionEvent.ACTION_DOWN && host.hasFocus()) {
                dismissKeyboard()
            }

            false
        }

        applyScript(id, view)

        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (isWeb(request.url.scheme)) {
                    return false
                }

                // A non-web scheme (WalletConnect pairing, wallet deep link) is offered to the wallet.
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

            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                asks.entries.removeAll { it.value.request === request }
            }
        }

        return view
    }

    private fun dismissKeyboard() {
        host.evaluateJavascript("document.activeElement && document.activeElement.blur && document.activeElement.blur()", null)

        activity.getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(host.windowToken, 0)
    }

    private fun place(view: View, x: Float, y: Float) {
        val parent = view.parent as? View ?: return

        view.x = x.coerceIn(0f, (parent.width - view.width).coerceAtLeast(0).toFloat())
        view.y = y.coerceIn(0f, (parent.height - view.height).coerceAtLeast(0).toFloat())
    }

    // A press while the menu is open only closes it.
    private fun press(view: View) {
        if (menu != null) {
            closeMenu()
        } else {
            report(view)
        }
    }

    // With the mouse's centre in the wallet's page, in CSS pixels, which the wallet's own menu is drawn round.
    private fun report(view: View) {
        val mouseAt = IntArray(2)
        val hostAt = IntArray(2)

        view.getLocationInWindow(mouseAt)
        host.getLocationInWindow(hostAt)

        val x = (mouseAt[0] - hostAt[0] + view.width / 2f) / density
        val y = (mouseAt[1] - hostAt[1] + view.height / 2f) / density

        host.post {
            host.evaluateJavascript("window.__nuraMouse && window.__nuraMouse('click', $x, $y)", null)
        }
    }

    private fun mouseImage() = if (mouseIcon == "browser") R.drawable.nura_browser else R.drawable.nura_logo

    private fun glyphOf(glyph: String) = when (glyph) {
        "wallet" -> R.drawable.nura_glyph_wallet
        "browser" -> R.drawable.nura_glyph_browser
        "full" -> R.drawable.nura_glyph_full
        else -> R.drawable.nura_glyph_exit
    }

    private fun disc(fill: Int, line: Int?) = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(fill)

        if (line != null) {
            setStroke(px(1.0).coerceAtLeast(1), line)
        }
    }

    // Each button's offset from the mouse's centre, which it slides out along and back in.
    private class Spoke(val dx: Float, val dy: Float)

    /**
     * Lays the menu round the mouse's centre, as src/ui/speeddial.tsx does on the desktop: the first button at
     * twelve o'clock and the rest clockwise, each 10dp clear of the mouse. A mouse too near an edge for the ring
     * steps in until it fits, and stays there.
     */
    private fun openMenu(spec: JSONObject) {
        val mouse = mouse ?: return
        val root = mouse.parent as? ViewGroup ?: return

        dropMenu()

        val items = spec.optJSONArray("items") ?: return
        val colors = spec.optJSONObject("colors") ?: JSONObject()

        if (mouse.visibility != View.VISIBLE || items.length() == 0) {
            return
        }

        fun colour(name: String) = runCatching { Color.parseColor(colors.getString(name)) }.getOrDefault(Color.GRAY)

        val surface = colour("surface")
        val line = colour("line")
        val ink = colour("ink")
        val accent = colour("accent")
        val onAccent = colour("onAccent")
        val muted = colour("muted")

        val size = px(40.0)
        val button = px(48.0)
        val radius = 54.0 * density
        val reach = ((54.0 + 24.0 + 8.0) * density).toFloat()

        val cx = (mouse.x + size / 2f).coerceIn(reach, (root.width - reach).coerceAtLeast(reach))
        val cy = (mouse.y + size / 2f).coerceIn(reach, (root.height - reach).coerceAtLeast(reach))

        mouse.x = cx - size / 2f
        mouse.y = cy - size / 2f

        val layer = FrameLayout(activity)

        layer.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        layer.translationZ = 999f
        layer.setOnClickListener { closeMenu() }

        val count = items.length()

        for (index in 0 until count) {
            val item = items.optJSONObject(index) ?: continue
            val key = item.optString("key")
            val label = item.optString("label")

            val angle = -Math.PI / 2 + index * 2 * Math.PI / count
            val spoke = Spoke((Math.cos(angle) * radius).toFloat(), (Math.sin(angle) * radius).toFloat())

            val view = ImageView(activity)

            // LEFT, not START: the ring is laid out on the screen, the same whichever way the text runs.
            view.layoutParams = FrameLayout.LayoutParams(button, button, Gravity.TOP or Gravity.LEFT).apply {
                leftMargin = (cx + spoke.dx - button / 2f).toInt()
                topMargin = (cy + spoke.dy - button / 2f).toInt()
            }

            view.tag = spoke
            view.scaleType = ImageView.ScaleType.CENTER
            view.setImageResource(glyphOf(item.optString("glyph")))
            view.background = StateListDrawable().apply {
                addState(intArrayOf(android.R.attr.state_pressed, android.R.attr.state_enabled), disc(accent, null))
                addState(intArrayOf(), disc(surface, line))
            }
            view.imageTintList = ColorStateList(
                arrayOf(intArrayOf(-android.R.attr.state_enabled), intArrayOf(android.R.attr.state_pressed), intArrayOf()),
                intArrayOf(Color.argb(153, Color.red(muted), Color.green(muted), Color.blue(muted)), onAccent, ink)
            )
            view.elevation = px(6.0).toFloat()
            view.contentDescription = label

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                view.tooltipText = label
            }

            view.setOnClickListener { pick(key) }
            view.isEnabled = !item.optBoolean("disabled")

            // Out from part-way toward the centre, one after another clockwise.
            view.alpha = 0f
            view.scaleX = 0.5f
            view.scaleY = 0.5f
            view.translationX = -spoke.dx * 0.6f
            view.translationY = -spoke.dy * 0.6f

            view.animate()
                .alpha(1f)
                .scaleX(1f)
                .scaleY(1f)
                .translationX(0f)
                .translationY(0f)
                .setStartDelay(index * 40L)
                .setDuration(300L)
                .setInterpolator(DecelerateInterpolator(2f))
                .start()

            layer.addView(view)
        }

        root.addView(layer)

        menu = layer
    }

    // Back the way the buttons came, the last one first; the layer lets every touch through as soon as it starts.
    private fun closeMenu() {
        val layer = menu ?: return

        menu = null

        layer.setOnClickListener(null)
        layer.isClickable = false

        val count = layer.childCount

        if (count == 0) {
            (layer.parent as? ViewGroup)?.removeView(layer)

            return
        }

        for (index in 0 until count) {
            val view = layer.getChildAt(index)
            val spoke = view.tag as? Spoke ?: Spoke(0f, 0f)

            view.isClickable = false
            view.animate().cancel()

            val leaving = view.animate()
                .alpha(0f)
                .scaleX(0.5f)
                .scaleY(0.5f)
                .translationX(-spoke.dx * 0.6f)
                .translationY(-spoke.dy * 0.6f)
                .setStartDelay((count - 1 - index) * 30L)
                .setDuration(200L)
                .setInterpolator(AccelerateInterpolator())

            if (index == 0) {
                leaving.withEndAction { (layer.parent as? ViewGroup)?.removeView(layer) }
            }

            leaving.start()
        }
    }

    // At once, with no collapse: for a hidden mouse, a new menu, or a screen that changed shape under it.
    private fun dropMenu() {
        val layer = menu ?: return

        menu = null

        (layer.parent as? ViewGroup)?.removeView(layer)
    }

    // Told to the wallet alone, as a press is; it acts only on a button it offered.
    private fun pick(key: String) {
        closeMenu()

        host.post {
            host.evaluateJavascript("window.__nuraMouse && window.__nuraMouse('pick', ${JSONObject.quote(key)})", null)
        }
    }

    // A raised Z keeps the mouse over tabs added later, for drawing and touches, with no re-stacking.
    @SuppressLint("ClickableViewAccessibility")
    private fun buildMouse(root: ViewGroup): ImageView {
        val size = px(40.0)
        val view = ImageView(activity)

        view.setImageResource(mouseImage())
        view.contentDescription = "Nura Wallet"
        view.layoutParams = FrameLayout.LayoutParams(size, size)
        view.translationZ = 1000f

        val slop = ViewConfiguration.get(activity).scaledTouchSlop

        var downX = 0f
        var downY = 0f
        var fromX = 0f
        var fromY = 0f
        var dragging = false

        // No gesture detector: the view follows the finger, so it would call every drag a tap.
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

                        closeMenu()

                        host.post {
                            host.evaluateJavascript("window.__nuraMouse && window.__nuraMouse('move')", null)
                        }
                    }

                    if (dragging) {
                        place(touched, fromX + dx, fromY + dy)
                    }
                }

                MotionEvent.ACTION_UP -> if (!dragging) {
                    press(touched)
                }
            }

            true
        }

        // Only reached through accessibility services, since the touch listener takes the rest.
        view.setOnClickListener { press(it) }

        root.addView(view)

        // Kept on screen through resizes: in full screen it is the only way back out. A ring laid out for the old
        // shape would no longer sit round it, so a menu goes with the resize.
        root.addOnLayoutChangeListener { _, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
            if (right - left != oldRight - oldLeft || bottom - top != oldBottom - oldTop) {
                dropMenu()
            }

            place(view, view.x, view.y)
        }

        root.post { place(view, (root.width - size) / 2f, (root.height - size) / 2f) }

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
        activity.runOnUiThread {
            dropMenu()

            mouse?.visibility = View.GONE
        }
    }

    @JavascriptInterface
    fun showMouseMenu(payload: String) {
        val spec = runCatching { JSONObject(payload) }.getOrNull() ?: return

        activity.runOnUiThread { openMenu(spec) }
    }

    @JavascriptInterface
    fun hideMouseMenu() {
        activity.runOnUiThread { dropMenu() }
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
    fun setBarInk(ink: String) {
        activity.runOnUiThread {
            val bars = WindowCompat.getInsetsController(activity.window, activity.window.decorView)

            val system = systemBarInk ?: bars.isAppearanceLightStatusBars.also { systemBarInk = it }

            // A light status bar, as Android names it, is one whose ink is dark.
            bars.isAppearanceLightStatusBars = when (ink) {
                "dark" -> true
                "light" -> false
                else -> system
            }
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

    @JavascriptInterface
    fun permissionReply(ticket: String, allowed: Boolean) {
        activity.runOnUiThread {
            val request = asks.remove(ticket)?.request ?: return@runOnUiThread

            if (!allowed) {
                request.deny()

                return@runOnUiThread
            }

            val grant = { request.grant(request.resources) }

            val missing = request.resources
                .mapNotNull { permissionOf(it) }
                .filter { ContextCompat.checkSelfPermission(activity, it) != PackageManager.PERMISSION_GRANTED }

            if (missing.isEmpty()) {
                grant()
            } else {
                askAndroid(missing.toTypedArray()) { granted -> if (granted) grant() else request.deny() }
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

    /** What every site kept goes with the wallet. Cookies, storage and cache are process-wide, so
     * the host clears them for all tabs; the tabs close first so none writes again. */
    @JavascriptInterface
    fun clearData() {
        closeAll()

        activity.runOnUiThread {
            CookieManager.getInstance().removeAllCookies(null)
            CookieManager.getInstance().flush()

            WebStorage.getInstance().deleteAllData()
            GeolocationPermissions.getInstance().clearAll()
            WebViewDatabase.getInstance(activity).clearHttpAuthUsernamePassword()

            host.clearCache(true)
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
