package com.sy.antivirus

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.google.android.gms.ads.MobileAds
import com.sy.antivirus.ui.SyApp
import com.sy.antivirus.work.Notifications

class MainActivity : ComponentActivity() {
    private val vm: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        // The branded top bar is navy, so keep the status bar icons light.
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT))
        Notifications.ensureChannel(this)
        // Initialising AdMob off the main thread keeps startup fast.
        Thread { MobileAds.initialize(this) {} }.start()
        if (savedInstanceState == null) handleShare(intent)
        setContent { SyApp(vm) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShare(intent)
    }

    private fun handleShare(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND) return
        val text = listOfNotNull(
            intent.getStringExtra(Intent.EXTRA_SUBJECT),
            intent.getStringExtra(Intent.EXTRA_TEXT),
        ).joinToString("\n")
        if (text.isNotBlank()) vm.onSharedText(text)
    }
}
