package com.sy.antivirus.work

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.sy.antivirus.MainActivity
import com.sy.antivirus.R
import com.sy.antivirus.engine.AppVerdict
import com.sy.antivirus.engine.MessageVerdict
import com.sy.antivirus.engine.RiskLevel
import com.sy.antivirus.service.ThreatActionReceiver

object Notifications {
    private const val CH_THREATS = "threats"
    private const val CH_STATUS = "protection_status"
    private const val CH_RESULTS = "scan_results"
    const val ONGOING_ID = 1

    const val ACTION_CHECK_TEXT = "com.sy.antivirus.CHECK_TEXT"

    fun ensureChannels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CH_THREATS, "איומים שזוהו", NotificationManager.IMPORTANCE_HIGH))
        // MIN importance: the always-on notification stays out of the status bar and makes no sound.
        manager.createNotificationChannel(
            NotificationChannel(CH_STATUS, "הגנה בזמן אמת פעילה", NotificationManager.IMPORTANCE_MIN).apply { setShowBadge(false) },
        )
        manager.createNotificationChannel(
            NotificationChannel(CH_RESULTS, "תוצאות סריקה", NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) },
        )
    }

    fun ongoing(context: Context, text: String): Notification =
        NotificationCompat.Builder(context, CH_STATUS)
            .setSmallIcon(R.drawable.ic_stat_shield)
            .setContentTitle("SY Security מגן על המכשיר")
            .setContentText(text)
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(openApp(context))
            .build()

    fun appThreat(context: Context, verdict: AppVerdict) {
        val title = if (verdict.level == RiskLevel.MALWARE) "⚠ נמצאה נוזקה!" else "⚠ אפליקציה חשודה הותקנה"
        val text = "${verdict.app.label} - ${verdict.threat ?: verdict.reasons.firstOrNull() ?: "ניקוד סיכון ${verdict.score}"}"
        notify(context, verdict.app.packageName.hashCode(), threat(context, title, text).build())
    }

    /** Quiet confirmation that a newly installed app was checked, like the big AVs show. */
    fun appScanned(context: Context, verdict: AppVerdict) {
        val notification = NotificationCompat.Builder(context, CH_RESULTS)
            .setSmallIcon(R.drawable.ic_stat_shield)
            .setContentTitle("✓ ${verdict.app.label} נסרקה")
            .setContentText("לא נמצאו איומים")
            .setTimeoutAfter(8_000)
            .setAutoCancel(true)
            .setContentIntent(openApp(context))
            .build()
        notify(context, verdict.app.packageName.hashCode(), notification)
    }

    fun fileThreat(context: Context, path: String, name: String, threat: String, infected: Boolean) {
        val id = path.hashCode()
        fun action(action: String, label: String): NotificationCompat.Action {
            val intent = Intent(context, ThreatActionReceiver::class.java)
                .setAction(action)
                .putExtra(ThreatActionReceiver.EXTRA_PATH, path)
                .putExtra(ThreatActionReceiver.EXTRA_THREAT, threat)
                .putExtra(ThreatActionReceiver.EXTRA_NOTIFICATION_ID, id)
            val pending = PendingIntent.getBroadcast(
                context, id + action.hashCode(), intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            return NotificationCompat.Action(0, label, pending)
        }
        val notification = threat(
            context,
            if (infected) "⚠ קובץ נגוע: $name" else "⚠ קובץ חשוד: $name",
            "$threat - מומלץ להעביר להסגר",
        )
            .addAction(action(ThreatActionReceiver.ACTION_QUARANTINE, "העבר להסגר"))
            .addAction(action(ThreatActionReceiver.ACTION_DELETE, "מחק"))
            .build()
        notify(context, id, notification)
    }

    fun messageThreat(context: Context, appLabel: String, sender: String?, text: String, verdict: MessageVerdict) {
        val open = Intent(context, MainActivity::class.java)
            .setAction(ACTION_CHECK_TEXT)
            .putExtra(Intent.EXTRA_TEXT, text)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pending = PendingIntent.getActivity(
            context, text.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val from = listOfNotNull(sender, appLabel).joinToString(" · ")
        val notification = threat(context, "⚠ הודעת הונאה ב$appLabel", "$from: ${verdict.advice}")
            .setStyle(NotificationCompat.BigTextStyle().bigText("$from\n${verdict.reasons.joinToString("\n") { "• $it" }}\n\n${verdict.advice}"))
            .setContentIntent(pending)
            .build()
        notify(context, text.hashCode(), notification)
    }

    fun actionResult(context: Context, id: Int, title: String) {
        val notification = NotificationCompat.Builder(context, CH_RESULTS)
            .setSmallIcon(R.drawable.ic_stat_shield)
            .setContentTitle(title)
            .setTimeoutAfter(6_000)
            .setAutoCancel(true)
            .build()
        notify(context, id, notification)
    }

    private fun threat(context: Context, title: String, text: String) =
        NotificationCompat.Builder(context, CH_THREATS)
            .setSmallIcon(R.drawable.ic_stat_shield)
            .setColor(0xFFFF4D4F.toInt())
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setContentIntent(openApp(context))
            .setAutoCancel(true)

    private fun openApp(context: Context): PendingIntent = PendingIntent.getActivity(
        context, 0,
        Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE,
    )

    @SuppressLint("MissingPermission")
    fun notify(context: Context, id: Int, notification: Notification) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        ensureChannels(context)
        NotificationManagerCompat.from(context).notify(id, notification)
    }
}
