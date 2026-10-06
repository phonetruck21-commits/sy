package com.sy.antivirus.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sy.antivirus.MainViewModel
import kotlinx.coroutines.flow.filterNotNull

private data class Tab(val title: String, val icon: ImageVector)

private val TABS = listOf(
    Tab("בית", Icons.Filled.Home),
    Tab("אפליקציות", Icons.AutoMirrored.Filled.List),
    Tab("קבצים", Icons.Filled.Search),
    Tab("הסגר", Icons.Filled.Lock),
)

private val Blue = Color(0xFF0D47A1)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyApp(vm: MainViewModel = viewModel()) {
    val colors = if (isSystemInDarkTheme()) {
        darkColorScheme(primary = Color(0xFF90CAF9))
    } else {
        lightColorScheme(primary = Blue)
    }
    MaterialTheme(colorScheme = colors) {
        // The whole UI is Hebrew, so lay it out right-to-left regardless of the device language.
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
            var tab by rememberSaveable { mutableIntStateOf(0) }
            val snackbar = remember { SnackbarHostState() }
            LaunchedEffect(Unit) {
                snapshotFlow { vm.message }.filterNotNull().collect {
                    vm.message = null
                    snackbar.showSnackbar(it)
                }
            }
            Scaffold(
                topBar = { CenterAlignedTopAppBar(title = { Text("SY אנטי-וירוס") }) },
                bottomBar = {
                    NavigationBar {
                        TABS.forEachIndexed { index, t ->
                            NavigationBarItem(
                                selected = tab == index,
                                onClick = { tab = index },
                                icon = { Icon(t.icon, contentDescription = null) },
                                label = { Text(t.title) },
                            )
                        }
                    }
                },
                snackbarHost = { SnackbarHost(snackbar) },
            ) { padding ->
                Box(Modifier.padding(padding)) {
                    when (tab) {
                        0 -> HomeScreen(vm, onShowApps = { tab = 1 })
                        1 -> AppsScreen(vm)
                        2 -> FilesScreen(vm)
                        else -> QuarantineScreen(vm)
                    }
                }
            }
        }
    }
}
