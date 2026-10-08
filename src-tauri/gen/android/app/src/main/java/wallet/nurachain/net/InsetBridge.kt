package wallet.nurachain.net

import android.view.View
import android.view.ViewGroup
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
 *
 * The keyboard is the third thing an edge-to-edge window is no longer resized for: it only arrives
 * here as one more inset, and a page left alone runs on underneath it with its fields covered. The
 * view gives up that much of its own height instead, so the page lays out again in what is left.
 */
class InsetBridge(private val webView: WebView) {

    @Volatile
    private var topInset = 0.0

    @Volatile
    private var bottomInset = 0.0

    /** The system measures insets in physical pixels; CSS counts in density-independent ones. */
    private fun scale(view: View) = view.resources.displayMetrics.density.toDouble()

    /** Ends the view where the keyboard begins. Zero puts it back at the bottom of the window. */
    private fun lift(view: View, keyboard: Int) {
        val params = view.layoutParams as? ViewGroup.MarginLayoutParams ?: return

        if (params.bottomMargin != keyboard) {
            params.bottomMargin = keyboard

            view.layoutParams = params
        }
    }

    fun track() {
        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
            val density = scale(view)

            lift(view, keyboard)

            topInset = bars.top / density

            // The keyboard is measured from the bottom of the window, navigation bar included, so a
            // view lifted clear of the one is clear of the other and has nothing left to pad for.
            bottomInset = (bars.bottom - keyboard).coerceAtLeast(0) / density

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
