package com.sy.antivirus.engine

import java.io.ByteArrayInputStream
import java.util.zip.ZipInputStream
import kotlin.math.ln

enum class Method { HASH, PATTERN, HEURISTIC }
enum class Severity { HIGH, MEDIUM }

data class Detection(
    val threat: String,
    val method: Method,
    val severity: Severity,
    val details: List<String> = emptyList(),
)

data class FileResult(
    val name: String,
    val sha256: String,
    val detections: List<Detection>,
) {
    val infected get() = detections.any { it.severity == Severity.HIGH }
    val suspicious get() = detections.isNotEmpty() && !infected
}

/** Scans file contents with hash signatures, byte patterns, heuristics and ZIP/APK unpacking. */
class FileScanner(
    private val db: SignatureDb,
    private val heuristicThreshold: Int = 50,
    private val useHeuristics: Boolean = true,
) {
    fun scan(name: String, content: ByteArray): FileResult {
        val sha256 = Hashing.sha256(content)
        return FileResult(name, sha256, scanBytes(name, content, sha256, depth = 0))
    }

    private fun scanBytes(name: String, content: ByteArray, sha256: String, depth: Int): List<Detection> {
        db.matchHash(sha256, Hashing.md5(content))?.let {
            return listOf(Detection(it, Method.HASH, Severity.HIGH, listOf("sha256=$sha256")))
        }
        val detections = mutableListOf<Detection>()
        val text = String(content, Charsets.ISO_8859_1)

        db.matchPatterns(text).forEach { detections += Detection(it.name, Method.PATTERN, Severity.HIGH) }

        val isZip = content.size > 4 && content[0] == 'P'.code.toByte() && content[1] == 'K'.code.toByte() &&
            content[2] == 3.toByte() && content[3] == 4.toByte()
        val entries = if (isZip && depth < MAX_DEPTH) readZip(content) else emptyList()

        if (useHeuristics) {
            val hits = Heuristics.analyzeFile(name, content, text, entries.map { it.first })
            val score = hits.sumOf { it.score }
            if (score >= heuristicThreshold) {
                val severity = if (score >= heuristicThreshold * 2) Severity.HIGH else Severity.MEDIUM
                detections += Detection(
                    "Heuristic.Suspicious (ניקוד $score)",
                    Method.HEURISTIC,
                    severity,
                    hits.map { "${it.reason} (+${it.score})" },
                )
            }
        }

        for ((entryName, entryBytes) in entries) {
            scanBytes(entryName, entryBytes, Hashing.sha256(entryBytes), depth + 1).forEach {
                detections += it.copy(details = listOf("בתוך הארכיון: $entryName") + it.details)
            }
        }
        return detections
    }

    private fun readZip(content: ByteArray): List<Pair<String, ByteArray>> {
        val result = mutableListOf<Pair<String, ByteArray>>()
        try {
            ZipInputStream(ByteArrayInputStream(content)).use { zip ->
                while (true) {
                    val entry = zip.nextEntry ?: break
                    if (entry.isDirectory) continue
                    val bytes = readLimited(zip, MAX_ENTRY_SIZE) ?: continue
                    result += entry.name to bytes
                }
            }
        } catch (_: Exception) {
            // Corrupt or encrypted archive: scan what we managed to read.
        }
        return result
    }

    private fun readLimited(zip: ZipInputStream, limit: Int): ByteArray? {
        val out = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(32 * 1024)
        while (true) {
            val read = zip.read(buffer)
            if (read < 0) break
            out.write(buffer, 0, read)
            if (out.size() > limit) return null
        }
        return out.toByteArray()
    }

    companion object {
        const val MAX_DEPTH = 2
        const val MAX_ENTRY_SIZE = 20 * 1024 * 1024
    }
}

data class HeuristicHit(val reason: String, val score: Int)

object Heuristics {
    private val EXECUTABLE_EXT = setOf(
        "exe", "dll", "scr", "com", "pif", "bat", "cmd", "vbs", "js", "jse", "wsf", "ps1", "hta",
        "msi", "jar", "lnk", "apk", "xapk", "apks", "sh",
    )
    private val DOCUMENT_EXT = setOf(
        "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "jpg", "jpeg", "png", "gif",
        "mp3", "mp4", "zip", "rar",
    )

