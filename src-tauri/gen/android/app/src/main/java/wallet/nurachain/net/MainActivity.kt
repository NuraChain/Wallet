package wallet.nurachain.net

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts

class MainActivity : TauriActivity() {
  // Whoever is waiting to hear whether Android let the app use a device, in the order they asked. A
  // page in the browser asks through BrowserBridge, but the launcher is registered here: an
  // activity takes one only before it has started, and the bridge is built later than that.
  private val deviceAsks = ArrayDeque<Pair<Array<String>, (Boolean) -> Unit>>()

  private val devices = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
    val asked = deviceAsks.removeFirstOrNull()

    asked?.second?.invoke(asked.first.all { result[it] == true })

    launchNext()
  }

  private fun launchNext() {
    deviceAsks.firstOrNull()?.let { devices.launch(it.first) }
  }

  // One system dialog at a time: a page asking while one is up waits its turn.
  private fun askAndroid(names: Array<String>, answer: (Boolean) -> Unit) {
    deviceAsks.addLast(names to answer)

    if (deviceAsks.size == 1) {
      launchNext()
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT)
    )

    super.onCreate(savedInstanceState)
  }

  @SuppressLint("JavascriptInterface")
  override fun onWebViewCreate(webView: WebView) {
    val insets = InsetBridge(webView)

    webView.addJavascriptInterface(BrowserBridge(this, webView, ::askAndroid), "__nuraBrowser")
    webView.addJavascriptInterface(ExportBridge(this), "__nuraExport")
    webView.addJavascriptInterface(insets, "__nuraInset")

    insets.track()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()

    val fastest = window.decorView.display
      ?.supportedModes
      ?.maxByOrNull { it.refreshRate }
      ?: return

    window.attributes = window.attributes.apply { preferredDisplayModeId = fastest.modeId }
  }
}
