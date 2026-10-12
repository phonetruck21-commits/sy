package com.sy.antivirus.service

import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.FileObserver
import android.os.IBinder
import androidx.core.content.ContextCompat
import com.sy.antivirus.data.FileAccess
import com.sy.antivirus.data.InstalledApps
import com.sy.antivirus.data.SignatureStore
import com.sy.antivirus.engine.AppAnalyzer
import com.sy.antivirus.engine.FileScanner
import com.sy.antivirus.engine.RiskLevel
import com.sy.antivirus.work.Notifications
import com.sy.antivirus.work.ProtectionWorker
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Always-on real-time protection, built to cost almost nothing while idle:
 * - no polling, no timers, no wake locks: it only runs when Android delivers an event
 * - installs/updates arrive as package broadcasts
 * - new files arrive through inotify (FileObserver) on the folders malware usually lands in
 * - all scanning happens on one low-priority background thread
 */
class ProtectionService : Service() {
    private lateinit var executor: ExecutorService
    private val observers = mutableListOf<FileObserver>()
    private val db by lazy { SignatureStore.load(this) }
    private val analyzer by lazy { AppAnalyzer(db) }
    private val fileScanner by lazy { FileScanner(db) }
    private var appsScanned = 0
    private var filesScanned = 0

    private val packageReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val packageName = intent.data?.schemeSpecificPart ?: return
            // An update sends ADDED(replacing) and REPLACED; scan once.
            if (intent.action == Intent.ACTION_PACKAGE_ADDED && intent.getBooleanExtra(Intent.EXTRA_REPLACING, false)) return
            executor.execute { scanApp(packageName) }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        executor = Executors.newSingleThreadExecutor { runnable ->
            Thread {
                android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND)
                runnable.run()
            }.apply { name = "sy-protection" }
        }
        Notifications.ensureChannels(this)
        val notification = Notifications.ongoing(this, statusText())
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(Notifications.ONGOING_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(Notifications.ONGOING_ID, notification)
        }
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REPLACED)
            addDataScheme("package")
        }
        // Package broadcasts are protected system broadcasts, so they can't be spoofed by other apps.
        ContextCompat.registerReceiver(this, packageReceiver, filter, ContextCompat.RECEIVER_EXPORTED)
        isRunning = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!ProtectionWorker.isEnabled(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        // Called again whenever the app starts us, e.g. right after the user grants file access.
        refreshFileGuard()
        return START_STICKY
    }

    override fun onDestroy() {
        isRunning = false
        runCatching { unregisterReceiver(packageReceiver) }
        stopObservers()
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun scanApp(packageName: String) {
        if (packageName == this.packageName) return
        val info = InstalledApps(this).collect(packageName) ?: return
        val verdict = analyzer.analyze(info)
        appsScanned++
        val trusted = getSharedPreferences("ui", Context.MODE_PRIVATE).getStringSet("trusted", emptySet()).orEmpty()
        val report = verdict.level == RiskLevel.MALWARE || (verdict.level == RiskLevel.SUSPICIOUS && packageName !in trusted)
        if (report) Notifications.appThreat(this, verdict) else Notifications.appScanned(this, verdict)
        updateStatus()
    }

    private fun refreshFileGuard() {
        stopObservers()
        if (!FileAccess.granted(this)) {
            updateStatus()
            return
        }
        for (dir in FileAccess.watchedFolders()) {
            @Suppress("DEPRECATION")
            val observer = object : FileObserver(dir.path, CLOSE_WRITE or MOVED_TO) {
                override fun onEvent(event: Int, path: String?) {
                    if (path == null || isTemporary(path)) return
                    val file = File(dir, path)
                    executor.execute { scanFile(file) }
                }
            }
            observer.startWatching()
            observers += observer
        }
        updateStatus()
    }

    private fun scanFile(file: File) {
        if (!file.isFile || file.length() > MAX_FILE_BYTES) return
        val bytes = runCatching { file.readBytes() }.getOrNull() ?: return
        val result = fileScanner.scan(file.name, bytes)
        filesScanned++
        result.detections.firstOrNull()?.let { detection ->
            Notifications.fileThreat(this, file.path, file.name, detection.threat, result.infected)
        }
        updateStatus()
    }

    private fun stopObservers() {
        observers.forEach { it.stopWatching() }
        observers.clear()
    }

    private fun statusText(): String {
        val shields = buildList {
            add("אפליקציות")
            if (observers.isNotEmpty()) add("קבצים")
            if (MessageGuardService.isEnabled(this@ProtectionService)) add("הודעות")
        }
        val counts = if (appsScanned + filesScanned > 0) " · נבדקו $appsScanned אפליקציות ו-$filesScanned קבצים" else ""
        return "מגן: ${shields.joinToString(", ")}$counts"
    }

    private fun updateStatus() {
        Notifications.notify(this, Notifications.ONGOING_ID, Notifications.ongoing(this, statusText()))
    }

    companion object {
        /** True while the service lives in this process; lets the hourly worker avoid duplicate alerts. */
        @Volatile
        var isRunning = false
            private set

        private const val MAX_FILE_BYTES = 50L * 1024 * 1024

        private fun isTemporary(name: String): Boolean {
            val lower = name.lowercase()
            return lower.startsWith(".") || TEMP_SUFFIXES.any { lower.endsWith(it) }
        }

        private val TEMP_SUFFIXES = listOf(".crdownload", ".part", ".partial", ".tmp", ".download", ".temp")

        fun start(context: Context) {
            // Fails only if called from the background on Android 12+; the hourly worker covers that case.
            runCatching { ContextCompat.startForegroundService(context, Intent(context, ProtectionService::class.java)) }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, ProtectionService::class.java))
        }
    }
}
