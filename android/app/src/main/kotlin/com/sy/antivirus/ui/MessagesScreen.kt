package com.sy.antivirus.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import com.sy.antivirus.MainViewModel
import com.sy.antivirus.engine.LinkVerdict
import com.sy.antivirus.engine.ScamLevel

@Composable
fun MessagesScreen(vm: MainViewModel) {
    val clipboard = LocalClipboardManager.current

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text("בודק הונאות", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(
            "קיבלת SMS, וואטסאפ או מייל חשוד? הדבק אותו כאן ונבדוק אם זו הונאה - כולל הקישורים שבו.",
            style = MaterialTheme.typography.bodyMedium,
        )

        OutlinedTextField(
            value = vm.scamInput,
            onValueChange = { vm.scamInput = it },
            modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp),
            placeholder = { Text("לדוגמה: החבילה שלך ממתינה לתשלום דמי משלוח...") },
            textStyle = MaterialTheme.typography.bodyMedium.copy(textDirection = TextDirection.Content),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = vm::checkMessage, modifier = Modifier.weight(1f)) { Text("בדוק") }
            OutlinedButton(onClick = {
                clipboard.getText()?.text?.let {
                    vm.scamInput = it
                    vm.checkMessage()
                }
            }) { Text("הדבק ובדוק") }
        }

        vm.scamResult?.let { result ->
            val (color, icon, title) = when (result.level) {
                ScamLevel.DANGEROUS -> Triple(Red, Icons.Filled.Warning, "הונאה!")
                ScamLevel.CAUTION -> Triple(Orange, Icons.Filled.Warning, "חשוד - היזהר")
                ScamLevel.SAFE -> Triple(Green, Icons.Filled.CheckCircle, "לא נמצאו סימני הונאה")
            }
            Card(colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.12f))) {
                Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(36.dp))
                        Spacer(Modifier.width(10.dp))
                        Text(title, color = color, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    }
                    Text(result.advice, fontWeight = FontWeight.SemiBold)
                    result.reasons.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                }
            }
            if (result.links.isNotEmpty()) {
                Text("קישורים בהודעה", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                result.links.forEach { LinkCard(it) }
            }
        }

        HowToShare()
    }
}

@Composable
private fun LinkCard(link: LinkVerdict) {
    val (label, color) = when (link.level) {
        ScamLevel.DANGEROUS -> "מסוכן" to Red
        ScamLevel.CAUTION -> "חשוד" to Orange
        ScamLevel.SAFE -> "תקין" to Green
    }
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    link.host,
                    style = MaterialTheme.typography.titleSmall.copy(textDirection = TextDirection.Ltr),
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                Surface(color = color.copy(alpha = 0.15f), shape = RoundedCornerShape(8.dp)) {
                    Text(label, color = color, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
                }
            }
            link.reasons.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
private fun HowToShare() {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(40.dp).clip(CircleShape).background(Color(0xFF00A3FF).copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Share, contentDescription = null, tint = Sky)
            }
            Spacer(Modifier.width(12.dp))
            Column {
                Text("טיפ: בדיקה בלחיצה אחת", fontWeight = FontWeight.Bold)
                Text(
                    "בוואטסאפ או ב-SMS: לחיצה ארוכה על ההודעה ← שתף ← SY Security",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}
