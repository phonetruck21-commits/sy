package com.sy.antivirus.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.sy.antivirus.data.QuarantineManager
import com.sy.antivirus.work.Notifications
import com.sy.antivirus.work.ProtectionWorker
import java.io.File

/** Restarts real-time protection after a reboot or an app update. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        if (ProtectionWorker.isEnabled(context)) ProtectionService.start(context)
    }
}

/** Handles the "quarantine" / "delete" buttons on a file-threat notification. */
class ThreatActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val path = intent.getStringExtra(EXTRA_PATH) ?: return
        val threat = intent.getStringExtra(EXTRA_THREAT) ?: "Unknown"
        val id = intent.getIntExtra(EXTRA_NOTIFICATION_ID, path.hashCode())
        val file = File(path)
        val pending = goAsync()
        Thread {
            try {
                val title = when (intent.action) {
                    ACTION_QUARANTINE ->
                        if (runCatching { QuarantineManager(context).quarantineFile(file, threat) }.getOrDefault(false)) {
                            "✓ ${file.name} הועבר להסגר"
                        } else {
                            "לא ניתן להעביר את ${file.name} להסגר"
                        }
                    ACTION_DELETE ->
                        if (file.delete()) "✓ ${file.name} נמחק" else "לא ניתן למחוק את ${file.name}"
                    else -> null
                }
                title?.let { Notifications.actionResult(context, id, it) }
            } finally {
                pending.finish()
            }
        }.start()
    }

    companion object {
        const val ACTION_QUARANTINE = "com.sy.antivirus.action.QUARANTINE"
        const val ACTION_DELETE = "com.sy.antivirus.action.DELETE"
        const val EXTRA_PATH = "path"
        const val EXTRA_THREAT = "threat"
        const val EXTRA_NOTIFICATION_ID = "notification_id"
    }
}
