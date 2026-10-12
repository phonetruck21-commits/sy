package com.sy.antivirus.ui

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.os.Build
import android.text.format.DateUtils
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Switch
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.sy.antivirus.BuildConfig
import com.sy.antivirus.MainViewModel
import com.sy.antivirus.R
import com.sy.antivirus.data.CheckItem
import com.sy.antivirus.data.DeviceCheck
import com.sy.antivirus.data.FileAccess
import com.sy.antivirus.data.SecurityReport

@Composable
fun HomeScreen(vm: MainViewModel, onNavigate: (tab: Int) -> Unit) {
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        vm.setProtection(true)
    }
    val importFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let(vm::importSignatures)
    }
    val context = LocalContext.current
    LifecycleResumeEffect(Unit) {
        // Re-check when coming back from the settings screen the user just fixed something in.
        vm.refreshSecurity()
        onPauseOrDispose { }
    }
    val legacyStorage = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        vm.refreshSecurity()
    }
    val toggleProtection = {
        val enable = !vm.protectionEnabled
        if (enable && Build.VERSION.SDK_INT >= 33) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            vm.setProtection(enable)
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Hero(vm)

        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            vm.securityReport?.let { report ->
                SecurityScoreCard(report) { fix ->
                    when (fix) {
                        DeviceCheck.FIX_PROTECTION -> toggleProtection()
                        DeviceCheck.FIX_SCAN -> vm.scanApps()
                        DeviceCheck.FIX_APPS -> onNavigate(MainViewModel.TAB_APPS)
                        else -> openSettings(context, fix)
                    }
                }
            }
            ShieldsCard(
                vm,
                onToggle = toggleProtection,
                onEnableFiles = {
                    val intent = FileAccess.settingsIntent(context)
                    if (intent != null) openIntent(context, intent) else legacyStorage.launch(FileAccess.legacyPermissions)
                },
                onEnableMessages = { openSettings(context, Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS) },
                onEnableBattery = { openSettings(context, Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS) },
            )
            StatsRow(vm)
            InfoBanner()

            Text("כלי הגנה", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            TileRow(
                {
                    FeatureTile(Icons.AutoMirrored.Filled.List, "סריקת אפליקציות", "${vm.appVerdicts?.size ?: 0} נבדקו", Sky) {
                        onNavigate(MainViewModel.TAB_APPS)
                    }
                },
                {
                    FeatureTile(Icons.Filled.Search, "סריקת קבצים", "הורדות, WhatsApp ועוד", Teal) {
                        onNavigate(MainViewModel.TAB_FILES)
                    }
                },
            )
            TileRow(
                {
                    FeatureTile(Icons.Filled.Email, "בודק הונאות", "SMS, וואטסאפ וקישורים", Color(0xFFFF6B6B)) {
                        onNavigate(MainViewModel.TAB_MESSAGES)
                    }
                },
                {
                    FeatureTile(
                        Icons.Filled.Notifications, "הגנה בזמן אמת",
                        if (vm.protectionEnabled) "פעילה · הקש לכיבוי" else "כבויה · הקש להפעלה",
                        if (vm.protectionEnabled) Green else Orange,
                        onClick = toggleProtection,
                    )
                },
            )
            TileRow(
                {
                    FeatureTile(Icons.Filled.Lock, "הסגר", "${vm.quarantine.size} קבצים", Color(0xFF8E7CFF)) {
                        onNavigate(MainViewModel.TAB_QUARANTINE)
                    }
                },
                {
                    FeatureTile(Icons.Filled.Refresh, "מאגר חתימות", "${vm.db.size} חתימות · ייבוא", Color(0xFF0077E6)) {
                        importFile.launch(arrayOf("*/*"))
                    }
                },
            )

            AdBanner(Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun Hero(vm: MainViewModel) {
    val progress = vm.appProgress
    val scanning = progress != null
    val scannedThisSession = vm.appVerdicts != null || vm.lastFileScanCount != null
    val threats = vm.threatsFound
    val lastScan = if (vm.lastAppScan > 0) "סריקה אחרונה: " + DateUtils.getRelativeTimeSpanString(vm.lastAppScan) else "בצע סריקה ראשונה"

    val (color, title, subtitle) = when {
        scanning -> Triple(Sky, "סורק את המכשיר...", progress!!.current)
        threats > 0 -> Triple(Red, "נמצאו $threats איומים", "לחץ על \"אפליקציות\" או \"קבצים\" כדי לטפל")
        scannedThisSession -> Triple(Green, "אתה מוגן", lastScan)
        else -> Triple(Orange, "מומלץ לסרוק את המכשיר", lastScan)
    }

    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(bottomStart = 32.dp, bottomEnd = 32.dp))
            .background(HeroGradient)
            .padding(top = 12.dp, bottom = 28.dp, start = 24.dp, end = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        ScanOrb(
            statusColor = color,
            scanning = scanning,
            progress = progress?.let { if (it.total == 0) 0f else it.done.toFloat() / it.total } ?: 0f,
            onClick = vm::scanApps,
        )
        Text(title, color = Color.White, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(
            subtitle,
            color = Color.White.copy(alpha = 0.75f),
            style = MaterialTheme.typography.bodySmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** The big round scan button: pulses while idle, shows a progress ring while scanning. */
@Composable
private fun ScanOrb(statusColor: Color, scanning: Boolean, progress: Float, onClick: () -> Unit) {
    val transition = rememberInfiniteTransition(label = "orb")
    val pulse by transition.animateFloat(
        initialValue = 1f, targetValue = 1.05f,
        animationSpec = infiniteRepeatable(tween(1400), RepeatMode.Reverse), label = "pulse",
    )
    val sweepStart by transition.animateFloat(
        initialValue = 0f, targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(1800, easing = LinearEasing)), label = "sweep",
    )

    Box(Modifier.size(220.dp).scale(if (scanning) 1f else pulse), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 10.dp.toPx()
            val inset = stroke / 2 + 6.dp.toPx()
            val arcSize = Size(size.width - inset * 2, size.height - inset * 2)
            drawCircle(statusColor.copy(alpha = 0.12f))
            drawArc(
                Color.White.copy(alpha = 0.12f), 0f, 360f, false,
                topLeft = Offset(inset, inset), size = arcSize, style = Stroke(stroke),
            )
            if (scanning) {
                drawArc(
                    Brush.sweepGradient(listOf(Teal, Sky, Teal)), -90f, 360f * progress.coerceAtLeast(0.02f), false,
                    topLeft = Offset(inset, inset), size = arcSize, style = Stroke(stroke, cap = StrokeCap.Round),
                )
                drawArc(
                    Color.White.copy(alpha = 0.5f), sweepStart, 30f, false,
                    topLeft = Offset(inset, inset), size = arcSize, style = Stroke(stroke / 3, cap = StrokeCap.Round),
                )
            } else {
                drawArc(
                    statusColor, -90f, 360f, false,
                    topLeft = Offset(inset, inset), size = arcSize, style = Stroke(stroke),
                )
            }
        }
        Box(
            Modifier
                .size(156.dp)
                .clip(CircleShape)
                .background(BrandGradient)
                .clickable(enabled = !scanning, onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                if (scanning) {
                    Text(
                        "${(progress * 100).toInt()}%",
                        color = Navy, style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold,
                    )
                } else {
                    Image(painterResource(R.drawable.ic_logo), contentDescription = null, modifier = Modifier.height(52.dp))
                    Spacer(Modifier.height(6.dp))
                    Text("סרוק עכשיו", color = Navy, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun SecurityScoreCard(report: SecurityReport, onFix: (String) -> Unit) {
    val color = when {
        report.score >= 80 -> Green
        report.score >= 50 -> Orange
        else -> Red
    }
    var expanded by remember { mutableStateOf(false) }
    val problems = report.problems
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(84.dp), contentAlignment = Alignment.Center) {
                    Canvas(Modifier.fillMaxSize()) {
                        val stroke = 9.dp.toPx()
                        val inset = stroke / 2
                        val arc = Size(size.width - stroke, size.height - stroke)
                        drawArc(color.copy(alpha = 0.15f), 135f, 270f, false, Offset(inset, inset), arc, style = Stroke(stroke, cap = StrokeCap.Round))
                        drawArc(color, 135f, 270f * report.score / 100f, false, Offset(inset, inset), arc, style = Stroke(stroke, cap = StrokeCap.Round))
                    }
                    Text("${report.score}", color = color, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)
                }
                Spacer(Modifier.size(14.dp))
                Column(Modifier.weight(1f)) {
                    Text("ציון אבטחה", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(
                        when {
                            problems.isEmpty() -> "מושלם! המכשיר מוגדר בצורה בטוחה"
                            problems.size == 1 -> "בעיה אחת לתיקון"
                            else -> "${problems.size} בעיות לתיקון"
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            val shown = if (expanded) report.items else problems.take(3)
            shown.forEach { item -> CheckRow(item, onFix) }
            TextButton(onClick = { expanded = !expanded }) {
                Text(if (expanded) "הצג פחות" else "הצג את כל ${report.items.size} הבדיקות")
            }
        }
    }
}

@Composable
private fun CheckRow(item: CheckItem, onFix: (String) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            if (item.ok) Icons.Filled.CheckCircle else Icons.Filled.Warning,
            contentDescription = null,
            tint = if (item.ok) Green else Orange,
            modifier = Modifier.size(22.dp),
        )
        Spacer(Modifier.size(10.dp))
        Column(Modifier.weight(1f)) {
            Text(item.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(item.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (!item.ok && item.fix != null) {
            FilledTonalButton(onClick = { onFix(item.fix) }) { Text("תקן") }
        }
    }
}

private fun openSettings(context: Context, action: String) = openIntent(context, Intent(action))

private fun openIntent(context: Context, intent: Intent) {
    try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: ActivityNotFoundException) {
        context.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

/** Real-time protection, shield by shield, the way the big AVs show it. */
@Composable
private fun ShieldsCard(
    vm: MainViewModel,
    onToggle: () -> Unit,
    onEnableFiles: () -> Unit,
    onEnableMessages: () -> Unit,
    onEnableBattery: () -> Unit,
) {
    val on = vm.protectionEnabled
    val shields = vm.shields
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("הגנה בזמן אמת", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(
                        if (on) "פועלת תמיד ברקע · כמעט ללא צריכת סוללה" else "כבויה - המכשיר לא מוגן ברקע",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (on) Green else Red,
                    )
                }
                Switch(checked = on, onCheckedChange = { onToggle() })
            }
            ShieldRow("מגן אפליקציות", "כל התקנה ועדכון נסרקים מיד", on, active = on, onEnable = null)
            ShieldRow(
                "מגן קבצים", "סורק כל קובץ חדש בהורדות, וואטסאפ, טלגרם ובלוטות'",
                on, active = on && shields.files, onEnable = if (shields.files) null else onEnableFiles,
            )
            ShieldRow(
                "מגן הודעות", "בודק כל SMS והודעת וואטסאפ להונאה - במכשיר בלבד",
                on, active = on && shields.messages, onEnable = if (shields.messages) null else onEnableMessages,
            )
            if (on && !shields.battery) {
                ShieldRow(
                    "פעולה ללא הגבלת סוללה", "מונע מהמכשיר לעצור את ההגנה (חשוב בסמסונג ושיאומי)",
                    true, active = false, onEnable = onEnableBattery, enableLabel = "אפשר",
                )
            }
        }
    }
}

@Composable
private fun ShieldRow(
    title: String,
    detail: String,
    masterOn: Boolean,
    active: Boolean,
    onEnable: (() -> Unit)?,
    enableLabel: String = "הפעל",
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(10.dp).clip(CircleShape).background(
                when {
                    active -> Green
                    masterOn -> Orange
                    else -> MaterialTheme.colorScheme.outlineVariant
                },
            ),
        )
        Spacer(Modifier.size(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (masterOn && onEnable != null) {
            FilledTonalButton(onClick = onEnable) { Text(enableLabel) }
        }
    }
}

@Composable
private fun StatsRow(vm: MainViewModel) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        StatCard(vm.appVerdicts?.size?.toString() ?: "—", "אפליקציות נסרקו", Sky, Modifier.weight(1f))
        StatCard(vm.threatsFound.toString(), "איומים", if (vm.threatsFound > 0) Red else Green, Modifier.weight(1f))
        StatCard(vm.quarantine.size.toString(), "בהסגר", Color(0xFF8E7CFF), Modifier.weight(1f))
    }
}

@Composable
private fun StatCard(value: String, label: String, color: Color, modifier: Modifier) {
    Card(modifier, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.fillMaxWidth().padding(vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, color = color, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun TileRow(start: @Composable () -> Unit, end: @Composable () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.weight(1f)) { start() }
        Box(Modifier.weight(1f)) { end() }
    }
}

@Composable
private fun FeatureTile(icon: ImageVector, title: String, subtitle: String, color: Color, onClick: () -> Unit) {
    Card(
        Modifier.fillMaxWidth().heightIn(min = 112.dp).clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(color.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = color)
            }
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun AboutDialog(onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Image(painterResource(R.drawable.ic_logo), contentDescription = null, modifier = Modifier.height(56.dp)) },
        title = { Text("SY Security") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("גרסה ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.labelMedium)
                Text("נבנה בישראל, נגד ההונאות של ישראל:", fontWeight = FontWeight.Bold)
                Text("• זיהוי נוזקות לפי חתימות (APK, מפתח, שם חבילה)")
                Text("• ניתוח הרשאות לזיהוי טרויאני בנקאות ורוגלות")
                Text("• סריקת קבצים כולל ZIP ו-APK")
                Text("• הסגר מוצפן ושחזור")
                Text("• הגנה ברקע על כל התקנה חדשה")
                Text("• בודק הונאות SMS/וואטסאפ וקישורים מתחזים")
                Text("• ציון אבטחה למכשיר עם תיקון בלחיצה")
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("סגור") } },
    )
}
