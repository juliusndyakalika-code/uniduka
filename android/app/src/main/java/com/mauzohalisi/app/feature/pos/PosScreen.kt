package com.mauzohalisi.app.feature.pos

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mauzohalisi.app.core.net.Product
import androidx.compose.ui.graphics.graphicsLayer
import com.mauzohalisi.app.ui.components.NeuField
import com.mauzohalisi.app.ui.theme.*
import java.text.NumberFormat
import java.util.Locale

private val money = NumberFormat.getNumberInstance(Locale.US).apply { maximumFractionDigits = 0 }
private fun qtyLabel(q: Double) = if (q % 1.0 == 0.0) q.toInt().toString() else q.toString()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PosScreen(vm: PosViewModel, onBack: () -> Unit) {
    val s by vm.state.collectAsStateWithLifecycle()
    var showCart by remember { mutableStateOf(false) }

    s.lastReceipt?.let { receipt ->
        AlertDialog(
            onDismissRequest = vm::dismissReceipt,
            confirmButton = { TextButton(onClick = vm::dismissReceipt) { Text("DONE") } },
            title = { Text("Sale recorded") },
            text = { Text(receipt) },
        )
    }

    Scaffold(
        containerColor = NeuGround,
        topBar = {
            TopAppBar(
                title = { Text("Point of Sale", style = MaterialTheme.typography.titleMedium) },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = NeuGround),
            )
        },
        bottomBar = {
            // The total and the charge button stay pinned. On a busy counter the
            // cart is long and the one control that matters must never be
            // somewhere you have to scroll to find.
            if (s.cart.isNotEmpty()) {
                Surface(color = Ink, tonalElevation = 0.dp) {
                    Column(Modifier.fillMaxWidth().padding(16.dp)) {
                        Row(
                            Modifier.fillMaxWidth().clickable { showCart = !showCart },
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("${s.count} item${if (s.count == 1) "" else "s"}  ·  ${if (showCart) "hide" else "view"}",
                                 color = Muted, style = MaterialTheme.typography.bodySmall)
                            Text("TSh ${money.format(s.total)}", color = androidx.compose.ui.graphics.Color.White,
                                 style = MaterialTheme.typography.titleLarge)
                        }
                        Spacer(Modifier.height(12.dp))
                        Box(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                                .background(Ochre)
                                .clickable(enabled = !s.charging) { vm.charge() }
                                .padding(vertical = 16.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (s.charging) {
                                CircularProgressIndicator(strokeWidth = 2.dp,
                                    color = androidx.compose.ui.graphics.Color.White,
                                    modifier = Modifier.size(18.dp))
                            } else {
                                Text("CHARGE  ·  TSh ${money.format(s.total)}",
                                     color = androidx.compose.ui.graphics.Color.White,
                                     fontWeight = FontWeight.SemiBold, fontSize = 13.sp,
                                     letterSpacing = 1.5.sp)
                            }
                        }
                    }
                }
            }
        },
    ) { pad ->
        Column(Modifier.fillMaxSize().padding(pad)) {

            NeuField(
                value = s.search,
                onValueChange = vm::onSearch,
                placeholder = "Search product or SKU",
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
            )

            s.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error,
                     style = MaterialTheme.typography.bodySmall,
                     modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
            }

            when {
                s.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Ochre)
                }

                showCart && s.cart.isNotEmpty() -> LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(s.cart, key = { it.product.id }) { line ->
                        CartRow(
                            name = line.product.name,
                            qty = line.qty,
                            unit = line.product.unit,
                            total = line.lineTotal,
                            onMinus = { vm.setQty(line.product.id, line.qty - 1) },
                            onPlus  = { vm.setQty(line.product.id, line.qty + 1) },
                            onRemove = { vm.remove(line.product.id) },
                        )
                    }
                }

                s.visible.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(if (s.products.isEmpty()) "No products yet" else "Nothing matches that search",
                         color = Muted)
                }

                else -> LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 150.dp),
                    contentPadding = PaddingValues(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(s.visible, key = { it.id }) { p -> ProductTile(p) { vm.add(p) } }
                }
            }
        }
    }
}

@Composable
private fun ProductTile(p: Product, onTap: () -> Unit) {
    val out = !p.sellable
    Box(
        Modifier
            .height(116.dp)
            .neuRaised(radius = 16.dp)
            .clickable(enabled = !out) { onTap() }
            .graphicsLayer { alpha = if (out) 0.55f else 1f },
    ) {
        Column(Modifier.padding(12.dp).fillMaxSize(), verticalArrangement = Arrangement.SpaceBetween) {
            Text(p.name, style = MaterialTheme.typography.bodyMedium,
                 fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Column {
                Text("TSh ${money.format(p.price)}", color = Ochre,
                     style = MaterialTheme.typography.titleMedium)
                Text(
                    if (p.type == "SERVICE") "service"
                    else if (out) "out of stock"
                    else "${qtyLabel(p.stock)} ${p.unit}",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (out) Bad else Muted,
                )
            }
        }
    }
}

@Composable
private fun CartRow(
    name: String, qty: Double, unit: String, total: Double,
    onMinus: () -> Unit, onPlus: () -> Unit, onRemove: () -> Unit,
) {
    Box(Modifier.fillMaxWidth().neuRaised(radius = 14.dp)) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                Text("TSh ${money.format(total)}", color = Muted,
                     style = MaterialTheme.typography.bodySmall)
            }
            IconButton(onClick = onMinus) { Icon(Icons.Filled.Remove, "Reduce quantity") }
            Text("${qtyLabel(qty)} $unit", style = MaterialTheme.typography.bodyMedium,
                 modifier = Modifier.widthIn(min = 44.dp))
            IconButton(onClick = onPlus) { Icon(Icons.Filled.Add, "Increase quantity") }
            IconButton(onClick = onRemove) {
                Icon(Icons.Filled.Close, "Remove from cart", tint = Bad)
            }
        }
    }
}
