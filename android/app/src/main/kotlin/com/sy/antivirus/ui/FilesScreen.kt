package com.sy.antivirus.ui

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.sy.antivirus.MainViewModel

@Composable
fun FilesScreen(vm: MainViewModel) {
    val context = LocalContext.current
    val pickFolder = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) {
            // Keep access so quarantined files can be restored to the same folder later.
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
                )
            }
            vm.scanFolder(uri)
        }
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(
                "בחר תיקייה (למשל Download או WhatsApp) והאנטי-וירוס יסרוק את כל הקבצים בתוכה, כולל בתוך קובצי ZIP ו-APK.",
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        item {
            val progress = vm.fileProgress
            if (progress == null) {
                Button(onClick = { pickFolder.launch(null) }, modifier = Modifier.fillMaxWidth()) {
                    Text("בחר תיקייה לסריקה")
                }
                vm.lastFileScanCount?.let {
                    Text(
                        "נסרקו $it קבצים, נמצאו ${vm.fileFindings.size} איומים",
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("נסרקו ${progress.done} קבצים: ${progress.current}", maxLines = 1)
                    LinearProgressIndicator(Modifier.fillMaxWidth())
                    OutlinedButton(onClick = vm::stopFileScan) { Text("עצור") }
                }
            }
        }
        items(vm.fileFindings, key = { it.uri.toString() }) { finding ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(finding.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                        Text(
                            if (finding.result.infected) "נגוע" else "חשוד",
                            color = if (finding.result.infected) Red else Orange,
                        )
                    }
                    finding.result.detections.forEach { detection ->
                        Text(detection.threat, style = MaterialTheme.typography.bodyMedium)
                        detection.details.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                    }
                    Button(onClick = { vm.quarantineFinding(finding) }) { Text("העבר להסגר") }
                }
            }
        }
    }
}
