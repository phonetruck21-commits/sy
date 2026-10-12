package com.sy.antivirus.engine

import java.net.URI

enum class ScamLevel { SAFE, CAUTION, DANGEROUS }

data class LinkVerdict(
    val url: String,
    val host: String,
    val level: ScamLevel,
    val score: Int,
    val reasons: List<String>,
)

data class MessageVerdict(
    val level: ScamLevel,
    val score: Int,
    val reasons: List<String>,
    val links: List<LinkVerdict>,
    val advice: String,
)

/**
 * Detects phishing links and scam messages, tuned for the scams that actually
 * circulate in Israel (fake parcel fees, bank lockouts, "hi mom" WhatsApp scams...).
 */
class ScamDetector(private val db: SignatureDb = SignatureDb()) {

    fun analyzeMessage(text: String): MessageVerdict {
        val links = extractUrls(text).map(::analyzeLink)
        val reasons = mutableListOf<String>()
        var score = 0
        for (rule in MESSAGE_RULES) {
            if (rule.matches(text)) {
                score += rule.score
                reasons += rule.reason
            }
        }
        // A message pushing a link is far more dangerous than the same text without one.
        val worstLink = links.maxByOrNull { it.score }
        if (worstLink != null) {
            score += worstLink.score
            if (worstLink.level != ScamLevel.SAFE) reasons += "מכיל קישור חשוד: ${worstLink.host}"
        }
        val level = levelFor(score, links.map { it.level })
        return MessageVerdict(level, score, reasons, links, adviceFor(level, text))
    }

    fun analyzeLink(raw: String): LinkVerdict {
        val url = raw.trim().trimEnd('.', ',', ')', '!', '?', '"', '\'')
        val withScheme = if (url.contains("://")) url else "http://$url"
        val uri = runCatching { URI(withScheme) }.getOrNull()
        val host = (uri?.host ?: uri?.rawAuthority?.substringAfterLast('@') ?: url).lowercase().removePrefix("www.")
        val reasons = mutableListOf<String>()
        var score = 0
        fun add(points: Int, reason: String) {
            score += points
            reasons += reason
        }

        db.matchDomain(host)?.let {
            return LinkVerdict(url, host, ScamLevel.DANGEROUS, 100, listOf("הדומיין מופיע במאגר האתרים הזדוניים ($it)"))
        }

        val registrable = registrableDomain(host)
        val official = OFFICIAL_DOMAINS.any { registrable == it }

        if (IP_HOST.matches(host)) add(35, "כתובת IP במקום שם אתר")
        if (host.contains("xn--") || host.any { it.code > 127 }) add(40, "אותיות מחופשות בשם האתר (התחזות ויזואלית)")
        if (uri?.rawAuthority?.contains('@') == true) add(40, "הסימן @ מסתיר את כתובת האתר האמיתית")

        if (!official) {
            val tokens = host.split('.', '-')
            BRANDS.firstOrNull { it.matches(tokens) }?.let { brand ->
                add(50, "מתחזה ל${brand.name} - האתר הרשמי הוא ${brand.domains.first()}")
            }
            if (registrable in SHORTENERS) add(20, "קישור מקוצר שמסתיר את היעד האמיתי")
            if (SUSPICIOUS_TLDS.any { host.endsWith(it) }) add(20, "סיומת אתר שנפוצה באתרי הונאה (${host.substringAfterLast('.')})")
            if (registrable.count { it == '-' } >= 2) add(10, "שם אתר עם הרבה מקפים")
            if (host.split('.').size - registrable.split('.').size >= 3) add(10, "הרבה תת-דומיינים")
            if (PHISHING_WORDS.containsMatchIn(url.lowercase())) add(10, "מילים של דף התחברות או \"אימות חשבון\"")
            if (withScheme.startsWith("http://") && url.contains("://")) add(10, "חיבור לא מוצפן (http)")
        }

        val level = levelFor(score, emptyList())
        return LinkVerdict(url, host, level, score, reasons)
    }

    private fun levelFor(score: Int, linkLevels: List<ScamLevel>) = when {
        score >= DANGEROUS || ScamLevel.DANGEROUS in linkLevels -> ScamLevel.DANGEROUS
        score >= CAUTION || ScamLevel.CAUTION in linkLevels -> ScamLevel.CAUTION
        else -> ScamLevel.SAFE
    }

