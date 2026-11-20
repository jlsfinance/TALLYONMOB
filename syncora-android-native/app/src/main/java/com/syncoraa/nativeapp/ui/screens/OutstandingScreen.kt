package com.syncoraa.nativeapp.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.syncoraa.nativeapp.model.OutstandingBill
import com.syncoraa.nativeapp.ui.components.EmptyPanel
import com.syncoraa.nativeapp.ui.components.ErrorPanel
import com.syncoraa.nativeapp.ui.components.LoadingPanel
import com.syncoraa.nativeapp.ui.components.SearchFieldBar
import com.syncoraa.nativeapp.ui.components.SyncoraTopBar
import com.syncoraa.nativeapp.ui.theme.SyncoraColors
import com.syncoraa.nativeapp.util.Formatters
import com.syncoraa.nativeapp.viewmodel.AsyncState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OutstandingScreen(
    companyName: String,
    outstandingsState: AsyncState<List<OutstandingBill>>,
    onRefresh: () -> Unit,
    onOpenParty: (String) -> Unit,
    onBack: () -> Unit
) {
    var showReceivables by remember { mutableStateOf(true) }
    var query by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        if (outstandingsState.data == null && !outstandingsState.loading) {
            onRefresh()
        }
    }

    val all = outstandingsState.data.orEmpty()
    val filtered = remember(all, showReceivables, query) {
        val q = query.trim().lowercase()
        all.filter { bill ->
            val dirMatch = bill.isReceivable == showReceivables
            val queryMatch = q.isEmpty() || bill.ledgerName.lowercase().contains(q)
            dirMatch && queryMatch
        }
    }
    val totalAmount = remember(filtered) { filtered.sumOf { it.effectiveAmount } }

    Scaffold(
        topBar = {
            SyncoraTopBar(
                title = "Outstanding Bills",
                subtitle = companyName,
                onBack = onBack
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            SingleChoiceSegmentedButtonRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp)
            ) {
                SegmentedButton(
                    selected = showReceivables,
                    onClick = { showReceivables = true },
                    shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2)
                ) {
                    Text("Receivables")
                }
                SegmentedButton(
                    selected = !showReceivables,
                    onClick = { showReceivables = false },
                    shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2)
                ) {
                    Text("Payables")
                }
            }

            SearchFieldBar(
                query = query,
                onQueryChange = { query = it },
                placeholder = "Search party name...",
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
            )

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        if (showReceivables) "Total Receivable (${filtered.size})" else "Total Payable (${filtered.size})",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Text(
                        Formatters.formatInr(totalAmount),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = if (showReceivables) SyncoraColors.Emerald else SyncoraColors.Rose
                    )
                }
            }

            when {
                outstandingsState.loading && all.isEmpty() -> LoadingPanel("Loading outstanding balances...")
                outstandingsState.error != null && all.isEmpty() -> ErrorPanel(outstandingsState.error, onRetry = onRefresh)
                else -> {
                    PullToRefreshBox(
                        isRefreshing = outstandingsState.loading,
                        onRefresh = onRefresh,
                        modifier = Modifier.fillMaxSize()
                    ) {
                        if (filtered.isEmpty()) {
                            EmptyPanel(
                                title = if (showReceivables) "No receivables pending" else "No payables pending",
                                subtitle = "All balances in this category are settled.",
                                icon = Icons.Default.AccountBalanceWallet
                            )
                        } else {
                            LazyColumn(
                                contentPadding = PaddingValues(16.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                items(filtered, key = { it.id.ifBlank { it.ledgerName + it.direction } }) { bill ->
                                    Card(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable { onOpenParty(bill.ledgerName) },
                                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(14.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text(
                                                text = bill.ledgerName,
                                                style = MaterialTheme.typography.titleMedium,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                                modifier = Modifier.weight(1f)
                                            )
                                            Spacer(Modifier.width(12.dp))
                                            Text(
                                                text = Formatters.formatInr(bill.effectiveAmount),
                                                style = MaterialTheme.typography.titleMedium,
                                                fontWeight = FontWeight.Bold,
                                                color = if (showReceivables) SyncoraColors.Emerald else SyncoraColors.Rose
                                            )
                                            Spacer(Modifier.width(4.dp))
                                            Icon(
                                                Icons.Default.ChevronRight,
                                                contentDescription = null,
                                                tint = MaterialTheme.colorScheme.onSurfaceVariant
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
