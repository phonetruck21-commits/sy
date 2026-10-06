package com.sy.antivirus.data

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import androidx.documentfile.provider.DocumentFile
import com.sy.antivirus.engine.Detection
import com.sy.antivirus.engine.FileResult
import com.sy.antivirus.engine.FileScanner
import com.sy.antivirus.engine.Hashing
import com.sy.antivirus.engine.Method
import com.sy.antivirus.engine.QuarantineEntry
import com.sy.antivirus.engine.QuarantineStore
import com.sy.antivirus.engine.Severity
import com.sy.antivirus.engine.SignatureDb
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import java.io.File

data class FileFinding(
    val uri: Uri,
    val parentUri: Uri,
    val name: String,
    val result: FileResult,
)

/** Scans folders the user picked through the system file picker (Storage Access Framework). */
class StorageScanner(private val context: Context, private val db: SignatureDb) {
    private val resolver = context.contentResolver
    private val scanner = FileScanner(db)

    suspend fun scanTree(
        treeUri: Uri,
        onFile: (scanned: Int, name: String) -> Unit,
        onFinding: (FileFinding) -> Unit,
    ) {
        val root = DocumentFile.fromTreeUri(context, treeUri) ?: return
        var scanned = 0
        val stack = ArrayDeque(listOf(root))
        while (stack.isNotEmpty()) {
            val dir = stack.removeLast()
            for (child in dir.listFiles()) {
                currentCoroutineContext().ensureActive()
                if (child.isDirectory) {
                    stack.addLast(child)
                    continue
                }
                val name = child.name ?: continue
                scanned++
                onFile(scanned, name)
                val result = runCatching { scanDocument(child, name) }.getOrNull() ?: continue
                if (result.detections.isNotEmpty()) onFinding(FileFinding(child.uri, dir.uri, name, result))
            }
        }
    }

    private fun scanDocument(file: DocumentFile, name: String): FileResult? {
        if (file.length() > MAX_FULL_SCAN_BYTES) {
            // Too big to load: check the hash only.
            val sha256 = resolver.openInputStream(file.uri)?.let { Hashing.sha256(it) } ?: return null
            val threat = db.matchHash(sha256) ?: return FileResult(name, sha256, emptyList())
            return FileResult(name, sha256, listOf(Detection(threat, Method.HASH, Severity.HIGH, listOf("sha256=$sha256"))))
        }
        val bytes = resolver.openInputStream(file.uri)?.use { it.readBytes() } ?: return null
        return scanner.scan(name, bytes)
    }

    companion object {
        const val MAX_FULL_SCAN_BYTES = 50L * 1024 * 1024
    }
}

/** Moves files between the user's storage and the private quarantine. */
class QuarantineManager(private val context: Context) {
    private val resolver = context.contentResolver
    val store = QuarantineStore(File(context.filesDir, "quarantine"))

    fun quarantine(finding: FileFinding): Boolean {
        val bytes = resolver.openInputStream(finding.uri)?.use { it.readBytes() } ?: return false
        val threat = finding.result.detections.firstOrNull()?.threat ?: "Unknown"
        val entry = store.add(bytes, finding.name, finding.parentUri.toString(), threat)
        val deleted = runCatching { DocumentsContract.deleteDocument(resolver, finding.uri) }.getOrDefault(false)
        if (!deleted) store.delete(entry.id)
        return deleted
    }

    fun restore(entry: QuarantineEntry): Boolean {
        val target = runCatching {
            DocumentsContract.createDocument(
                resolver, Uri.parse(entry.originalLocation), "application/octet-stream", entry.originalName,
            )
        }.getOrNull() ?: return false
        resolver.openOutputStream(target)?.use { it.write(store.read(entry.id)) } ?: return false
        store.delete(entry.id)
        return true
    }
}
