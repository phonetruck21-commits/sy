package com.sy.antivirus.engine

import java.io.Reader

data class PatternSignature(val name: String, val regex: Regex)

/**
 * Signature database in a simple tab-separated format, one entry per line:
 *
 *     hash      <sha256 or md5 hex>   <threat name>
 *     package   <android package>     <threat name>
 *     cert      <signing cert sha256> <threat name>
 *     pattern   <threat name>         <regex over file bytes>
 *
 * Lines starting with '#' are comments.
 */
class SignatureDb {
    val hashes = mutableMapOf<String, String>()
    val packages = mutableMapOf<String, String>()
    val certs = mutableMapOf<String, String>()
    val patterns = mutableListOf<PatternSignature>()

    val size: Int get() = hashes.size + packages.size + certs.size + patterns.size

    fun load(reader: Reader): SignatureDb {
        reader.forEachLine { raw ->
            val line = raw.trim()
            if (line.isEmpty() || line.startsWith("#")) return@forEachLine
            val parts = line.split('\t', limit = 3)
            if (parts.size < 3) return@forEachLine
            val (type, key, value) = parts
            when (type) {
                "hash" -> if (isValidHash(key)) hashes[key.lowercase()] = value
                "package" -> packages[key] = value
                "cert" -> certs[key.lowercase().replace(":", "")] = value
                "pattern" -> addPattern(key, value)
            }
        }
        return this
    }

    fun merge(other: SignatureDb): SignatureDb {
        hashes.putAll(other.hashes)
        packages.putAll(other.packages)
        certs.putAll(other.certs)
        patterns.addAll(other.patterns)
        return this
    }

    fun addHash(hash: String, name: String) {
        require(isValidHash(hash)) { "hash must be MD5 (32 hex) or SHA-256 (64 hex)" }
        hashes[hash.lowercase()] = name
    }

    fun addPattern(name: String, regex: String) {
        patterns += PatternSignature(name, Regex(regex, RegexOption.DOT_MATCHES_ALL))
    }

    /**
     * Imports a plain hash list (e.g. a MalwareBazaar export): one hash per line,
     * optionally followed by whitespace and a name. Returns how many were added.
     */
    fun importHashList(text: String, defaultName: String = "Imported.Malware"): Int {
        var count = 0
        for (raw in text.lineSequence()) {
            val line = raw.trim()
            if (line.isEmpty() || line.startsWith("#")) continue
            val parts = line.split(Regex("[\\s,;]+"), limit = 2)
            val hash = parts[0].trim('"')
            if (!isValidHash(hash)) continue
            hashes[hash.lowercase()] = parts.getOrNull(1)?.trim()?.trim('"')?.ifEmpty { null } ?: defaultName
            count++
        }
        return count
    }

    fun serialize(): String = buildString {
        hashes.forEach { (k, v) -> append("hash\t$k\t$v\n") }
        packages.forEach { (k, v) -> append("package\t$k\t$v\n") }
        certs.forEach { (k, v) -> append("cert\t$k\t$v\n") }
        patterns.forEach { append("pattern\t${it.name}\t${it.regex.pattern}\n") }
    }

    fun matchHash(sha256: String, md5: String? = null): String? =
        hashes[sha256.lowercase()] ?: md5?.let { hashes[it.lowercase()] }

    fun matchPackage(packageName: String): String? = packages[packageName]

    fun matchCert(certSha256: String): String? = certs[certSha256.lowercase()]

    /** [content] must be the file bytes decoded as ISO-8859-1 (one char per byte). */
    fun matchPatterns(content: String): List<PatternSignature> =
        patterns.filter { it.regex.containsMatchIn(content) }

    companion object {
        private val HASH_REGEX = Regex("[0-9a-fA-F]{32}|[0-9a-fA-F]{64}")

        fun isValidHash(value: String) = HASH_REGEX.matches(value)

        /** Signatures shipped inside the app. */
        fun bundled(): SignatureDb {
            val stream = SignatureDb::class.java.getResourceAsStream("/signatures.tsv")
                ?: return SignatureDb()
            return stream.bufferedReader(Charsets.UTF_8).use { SignatureDb().load(it) }
        }
    }
}
