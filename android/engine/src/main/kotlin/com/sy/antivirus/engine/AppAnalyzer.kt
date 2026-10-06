package com.sy.antivirus.engine

/** What we know about an installed app (collected on the device by the Android layer). */
data class AppInfo(
    val packageName: String,
    val label: String,
    val versionName: String? = null,
    val apkSha256: String? = null,
    val certSha256: List<String> = emptyList(),
    val permissions: Set<String> = emptySet(),
    val installer: String? = null,
    val isSystem: Boolean = false,
    val hasLauncherIcon: Boolean = true,
    val hasAccessibilityService: Boolean = false,
    val hasDeviceAdmin: Boolean = false,
    val hasNotificationListener: Boolean = false,
)

enum class RiskLevel { SAFE, LOW, SUSPICIOUS, MALWARE }

data class AppVerdict(
    val app: AppInfo,
    val level: RiskLevel,
    val score: Int,
    val threat: String?,
    val reasons: List<String>,
)

/**
 * Rates installed apps. A signature match (APK hash, package name or signing
 * certificate) means known malware; otherwise permissions and capabilities are
 * scored the way mobile banking trojans and stalkerware typically combine them.
 */
class AppAnalyzer(private val db: SignatureDb) {

    fun analyze(app: AppInfo): AppVerdict {
        signatureMatch(app)?.let { (threat, reason) ->
            return AppVerdict(app, RiskLevel.MALWARE, 100, threat, listOf(reason))
        }
        // System apps legitimately hold every sensitive capability.
        if (app.isSystem) return AppVerdict(app, RiskLevel.SAFE, 0, null, emptyList())

        val reasons = mutableListOf<String>()
        var score = 0
        fun add(points: Int, reason: String) {
            score += points
            reasons += "$reason (+$points)"
        }

        val p = app.permissions
        val sms = p.any { it in SMS_PERMISSIONS }
        if (app.hasAccessibilityService) add(25, "שירות נגישות - יכול לקרוא את המסך וללחוץ בשמך")
        if (app.hasDeviceAdmin) add(20, "מנהל מכשיר - קשה להסיר ויכול לנעול את המכשיר")
        if (app.hasNotificationListener) add(15, "קורא את כל ההתראות (כולל קודי אימות)")
        if (sms) add(20, "גישה להודעות SMS")
        if (SEND_SMS in p) add(10, "שליחת SMS (עלולה לעלות כסף)")
        if (OVERLAY in p) add(10, "הצגה מעל אפליקציות אחרות")
        if (INSTALL_PACKAGES in p) add(10, "התקנת אפליקציות נוספות")
        if (p.any { it in CALL_PERMISSIONS }) add(10, "גישה ליומן שיחות")
        if (RECORD_AUDIO in p) add(5, "הקלטת אודיו")
        if (CAMERA in p) add(5, "מצלמה")
        if (FINE_LOCATION in p || BACKGROUND_LOCATION in p) add(5, "מיקום מדויק")
        if (READ_CONTACTS in p) add(5, "אנשי קשר")

        if (app.hasAccessibilityService && sms) add(30, "שילוב נגישות + SMS: דפוס טיפוסי של טרויאני בנקאות")
        if (app.hasAccessibilityService && OVERLAY in p) add(20, "שילוב נגישות + חלון צף: דפוס של גניבת סיסמאות")
        if (!app.hasLauncherIcon && score >= 20) add(20, "אפליקציה ללא אייקון (מוסתרת)")
        if (app.installer !in TRUSTED_INSTALLERS && score > 0) add(15, "הותקנה ממקור לא רשמי")

        val level = when {
            score >= SUSPICIOUS_THRESHOLD -> RiskLevel.SUSPICIOUS
            score >= LOW_THRESHOLD -> RiskLevel.LOW
            else -> RiskLevel.SAFE
        }
        return AppVerdict(app, level, score, null, reasons)
    }

    private fun signatureMatch(app: AppInfo): Pair<String, String>? {
        app.apkSha256?.let { hash -> db.matchHash(hash)?.let { return it to "קובץ ה-APK מופיע במאגר הנוזקות" } }
        db.matchPackage(app.packageName)?.let { return it to "שם החבילה מופיע במאגר הנוזקות" }
        app.certSha256.forEach { cert -> db.matchCert(cert)?.let { return it to "חתום בתעודה של מפתח נוזקות ידוע" } }
        return null
    }

    companion object {
        const val SUSPICIOUS_THRESHOLD = 80
        const val LOW_THRESHOLD = 30

        private const val PERM = "android.permission."
        val SMS_PERMISSIONS = setOf("${PERM}READ_SMS", "${PERM}RECEIVE_SMS", "${PERM}RECEIVE_MMS", "${PERM}RECEIVE_WAP_PUSH")
        val CALL_PERMISSIONS = setOf("${PERM}READ_CALL_LOG", "${PERM}PROCESS_OUTGOING_CALLS")
        const val SEND_SMS = "${PERM}SEND_SMS"
        const val OVERLAY = "${PERM}SYSTEM_ALERT_WINDOW"
        const val INSTALL_PACKAGES = "${PERM}REQUEST_INSTALL_PACKAGES"
        const val RECORD_AUDIO = "${PERM}RECORD_AUDIO"
        const val CAMERA = "${PERM}CAMERA"
        const val FINE_LOCATION = "${PERM}ACCESS_FINE_LOCATION"
        const val BACKGROUND_LOCATION = "${PERM}ACCESS_BACKGROUND_LOCATION"
        const val READ_CONTACTS = "${PERM}READ_CONTACTS"

        val TRUSTED_INSTALLERS = setOf(
            "com.android.vending",            // Google Play
            "com.sec.android.app.samsungapps", // Galaxy Store
            "com.amazon.venezia",             // Amazon Appstore
            "com.huawei.appmarket",           // Huawei AppGallery
            "com.xiaomi.mipicks",             // Xiaomi GetApps
        )
    }
}