    private fun adviceFor(level: ScamLevel, text: String): String = when {
        level == ScamLevel.SAFE -> "לא נמצאו סימני הונאה. עדיין, אל תמסור סיסמאות או קודים שקיבלת ב-SMS."
        FAMILY_SCAM.containsMatchIn(text) ->
            "אל תעביר כסף! התקשר למספר הישן של בן המשפחה ושאל אם זה באמת הוא."
        CODE_REQUEST.containsMatchIn(text) ->
            "לעולם אל תמסור קוד אימות לאף אחד - כך גונבים חשבונות וואטסאפ ובנק."
        level == ScamLevel.DANGEROUS ->
            "ככל הנראה הונאה. אל תלחץ על הקישור ואל תמסור פרטים. אם יש ספק - היכנס לאתר הרשמי ידנית או התקשר לגוף עצמו."
        else -> "יש סימנים מחשידים. אל תלחץ על קישורים לפני שווידאת מול הגוף הרשמי."
    }

    private class Rule(val reason: String, val score: Int, vararg val all: Regex) {
        fun matches(text: String) = all.all { it.containsMatchIn(text) }
    }

    /**
     * [exactOnly] brands use common words ("discount", "apple"), so they must appear as a whole
     * label ("apple-id.xyz") rather than inside another word ("pineapple.com").
     */
    private class Brand(
        val name: String,
        val keywords: List<String>,
        val domains: List<String>,
        val exactOnly: Boolean = false,
    ) {
        fun matches(tokens: List<String>) = tokens.any { token ->
            keywords.any { kw -> token == kw || (!exactOnly && kw.length >= 5 && kw in token) }
        }
    }

