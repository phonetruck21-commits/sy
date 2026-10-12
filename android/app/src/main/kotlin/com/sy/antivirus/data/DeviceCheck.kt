package com.sy.antivirus.data

import android.app.AppOpsManager
import android.app.KeyguardManager
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import java.io.File
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * One line of the security checkup. [fix] is either an android.provider.Settings action
 * or one of the in-app actions below.
 */
data class CheckItem(
    val title: String,
    val detail: String,
    val ok: Boolean,
    val weight: Int,
    val fix: String? = null,
)

data class SecurityReport(val score: Int, val items: List<CheckItem>) {
    val problems get() = items.filter { !it.ok }
}

object DeviceCheck {
    const val FIX_PROTECTION = "app:protection"
    const val FIX_SCAN = "app:scan"
    const val FIX_APPS = "app:apps"

    fun run(
        context: Context,
        protectionEnabled: Boolean,
        lastAppScan: Long,
        suspiciousApps: Int?,
    ): SecurityReport {
        val items = listOfNotNull(
            screenLock(context),
            securityPatch(),
            usbDebugging(context),
            developerOptions(context),
            root(),
            unknownSources(context),
            CheckItem(
                "הגנה ברקע",
                if (protectionEnabled) "פעילה - כל אפליקציה חדשה נבדקת" else "כבויה - אפליקציות חדשות לא נבדקות",
                protectionEnabled, 10, FIX_PROTECTION,
            ),
            scanRecency(lastAppScan),
            suspiciousApps?.let {
                CheckItem(
                    "אפליקציות חשודות",
                    if (it == 0) "לא נמצאו בסריקה האחרונה" else "נמצאו $it אפליקציות חשודות",
                    it == 0, 15, FIX_APPS,
                )
            },
        )
        val score = (100 - items.filter { !it.ok }.sumOf { it.weight }).coerceIn(0, 100)
        return SecurityReport(score, items.sortedBy { it.ok })
    }

    private fun screenLock(context: Context): CheckItem {
        val secure = context.getSystemService(KeyguardManager::class.java)?.isDeviceSecure == true
        return CheckItem(
            "נעילת מסך",
            if (secure) "מוגדרת נעילה עם קוד, תבנית או טביעת אצבע" else "אין נעילת מסך - כל מי שמחזיק את הטלפון נכנס לכל דבר",
            secure, 25, Settings.ACTION_SECURITY_SETTINGS,
        )
    }

    private fun securityPatch(): CheckItem? {
        val patch = runCatching { LocalDate.parse(Build.VERSION.SECURITY_PATCH) }.getOrNull() ?: return null
        val days = ChronoUnit.DAYS.between(patch, LocalDate.now())
        val ok = days <= 120
        return CheckItem(
            "עדכוני אבטחה",
            if (ok) "עדכון אבטחה מ-${Build.VERSION.SECURITY_PATCH}" else "העדכון האחרון בן ${days / 30} חודשים - בדוק אם יש עדכון מערכת",
            ok, 15, Settings.ACTION_DEVICE_INFO_SETTINGS,
        )
    }

    private fun usbDebugging(context: Context): CheckItem {
        val on = Settings.Global.getInt(context.contentResolver, Settings.Global.ADB_ENABLED, 0) == 1
        return CheckItem(
            "ניפוי באגים ב-USB",
            if (on) "פעיל - מחשב או מטען זדוני יכולים להשתלט על המכשיר" else "כבוי",
            !on, 10, Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS,
        )
    }

    private fun developerOptions(context: Context): CheckItem {
        val on = Settings.Global.getInt(context.contentResolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) == 1
        return CheckItem(
            "אפשרויות מפתחים",
            if (on) "פעילות - מומלץ לכבות אם אינך מפתח" else "כבויות",
            !on, 5, Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS,
        )
    }

    private fun root(): CheckItem {
        val rooted = SU_PATHS.any { File(it).exists() } || Build.TAGS?.contains("test-keys") == true
        return CheckItem(
            "הרשאות root",
            if (rooted) "המכשיר פרוץ (rooted) - אפליקציה זדונית יכולה לקבל שליטה מלאה" else "המכשיר לא פרוץ",
            !rooted, 15,
        )
    }

    @Suppress("DEPRECATION")
    private fun unknownSources(context: Context): CheckItem {
        val pm = context.packageManager
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val allowed = runCatching {
            installedWithPermissions(pm)
                .filter { it.requestedPermissions?.contains(REQUEST_INSTALL) == true && it.packageName != context.packageName }
                .mapNotNull { it.applicationInfo }
                .filter { it.flags and ApplicationInfo.FLAG_SYSTEM == 0 }
                .filter { info ->
                    val mode = if (Build.VERSION.SDK_INT >= 29) {
                        appOps.unsafeCheckOpNoThrow(OP_REQUEST_INSTALL, info.uid, info.packageName)
                    } else {
                        appOps.checkOpNoThrow(OP_REQUEST_INSTALL, info.uid, info.packageName)
                    }
                    mode == AppOpsManager.MODE_ALLOWED
                }
                .map { it.loadLabel(pm).toString() }
        }.getOrDefault(emptyList())
        return CheckItem(
            "התקנה ממקורות לא ידועים",
            if (allowed.isEmpty()) {
                "אף אפליקציה לא רשאית להתקין אפליקציות"
            } else {
                "רשאיות להתקין אפליקציות: ${allowed.take(3).joinToString(", ")}${if (allowed.size > 3) " ועוד" else ""}"
            },
            allowed.isEmpty(), 10, Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        )
    }

    private fun scanRecency(lastAppScan: Long): CheckItem {
        val days = if (lastAppScan == 0L) null else (System.currentTimeMillis() - lastAppScan) / 86_400_000
        val ok = days != null && days <= 7
        return CheckItem(
            "סריקה אחרונה",
            when (days) {
                null -> "המכשיר עדיין לא נסרק"
                0L -> "נסרק היום"
                else -> "נסרק לפני $days ימים"
            },
            ok, 10, FIX_SCAN,
        )
    }

    @Suppress("DEPRECATION")
    private fun installedWithPermissions(pm: PackageManager) =
        if (Build.VERSION.SDK_INT >= 33) {
            pm.getInstalledPackages(PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()))
        } else {
            pm.getInstalledPackages(PackageManager.GET_PERMISSIONS)
        }

    private const val REQUEST_INSTALL = "android.permission.REQUEST_INSTALL_PACKAGES"
    private const val OP_REQUEST_INSTALL = "android:request_install_packages"
    private val SU_PATHS = listOf("/system/bin/su", "/system/xbin/su", "/sbin/su", "/system/sd/xbin/su", "/data/local/xbin/su", "/data/local/bin/su")
}
