package com.sy.antivirus.engine

import java.io.ByteArrayOutputStream
import java.nio.file.Files
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

// Built at runtime so this source file is never flagged by real antivirus software.
private val EICAR = ("X5O!P%@AP[4\\PZX54(P^)7CC)7}$" + "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!\$H+H*").toByteArray()

private fun zip(vararg entries: Pair<String, ByteArray>): ByteArray {
    val out = ByteArrayOutputStream()
    ZipOutputStream(out).use { zip ->
        for ((name, data) in entries) {
            zip.putNextEntry(ZipEntry(name))
            zip.write(data)
            zip.closeEntry()
        }
    }
    return out.toByteArray()
}

class FileScannerTest {
    private val db = SignatureDb.bundled()
    private val scanner = FileScanner(db)

    @Test fun bundledDatabaseLoads() {
        assertEquals(2, db.hashes.size)
        assertEquals(4, db.patterns.size)
    }

    @Test fun eicarDetectedByHash() {
        val result = scanner.scan("eicar.com", EICAR)
        assertTrue(result.infected)
        assertEquals(Method.HASH, result.detections.single().method)
        assertEquals("EICAR-Test-File", result.detections.single().threat)
    }

    @Test fun embeddedEicarDetectedByPattern() {
        val result = scanner.scan("blob.bin", "junk".toByteArray() + EICAR + "tail".toByteArray())
        assertTrue(result.infected)
        assertEquals(Method.PATTERN, result.detections.first().method)
    }

    @Test fun cleanFile() {
        val result = scanner.scan("notes.txt", "shopping list: milk, eggs".toByteArray())
        assertTrue(result.detections.isEmpty())
    }

    @Test fun eicarInsideZip() {
        val result = scanner.scan("archive.zip", zip("readme.txt" to "hi".toByteArray(), "inner/eicar.com" to EICAR))
        assertTrue(result.infected)
        assertTrue(result.detections.any { "בתוך הארכיון: inner/eicar.com" in it.details })
    }

    @Test fun apkDisguisedAsImage() {
        val apk = zip("AndroidManifest.xml" to ByteArray(10), "classes.dex" to "dex\n035".toByteArray())
        assertTrue(scanner.scan("photo.jpg", apk).suspicious)
        assertTrue(scanner.scan("app.apk", apk).detections.isEmpty())
    }

    @Test fun doubleExtension() {
        assertTrue(scanner.scan("invoice.pdf.apk", "x".toByteArray()).suspicious)
    }

    @Test fun ransomwareScriptIsHigh() {
        val script = "vssadmin delete shadows /all /quiet\nbcdedit /set {default} recoveryenabled no\necho Your files have been encrypted > note.txt\n"
        val result = scanner.scan("run.bat", script.toByteArray())
        assertTrue(result.infected)
        assertEquals(Method.HEURISTIC, result.detections.single().method)
    }

    @Test fun heuristicsCanBeDisabled() {
        val result = FileScanner(db, useHeuristics = false).scan("invoice.pdf.apk", "x".toByteArray())
        assertTrue(result.detections.isEmpty())
    }

    @Test fun entropy() {
        assertEquals(0.0, Heuristics.entropy("aaaa".toByteArray()))
        assertEquals(8.0, Heuristics.entropy(ByteArray(256) { it.toByte() }), 1e-9)
    }
}

class SignatureDbTest {
    @Test fun importHashListAndRoundTrip() {
        val db = SignatureDb()
        val sha = "a".repeat(64)
        val count = db.importHashList("# comment\n$sha Trojan.Test\n${"b".repeat(32)}\nnot-a-hash\n\"${"c".repeat(64)}\",x")
        assertEquals(3, count)
        assertEquals("Trojan.Test", db.matchHash(sha))
        assertEquals("Imported.Malware", db.matchHash("0".repeat(64), "b".repeat(32)))

        db.packages["com.bad.app"] = "Android.Trojan.Bad"
        db.addPattern("Custom.Marker", "EVIL_[0-9]+")
        val reloaded = SignatureDb().load(db.serialize().reader())
        assertEquals(db.hashes, reloaded.hashes)
        assertEquals("Android.Trojan.Bad", reloaded.matchPackage("com.bad.app"))
        assertEquals(1, reloaded.matchPatterns("xx EVIL_42").size)
    }

    @Test fun invalidHashRejected() {
        assertFailsWith<IllegalArgumentException> { SignatureDb().addHash("nope", "x") }
    }
}

class AppAnalyzerTest {
    private val db = SignatureDb().apply {
        packages["com.evil.flashlight"] = "Android.Trojan.Fake"
        certs["ab".repeat(32)] = "Android.Spy.KnownDev"
        addHash("cd".repeat(32), "Android.Banker.Sample")
    }
    private val analyzer = AppAnalyzer(db)
    private fun perms(vararg names: String) = names.map { "android.permission.$it" }.toSet()

