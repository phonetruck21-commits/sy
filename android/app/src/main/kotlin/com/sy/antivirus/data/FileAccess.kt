package com.sy.antivirus.data

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.ContextCompat
import java.io.File

/** Storage access needed by the real-time file shield ("All files access" on Android 11+). */
object FileAccess {
    fun granted(context: Context): Boolean =
        if (Build.VERSION.SDK_INT >= 30) {
            Environment.isExternalStorageManager()
        } else {
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
        }

    /** Android 11+: the settings screen to grant access. Older versions use a runtime permission instead. */
    fun settingsIntent(context: Context): Intent? =
        if (Build.VERSION.SDK_INT >= 30) {
            Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:${context.packageName}"))
        } else {
            null
        }

    val legacyPermissions = arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE)

    /** Where downloaded and received files land; FileObserver isn't recursive, so list each one. */
    @Suppress("DEPRECATION")
    fun watchedFolders(): List<File> {
        val root = Environment.getExternalStorageDirectory()
        return listOf(
            Environment.DIRECTORY_DOWNLOADS,
            Environment.DIRECTORY_DOCUMENTS,
            "Bluetooth",
            "Download/Telegram",
            "Telegram/Telegram Documents",
            "Android/media/org.telegram.messenger/Telegram/Telegram Documents",
            "WhatsApp/Media/WhatsApp Documents",
            "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents",
            "Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Business Documents",
        ).map { File(root, it) }.filter { it.isDirectory }
    }
}