    private val SUSPICIOUS_STRINGS: List<Triple<String, Regex, Int>> = listOf(
        Triple("פקודת PowerShell מוצפנת", "powershell(\\.exe)?\\s+.*-(e|enc|encodedcommand)\\s+[A-Za-z0-9+/=]{20,}", 40),
        Triple("הורדה והרצה דרך PowerShell", "(New-Object\\s+Net\\.WebClient|Invoke-WebRequest).{0,200}(DownloadString|DownloadFile|-OutFile)", 30),
        Triple("מחיקת גיבויי Shadow Copy", "vssadmin(\\.exe)?\\s+delete\\s+shadows", 50),
        Triple("השבתת מצב שחזור של Windows", "bcdedit(\\.exe)?\\s+/set\\s+.*recoveryenabled\\s+no", 40),
        Triple("טקסט של הודעת כופר", "(your files (have been|are) encrypted|pay .{0,40}bitcoin|decrypt(ion)? key)", 35),
        Triple("Reverse shell", "(/bin/(ba)?sh\\s+-i\\s*>&\\s*/dev/tcp/|nc(at)?\\s+-e\\s+/bin/(ba)?sh)", 45),
        Triple("הורדה והרצה של סקריפט", "(curl|wget)\\s+[^|\\n]{1,200}\\|\\s*(sudo\\s+)?(ba)?sh\\b", 25),
        Triple("Webshell ב-PHP", "eval\\s*\\(\\s*(base64_decode|gzinflate|str_rot13)\\s*\\(", 40),
        Triple("כורה מטבעות קריפטו", "(stratum\\+tcp://|xmrig|cryptonight)", 35),
        Triple("ניסיון להשיג הרשאות root", "(/system/(x)?bin/su\\b.{0,200}(mount\\s+-o\\s+remount|chmod\\s+[0-7]*6755))", 40),
        Triple("התקנה שקטה של אפליקציות", "pm\\s+install\\s+-r\\s+.{0,100}\\.apk", 25),
    ).map { (reason, pattern, score) -> Triple(reason, Regex(pattern, setOf(RegexOption.IGNORE_CASE)), score) }

    fun analyzeFile(name: String, content: ByteArray, text: String, zipEntries: List<String>): List<HeuristicHit> {
        val hits = mutableListOf<HeuristicHit>()
        val parts = name.lowercase().substringAfterLast('/').split('.')
        val ext = if (parts.size > 1) parts.last() else ""
        val prevExt = if (parts.size > 2) parts[parts.size - 2] else ""

        if (ext in EXECUTABLE_EXT && prevExt in DOCUMENT_EXT) {
            hits += HeuristicHit("סיומת כפולה (.$prevExt.$ext)", 50)
        }
        if ('‮' in name) hits += HeuristicHit("תו היפוך כיוון (RTLO) בשם הקובץ", 50)

        val isPe = content.size > 64 && content[0] == 'M'.code.toByte() && content[1] == 'Z'.code.toByte() &&
            text.take(1024).contains("PE\u0000\u0000")
        if (isPe && ext in DOCUMENT_EXT) hits += HeuristicHit("קובץ הרצה של Windows שמתחפש למסמך", 50)

        val isApk = "AndroidManifest.xml" in zipEntries && zipEntries.any { it.endsWith(".dex") }
        if (isApk && ext != "apk" && ext != "zip") hits += HeuristicHit("אפליקציית אנדרואיד שמתחפשת לקובץ אחר", 50)

        if ((isPe || ext in EXECUTABLE_EXT) && content.size > 4096 && entropy(content) > 7.2 && !isApk && ext != "jar") {
            hits += HeuristicHit("קובץ הרצה ארוז/מוצפן (אנטרופיה גבוהה)", 25)
        }

        for ((reason, regex, score) in SUSPICIOUS_STRINGS) {
            if (regex.containsMatchIn(text)) hits += HeuristicHit(reason, score)
        }
        return hits
    }

    /** Shannon entropy in bits per byte (0..8). */
    fun entropy(data: ByteArray): Double {
        if (data.isEmpty()) return 0.0
        val counts = IntArray(256)
        for (b in data) counts[b.toInt() and 0xFF]++
        val len = data.size.toDouble()
        return counts.filter { it > 0 }.sumOf { val p = it / len; p * ln(1 / p) / ln(2.0) }
    }
}
