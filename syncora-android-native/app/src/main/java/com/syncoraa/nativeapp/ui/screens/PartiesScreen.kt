package com.syncoraa.nativeapp.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.SwapVert
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import com.syncoraa.nativeapp.model.Ledger
import com.syncoraa.nativeapp.ui.components.EmptyPanel
import com.syncoraa.nativeapp.ui.components.ErrorPanel
import com.syncoraa.nativeapp.ui.components.LoadingPanel
import com.syncoraa.nativeapp.ui.components.SearchFieldBar
import com.syncoraa.nativeapp.ui.components.SyncoraTopBar
import com.syncoraa.nativeapp.ui.theme.SyncoraColors
import com.syncoraa.nativeapp.util.Formatters
import com.syncoraa.nativeapp.viewmodel.AsyncState
import kotlin.math.abs

private enum class LedgerGroupFilter(val label: String) {
    ALL("All"),
    DEBTORS("Debtors"),
    CREDITORS("Creditors"),
    BANKS("Banks / Cash")
}

private enum class LedgerSortMode(val label: String) {
    NAME_ASC("Name"),
    BALANCE_DESC("Highest Balance")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PartiesScreen(
    companyName: String,
    ledgersState: AsyncState<List<Ledger>>,
    onRefresh: () -> Unit,
    onOpenLedger: (Ledger) -> Unit
) {
    var query by remember { mutableStateOf("") }
    var groupFilter by remember { mutableStateOf(LedgerGroupFilter.ALL) }
    var sortMode by remember { mutableStateOf(LedgerSortMode.NAME_ASC) }

    val all = ledgersState.data.orEmpty()
    val filtered = remember(all, query, groupFilter, sortMode) {
        val q = query.trim().lowercase()
        val byGroup = all.filter { ledger ->
            val g = ledger.effectiveGroup.lowercase()
            when (groupFilter) {
                LedgerGroupFilter.ALL -> true
                LedgerGroupFilter.DEBTORS -> g.contains("debtor")
                LedgerGroupFilter.CREDITORS -> g.contains("creditor")
                LedgerGroupFilter.BANKS -> g.contains("bank") || g.contains("cash")
            }
        }
        val byQuery = if (q.isEmpty()) byGroup else byGroup.filter {
            it.name.lowercase().contains(q) ||
                it.effectiveGroup.lowercase().contains(q) ||
                it.gstin.orEmpty().lowercase().contains(q)
        }
        when (sortMode) {
            LedgerSortMode.NAME_ASC -> byQuery.sortedBy { it.name.lowercase() }
            LedgerSortMode.BALANCE_DESC -> byQuery.sortedByDescending { abs(it.effectiveClosingBalance) }
        }
    }

    Scaffold(
        topBar = {
            SyncoraTopBar(
                title = "Parties & Ledgers",
                subtitle = "$companyName · ${filtered.size} shown",
                actions = {
                    IconButton(onClick = {
                        sortMode = if (sortMode == LedgerSortMode.NAME_ASC) {
                            LedgerSortMode.BALANCE_DESC
                        } else {
                            LedgerSortMode.NAME_ASC
                        }
                    }) {
                        Icon(Icons.Default.SwapVert, contentDescription = "Toggle sort (${sortMode.label})")
                    }
                }
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
                placeholder = "Search ledger, group, or GSTIN...",
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                LedgerGroupFilter.entries.forEach { f ->
                    FilterChip(
                        selected = groupFilter == f,
                        onClick = { groupFilter = f },
                        label = { Text(f.label) }
                    )
                }
            }

            when {
                ledgersState.loading && all.isEmpty() -> LoadingPanel("Loading ledgers...")
                ledgersState.error != null && all.isEmpty() -> ErrorPanel(ledgersState.error, onRetry = onRefresh)
                else -> {
                    PullToRefreshBox(
                        isRefreshing = ledgersState.loading,
                        onRefresh = onRefresh,
                        modifier = Modifier.fillMaxSize()
                    ) {
                        if (filtered.isEmpty()) {
                            EmptyPanel(
                                title = "No matching ledgers",
                                subtitle = "Adjust search or group filters.",
                                icon = Icons.Default.People
                            )
                        } else {
                            LazyColumn(
                                contentPadding = PaddingValues(16.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                items(filtered, key = { it.id }) { ledger ->
                                    val (balText, isDebit) = Formatters.formatDrCrBalance(ledger.effectiveClosingBalance)
                                    Card(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable { onOpenLedger(ledger) },
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
                                                    text = ledger.name,
                                                    style = MaterialTheme.typography.titleMedium,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                                Spacer(Modifier.height(2.dp))
                                                Text(
                                                    text = ledger.effectiveGroup,
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                            }
                                            Spacer(Modifier.width(12.dp))
                                            Text(
                                                text = balText,
                                                style = MaterialTheme.typography.titleMedium,
                                                fontWeight = FontWeight.Bold,
                                                color = if (isDebit) SyncoraColors.Emerald else SyncoraColors.Rose
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
