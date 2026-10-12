package com.sy.antivirus.service

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.sy.antivirus.data.SignatureStore
import com.sy.antivirus.engine.ScamDetector
import com.sy.antivirus.engine.ScamLevel
import com.sy.antivirus.work.Notifications
import com.sy.antivirus.work.ProtectionWorker
import java.util.concurrent.Executors

/**
 * Scam shield for incoming messages. Android hands us each new notification; we read the
 * text of messaging-app notifications and run it through [ScamDetector] on the device.
 * Nothing is stored or sent anywhere.
 */
class MessageGuardService : NotificationListenerService() {
    private val executor = Executors.newSingleThreadExecutor()
    private val detector by lazy { ScamDetector(SignatureStore.load(this)) }
    private val recent = ArrayDeque<Int>()

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return
        if (sbn.packageName == packageName || !ProtectionWorker.isEnabled(this)) return
        val notification = sbn.notification ?: return
        if (sbn.packageName !in MESSAGING_APPS && notification.category != Notification.CATEGORY_MESSAGE) return
        if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

        val text = extractText(notification)
        if (text.length < 8) return
        val key = (sbn.packageName + text).hashCode()
        synchronized(recent) {
            if (key in recent) return // messaging apps re-post the same notification often
            recent.addLast(key)
            if (recent.size > 200) recent.removeFirst()
        }
        val sender = notification.extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        executor.execute {
            val verdict = detector.analyzeMessage(text)
            if (verdict.level == ScamLevel.DANGEROUS) {
                Notifications.messageThreat(this, appLabel(sbn.packageName), sender, text, verdict)
            }
        }
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun extractText(notification: Notification): String {
        val messaging = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(notification)
        messaging?.messages?.lastOrNull()?.text?.let { return it.toString() }
        val extras = notification.extras
        return (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))
            ?.toString().orEmpty()
    }

    private fun appLabel(packageName: String): String = runCatching {
        packageManager.getApplicationLabel(packageManager.getApplicationInfo(packageName, 0)).toString()
    }.getOrDefault(packageName)

    companion object {
        fun isEnabled(context: Context) =
            context.packageName in NotificationManagerCompat.getEnabledListenerPackages(context)

        private val MESSAGING_APPS = setOf(
            "com.whatsapp", "com.whatsapp.w4b", "org.telegram.messenger", "org.thunderdog.challegram",
            "com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms",
            "com.facebook.orca", "com.viber.voip", "com.instagram.android", "xyz.klinker.messenger",
            "com.textra", "com.google.android.gm", "com.microsoft.office.outlook", "com.truecaller",
        )
    }
}
