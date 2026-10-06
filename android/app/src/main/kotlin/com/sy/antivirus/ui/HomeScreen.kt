package com.sy.antivirus.ui

import android.Manifest
import android.os.Build
import android.text.format.DateUtils
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.sy.antivirus.MainViewModel

val Green = Color(0xFF2E7D32)
val Orange = Color(0xFFEF6C00)
val Red = Color(0xFFC62828)

@Composable
fun HomeScreen(vm: MainViewModel, onShowApps: () -> Unit) {
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        vm.setProtection(true)
    }
    val importFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let(vm::importSignatures)
    }

    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        StatusCard(vm)

        val progress = vm.appProgress
        if (progress != null) {
            Text("סורק ${progress.done} מתוך ${progress.total}: ${progress.current}", maxLines = 1)
            LinearProgressIndicator(
                progress = { if (progress.total == 0) 0f else progress.done.toFloat() / progress.total },
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            Button(onClick = vm::scanApps, modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
                Text("סרוק את כל האפליקציות", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(8.dp))
            }
            if (vm.appVerdicts != null) {
                OutlinedButton(onClick = onShowApps, modifier = Modifier.fillMaxWidth()) { Text("הצג תוצאות") }
            }
        }

        Card(Modifier.fillMaxWidth()) {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("הגנה ברקע", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "בודק כל אפליקציה חדשה שמותקנת או מתעדכנת ומתריע אם היא חשודה",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Switch(
                    checked = vm.protectionEnabled,
                    onCheckedChange = { enabled ->
                        if (enabled && Build.VERSION.SDK_INT >= 33) {
                            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else {
                            vm.setProtection(enabled)
                        }
                    },
                )
            }
        }

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("מאגר חתימות", style = MaterialTheme.typography.titleMedium)
                Text("${vm.db.size} חתימות טעונות", style = MaterialTheme.typography.bodyMedium)
                Text(
                    "אפשר לייבא קובץ טקסט עם רשימת SHA-256 של נוזקות (למשל מ-MalwareBazaar) כדי להגדיל את המאגר.",
                    style = MaterialTheme.typography.bodySmall,
                )
                OutlinedButton(onClick = { importFile.launch(arrayOf("*/*")) }) { Text("ייבוא חתימות") }
            }
        }

        Row(verticalAlignment = Alignment.Top) {
            Icon(Icons.Filled.Info, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(
                "בדיקה: הורד את קובץ הבדיקה EICAR מ-eicar.org ואז סרוק את תיקיית ההורדות בלשונית \"קבצים\".",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun StatusCard(vm: MainViewModel) {
    val scanned = vm.appVerdicts != null || vm.lastFileScanCount != null
    val threats = vm.threatsFound
    val (color, icon, title) = when {
        threats > 0 -> Triple(Red, Icons.Filled.Warning, "נמצאו $threats איומים")
        scanned -> Triple(Green, Icons.Filled.CheckCircle, "המכשיר נקי")
        else -> Triple(Orange, Icons.Filled.Info, "עדיין לא בוצעה סריקה")
    }
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.12f)),
    ) {
        Column(
            Modifier.fillMaxWidth().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(72.dp))
            Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = color)
            if (vm.lastAppScan > 0) {
                Text(
                    "סריקת אפליקציות אחרונה: " + DateUtils.getRelativeTimeSpanString(vm.lastAppScan),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}