    companion object {
        const val CAUTION = 25
        const val DANGEROUS = 50

        private fun rx(pattern: String) = Regex(pattern, RegexOption.IGNORE_CASE)

        private val URL_REGEX = rx(
            "(https?://[^\\s<>\"]+)|((?<![@\\w.-])(?:[a-z0-9-]+\\.)+[a-z]{2,24}(?:/[^\\s<>\"]*)?)",
        )
        private val IP_HOST = Regex("\\d{1,3}(\\.\\d{1,3}){3}")
        private val PHISHING_WORDS = rx("login|signin|verify|verification|secure|update|account|confirm|wallet|unlock|suspend")
        private val FAMILY_SCAM = rx("(שלום|היי|הי)\\s*(אמא|אבא|מאמי)|החלפתי (מספר|טלפון)|(הטלפון|הפלאפון) שלי (התקלקל|נשבר|נפל)|hi (mom|mum|dad)")
        private val CODE_REQUEST = rx("(שלח|תשלח|העבר|תעביר)[^.\\n]{0,30}(הקוד|קוד אימות|קוד חד)|verification code")

        private val MESSAGE_RULES = listOf(
            Rule("הונאת חבילה: \"חבילה ממתינה\" / דמי משלוח", 30,
                rx("חבילה|משלוח|המשלוח|parcel|package|delivery"),
                rx("ממתינ|עוכב|לא נמסר|דמי|מכס|לשחרור|תשלום|כתובת|pending|held|fee|customs|redeliver")),
            Rule("איום בחסימה או השעיה של חשבון", 30,
                rx("חשבונ|כרטיס|הכרטיס|account|card"),
                rx("נחסם|ייחסם|הוקפא|יוקפא|הושעה|יושעה|פעילות חריגה|suspended|locked|blocked|unusual activity")),
            Rule("לחץ זמן (\"מיידי\", \"תוך 24 שעות\")", 15,
                rx("מיידי|דחוף|בהקדם|תוך \\d+ (שעות|ימים)|היום בלבד|אחרונה|urgent|immediately|within \\d+ hours|final notice")),
            Rule("בקשת תשלום של סכום קטן", 15,
                rx("שלם|לתשלום|תשלום|pay|payment"), rx("₪|ש\"ח|שח|nis|\\$|€|\\d+\\.\\d{2}")),
            Rule("בקשה לעדכן או לאמת פרטים", 20,
                rx("עדכן|עדכנו|אמת|אמתו|אשר|אשרו|verify|update|confirm"),
                rx("פרטי|פרטים|הפרטים|זהות|אשראי|details|information|identity")),
            Rule("הבטחה לזכייה או מתנה", 25,
                rx("זכית|זכייה|זכיתם|פרס|הגרלה|מתנה|שובר|you (have )?won|winner|prize|gift card|free iphone")),
            Rule("בקשה למסור קוד אימות", 35, CODE_REQUEST),
            Rule("הונאת \"שלום אמא, החלפתי מספר\"", 40, FAMILY_SCAM),
            Rule("הבטחת רווח מהשקעה", 30,
                rx("השקע|תשואה|ביטקוין|קריפטו|מסחר|invest|crypto|bitcoin|trading"),
                rx("מובטח|ללא סיכון|בטוח|%|פי \\d|guaranteed|risk.free|profit")),
            Rule("התחזות לגוף ממשלתי (מס, ביטוח לאומי, משטרה)", 20,
                rx("רשות המסים|מס הכנסה|ביטוח לאומי|משטרה|קנס|החזר מס|tax refund|fine")),
        )

        private val BRANDS = listOf(
            Brand("בנק לאומי", listOf("leumi", "bankleumi"), listOf("leumi.co.il")),
            Brand("בנק הפועלים", listOf("hapoalim", "poalim"), listOf("bankhapoalim.co.il")),
            Brand("בנק דיסקונט", listOf("discount"), listOf("discountbank.co.il"), exactOnly = true),
            Brand("מזרחי טפחות", listOf("mizrahi", "tefahot"), listOf("mizrahi-tefahot.co.il")),
            Brand("ישראכרט", listOf("isracard"), listOf("isracard.co.il")),
            Brand("דואר ישראל", listOf("israelpost", "doar"), listOf("israelpost.co.il")),
            Brand("ביטוח לאומי", listOf("btl", "bituach"), listOf("btl.gov.il"), exactOnly = true),
            Brand("PayPal", listOf("paypal"), listOf("paypal.com")),
            Brand("Apple", listOf("apple", "icloud"), listOf("apple.com", "icloud.com"), exactOnly = true),
            Brand("Microsoft", listOf("microsoft", "office365", "outlook"), listOf("microsoft.com", "office.com", "outlook.com", "live.com")),
            Brand("Netflix", listOf("netflix"), listOf("netflix.com")),
            Brand("Amazon", listOf("amazon"), listOf("amazon.com"), exactOnly = true),
            Brand("WhatsApp", listOf("whatsapp"), listOf("whatsapp.com")),
            Brand("Facebook", listOf("facebook"), listOf("facebook.com")),
            Brand("Google", listOf("google", "gmail"), listOf("google.com"), exactOnly = true),
            Brand("DHL", listOf("dhl"), listOf("dhl.com", "dhl.co.il"), exactOnly = true),
            Brand("AliExpress", listOf("aliexpress"), listOf("aliexpress.com")),
        )

        private val OFFICIAL_DOMAINS = BRANDS.flatMap { it.domains }.toSet() + setOf(
            "gov.il", "google.co.il", "youtube.com", "wa.me", "whatsapp.net", "instagram.com", "fb.com",
            "apple.co", "amazon.co.uk", "paypal.me", "microsoftonline.com", "live.co.uk",
        )

        private val SHORTENERS = setOf(
            "bit.ly", "tinyurl.com", "cutt.ly", "is.gd", "rb.gy", "shorturl.at", "tiny.cc", "ow.ly",
            "s.id", "t.ly", "rebrand.ly", "short.gy", "bitly.com", "v.gd", "tny.im", "clck.ru",
        )

        private val SUSPICIOUS_TLDS = listOf(
            ".xyz", ".top", ".icu", ".click", ".buzz", ".monster", ".rest", ".cyou", ".sbs", ".cfd",
            ".online", ".site", ".live", ".shop", ".info", ".support", ".help", ".bond", ".vip", ".work",
        )

        private val SECOND_LEVEL = setOf("co", "org", "gov", "ac", "net", "muni", "com", "k12", "idf")

        fun extractUrls(text: String): List<String> =
            URL_REGEX.findAll(text).map { it.value }.filter { candidate ->
                // Skip things like "file.txt" or "גרסה 1.2" that only look like domains.
                candidate.contains("://") || candidate.substringBefore('/').substringAfterLast('.').lowercase() !in NOT_TLDS
            }.distinct().toList()

        private val NOT_TLDS = setOf("txt", "pdf", "jpg", "png", "doc", "docx", "apk", "zip", "mp4", "exe", "html", "js")

        /** "secure.login.leumi.co.il.evil.xyz" -> "evil.xyz"; "www.leumi.co.il" -> "leumi.co.il". */
        fun registrableDomain(host: String): String {
            val labels = host.trim('.').split('.')
            if (labels.size <= 2) return labels.joinToString(".")
            val take = if (labels.last().length == 2 && labels[labels.size - 2] in SECOND_LEVEL) 3 else 2
            return labels.takeLast(take).joinToString(".")
        }
    }
}
