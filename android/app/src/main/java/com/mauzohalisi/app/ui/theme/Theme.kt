package com.mauzohalisi.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * The brand, carried over from the web app so the two do not drift apart:
 * ochre on a cool neutral ground, ink for text.
 *
 * Material You dynamic colour is deliberately not used. A till that recolours
 * itself to the customer's wallpaper stops looking like the same product from
 * one shop to the next, and the ochre is the only thing carrying the brand.
 */
val Ochre      = Color(0xFFB0682C)
val OchreDark  = Color(0xFF8A5122)
val Ink        = Color(0xFF12100E)
val Ground     = NeuGround
val Surface    = NeuGround
val Muted      = Color(0xFF78716C)
val Line       = Color(0xFFD6D3D1)
val Good       = Color(0xFF0D9488)
val Bad        = Color(0xFFB91C1C)
val Warn       = Color(0xFFB45309)

// Tailwind stone, matching the web's text ramp exactly.
val Stone400   = Color(0xFFA8A29E)
val Stone500   = Color(0xFF78716C)
val Stone700   = Color(0xFF44403C)

// Icon-chip tints from the dashboard cards.
val TintAmber  = Color(0xFFFEF3C7)
val TintAmberFg= Color(0xFFB45309)
val TintTeal   = Color(0xFFCCFBF1)
val TintTealFg = Color(0xFF0F766E)
val TintBlue   = Color(0xFFDBEAFE)
val TintBlueFg = Color(0xFF1D4ED8)
val TintRed    = Color(0xFFFEE2E2)
val TintRedFg  = Color(0xFFB91C1C)
val TintGreen  = Color(0xFFD1FAE5)
val TintGreenFg= Color(0xFF065F46)
val TintPurple = Color(0xFFEDE9FE)
val TintPurpleFg=Color(0xFF6D28D9)

private val LightColors = lightColorScheme(
    primary = Ochre, onPrimary = Color.White,
    secondary = Ink, onSecondary = Color.White,
    background = Ground, onBackground = Ink,
    surface = Surface, onSurface = Ink,
    surfaceVariant = Ground, onSurfaceVariant = Muted,
    error = Bad, onError = Color.White,
    outline = Line,
)

private val DarkColors = darkColorScheme(
    primary = Ochre, onPrimary = Color.White,
    secondary = Color(0xFFE7E5E4), onSecondary = Ink,
    background = Color(0xFF17161A), onBackground = Color(0xFFF5F5F4),
    surface = Color(0xFF201F24), onSurface = Color(0xFFF5F5F4),
    surfaceVariant = Color(0xFF2A292F), onSurfaceVariant = Color(0xFFA8A29E),
    error = Color(0xFFF87171), onError = Ink,
    outline = Color(0xFF3F3E44),
)

private val AppTypography = Typography(
    headlineMedium = Typography().headlineMedium.copy(fontWeight = FontWeight.Bold),
    titleLarge     = Typography().titleLarge.copy(fontWeight = FontWeight.Bold),
    titleMedium    = Typography().titleMedium.copy(fontWeight = FontWeight.SemiBold),
    labelLarge     = Typography().labelLarge.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.5.sp),
    labelSmall     = Typography().labelSmall.copy(letterSpacing = 1.sp),
)

@Composable
fun MauzoTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (dark) DarkColors else LightColors,
        typography  = AppTypography,
        content     = content,
    )
}
