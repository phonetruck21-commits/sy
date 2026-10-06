package com.sy.antivirus.engine

import java.io.InputStream
import java.security.MessageDigest

object Hashing {
    fun sha256(data: ByteArray): String = hex(MessageDigest.getInstance("SHA-256").digest(data))

    fun md5(data: ByteArray): String = hex(MessageDigest.getInstance("MD5").digest(data))

    /** Streams [input] through SHA-256 without loading it into memory. Closes the stream. */
    fun sha256(input: InputStream): String {
        val digest = MessageDigest.getInstance("SHA-256")
        input.use { stream ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val read = stream.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        return hex(digest.digest())
    }

    fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }
}
