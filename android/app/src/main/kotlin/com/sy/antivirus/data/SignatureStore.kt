package com.sy.antivirus.data

import android.content.Context
import com.sy.antivirus.engine.SignatureDb
import java.io.File

/** Bundled signatures plus the ones the user imported (kept in private storage). */
object SignatureStore {
    private fun userFile(context: Context) = File(context.filesDir, "user_signatures.tsv")

    private fun loadUser(context: Context): SignatureDb {
        val file = userFile(context)
        return if (file.exists()) file.bufferedReader().use { SignatureDb().load(it) } else SignatureDb()
    }

    fun load(context: Context): SignatureDb = SignatureDb.bundled().merge(loadUser(context))

    /** Imports a hash list (one SHA-256/MD5 per line). Returns the number of hashes added. */
    fun importHashes(context: Context, text: String): Int {
        val user = loadUser(context)
        val count = user.importHashList(text)
        if (count > 0) userFile(context).writeText(user.serialize())
        return count
    }
}
