package com.sy.antivirus.data

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.Build
import com.sy.antivirus.engine.AppInfo
import com.sy.antivirus.engine.Hashing
import java.io.File

/** Reads what the engine needs to know about installed apps from PackageManager. */
class InstalledApps(context: Context) {
    private val pm: PackageManager = context.packageManager
    private val ownPackage = context.packageName

    fun packageNames(): List<String> =
        installedPackages(0).map { it.packageName }.filter { it != ownPackage }

    /** Returns null if the package is no longer installed. */
    fun collect(packageName: String, hashApk: Boolean = true): AppInfo? {
        val info = try {
            packageInfo(packageName, DETAIL_FLAGS)
        } catch (_: PackageManager.NameNotFoundException) {
            return null
        }
        val appInfo = info.applicationInfo ?: return null
        val isSystem = appInfo.flags and ApplicationInfo.FLAG_SYSTEM != 0

        val apkHash = if (hashApk && !isSystem) {
            runCatching { Hashing.sha256(File(appInfo.sourceDir).inputStream()) }.getOrNull()
        } else {
            null
        }

        return AppInfo(
            packageName = packageName,
            label = runCatching { appInfo.loadLabel(pm).toString() }.getOrDefault(packageName),
            versionName = info.versionName,
            apkSha256 = apkHash,
            certSha256 = signatures(info).map { Hashing.sha256(it.toByteArray()) },
            permissions = info.requestedPermissions?.toSet().orEmpty(),
            installer = installer(packageName),
            isSystem = isSystem,
            hasLauncherIcon = pm.getLaunchIntentForPackage(packageName) != null,
            hasAccessibilityService = info.services.orEmpty().any { it.permission == BIND_ACCESSIBILITY },
            hasDeviceAdmin = info.receivers.orEmpty().any { it.permission == BIND_DEVICE_ADMIN },
            hasNotificationListener = info.services.orEmpty().any { it.permission == BIND_NOTIFICATION_LISTENER },
        )
    }

    @Suppress("DEPRECATION")
    private fun installedPackages(flags: Int): List<PackageInfo> =
        if (Build.VERSION.SDK_INT >= 33) {
            pm.getInstalledPackages(PackageManager.PackageInfoFlags.of(flags.toLong()))
        } else {
            pm.getInstalledPackages(flags)
        }

    @Suppress("DEPRECATION")
    private fun packageInfo(name: String, flags: Int): PackageInfo =
        if (Build.VERSION.SDK_INT >= 33) {
            pm.getPackageInfo(name, PackageManager.PackageInfoFlags.of(flags.toLong()))
        } else {
            pm.getPackageInfo(name, flags)
        }

    @Suppress("DEPRECATION")
    private fun signatures(info: PackageInfo): List<Signature> {
        if (Build.VERSION.SDK_INT >= 28) {
            val signing = info.signingInfo ?: return emptyList()
            val signers = if (signing.hasMultipleSigners()) signing.apkContentsSigners else signing.signingCertificateHistory
            return signers?.toList().orEmpty()
        }
        return info.signatures?.toList().orEmpty()
    }

    @Suppress("DEPRECATION")
    private fun installer(packageName: String): String? = try {
        if (Build.VERSION.SDK_INT >= 30) {
            pm.getInstallSourceInfo(packageName).installingPackageName
        } else {
            pm.getInstallerPackageName(packageName)
        }
    } catch (_: Exception) {
        null
    }

    private companion object {
        const val BIND_ACCESSIBILITY = "android.permission.BIND_ACCESSIBILITY_SERVICE"
        const val BIND_DEVICE_ADMIN = "android.permission.BIND_DEVICE_ADMIN"
        const val BIND_NOTIFICATION_LISTENER = "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"

        @Suppress("DEPRECATION")
        val DETAIL_FLAGS = PackageManager.GET_PERMISSIONS or
            PackageManager.GET_SERVICES or
            PackageManager.GET_RECEIVERS or
            (if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES)
    }
}
