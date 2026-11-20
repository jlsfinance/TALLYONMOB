package com.syncoraa.nativeapp.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.syncoraa.nativeapp.model.StockItem
import com.syncoraa.nativeapp.ui.components.EmptyPanel
import com.syncoraa.nativeapp.ui.components.ErrorPanel
import com.syncoraa.nativeapp.ui.components.LoadingPanel
import com.syncoraa.nativeapp.ui.components.SearchFieldBar
import com.syncoraa.nativeapp.ui.components.StatusBadge
import com.syncoraa.nativeapp.ui.components.SyncoraTopBar
import com.syncoraa.nativeapp.ui.theme.SyncoraColors
import com.syncoraa.nativeapp.util.Formatters
import com.syncoraa.nativeapp.viewmodel.AsyncState
import kotlin.math.abs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockScreen(
    companyName: String,
    stockState: AsyncState<List<StockItem>>,
    onRefresh: () -> Unit,
    onOpenStockItem: (StockItem) -> Unit
) {
    var query by remember { mutableStateOf("") }
    var selectedGroup by remember { mutableStateOf("All") }

    val all = stockState.data.orEmpty()
    val groups = remember(all) {
        listOf("All") + all.mapNotNull { it.stockGroup?.takeIf { g -> g.isNotBlank() } }.distinct().sorted()
    }
    val filtered = remember(all, query, selectedGroup) {
        val q = query.trim().lowercase()
        all.filter { item ->
            val groupMatch = selectedGroup == "All" || item.stockGroup.equals(selectedGroup, ignoreCase = true)
            val queryMatch = q.isEmpty() ||
                item.name.lowercase().contains(q) ||
                item.hsnCode.orEmpty().lowercase().contains(q)
            groupMatch && queryMatch
        }
    }
    val totalValue = remember(filtered) { filtered.sumOf { abs(it.closingValue ?: 0.0) } }

    Scaffold(
        topBar = {
            SyncoraTopBar(
                title = "Inventory & Stock",
                subtitle = "$companyName · ${filtered.size} items"
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            SearchFieldBar(
                query = query,
                onQueryChange = { query = it },
                placeholder = "Search stock item or HSN...",
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
            )
            if (groups.size > 1) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    groups.forEach { g ->
                        FilterChip(
                            selected = selectedGroup == g,
                            onClick = { selectedGroup = g },
                            label = { Text(g) }
                        )
                    }
                }
            }

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        "Total Stock Valuation",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        Formatters.formatInr(totalValue),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }

            when {
                stockState.loading && all.isEmpty() -> LoadingPanel("Loading stock items...")
                stockState.error != null && all.isEmpty() -> ErrorPanel(stockState.error, onRetry = onRefresh)
                else -> {
                    PullToRefreshBox(
                        isRefreshing = stockState.loading,
                        onRefresh = onRefresh,
                        modifier = Modifier.fillMaxSize()
                    ) {
                        if (filtered.isEmpty()) {
                            EmptyPanel(
                                title = "No stock items found",
                                subtitle = "Adjust search or group filters.",
                                icon = Icons.Default.Inventory2
                            )
                        } else {
                            LazyColumn(
                                contentPadding = PaddingValues(16.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                items(filtered, key = { it.id }) { item ->
                                    val qty = item.effectiveCurrentQty
                                    val lowStock = qty <= 0.0
                                    Card(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable { onOpenStockItem(item) },
                                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(14.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(
                                                    item.name,
                                                    style = MaterialTheme.typography.titleMedium,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                                Spacer(Modifier.height(4.dp))
                                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                    StatusBadge(
                                                        item.stockGroup ?: "Primary",
                                                        SyncoraColors.Blue
                                                    )
                                                    item.gstRate?.takeIf { it > 0.0 }?.let {
                                                        StatusBadge("GST ${it.toInt()}%", SyncoraColors.Violet)
                                                    }
                                                }
                                            }
                                            Spacer(Modifier.width(12.dp))
                                            Column(horizontalAlignment = Alignment.End) {
                                                Text(
                                                    "${Formatters.formatIndianNumber(qty, 2)} ${item.effectiveUnit}",
                                                    style = MaterialTheme.typography.titleMedium,
                                                    fontWeight = FontWeight.Bold,
                                                    color = if (lowStock) SyncoraColors.Rose else SyncoraColors.Emerald
                                                )
                                                item.closingValue?.let { valAmt ->
                                                    Text(
                                                        Formatters.formatInr(abs(valAmt)),
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
