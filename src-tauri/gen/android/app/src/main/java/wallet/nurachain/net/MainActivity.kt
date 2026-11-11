package wallet.nurachain.net

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.ActivityResult
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

  // One picker at a time, each request queued behind the last: a page waiting on a file has to be
  // answered once, with what was picked or with nothing at all.
  private val fileAsks = ArrayDeque<Pair<Intent, (ActivityResult?) -> Unit>>()

  private val files = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
    fileAsks.removeFirstOrNull()?.second?.invoke(result)

    launchNextFile()
  }

  private fun launchNextFile() {
    val next = fileAsks.firstOrNull() ?: return

    try {
      files.launch(next.first)
    } catch (_: ActivityNotFoundException) {
      // Nothing on the phone picked up what the page asked for; the page hears of it as a cancel.
      fileAsks.removeFirst()

      next.second(null)

      launchNextFile()
    }
  }

  private fun chooseFile(intent: Intent, answer: (ActivityResult?) -> Unit) {
    fileAsks.addLast(intent to answer)

    if (fileAsks.size == 1) {
      launchNextFile()
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT)
    )

    super.onCreate(savedInstanceState)

    giveDiscordActivity()
  }

  // Discord's SDK loads its library and reaches the Discord app through the activity it is handed. It is in a build only when its
  // AAR was supplied (see build.gradle.kts), hence the reflection; without it, Rich Presence is simply off.
  private fun giveDiscordActivity() {
    try {
      Class.forName("com.discord.socialsdk.DiscordSocialSdkInit")
        .getMethod("setEngineActivity", android.app.Activity::class.java)
        .invoke(null, this)
    } catch (_: ReflectiveOperationException) {
    } catch (_: LinkageError) {
    }
  }

  @SuppressLint("JavascriptInterface")
  override fun onWebViewCreate(webView: WebView) {
    val insets = InsetBridge(webView)

    webView.addJavascriptInterface(BrowserBridge(this, webView, ::askAndroid, ::chooseFile), "__nuraBrowser")
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
