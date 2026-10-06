package com.sy.antivirus.ui

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.sy.antivirus.MainViewModel
import com.sy.antivirus.engine.AppVerdict
import com.sy.antivirus.engine.RiskLevel

@Composable
fun AppsScreen(vm: MainViewModel) {
    val verdicts = vm.appVerdicts
    if (verdicts == null) {
        Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("עדיין לא נסרקו אפליקציות", textAlign = TextAlign.Center)
                val progress = vm.appProgress
                if (progress != null) {
                    Text("סורק ${progress.done} מתוך ${progress.total}...")
                } else {
                    Button(onClick = vm::scanApps) { Text("סרוק עכשיו") }
                }
            }
        }
        return
    }

    var showAll by rememberSaveable { mutableStateOf(false) }
    val visible = if (showAll) verdicts else verdicts.filter { it.level > RiskLevel.SAFE }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${verdicts.size} אפליקציות נסרקו", modifier = Modifier.weight(1f))
                FilterChip(selected = showAll, onClick = { showAll = !showAll }, label = { Text("הצג הכל") })
            }
        }
        if (visible.isEmpty()) {
            item { Text("לא נמצאו אפליקציות חשודות 👍", modifier = Modifier.padding(vertical = 24.dp)) }
        }
        items(visible, key = { it.app.packageName }) { AppCard(it) }
    }
}

@Composable
private fun AppCard(verdict: AppVerdict) {
    val context = LocalContext.current
    var expanded by rememberSaveable(verdict.app.packageName) { mutableStateOf(verdict.level >= RiskLevel.SUSPICIOUS) }
    Card(Modifier.fillMaxWidth().clickable { expanded = !expanded }) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(verdict.app.label, style = MaterialTheme.typography.titleMedium)
                    Text(verdict.app.packageName, style = MaterialTheme.typography.bodySmall)
                }
                LevelBadge(verdict.level)
            }
            verdict.threat?.let { Text("איום: $it", color = Red, style = MaterialTheme.typography.bodyMedium) }
            if (expanded) {
                if (verdict.reasons.isEmpty()) {
                    Text("לא נמצאו סימנים מחשידים", style = MaterialTheme.typography.bodySmall)
                }
                verdict.reasons.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                if (verdict.level == RiskLevel.SUSPICIOUS) {
                    Text(
                        "חשודה = יש לה שילוב הרשאות שנפוץ בנוזקות. אם אתה לא מכיר אותה או לא התקנת אותה בעצמך - כדאי להסיר.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                if (!verdict.app.isSystem) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = {
                            context.startActivity(Intent(Intent.ACTION_DELETE, Uri.fromParts("package", verdict.app.packageName, null)))
                        }) { Text("הסר") }
                        OutlinedButton(onClick = {
                            context.startActivity(
                                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", verdict.app.packageName, null)),
                            )
                        }) { Text("הרשאות ופרטים") }
                    }
                }
            }
        }
    }
}

@Composable
fun LevelBadge(level: RiskLevel) {
    val (text, color) = when (level) {
        RiskLevel.MALWARE -> "נוזקה" to Red
        RiskLevel.SUSPICIOUS -> "חשודה" to Orange
        RiskLevel.LOW -> "סיכון נמוך" to Color(0xFFF9A825)
        RiskLevel.SAFE -> "תקינה" to Green
    }
    Surface(color = color.copy(alpha = 0.15f), shape = MaterialTheme.shapes.small) {
        Text(text, color = color, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
    }
}
