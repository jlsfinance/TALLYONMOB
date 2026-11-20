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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
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
import com.syncoraa.nativeapp.model.Voucher
import com.syncoraa.nativeapp.ui.components.EmptyPanel
import com.syncoraa.nativeapp.ui.components.ErrorPanel
import com.syncoraa.nativeapp.ui.components.LoadingPanel
import com.syncoraa.nativeapp.ui.components.SearchFieldBar
import com.syncoraa.nativeapp.ui.components.StatusBadge
import com.syncoraa.nativeapp.ui.components.SyncoraTopBar
import com.syncoraa.nativeapp.ui.components.voucherTypeColor
import com.syncoraa.nativeapp.util.Formatters
import com.syncoraa.nativeapp.viewmodel.AsyncState

private val DAYBOOK_TYPES = listOf(
    "All", "Sales", "Purchase", "Receipt", "Payment", "Journal", "Contra", "Credit Note", "Debit Note"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DayBookScreen(
    companyName: String,
    fyLabel: String,
    vouchersState: AsyncState<List<Voucher>>,
    onRefresh: () -> Unit,
    onOpenVoucher: (String) -> Unit,
    onOpenCreateVoucher: () -> Unit
) {
    var query by remember { mutableStateOf("") }
    var selectedType by remember { mutableStateOf("All") }

    val all = vouchersState.data.orEmpty()
    val filtered = remember(all, query, selectedType) {
        val q = query.trim().lowercase()
        all.filter { v ->
            val typeMatch = selectedType == "All" ||
                v.voucherType.equals(selectedType, ignoreCase = true)
            val queryMatch = q.isEmpty() ||
                v.partyName.orEmpty().lowercase().contains(q) ||
                v.voucherNumber.orEmpty().lowercase().contains(q) ||
                v.narration.orEmpty().lowercase().contains(q)
            typeMatch && queryMatch
        }
    }
    val totalValue = remember(filtered) { filtered.sumOf { it.effectiveAmount } }

    Scaffold(
        topBar = {
            SyncoraTopBar(
                title = "Day Book",
                subtitle = "$companyName · $fyLabel"
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onOpenCreateVoucher,
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            ) {
                Icon(Icons.Default.Add, contentDescription = "Create Voucher")
            }
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
                placeholder = "Search party, voucher no, or narration...",
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                DAYBOOK_TYPES.forEach { t ->
                    FilterChip(
                        selected = selectedType == t,
                        onClick = { selectedType = t },
                        label = { Text(t) }
                    )
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
                        "${filtered.size} vouchers",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        "Total: ${Formatters.formatInr(totalValue)}",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            when {
                vouchersState.loading && all.isEmpty() -> LoadingPanel("Loading Day Book...")
                vouchersState.error != null && all.isEmpty() -> ErrorPanel(vouchersState.error, onRetry = onRefresh)
                else -> {
                    PullToRefreshBox(
                        isRefreshing = vouchersState.loading,
                        onRefresh = onRefresh,
                        modifier = Modifier.fillMaxSize()
                    ) {
                        if (filtered.isEmpty()) {
                            EmptyPanel(
                                title = "No vouchers found",
                                subtitle = "Adjust filters or tap + to queue a new voucher.",
                                icon = Icons.Default.ReceiptLong
                            )
                        } else {
                            LazyColumn(
                                contentPadding = PaddingValues(16.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                items(filtered, key = { it.id }) { v ->
                                    Card(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable { onOpenVoucher(v.id) },
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
                                                    text = v.partyName?.takeIf { it.isNotBlank() } ?: v.voucherType,
                                                    style = MaterialTheme.typography.titleMedium,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                                Spacer(Modifier.height(4.dp))
                                                Row(
                                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    StatusBadge(v.voucherType, voucherTypeColor(v.voucherType))
                                                    Text(
                                                        text = "#${v.voucherNumber ?: "—"} · ${Formatters.formatDateDisplay(v.voucherDate)}",
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                }
                                            }
                                            Spacer(Modifier.width(10.dp))
                                            Text(
                                                text = Formatters.formatInr(v.effectiveAmount),
                                                style = MaterialTheme.typography.titleMedium,
                                                fontWeight = FontWeight.Bold
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
