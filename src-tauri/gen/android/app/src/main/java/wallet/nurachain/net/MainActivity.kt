package wallet.nurachain.net

import android.Manifest
import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts

class MainActivity : TauriActivity() {
  // Whoever is waiting to hear whether Android let the app use the microphone. A page in the browser
  // asks through BrowserBridge, but the launcher is registered here: an activity takes one only
  // before it has started, and the bridge is built later than that.
  private val microphoneWaiting = ArrayList<(Boolean) -> Unit>()

  private val microphone = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    val waiting = microphoneWaiting.toList()

    microphoneWaiting.clear()

    waiting.forEach { it(granted) }
  }

  // One system dialog at a time: a second page asking while it is up waits on the same answer.
  private fun askMicrophone(answer: (Boolean) -> Unit) {
    microphoneWaiting.add(answer)

    if (microphoneWaiting.size == 1) {
      microphone.launch(Manifest.permission.RECORD_AUDIO)
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

    webView.addJavascriptInterface(BrowserBridge(this, webView, ::askMicrophone), "__nuraBrowser")
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
