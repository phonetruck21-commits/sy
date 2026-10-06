package com.sy.antivirus

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.sy.antivirus.ui.SyApp
import com.sy.antivirus.work.Notifications

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        Notifications.ensureChannel(this)
        setContent { SyApp() }
    }
}
