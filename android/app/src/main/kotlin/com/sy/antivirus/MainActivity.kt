package com.sy.antivirus

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.google.android.gms.ads.MobileAds
import com.sy.antivirus.ui.SyApp
import com.sy.antivirus.work.Notifications

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        // The branded top bar is navy, so keep the status bar icons light.
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT))
        Notifications.ensureChannel(this)
        // Initialising AdMob off the main thread keeps startup fast.
        Thread { MobileAds.initialize(this) {} }.start()
        setContent { SyApp() }
    }
}
