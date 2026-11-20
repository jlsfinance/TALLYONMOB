package com.syncoraa.nativeapp.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object SyncoraColors {
    val DarkBg = Color(0xFF070D1A)
    val DarkSurface = Color(0xFF10192D)
    val DarkSurfaceAlt = Color(0xFF17233C)
    val DarkOutline = Color(0xFF253554)
    val DarkPrimary = Color(0xFF00E599)
    val DarkOnPrimary = Color(0xFF042619)

    val LightBg = Color(0xFFF7F9FB)
    val LightSurface = Color(0xFFFFFFFF)
    val LightSurfaceAlt = Color(0xFFEEF2F7)
    val LightOutline = Color(0xFFD8E0EB)
    val LightPrimary = Color(0xFF0B8968)
    val LightOnPrimary = Color(0xFFFFFFFF)

    val Emerald = Color(0xFF10B981)
    val Rose = Color(0xFFEF4444)
    val Amber = Color(0xFFF59E0B)
    val Blue = Color(0xFF3B82F6)
    val Violet = Color(0xFF8B5CF6)
}

private val DarkColorScheme = darkColorScheme(
    primary = SyncoraColors.DarkPrimary,
    onPrimary = SyncoraColors.DarkOnPrimary,
    primaryContainer = Color(0xFF083D2B),
    onPrimaryContainer = Color(0xFF8FF7CF),
    secondary = Color(0xFF60A5FA),
    onSecondary = Color(0xFF081B33),
    secondaryContainer = Color(0xFF1A2D4D),
    onSecondaryContainer = Color(0xFFD6E6FF),
    background = SyncoraColors.DarkBg,
    onBackground = Color(0xFFF1F5F9),
    surface = SyncoraColors.DarkSurface,
    onSurface = Color(0xFFF1F5F9),
    surfaceVariant = SyncoraColors.DarkSurfaceAlt,
    onSurfaceVariant = Color(0xFF94A3B8),
    outline = SyncoraColors.DarkOutline,
    outlineVariant = Color(0xFF1B2944),
    error = Color(0xFFF87171),
    onError = Color(0xFF3B0808)
)

private val LightColorScheme = lightColorScheme(
    primary = SyncoraColors.LightPrimary,
    onPrimary = SyncoraColors.LightOnPrimary,
    primaryContainer = Color(0xFFD9F7EB),
    onPrimaryContainer = Color(0xFF053B2C),
    secondary = Color(0xFF2563EB),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFDBEAFE),
    onSecondaryContainer = Color(0xFF1E3A8A),
    background = SyncoraColors.LightBg,
    onBackground = Color(0xFF0F172A),
    surface = SyncoraColors.LightSurface,
    onSurface = Color(0xFF0F172A),
    surfaceVariant = SyncoraColors.LightSurfaceAlt,
    onSurfaceVariant = Color(0xFF475569),
    outline = SyncoraColors.LightOutline,
    outlineVariant = Color(0xFFE2E8F0),
    error = Color(0xFFDC2626),
    onError = Color.White
)

private val AppTypography = Typography(
    headlineSmall = TextStyle(fontWeight = FontWeight.Bold, fontSize = 22.sp, lineHeight = 28.sp),
    titleLarge = TextStyle(fontWeight = FontWeight.Bold, fontSize = 18.sp, lineHeight = 24.sp),
    titleMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontWeight = FontWeight.Normal, fontSize = 13.5.sp, lineHeight = 19.sp),
    bodySmall = TextStyle(fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp),
    labelMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 11.5.sp, lineHeight = 15.sp)
)

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(14.dp),
    large = RoundedCornerShape(18.dp),
    extraLarge = RoundedCornerShape(24.dp)
)

@Composable
fun SyncoraNativeTheme(
    darkModeSetting: String = "system",
    content: @Composable () -> Unit
) {
    val isDark = when (darkModeSetting) {
        "dark" -> true
        "light" -> false
        else -> isSystemInDarkTheme()
    }
    MaterialTheme(
        colorScheme = if (isDark) DarkColorScheme else LightColorScheme,
        typography = AppTypography,
        shapes = AppShapes,
        content = content
    )
}
