package com.syncoraa.nativeapp.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.syncoraa.nativeapp.model.StockHistoryResult
import com.syncoraa.nativeapp.ui.components.EmptyPanel
import com.syncoraa.nativeapp.ui.components.ErrorPanel
import com.syncoraa.nativeapp.ui.components.LoadingPanel
import com.syncoraa.nativeapp.ui.components.StatusBadge
import com.syncoraa.nativeapp.ui.components.SyncoraTopBar
import com.syncoraa.nativeapp.ui.components.voucherTypeColor
import com.syncoraa.nativeapp.ui.theme.SyncoraColors
import com.syncoraa.nativeapp.util.Formatters
import com.syncoraa.nativeapp.viewmodel.AsyncState

@Composable
fun StockDetailScreen(
    itemId: String,
    historyState: AsyncState<StockHistoryResult>,
    onLoad: (String) -> Unit,
    onOpenVoucher: (String) -> Unit,
    onBack: () -> Unit
) {
    LaunchedEffect(itemId) {
        onLoad(itemId)
    }

    val history = historyState.data
    Scaffold(
        topBar = {
            SyncoraTopBar(
                title = history?.item?.name ?: "Stock Item",
                subtitle = history?.item?.let {
                    listOfNotNull(it.stockGroup, it.hsnCode?.let { h -> "HSN $h" }).joinToString(" · ")
                },
                onBack = onBack
            )
        }
    ) { padding ->
        when {
            historyState.loading && history == null -> Box(Modifier.padding(padding)) {
                LoadingPanel("Loading stock movement...")
            }
            historyState.error != null && history == null -> Box(Modifier.padding(padding)) {
                ErrorPanel(historyState.error) { onLoad(itemId) }
            }
            history != null -> {
                val unit = history.item.effectiveUnit
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    QtyStat("Opening", "${Formatters.formatIndianNumber(history.openingQty, 2)} $unit")
                                    QtyStat("Closing", "${Formatters.formatIndianNumber(history.closingQty, 2)} $unit", alignEnd = true)
                                }
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    QtyStat("Inward", "+${Formatters.formatIndianNumber(history.totalInQty, 2)} $unit", color = SyncoraColors.Emerald)
                                    QtyStat("Outward", "-${Formatters.formatIndianNumber(history.totalOutQty, 2)} $unit", color = SyncoraColors.Rose, alignEnd = true)
                                }
                            }
                        }
                    }

                    item {
                        Text(
                            "Stock Movement (${history.rows.size})",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    if (history.rows.isEmpty()) {
                        item {
                            EmptyPanel(
                                title = "No stock movement vouchers",
                                subtitle = "No inward or outward vouchers recorded for this item yet.",
                                icon = Icons.Default.Inventory2
                            )
                        }
                    } else {
                        items(history.rows, key = { it.id.ifBlank { it.voucherId } }) { row ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onOpenVoucher(row.voucherId) },
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
                                            row.partyName.ifBlank { row.voucherType },
                                            style = MaterialTheme.typography.titleMedium,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Spacer(Modifier.height(4.dp))
                                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            StatusBadge(row.voucherType, voucherTypeColor(row.voucherType))
                                            Text(
                                                "#${row.voucherNumber.ifBlank { "—" }} · ${Formatters.formatDateDisplay(row.voucherDate)}",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                    Spacer(Modifier.width(12.dp))
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text(
                                            "${if (row.isInward) "+" else "-"}${Formatters.formatIndianNumber(row.quantity, 2)} $unit",
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Bold,
                                            color = if (row.isInward) SyncoraColors.Emerald else SyncoraColors.Rose
                                        )
                                        Text(
                                            "Bal: ${Formatters.formatIndianNumber(row.runningStock, 2)} · ${Formatters.formatInr(row.amount)}",
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

@Composable
private fun QtyStat(
    label: String,
    value: String,
    color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurface,
    alignEnd: Boolean = false
) {
    Column(horizontalAlignment = if (alignEnd) Alignment.End else Alignment.Start) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = color)
    }
}
