package wallet.nurachain.net

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // The no-argument `enableEdgeToEdge()` puts an opaque light scrim behind the navigation bar, which
    // reads as a white strip under the web content. Both bars are forced fully transparent instead so
    // the page background shows through; `auto` still picks the icon tint from the system dark mode.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT)
    )

    super.onCreate(savedInstanceState)
  }

  // Attached to the app's own webview only. The browser tab's page webview is a separate instance
  // that never gets this interface, so a visited site cannot reach the bridge.
  @SuppressLint("JavascriptInterface")
  override fun onWebViewCreate(webView: WebView) {
    webView.addJavascriptInterface(BrowserBridge(this, webView), "__nuraBrowser")
    webView.addJavascriptInterface(ExportBridge(this), "__nuraExport")
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()

    // A window that never states a preference is left on the panel's base 60Hz mode by the display
    // manager, so a 120Hz screen renders the app at half rate. Ask for the fastest mode the panel
    // reports; the system still overrides this under thermal or battery-saver pressure.
    val fastest = window.decorView.display
      ?.supportedModes
      ?.maxByOrNull { it.refreshRate }
      ?: return

    window.attributes = window.attributes.apply { preferredDisplayModeId = fastest.modeId }
  }
}
