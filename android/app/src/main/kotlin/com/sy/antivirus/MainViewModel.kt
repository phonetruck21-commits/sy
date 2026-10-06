package com.sy.antivirus

import android.app.Application
import android.content.Context
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.sy.antivirus.data.FileFinding
import com.sy.antivirus.data.InstalledApps
import com.sy.antivirus.data.QuarantineManager
import com.sy.antivirus.data.SignatureStore
import com.sy.antivirus.data.StorageScanner
import com.sy.antivirus.engine.AppAnalyzer
import com.sy.antivirus.engine.AppVerdict
import com.sy.antivirus.engine.QuarantineEntry
import com.sy.antivirus.engine.RiskLevel
import com.sy.antivirus.engine.SignatureDb
import com.sy.antivirus.work.ProtectionWorker
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class Progress(val done: Int, val total: Int, val current: String)

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val context: Context get() = getApplication()
    private val prefs = application.getSharedPreferences("ui", Context.MODE_PRIVATE)
    private val quarantineManager = QuarantineManager(application)

    var db: SignatureDb by mutableStateOf(SignatureStore.load(application))
        private set

    private var rawVerdicts: List<AppVerdict>? = null
    var appVerdicts by mutableStateOf<List<AppVerdict>?>(null)
        private set

    /** Apps the user marked as trusted; they are never reported again. */
    private var trustedPackages: Set<String> = prefs.getStringSet("trusted", emptySet()).orEmpty().toSet()
    var appProgress by mutableStateOf<Progress?>(null)
        private set
    var lastAppScan by mutableStateOf(prefs.getLong("lastAppScan", 0L))
        private set

    var fileFindings by mutableStateOf<List<FileFinding>>(emptyList())
        private set
    var fileProgress by mutableStateOf<Progress?>(null)
        private set
    var lastFileScanCount by mutableStateOf<Int?>(null)
        private set
    private var fileJob: Job? = null

    var quarantine by mutableStateOf(quarantineManager.store.list())
        private set
    var protectionEnabled by mutableStateOf(ProtectionWorker.isEnabled(application))
        private set

    /** One-shot message for the snackbar. */
    var message by mutableStateOf<String?>(null)

    val threatsFound: Int
        get() = (appVerdicts?.count { it.level >= RiskLevel.SUSPICIOUS } ?: 0) + fileFindings.size

    fun scanApps() {
        if (appProgress != null) return
        viewModelScope.launch {
            appProgress = Progress(0, 0, "")
            val verdicts = withContext(Dispatchers.IO) {
                val apps = InstalledApps(context)
                val analyzer = AppAnalyzer(db)
                val names = apps.packageNames()
                names.mapIndexedNotNull { index, name ->
                    withContext(Dispatchers.Main) { appProgress = Progress(index + 1, names.size, name) }
                    apps.collect(name)?.let(analyzer::analyze)
                }
            }
            rawVerdicts = verdicts
            publishVerdicts()
            lastAppScan = System.currentTimeMillis()
            prefs.edit().putLong("lastAppScan", lastAppScan).apply()
            appProgress = null
            val bad = appVerdicts.orEmpty().count { it.level >= RiskLevel.SUSPICIOUS }
            message = if (bad == 0) "נסרקו ${verdicts.size} אפליקציות - לא נמצאו איומים" else "נמצאו $bad אפליקציות חשודות"
        }
    }

    fun setTrusted(packageName: String, trusted: Boolean) {
        trustedPackages = if (trusted) trustedPackages + packageName else trustedPackages - packageName
        prefs.edit().putStringSet("trusted", trustedPackages).apply()
        publishVerdicts()
    }

    fun isTrusted(packageName: String) = packageName in trustedPackages

    private fun publishVerdicts() {
        appVerdicts = rawVerdicts
            ?.map { v ->
                // A known-malware signature match is never hidden by the allowlist.
                if (v.app.packageName in trustedPackages && v.level != RiskLevel.MALWARE) {
                    v.copy(level = RiskLevel.SAFE, reasons = listOf("סומנה על ידך כמהימנה") + v.reasons)
                } else {
                    v
                }
            }
            ?.sortedWith(compareByDescending<AppVerdict> { it.level }.thenByDescending { it.score })
    }

    fun scanFolder(treeUri: Uri) {
        if (fileJob?.isActive == true) return
        fileFindings = emptyList()
        lastFileScanCount = null
        fileJob = viewModelScope.launch {
            fileProgress = Progress(0, 0, "")
            var scanned = 0
            try {
                withContext(Dispatchers.IO) {
                    StorageScanner(context, db).scanTree(
                        treeUri,
                        onFile = { count, name ->
                            scanned = count
                            viewModelScope.launch { fileProgress = Progress(count, 0, name) }
                        },
                        onFinding = { finding -> viewModelScope.launch { fileFindings = fileFindings + finding } },
                    )
                }
            } catch (e: CancellationException) {
                message = "הסריקה הופסקה"
            } catch (e: Exception) {
                message = "שגיאה בסריקה: ${e.message}"
            } finally {
                fileProgress = null
                lastFileScanCount = scanned
            }
        }
    }

    fun stopFileScan() {
        fileJob?.cancel()
    }

    fun quarantineFinding(finding: FileFinding) {
        viewModelScope.launch {
            val ok = withContext(Dispatchers.IO) { runCatching { quarantineManager.quarantine(finding) }.getOrDefault(false) }
            if (ok) {
                fileFindings = fileFindings - finding
                quarantine = quarantineManager.store.list()
                message = "${finding.name} הועבר להסגר"
            } else {
                message = "לא ניתן להעביר את הקובץ להסגר"
            }
        }
    }

    fun restore(entry: QuarantineEntry) {
        viewModelScope.launch {
            val ok = withContext(Dispatchers.IO) { runCatching { quarantineManager.restore(entry) }.getOrDefault(false) }
            quarantine = quarantineManager.store.list()
            message = if (ok) "${entry.originalName} שוחזר" else "השחזור נכשל (ייתכן שהתיקייה המקורית כבר לא נגישה)"
        }
    }

    fun deleteForever(entry: QuarantineEntry) {
        quarantineManager.store.delete(entry.id)
        quarantine = quarantineManager.store.list()
        message = "${entry.originalName} נמחק לצמיתות"
    }

    fun importSignatures(uri: Uri) {
        viewModelScope.launch {
            val count = withContext(Dispatchers.IO) {
                runCatching {
                    val text = context.contentResolver.openInputStream(uri)?.use { it.bufferedReader().readText() }.orEmpty()
                    SignatureStore.importHashes(context, text)
                }.getOrDefault(-1)
            }
            db = withContext(Dispatchers.IO) { SignatureStore.load(context) }
            message = when {
                count < 0 -> "קריאת הקובץ נכשלה"
                count == 0 -> "לא נמצאו חתימות בקובץ"
                else -> "נוספו $count חתימות"
            }
        }
    }

    fun setProtection(enabled: Boolean) {
        ProtectionWorker.setEnabled(context, enabled)
        protectionEnabled = enabled
    }
}
