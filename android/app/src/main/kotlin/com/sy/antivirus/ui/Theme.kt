package com.sy.antivirus.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

// SY Security brand palette.
val Navy = Color(0xFF0A1A33)
val NavyLight = Color(0xFF15305A)
val Teal = Color(0xFF00E5A0)
val Sky = Color(0xFF00A3FF)

// Status colors.
val Green = Color(0xFF00B87A)
val Orange = Color(0xFFFF9800)
val Red = Color(0xFFFF4D4F)

val BrandGradient = Brush.linearGradient(listOf(Teal, Sky))
val HeroGradient = Brush.verticalGradient(listOf(Navy, NavyLight))

private val LightColors = lightColorScheme(
    primary = Color(0xFF0077E6),
    onPrimary = Color.White,
    secondary = Color(0xFF00A676),
    background = Color(0xFFF3F6FB),
    surface = Color.White,
    surfaceVariant = Color(0xFFE8EEF7),
    primaryContainer = Color(0xFFD6E9FF),
    secondaryContainer = Color(0xFFCCF5E6),
)

private val DarkColors = darkColorScheme(
    primary = Sky,
    onPrimary = Navy,
    secondary = Teal,
    background = Color(0xFF071226),
    surface = Navy,
    surfaceVariant = NavyLight,
    primaryContainer = Color(0xFF0D3B73),
    secondaryContainer = Color(0xFF0B4A3A),
)

@Composable
fun SyTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors, content = content)
}