    @Test fun signatureMatches() {
        assertEquals(RiskLevel.MALWARE, analyzer.analyze(AppInfo("com.evil.flashlight", "Torch")).level)
        assertEquals(RiskLevel.MALWARE, analyzer.analyze(AppInfo("x.y", "Y", certSha256 = listOf("AB".repeat(32)))).level)
        val v = analyzer.analyze(AppInfo("a.b", "B", apkSha256 = "cd".repeat(32), isSystem = true))
        assertEquals("Android.Banker.Sample", v.threat)
    }

    @Test fun bankingTrojanProfileIsSuspicious() {
        val app = AppInfo(
            "com.update.service", "System Update",
            permissions = perms("RECEIVE_SMS", "READ_SMS", "SYSTEM_ALERT_WINDOW"),
            installer = "com.google.android.packageinstaller",
            hasAccessibilityService = true, hasLauncherIcon = false,
        )
        val verdict = analyzer.analyze(app)
        assertEquals(RiskLevel.SUSPICIOUS, verdict.level)
        assertTrue(verdict.reasons.any { "טרויאני בנקאות" in it })
    }

    @Test fun ordinaryMessengerFromPlayIsNotSuspicious() {
        val app = AppInfo(
            "com.messenger", "Messenger",
            permissions = perms("RECEIVE_SMS", "READ_CONTACTS", "CAMERA", "RECORD_AUDIO", "ACCESS_FINE_LOCATION"),
            installer = "com.android.vending",
        )
        val verdict = analyzer.analyze(app)
        assertTrue(verdict.level <= RiskLevel.LOW, verdict.toString())
    }

    @Test fun launcherFromPlayIsNotSuspicious() {
        val app = AppInfo(
            "com.microsoft.launcher", "Microsoft Launcher",
            permissions = perms("SYSTEM_ALERT_WINDOW", "RECORD_AUDIO", "CAMERA", "ACCESS_FINE_LOCATION", "READ_CONTACTS"),
            installer = "com.android.vending",
            hasAccessibilityService = true, hasDeviceAdmin = true, hasNotificationListener = true,
        )
        assertEquals(RiskLevel.LOW, analyzer.analyze(app).level)
    }

    @Test fun pluginInstalledBySameDeveloperIsNotSuspicious() {
        val app = AppInfo(
            "com.vendor.watchplugin", "Watch Plugin",
            permissions = perms("READ_SMS", "SEND_SMS", "SYSTEM_ALERT_WINDOW", "REQUEST_INSTALL_PACKAGES", "READ_CALL_LOG"),
            installer = "com.vendor.watchmanager", sameSignerAsInstaller = true,
            hasNotificationListener = true, hasLauncherIcon = false,
        )
        val verdict = analyzer.analyze(app)
        assertTrue(verdict.level <= RiskLevel.LOW, verdict.toString())
        assertFalse(verdict.reasons.any { "ללא אייקון" in it })
    }

    @Test fun deviceMakerSignedAppIsSafe() {
        val app = AppInfo("com.vendor.app", "Vendor", permissions = perms("READ_SMS"), hasAccessibilityService = true, signedLikeSystemApp = true)
        assertEquals(RiskLevel.SAFE, analyzer.analyze(app).level)
    }

    @Test fun apkFileInstallIsNeverTrustedSource() {
        val app = AppInfo(
            "com.fake.bank", "Bank",
            permissions = perms("RECEIVE_SMS", "READ_SMS"),
            installer = "com.android.vending", sideloadedFromFile = true,
            hasAccessibilityService = true,
        )
        assertEquals(RiskLevel.SUSPICIOUS, analyzer.analyze(app).level)
    }

    @Test fun systemAppsAreTrusted() {
        val app = AppInfo("android.sys", "Sys", permissions = perms("READ_SMS", "SEND_SMS"), hasAccessibilityService = true, isSystem = true)
        assertEquals(RiskLevel.SAFE, analyzer.analyze(app).level)
    }

    @Test fun harmlessApp() {
        val verdict = analyzer.analyze(AppInfo("com.calc", "Calculator", installer = null))
        assertEquals(RiskLevel.SAFE, verdict.level)
        assertEquals(0, verdict.score)
    }
}

class QuarantineStoreTest {
    @Test fun addReadDelete() {
        val dir = Files.createTempDirectory("q").toFile()
        try {
            val store = QuarantineStore(dir)
            val entry = store.add(EICAR, "eicar.com", "content://tree/doc", "EICAR-Test-File", now = 1000)
            val blob = dir.listFiles()!!.single { it.name.endsWith(".bin") }.readBytes()
            assertFalse(String(blob, Charsets.ISO_8859_1).contains("EICAR"))

            val listed = store.list().single()
            assertEquals(entry, listed)
            assertTrue(EICAR.contentEquals(store.read(entry.id)))

            store.delete(entry.id)
            assertTrue(store.list().isEmpty())
        } finally {
            dir.deleteRecursively()
        }
    }
}
