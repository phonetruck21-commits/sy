package com.sy.antivirus.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.sy.antivirus.data.InstalledApps
import com.sy.antivirus.data.SignatureStore
import com.sy.antivirus.engine.AppAnalyzer
import com.sy.antivirus.engine.RiskLevel
import com.sy.antivirus.service.ProtectionService
import java.util.concurrent.TimeUnit

/**
 * Safety net for real-time protection: every hour asks Android which packages were
 * installed or updated since the last check. It only alerts when [ProtectionService]
 * was not running (e.g. killed by an aggressive battery saver), so nothing is reported twice.
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
        val trusted = ctx.getSharedPreferences("ui", Context.MODE_PRIVATE).getStringSet("trusted", emptySet()).orEmpty()
        for (name in changed.packageNames) {
            if (name == ctx.packageName) continue
            val info = apps.collect(name) ?: continue // uninstalled
            val verdict = analyzer.analyze(info)
            val report = verdict.level == RiskLevel.MALWARE || (verdict.level == RiskLevel.SUSPICIOUS && name !in trusted)
            if (report && !ProtectionService.isRunning) Notifications.appThreat(ctx, verdict)
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
                    PeriodicWorkRequestBuilder<ProtectionWorker>(1, TimeUnit.HOURS).build(),
                )
                ProtectionService.start(context)
            } else {
                prefs.edit().putBoolean(KEY_ENABLED, false).apply()
                workManager.cancelUniqueWork(WORK_NAME)
                ProtectionService.stop(context)
            }
        }
    }
}
