package com.sy.antivirus.work

import android.Manifest
import android.annotation.SuppressLint
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
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.sy.antivirus.MainActivity
import com.sy.antivirus.R
import com.sy.antivirus.data.InstalledApps
import com.sy.antivirus.data.SignatureStore
import com.sy.antivirus.engine.AppAnalyzer
import com.sy.antivirus.engine.AppVerdict
import com.sy.antivirus.engine.RiskLevel
import java.util.concurrent.TimeUnit

/**
 * Background protection: periodically asks Android which packages were installed
 * or updated since the last check and scans only those.
 */
class ProtectionWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val pm = ctx.packageManager
        val sequence = prefs.getInt(KEY_SEQUENCE, -1)
        if (sequence < 0) {
            prefs.edit().putInt(KEY_SEQUENCE, pm.getChangedPackages(0)?.sequenceNumber ?: 0).apply()
            return Result.success()
        }
        val changed = pm.getChangedPackages(sequence) ?: return Result.success()

        val apps = InstalledApps(ctx)
        val analyzer = AppAnalyzer(SignatureStore.load(ctx))
        for (name in changed.packageNames) {
            if (name == ctx.packageName) continue
            val info = apps.collect(name) ?: continue // uninstalled
            val verdict = analyzer.analyze(info)
            if (verdict.level >= RiskLevel.SUSPICIOUS) Notifications.threat(ctx, verdict)
        }
        prefs.edit().putInt(KEY_SEQUENCE, changed.sequenceNumber).apply()
        return Result.success()
    }

    companion object {
        private const val WORK_NAME = "app-protection"
        private const val PREFS = "protection"
        private const val KEY_SEQUENCE = "sequence"
        private const val KEY_ENABLED = "enabled"

        fun isEnabled(context: Context) =
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false)

        fun setEnabled(context: Context, enabled: Boolean) {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val workManager = WorkManager.getInstance(context)
            if (enabled) {
                // Start from "now" so only apps installed from here on are reported.
                val current = context.packageManager.getChangedPackages(0)?.sequenceNumber ?: 0
                prefs.edit().putBoolean(KEY_ENABLED, true).putInt(KEY_SEQUENCE, current).apply()
                workManager.enqueueUniquePeriodicWork(
                    WORK_NAME,
                    ExistingPeriodicWorkPolicy.KEEP,
                    PeriodicWorkRequestBuilder<ProtectionWorker>(15, TimeUnit.MINUTES).build(),
                )
            } else {
                prefs.edit().putBoolean(KEY_ENABLED, false).apply()
                workManager.cancelUniqueWork(WORK_NAME)
            }
        }
    }
}

object Notifications {
    private const val CHANNEL = "threats"

    fun ensureChannel(context: Context) {
        val channel = NotificationChannel(CHANNEL, "איומים שזוהו", NotificationManager.IMPORTANCE_HIGH)
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    @SuppressLint("MissingPermission")
    fun threat(context: Context, verdict: AppVerdict) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        ensureChannel(context)
        val open = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val title = if (verdict.level == RiskLevel.MALWARE) "נמצאה נוזקה!" else "אפליקציה חשודה הותקנה"
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText("${verdict.app.label} - ${verdict.threat ?: "ניקוד סיכון ${verdict.score}"}")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(verdict.app.packageName.hashCode(), notification)
    }
}
