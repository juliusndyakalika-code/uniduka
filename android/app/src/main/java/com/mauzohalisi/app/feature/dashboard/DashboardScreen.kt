package com.mauzohalisi.app.feature.dashboard

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mauzohalisi.app.core.AppContainer
import com.mauzohalisi.app.ui.theme.*
import kotlinx.coroutines.flow.first
import java.text.NumberFormat
import java.util.Locale

private data class Tile(val label: String, val value: String, val note: String, val tint: androidx.compose.ui.graphics.Color)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(app: AppContainer, onSignOut: () -> Unit) {
    var shopName by remember { mutableStateOf<String?>(null) }
    var userName by remember { mutableStateOf<String?>(null) }
    var tiles by remember { mutableStateOf<List<Tile>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    val money = remember {
        NumberFormat.getNumberInstance(Locale.US).apply { maximumFractionDigits = 0 }
    }

    LaunchedEffect(Unit) {
        shopName = app.session.shopName.first()
        userName = app.session.userName.first()
        val res = runCatching { app.api.dashboard() }.getOrNull()
        if (res?.isSuccessful == true) {
            val d = res.body()?.data
            tiles = listOfNotNull(
                Tile("REVENUE TODAY", "TSh " + money.format(d?.revenue ?: 0.0), "today", Ochre),
                Tile("TRANSACTIONS", (d?.transactions ?: 0).toString(), "today", Good),
                Tile("CUSTOMERS", (d?.customers ?: 0).toString(), "total", Ink),
                Tile("PRODUCTS", (d?.products ?: 0).toString(), "active", Ink),
                // Only worth a tile when there is something to report.
                (d?.discounts ?: 0.0).takeIf { it > 0 }?.let {
                    Tile("DISCOUNTS", "TSh " + money.format(it), "given today", Warn)
                },
            )
        } else {
            error = "Could not load today's figures."
        }
        loading = false
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(shopName ?: "MauzoHalisi", style = MaterialTheme.typography.titleMedium)
                        userName?.let {
                            Text(it, style = MaterialTheme.typography.labelSmall, color = Muted)
                        }
                    }
                },
                actions = { TextButton(onClick = onSignOut) { Text("Sign out") } },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
    ) { pad ->
        when {
            loading -> Box(Modifier.fillMaxSize().padding(pad), contentAlignment = androidx.compose.ui.Alignment.Center) {
                CircularProgressIndicator(color = Ochre)
            }
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize().padding(pad),
            ) {
                error?.let { msg ->
                    item {
                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                            Text(msg, Modifier.padding(16.dp), color = Warn,
                                 style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                items(tiles) { t ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(Modifier.padding(18.dp)) {
                            Text(t.label, style = MaterialTheme.typography.labelSmall, color = Muted)
                            Text(t.value, style = MaterialTheme.typography.headlineMedium,
                                 color = t.tint, fontWeight = FontWeight.Bold,
                                 modifier = Modifier.padding(top = 4.dp))
                            Text(t.note, style = MaterialTheme.typography.bodySmall, color = Muted)
                        }
                    }
                }
            }
        }
    }
}
