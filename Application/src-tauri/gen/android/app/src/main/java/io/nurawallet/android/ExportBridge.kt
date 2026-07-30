package io.nurawallet.android

import android.app.Activity
import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import java.io.OutputStream

/**
 * Writes a recovery phrase out to shared storage, as an image or a text file.
 *
 * This exists because the user asked for it, and it is worth being blunt about what it does: shared
 * storage is exactly that. A picture in the gallery is swept up by whatever photo backup is signed in,
 * and both files are readable by any app the user has granted media or storage access. A phrase that
 * leaves the app's private directory should be treated as public from that moment on — the wallet is
 * only as safe as the least careful place its words end up.
 *
 * The app's own encrypted storage is unaffected; nothing here reads or moves it.
 *
 * MediaStore's scoped-storage API needs no permission from Android 10 onwards. Below that a write to
 * shared storage requires a runtime grant, so the export is refused with a message rather than
 * half-working.
 */
class ExportBridge(private val activity: Activity) {

    private fun scopedStorageAvailable() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

    /** Runs the write and turns any failure into a message the UI can show. */
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

            // Until this clears, other apps see a partially written file.
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(target, values, null, null)

            ""
        } catch (cause: Exception) {
            cause.message ?: "failed"
        }
    }

    /**
     * Saves a PNG, supplied as base64 from the page, into Pictures/Nura Wallet.
     *
     * The image is drawn by the caller rather than captured from the screen, so what lands in the
     * gallery is exactly the words and nothing else around them.
     */
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

    /** Saves a plain text file into Downloads. */
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
