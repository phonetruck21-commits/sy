package com.sy.antivirus.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sy.antivirus.MainViewModel
import com.sy.antivirus.R
import kotlinx.coroutines.flow.filterNotNull

private data class Tab(val title: String, val icon: ImageVector)

private val TABS = listOf(
    Tab("בית", Icons.Filled.Home),
    Tab("אפליקציות", Icons.AutoMirrored.Filled.List),
    Tab("קבצים", Icons.Filled.Search),
    Tab("הסגר", Icons.Filled.Lock),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BrandTopBar() {
    TopAppBar(
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(painterResource(R.drawable.ic_logo), contentDescription = null, modifier = Modifier.height(30.dp))
                Spacer(Modifier.width(10.dp))
                // One text run, so the bidi algorithm keeps "SY Security" in order inside the RTL layout.
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(color = Color.White, fontWeight = FontWeight.Black)) { append("SY ") }
                        withStyle(SpanStyle(color = Teal, fontWeight = FontWeight.Bold)) { append("Security") }
                    },
                )
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = Navy),
    )
}

@Composable
fun SyApp(vm: MainViewModel = viewModel()) {
    SyTheme {
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
                topBar = { BrandTopBar() },
                containerColor = MaterialTheme.colorScheme.background,
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
                        0 -> HomeScreen(vm, onNavigate = { tab = it })
                        1 -> AppsScreen(vm)
                        2 -> FilesScreen(vm)
                        else -> QuarantineScreen(vm)
                    }
                }
            }
        }
    }
}
