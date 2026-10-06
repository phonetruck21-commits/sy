package com.sy.antivirus.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

private data class Tip(val icon: ImageVector, val title: String, val text: String, val colors: List<Color>)

private val TIPS = listOf(
    Tip(
        Icons.Filled.Notifications, "הגנה בזמן אמת",
        "הפעל הגנה ברקע וקבל התראה מיידית על כל אפליקציה חשודה שמותקנת.",
        listOf(Color(0xFF0077E6), Sky),
    ),
    Tip(
        Icons.Filled.Warning, "זהירות מקובצי APK",
        "רוב הנוזקות באנדרואיד מגיעות מקבצי APK שנשלחים בוואטסאפ, SMS או מאתרים.",
        listOf(Color(0xFFE65100), Orange),
    ),
    Tip(
        Icons.Filled.Lock, "מגן מטרויאני בנקאות",
        "אפליקציה עם נגישות + גישה ל-SMS יכולה לגנוב קודי אימות. SY Security מזהה את הדפוס הזה.",
        listOf(Color(0xFF00897B), Teal),
    ),
    Tip(
        Icons.Filled.Refresh, "הגדל את מאגר החתימות",
        "ייבא רשימת חתימות מ-MalwareBazaar כדי לזהות אלפי נוזקות ידועות.",
        listOf(Color(0xFF5E35B1), Color(0xFF8E7CFF)),
    ),
    Tip(
        Icons.Filled.Info, "עדכן את המכשיר",
        "עדכוני אבטחה של אנדרואיד סוגרים פרצות שנוזקות מנצלות. התקן אותם ברגע שהם זמינים.",
        listOf(NavyLight, Color(0xFF3D6FB6)),
    ),
)

/** Auto-rotating tips carousel, in the spirit of the cards on Norton's and Malwarebytes' dashboards. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun InfoBanner(modifier: Modifier = Modifier) {
    val pager = rememberPagerState(pageCount = { TIPS.size })
    LaunchedEffect(pager) {
        while (true) {
            delay(5_000)
            pager.animateScrollToPage((pager.currentPage + 1) % TIPS.size)
        }
    }
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        HorizontalPager(state = pager, pageSpacing = 12.dp) { page ->
            val tip = TIPS[page]
            Row(
                Modifier
                    .fillMaxWidth()
                    .height(110.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(Brush.linearGradient(tip.colors))
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(48.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(tip.icon, contentDescription = null, tint = Color.White)
                }
                Spacer(Modifier.width(14.dp))
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(tip.title, color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Text(tip.text, color = Color.White.copy(alpha = 0.9f), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            repeat(TIPS.size) { index ->
                val selected = index == pager.currentPage
                Box(
                    Modifier
                        .size(width = if (selected) 18.dp else 6.dp, height = 6.dp)
                        .clip(CircleShape)
                        .background(if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
                )
            }
        }
    }
}
