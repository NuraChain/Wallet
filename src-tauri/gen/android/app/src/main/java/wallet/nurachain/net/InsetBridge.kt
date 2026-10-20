package wallet.nurachain.net

import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Android's WebView fills `env(safe-area-inset-*)` only from a cutout and edge-to-edge never resizes
 * for the keyboard, so insets go to CSS variables; the getters cover first paint, which misses pushes.
 */
class InsetBridge(private val webView: WebView) {

    @Volatile
    private var topInset = 0.0

    @Volatile
    private var bottomInset = 0.0

    // Tappable part only (none under a gesture bar): the whole inset left a solid strip under sites.
    @Volatile
    private var barInset = 0.0

    private fun scale(view: View) = view.resources.displayMetrics.density.toDouble()

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
            val tappable = insets.getInsets(WindowInsetsCompat.Type.tappableElement()).bottom
            val density = scale(view)

            lift(view, keyboard)

            topInset = bars.top / density

            // The keyboard height includes the navigation bar, so a lifted view has nothing to pad.
            bottomInset = (bars.bottom - keyboard).coerceAtLeast(0) / density
            barInset = (tappable - keyboard).coerceAtLeast(0) / density

            webView.evaluateJavascript(
                "document.documentElement.style.setProperty('--inset-top', '${topInset}px');" +
                    "document.documentElement.style.setProperty('--inset-bottom', '${bottomInset}px');" +
                    "document.documentElement.style.setProperty('--inset-bar', '${barInset}px');",
                null
            )

            // Not consumed: the browser tab's WebViews are siblings and are owed the same dispatch.
            insets
        }

        ViewCompat.requestApplyInsets(webView)
    }

    @JavascriptInterface
    fun top(): Double = topInset

    @JavascriptInterface
    fun bottom(): Double = bottomInset

    @JavascriptInterface
    fun bar(): Double = barInset
}
