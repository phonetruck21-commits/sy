package com.sy.antivirus.ui

import android.text.format.DateUtils
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.sy.antivirus.MainViewModel
import com.sy.antivirus.engine.QuarantineEntry

@Composable
fun QuarantineScreen(vm: MainViewModel) {
    var toRestore by remember { mutableStateOf<QuarantineEntry?>(null) }

    if (vm.quarantine.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("ההסגר ריק") }
        return
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(
                "קבצים בהסגר שמורים מוצפנים בזיכרון הפרטי של האפליקציה ולא ניתן לפתוח או להריץ אותם.",
                style = MaterialTheme.typography.bodySmall,
            )
        }
        items(vm.quarantine, key = { it.id }) { entry ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(entry.originalName, style = MaterialTheme.typography.titleMedium)
                    Text(entry.threat, color = Red)
                    Text(
                        DateUtils.getRelativeTimeSpanString(entry.quarantinedAt).toString(),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { vm.deleteForever(entry) }) { Text("מחק לצמיתות") }
                        OutlinedButton(onClick = { toRestore = entry }) { Text("שחזר") }
                    }
                }
            }
        }
    }

    toRestore?.let { entry ->
        AlertDialog(
            onDismissRequest = { toRestore = null },
            title = { Text("לשחזר את הקובץ?") },
            text = { Text("${entry.originalName} זוהה כ-${entry.threat}. שחזור קובץ זדוני עלול לסכן את המכשיר.") },
            confirmButton = {
                TextButton(onClick = {
                    vm.restore(entry)
                    toRestore = null
                }) { Text("שחזר בכל זאת") }
            },
            dismissButton = { TextButton(onClick = { toRestore = null }) { Text("ביטול") } },
        )
    }
}
