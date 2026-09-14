package com.mauzohalisi.app.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The web app's neumorphism, ported so the two platforms read as one product.
 *
 * On the web it is a single CSS declaration:
 *
 *   box-shadow: 8px 8px 20px #c5cad3, -8px -8px 20px #ffffff;
 *
 * Compose has no two-tone shadow, so each half is drawn by hand: a dark one down
 * and right, a light one up and left, both blurred, with the card colour painted
 * over the top. The effect only works on a ground of exactly #E8EBF0, which is
 * why the palette fixes it rather than leaving it to a surface token.
 */

val NeuGround    = Color(0xFFE8EBF0)
val NeuShadow    = Color(0xFFC5CAD3)
val NeuHighlight = Color(0xFFFFFFFF)

/** A raised surface: the `.card` class. */
fun Modifier.neuRaised(
    radius: Dp = 16.dp,
    offset: Dp = 8.dp,
    blur: Dp = 20.dp,
    ground: Color = NeuGround,
): Modifier = this
    .drawBehind {
        val r = radius.toPx()
        drawIntoCanvas { canvas ->
            val paint = android.graphics.Paint().apply {
                isAntiAlias = true
                color = android.graphics.Color.TRANSPARENT
            }
            // Dark below-right, then light above-left. Order does not matter
            // because each only paints its own blur.
            paint.setShadowLayer(blur.toPx(), offset.toPx(), offset.toPx(), NeuShadow.toArgb())
            canvas.nativeCanvas.drawRoundRect(0f, 0f, size.width, size.height, r, r, paint)
            paint.setShadowLayer(blur.toPx(), -offset.toPx(), -offset.toPx(), NeuHighlight.toArgb())
            canvas.nativeCanvas.drawRoundRect(0f, 0f, size.width, size.height, r, r, paint)
        }
    }
    .clip(RoundedCornerShape(radius))
    .background(ground)

/**
 * A pressed surface: the `.input-box` and `.nav-item-active` classes.
 *
 * An inner shadow is a stroke drawn just inside the edge and blurred, clipped to
 * the shape so the blur cannot escape outwards. Two of them, offset in opposite
 * directions, give the same sunken read as the CSS inset pair.
 */
fun Modifier.neuInset(
    radius: Dp = 12.dp,
    offset: Dp = 4.dp,
    blur: Dp = 8.dp,
    ground: Color = NeuGround,
): Modifier = this
    .clip(RoundedCornerShape(radius))
    .background(ground)
    .drawBehind {
        val r = radius.toPx()
        val stroke = Stroke(width = offset.toPx() * 2)
        drawIntoCanvas { canvas ->
            val paint = android.graphics.Paint().apply {
                isAntiAlias = true
                style = android.graphics.Paint.Style.STROKE
                strokeWidth = stroke.width
                maskFilter = android.graphics.BlurMaskFilter(
                    blur.toPx(), android.graphics.BlurMaskFilter.Blur.NORMAL,
                )
            }
            val inset = stroke.width / 2
            paint.color = NeuShadow.toArgb()
            canvas.nativeCanvas.drawRoundRect(
                inset + offset.toPx(), inset + offset.toPx(),
                size.width - inset, size.height - inset, r, r, paint,
            )
            paint.color = NeuHighlight.toArgb()
            canvas.nativeCanvas.drawRoundRect(
                inset, inset,
                size.width - inset - offset.toPx(), size.height - inset - offset.toPx(), r, r, paint,
            )
        }
    }
