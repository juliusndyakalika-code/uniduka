package com.mauzohalisi.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mauzohalisi.app.ui.theme.*

/** `.page-title` and `.page-subtitle`. */
@Composable
fun PageHeader(title: String, subtitle: String? = null, trailing: @Composable (() -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().padding(bottom = 20.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Ink)
            subtitle?.let {
                Text(it.uppercase(), fontSize = 10.sp, letterSpacing = 1.5.sp,
                     color = Stone400, modifier = Modifier.padding(top = 2.dp))
            }
        }
        trailing?.invoke()
    }
}

/** `.card` */
@Composable
fun NeuCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.neuRaised(radius = 16.dp), content = content)
}

/**
 * `.btn-primary` — the dark gradient pill. Uppercase and letter-spaced like the
 * web, because on a till the primary action has to be unmistakable at a glance.
 */
@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    Box(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF434343), Color(0xFF1A1A1A))))
            .clickable(enabled = enabled && !loading) { onClick() }
            .graphicsLayer { this.alpha = if (enabled) 1f else 0.4f }
            .padding(horizontal = 24.dp, vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            CircularProgressIndicator(strokeWidth = 2.dp, color = Color.White,
                                      modifier = Modifier.size(18.dp))
        } else {
            Text(text.uppercase(), color = Color.White, fontSize = 12.sp,
                 fontWeight = FontWeight.SemiBold, letterSpacing = 1.5.sp)
        }
    }
}

/** `.btn-secondary` — raised, on the ground colour. */
@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier
            .neuRaised(radius = 12.dp, offset = 4.dp, blur = 10.dp)
            .clickable { onClick() }
            .padding(horizontal = 24.dp, vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text.uppercase(), color = Stone700, fontSize = 12.sp,
             fontWeight = FontWeight.SemiBold, letterSpacing = 1.5.sp)
    }
}

/** `.input-box` — the sunken field. */
@Composable
fun NeuField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    trailing: @Composable (() -> Unit)? = null,
) {
    Row(
        modifier.neuInset(radius = 12.dp).padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) {
                Text(placeholder, color = Stone400, fontSize = 14.sp)
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                textStyle = TextStyle(color = Ink, fontSize = 14.sp),
                cursorBrush = SolidColor(Ochre),
                keyboardOptions = keyboardOptions,
                visualTransformation = visualTransformation,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        trailing?.invoke()
    }
}

/** `.label` */
@Composable
fun FieldLabel(text: String) {
    Text(text.uppercase(), fontSize = 10.sp, fontWeight = FontWeight.SemiBold,
         letterSpacing = 1.5.sp, color = Stone500,
         modifier = Modifier.padding(bottom = 8.dp))
}

/** `.badge-*` */
@Composable
fun Badge(text: String, bg: Color, fg: Color) {
    Text(text, fontSize = 10.sp, color = fg,
         modifier = Modifier.clip(CircleShape).background(bg)
             .padding(horizontal = 10.dp, vertical = 3.dp))
}
