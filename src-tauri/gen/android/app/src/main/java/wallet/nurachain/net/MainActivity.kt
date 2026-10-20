package wallet.nurachain.net

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts

class MainActivity : TauriActivity() {
  // Registered here, not in BrowserBridge: an activity takes a launcher only before it starts.
  private val deviceAsks = ArrayDeque<Pair<Array<String>, (Boolean) -> Unit>>()

  private val devices = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
    val asked = deviceAsks.removeFirstOrNull()

    asked?.second?.invoke(asked.first.all { result[it] == true })

    launchNext()
  }

  private fun launchNext() {
    deviceAsks.firstOrNull()?.let { devices.launch(it.first) }
  }

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
