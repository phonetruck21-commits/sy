package com.sy.antivirus.ui

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import com.sy.antivirus.BuildConfig

/** AdMob banner that adapts to the screen width. Kept off the threat screens on purpose. */
@Composable
fun AdBanner(modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("פרסומת", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val widthDp = maxWidth.value.toInt()
            AndroidView(
                modifier = Modifier.fillMaxWidth(),
                factory = { context ->
                    AdView(context).apply {
                        setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(context, widthDp))
                        adUnitId = BuildConfig.ADMOB_BANNER_ID
                        loadAd(AdRequest.Builder().build())
                    }
                },
                onRelease = { it.destroy() },
            )
        }
    }
}
