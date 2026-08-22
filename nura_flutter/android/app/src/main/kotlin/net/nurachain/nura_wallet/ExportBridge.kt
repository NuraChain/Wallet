package net.nurachain.nura_wallet

import android.app.Activity
import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
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
 *
 * A port of the Tauri build's bridge of the same name. That one was reached over a `JavascriptInterface`
 * and took the PNG base64-encoded because a webview could hand it nothing else; a method channel
 * carries bytes, so the encode/decode round trip is gone and nothing else changed.
 */
class ExportBridge(private val activity: Activity) {

    private fun scopedStorageAvailable() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

    /**
     * Runs the write and turns any failure into a message the UI can show.
     *
     * The collection arrives as a lambda so it is not resolved until after the version guard has
     * passed. `MediaStore.Downloads` is an API 29 class: naming it in an argument expression would
     * load it on the way *into* this function and throw `NoClassDefFoundError` on the very devices
     * the guard exists to turn away.
     */
    private fun write(collection: () -> Uri, values: ContentValues, body: (OutputStream) -> Unit): String {
        if (!scopedStorageAvailable()) {
            return "unsupported"
        }

        return try {
            val resolver = activity.contentResolver
            val target = resolver.insert(collection(), values) ?: return "insert-failed"

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
     * Saves a PNG, drawn by the caller, into Pictures/Nura Wallet.
     *
     * The image is composed rather than captured from the screen, so what lands in the gallery is
     * exactly the words and nothing else around them.
     */
    fun saveImage(png: ByteArray, name: String): String {
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, "image/png")
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Nura Wallet")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }

        return write({ MediaStore.Images.Media.EXTERNAL_CONTENT_URI }, values) { it.write(png) }
    }

    /** Saves a plain text file into Downloads. */
    fun saveText(text: String, name: String): String {
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, "text/plain")
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }

        return write({ MediaStore.Downloads.EXTERNAL_CONTENT_URI }, values) { it.write(text.toByteArray()) }
    }
}
