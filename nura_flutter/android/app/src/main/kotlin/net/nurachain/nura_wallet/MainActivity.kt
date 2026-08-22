package net.nurachain.nura_wallet

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    override fun configureFlutterEngine(engine: FlutterEngine) {
        super.configureFlutterEngine(engine)

        val bridge = ExportBridge(this)

        MethodChannel(engine.dartExecutor.binaryMessenger, EXPORT_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "saveImage" -> {
                    val bytes = call.argument<ByteArray>("bytes")
                    val name = call.argument<String>("name")

                    if (bytes == null || name == null) {
                        result.error("bad-arguments", "saveImage needs bytes and a name", null)
                    } else {
                        result.success(bridge.saveImage(bytes, name))
                    }
                }

                "saveText" -> {
                    val text = call.argument<String>("text")
                    val name = call.argument<String>("name")

                    if (text == null || name == null) {
                        result.error("bad-arguments", "saveText needs text and a name", null)
                    } else {
                        result.success(bridge.saveText(text, name))
                    }
                }

                else -> result.notImplemented()
            }
        }
    }

    private companion object {
        /** Matches the name the Dart side opens. */
        const val EXPORT_CHANNEL = "net.nurachain.nura_wallet/export"
    }
}
