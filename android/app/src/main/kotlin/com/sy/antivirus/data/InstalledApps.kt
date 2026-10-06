package com.sy.antivirus.data

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
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

    /** Signing certificates of preinstalled apps: the device maker's, Google's, the carrier's... */
    private val systemCerts: Set<String> by lazy {
        installedPackages(SIGNATURE_FLAG)
            .filter { (it.applicationInfo?.flags ?: 0) and ApplicationInfo.FLAG_SYSTEM != 0 }
            .flatMap { certHashes(it) }
            .toSet()
    }

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

        val certs = certHashes(info)
        val source = installSource(packageName)
        val installerCerts = source.installer?.let { installer ->
            runCatching { certHashes(packageInfo(installer, SIGNATURE_FLAG)) }.getOrDefault(emptyList())
        }.orEmpty()

        return AppInfo(
            packageName = packageName,
            label = runCatching { appInfo.loadLabel(pm).toString() }.getOrDefault(packageName),
            versionName = info.versionName,
            apkSha256 = apkHash,
            certSha256 = certs,
            permissions = info.requestedPermissions?.toSet().orEmpty(),
            installer = source.installer,
            isSystem = isSystem,
            hasLauncherIcon = pm.getLaunchIntentForPackage(packageName) != null,
            hasAccessibilityService = info.services.orEmpty().any { it.permission == BIND_ACCESSIBILITY },
            hasDeviceAdmin = info.receivers.orEmpty().any { it.permission == BIND_DEVICE_ADMIN },
            hasNotificationListener = info.services.orEmpty().any { it.permission == BIND_NOTIFICATION_LISTENER },
            installedFromStore = source.fromStore,
            sideloadedFromFile = source.fromFile,
            sameSignerAsInstaller = certs.any { it in installerCerts },
            signedLikeSystemApp = !isSystem && certs.any { it in systemCerts },
        )
    }

    private data class Source(val installer: String?, val fromStore: Boolean, val fromFile: Boolean)

    @Suppress("DEPRECATION")
    private fun installSource(packageName: String): Source = try {
        if (Build.VERSION.SDK_INT >= 30) {
            val info = pm.getInstallSourceInfo(packageName)
            val packageSource = if (Build.VERSION.SDK_INT >= 33) info.packageSource else PackageInstaller.PACKAGE_SOURCE_UNSPECIFIED
            Source(
                installer = info.installingPackageName,
                fromStore = packageSource == PackageInstaller.PACKAGE_SOURCE_STORE,
                fromFile = packageSource == PackageInstaller.PACKAGE_SOURCE_LOCAL_FILE ||
                    packageSource == PackageInstaller.PACKAGE_SOURCE_DOWNLOADED_FILE,
            )
        } else {
            Source(pm.getInstallerPackageName(packageName), fromStore = false, fromFile = false)
        }
    } catch (_: Exception) {
        Source(null, fromStore = false, fromFile = false)
    }

    private fun certHashes(info: PackageInfo): List<String> = signatures(info).map { Hashing.sha256(it.toByteArray()) }

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

    private companion object {
        const val BIND_ACCESSIBILITY = "android.permission.BIND_ACCESSIBILITY_SERVICE"
        const val BIND_DEVICE_ADMIN = "android.permission.BIND_DEVICE_ADMIN"
        const val BIND_NOTIFICATION_LISTENER = "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"

        @Suppress("DEPRECATION")
        val SIGNATURE_FLAG =
            if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES

        val DETAIL_FLAGS = PackageManager.GET_PERMISSIONS or
            PackageManager.GET_SERVICES or
            PackageManager.GET_RECEIVERS or
            SIGNATURE_FLAG
    }
}
