package io.gwallet.android

import android.graphics.Color
import android.os.Bundle
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

}
