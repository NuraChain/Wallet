package wallet.nurachain.net

import android.app.Activity
import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import java.io.OutputStream

class ExportBridge(private val activity: Activity) {

    private fun scopedStorageAvailable() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

    private fun write(collection: android.net.Uri, values: ContentValues, body: (OutputStream) -> Unit): String {
        if (!scopedStorageAvailable()) {
            return "unsupported"
        }

        return try {
            val resolver = activity.contentResolver
            val target = resolver.insert(collection, values) ?: return "insert-failed"

            resolver.openOutputStream(target).use { stream ->
                if (stream == null) {
                    return "open-failed"
                }

                body(stream)
            }

            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(target, values, null, null)

            ""
        } catch (cause: Exception) {
            cause.message ?: "failed"
        }
    }

    @JavascriptInterface
    fun saveImage(base64Png: String, name: String): String {
        val bytes = try {
            Base64.decode(base64Png, Base64.DEFAULT)
        } catch (cause: IllegalArgumentException) {
            return "bad-image"
        }

        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, "image/png")
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Nura Wallet")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }

        return write(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) { it.write(bytes) }
    }

    @JavascriptInterface
    fun saveText(text: String, name: String): String {
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, "text/plain")
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }

        return write(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) { it.write(text.toByteArray()) }
    }
}
