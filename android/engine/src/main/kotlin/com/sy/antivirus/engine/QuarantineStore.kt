package com.sy.antivirus.engine

import java.io.File
import java.util.Properties
import java.util.UUID

data class QuarantineEntry(
    val id: String,
    val originalName: String,
    /** Opaque location the Android layer uses to restore the file (e.g. parent document URI). */
    val originalLocation: String,
    val threat: String,
    val sha256: String,
    val quarantinedAt: Long,
)

/** Stores quarantined files XOR-obfuscated in a private directory so they can't be opened or run. */
class QuarantineStore(private val directory: File) {
    init {
        directory.mkdirs()
    }

    fun add(content: ByteArray, originalName: String, originalLocation: String, threat: String, now: Long = System.currentTimeMillis()): QuarantineEntry {
        val entry = QuarantineEntry(
            id = UUID.randomUUID().toString().replace("-", ""),
            originalName = originalName,
            originalLocation = originalLocation,
            threat = threat,
            sha256 = Hashing.sha256(content),
            quarantinedAt = now,
        )
        blob(entry.id).writeBytes(xor(content))
        val props = Properties().apply {
            setProperty("originalName", entry.originalName)
            setProperty("originalLocation", entry.originalLocation)
            setProperty("threat", entry.threat)
            setProperty("sha256", entry.sha256)
            setProperty("quarantinedAt", entry.quarantinedAt.toString())
        }
        meta(entry.id).outputStream().use { props.store(it, null) }
        return entry
    }

    fun list(): List<QuarantineEntry> = directory.listFiles { f -> f.name.endsWith(".meta") }
        .orEmpty()
        .mapNotNull { file ->
            runCatching {
                val props = Properties().apply { file.inputStream().use { load(it) } }
                QuarantineEntry(
                    id = file.name.removeSuffix(".meta"),
                    originalName = props.getProperty("originalName"),
                    originalLocation = props.getProperty("originalLocation"),
                    threat = props.getProperty("threat"),
                    sha256 = props.getProperty("sha256"),
                    quarantinedAt = props.getProperty("quarantinedAt").toLong(),
                )
            }.getOrNull()
        }
        .sortedByDescending { it.quarantinedAt }

    /** Returns the original (de-obfuscated) file content. */
    fun read(id: String): ByteArray = xor(blob(id).readBytes())

    fun delete(id: String) {
        blob(id).delete()
        meta(id).delete()
    }

    private fun blob(id: String) = File(directory, "$id.bin")
    private fun meta(id: String) = File(directory, "$id.meta")

    private fun xor(data: ByteArray) = ByteArray(data.size) { (data[it].toInt() xor KEY).toByte() }

    private companion object {
        const val KEY = 0xA5
    }
}
