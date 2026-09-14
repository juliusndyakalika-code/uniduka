package com.mauzohalisi.app.feature.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mauzohalisi.app.core.AppContainer
import com.mauzohalisi.app.core.net.DashboardStats
import com.mauzohalisi.app.ui.components.NeuCard
import com.mauzohalisi.app.ui.components.PageHeader
import com.mauzohalisi.app.ui.theme.*
import kotlinx.coroutines.flow.first
import java.text.NumberFormat
import java.util.Locale

private val money = NumberFormat.getNumberInstance(Locale.US).apply { maximumFractionDigits = 0 }
private fun tsh(v: Double) = "TSh " + money.format(v)

private data class Stat(
    val icon: ImageVector, val label: String, val value: String,
    val sub: String?, val bg: Color, val fg: Color,
)

@Composable
fun DashboardScreen(app: AppContainer, onOpenPos: () -> Unit, onSignOut: () -> Unit) {
    var shopName by remember { mutableStateOf<String?>(null) }
    var data by remember { mutableStateOf<DashboardStats?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        shopName = app.session.shopName.first()
        val res = runCatching { app.api.dashboard() }.getOrNull()
        if (res?.isSuccessful == true) data = res.body()?.data
        else error = "Could not load today's figures."
        loading = false
    }

    val d = data
    val stats = remember(d) {
        if (d == null) emptyList() else listOf(
            Stat(Icons.Filled.TrendingUp, "Revenue Today", tsh(d.revenue.today),
                 "${tsh(d.revenue.month)} this month", TintAmber, TintAmberFg),
            Stat(Icons.Filled.ShoppingCart, "Transactions Today", d.transactions.today.toString(),
                 "${d.transactions.week} this week", TintTeal, TintTealFg),
            Stat(Icons.Filled.People, "Total Customers", d.customers.total.toString(),
                 "+${d.customers.fresh} new", TintBlue, TintBlueFg),
            Stat(Icons.Filled.Inventory2, "Low Stock Alerts", d.lowStock.toString(),
                 "items", TintRed, TintRedFg),
            Stat(Icons.Filled.AccountBalanceWallet, "Net Profit (This Month)", tsh(d.netProfit.month),
                 "after ${tsh(d.netProfit.expenses)} expenses", TintGreen, TintGreenFg),
            Stat(Icons.Filled.Layers, "Stock Investment", tsh(d.stockValue),
                 "value tied up in inventory", TintPurple, TintPurpleFg),
        )
    }

    Scaffold(
        containerColor = NeuGround,
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onOpenPos,
                containerColor = Ochre, contentColor = Color.White,
                text = { Text("SELL", fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp) },
                icon = { Icon(Icons.Filled.ShoppingCart, contentDescription = null) },
            )
        },
    ) { pad ->
        if (loading) {
            Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Ochre)
            }
            return@Scaffold
        }

        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier.fillMaxSize().padding(pad),
        ) {
            item {
                PageHeader(
                    title = "Dashboard",
                    subtitle = shopName,
                    trailing = {
                        TextButton(onClick = onSignOut) {
                            Text("Sign out", color = Ochre, fontSize = 13.sp)
                        }
                    },
                )
            }

            error?.let { msg -> item { NeuCard { Text(msg, Modifier.padding(16.dp), color = Warn, fontSize = 13.sp) } } }

            // Two columns, matching the web's grid at phone width.
            items(stats.chunked(2).size) { row ->
                val pair = stats.chunked(2)[row]
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    pair.forEach { s -> Box(Modifier.weight(1f)) { StatCard(s) } }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }

            d?.salesChart?.takeIf { it.isNotEmpty() }?.let { chart ->
                item { SalesChart(chart.map { it.label to it.revenue }) }
            }

            d?.topProducts?.takeIf { it.isNotEmpty() }?.let { top ->
                item {
                    NeuCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            SectionTitle("Top products")
                            top.take(5).forEach { p ->
                                Row(
                                    Modifier.fillMaxWidth().padding(vertical = 7.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Text(p.name, fontSize = 13.sp, color = Stone700,
                                         maxLines = 1, overflow = TextOverflow.Ellipsis,
                                         modifier = Modifier.weight(1f))
                                    Text(tsh(p.revenue), fontSize = 13.sp,
                                         fontWeight = FontWeight.SemiBold, color = Ink)
                                }
                            }
                        }
                    }
                }
            }

            d?.recentTransactions?.takeIf { it.isNotEmpty() }?.let { txs ->
                item {
                    NeuCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            SectionTitle("Recent transactions")
                            txs.take(6).forEach { tx ->
                                Row(
                                    Modifier.fillMaxWidth().padding(vertical = 8.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(Modifier.weight(1f)) {
                                        Text(tx.receiptNo ?: "—", fontSize = 12.sp,
                                             color = Stone700, maxLines = 1,
                                             overflow = TextOverflow.Ellipsis)
                                        Text(tx.paymentMethod.replace('_', ' '),
                                             fontSize = 10.sp, color = Stone400)
                                    }
                                    Text(tsh(tx.total), fontSize = 13.sp,
                                         fontWeight = FontWeight.SemiBold, color = Ink)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp,
         color = Stone500, modifier = Modifier.padding(bottom = 10.dp))
}

/**
 * `.stat-card`, including the two water-drop circles the web draws with ::before
 * and ::after. They are what stops the card reading as a plain Material tile.
 */
@Composable
private fun StatCard(s: Stat) {
    Box(Modifier.fillMaxWidth().neuRaised(radius = 16.dp)) {
        // The ::before and ::after water drops. On the web these are barely
        // there — 28% white over the ground with a soft shadow. Drawn directly
        // rather than through neuRaised, which paints an opaque fill and turned
        // them into two white blobs that fought the figure for attention.
        Drop(88.dp, x = 18.dp, y = (-18).dp, alpha = 0.28f, Modifier.align(Alignment.TopEnd))
        Drop(36.dp, x = (-42).dp, y = 42.dp, alpha = 0.38f, Modifier.align(Alignment.TopEnd))
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Box(
                    Modifier.clip(RoundedCornerShape(9.dp)).background(s.bg).padding(7.dp),
                ) { Icon(s.icon, contentDescription = null, tint = s.fg,
                         modifier = Modifier.size(17.dp)) }
                Icon(Icons.Filled.ArrowOutward, contentDescription = null,
                     tint = Stone400, modifier = Modifier.size(13.dp))
            }
            Spacer(Modifier.height(12.dp))
            Text(s.value, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Ink,
                 maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(s.label.uppercase(), fontSize = 9.sp, letterSpacing = 1.2.sp,
                 color = Stone500, maxLines = 1, overflow = TextOverflow.Ellipsis,
                 modifier = Modifier.padding(top = 3.dp))
            s.sub?.let {
                Text(it, fontSize = 10.sp, color = Stone400, maxLines = 1,
                     overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
            }
        }
    }
}

/** The web's "Sales, last 14 days" panel, as bars so it stays legible on a phone. */
@Composable
private fun SalesChart(points: List<Pair<String, Double>>) {
    val peak = points.maxOfOrNull { it.second }?.takeIf { it > 0 } ?: 1.0
    NeuCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            SectionTitle("Sales, last 14 days")
            // Bars share the width rather than scrolling. Scrolling put the most
            // recent day, the one a shop actually looks for, off the right edge.
            Row(
                Modifier.fillMaxWidth().height(120.dp),
                horizontalArrangement = Arrangement.spacedBy(3.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                points.forEachIndexed { i, (label, value) ->
                    Column(
                        Modifier.weight(1f),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Box(
                            Modifier.fillMaxWidth()
                                // A zero day still gets a sliver, so the axis reads
                                // as a row of days rather than a gap.
                                .height((4 + (value / peak * 84)).dp)
                                .clip(RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp))
                                .background(if (value > 0) Ochre else Stone400.copy(alpha = 0.35f)),
                        )
                        // Every other label; fourteen at this width collide.
                        Text(
                            if (i % 2 == 0) label.substringAfter('-') else "",
                            fontSize = 8.sp, color = Stone400,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
            }
        }
    }
}

/** A soft translucent highlight, the Compose equivalent of the card's ::before. */
@Composable
private fun Drop(size: Dp, x: Dp, y: Dp, alpha: Float, modifier: Modifier = Modifier) {
    Box(
        modifier
            .offset(x = x, y = y)
            .size(size)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = alpha)),
    )
}
