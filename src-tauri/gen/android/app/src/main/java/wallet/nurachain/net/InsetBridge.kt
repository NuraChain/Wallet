package wallet.nurachain.net

import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Android's WebView fills `env(safe-area-inset-*)` from a display cutout and from nothing else. The
 * window is laid out edge to edge, so the status and navigation bars sit over the page, yet neither
 * one ever reaches CSS: a layout that trusts `env()` alone puts its content underneath them. The
 * insets the system does hand the view are published as the `--inset-top` and `--inset-bottom`
 * variables `style.css` seeds from `env()` on every other platform.
 *
 * Both routes write the same two variables. The push covers a change while the page is up — a
 * rotation, the gesture bar swapping for buttons — and the getters cover the first paint, which
 * lands after the last push the listener made against a document that no longer exists.
 */
class InsetBridge(private val webView: WebView) {

    @Volatile
    private var topInset = 0.0

    @Volatile
    private var bottomInset = 0.0

    /** The system measures insets in physical pixels; CSS counts in density-independent ones. */
    private fun scale(view: View) = view.resources.displayMetrics.density.toDouble()

    fun track() {
        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val density = scale(view)

            topInset = bars.top / density
            bottomInset = bars.bottom / density

            webView.evaluateJavascript(
                "document.documentElement.style.setProperty('--inset-top', '${topInset}px');" +
                    "document.documentElement.style.setProperty('--inset-bottom', '${bottomInset}px');",
                null
            )

            // Handed on rather than consumed: the browser tab's native WebViews are siblings of this
            // one under android.R.id.content and are still owed the same dispatch.
            insets
        }

        ViewCompat.requestApplyInsets(webView)
    }

    @JavascriptInterface
    fun top(): Double = topInset

    @JavascriptInterface
    fun bottom(): Double = bottomInset
}
