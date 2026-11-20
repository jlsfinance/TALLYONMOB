package com.syncoraa.nativeapp.ui.screens

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudQueue
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import com.syncoraa.nativeapp.ui.components.EmptyPanel
import com.syncoraa.nativeapp.ui.components.ErrorPanel
import com.syncoraa.nativeapp.ui.components.LoadingPanel
import com.syncoraa.nativeapp.ui.components.StatusBadge
import com.syncoraa.nativeapp.ui.components.SyncoraTopBar
import com.syncoraa.nativeapp.ui.theme.SyncoraColors
import com.syncoraa.nativeapp.util.Formatters
import com.syncoraa.nativeapp.viewmodel.AsyncState
import com.syncoraa.nativeapp.viewmodel.SyncStatusBundle
import kotlinx.serialization.json.jsonPrimitive

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncStatusScreen(
    companyName: String,
    syncState: AsyncState<SyncStatusBundle>,
    onRefresh: () -> Unit,
    onRetryTx: (String) -> Unit,
    onBack: () -> Unit
) {
    var showPushQueue by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        onRefresh()
    }

    val bundle = syncState.data
    Scaffold(
        topBar = {
            SyncoraTopBar(
                title = "Sync Status",
                subtitle = companyName,
                onBack = onBack,
                actions = {
                    IconButton(onClick = onRefresh) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh sync status")
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
            SingleChoiceSegmentedButtonRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp)
            ) {
                SegmentedButton(
                    selected = !showPushQueue,
                    onClick = { showPushQueue = false },
                    shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2)
                ) {
                    Text("Cloud Sync")
                }
                SegmentedButton(
                    selected = showPushQueue,
                    onClick = { showPushQueue = true },
                    shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2)
                ) {
                    val count = bundle?.pendingQueue?.count { it.status == "pending" } ?: 0
                    Text(if (count > 0) "Push Queue ($count)" else "Push Queue")
                }
            }

            when {
                syncState.loading && bundle == null -> LoadingPanel("Loading sync logs...")
                syncState.error != null && bundle == null -> ErrorPanel(syncState.error, onRetry = onRefresh)
                bundle != null -> {
                    PullToRefreshBox(
                        isRefreshing = syncState.loading,
                        onRefresh = onRefresh,
                        modifier = Modifier.fillMaxSize()
                    ) {
                        if (!showPushQueue) {
                            LazyColumn(
                                contentPadding = PaddingValues(16.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                item {
                                    Card(
                                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                                    ) {
                                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Text(
                                                "Last Successful Sync: ${Formatters.formatRelativeTime(bundle.lastSyncAt)}",
                                                style = MaterialTheme.typography.titleMedium,
                                                fontWeight = FontWeight.Bold
                                            )
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween
                                            ) {
                                                SyncCounter("Vouchers", bundle.voucherCount)
                                                SyncCounter("Ledgers", bundle.ledgerCount)
                                                SyncCounter("Stock Items", bundle.stockCount)
                                            }
                                        }
                                    }
                                }
                                item {
                                    Text(
                                        "Recent Connector Cycles (${bundle.history.size})",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                if (bundle.history.isEmpty()) {
                                    item {
                                        EmptyPanel(
                                            title = "No sync history yet",
                                            subtitle = "Run the PC connector to see sync logs.",
                                            icon = Icons.Default.CloudDone
                                        )
                                    }
                                } else {
                                    items(bundle.history, key = { it.id }) { row ->
                                        val color = when (row.status.lowercase()) {
                                            "completed", "success", "successful" -> SyncoraColors.Emerald
                                            "failed" -> SyncoraColors.Rose
                                            "partial" -> SyncoraColors.Amber
                                            else -> SyncoraColors.Blue
                                        }
                                        Card(
                                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                                        ) {
                                            Column(modifier = Modifier.padding(14.dp)) {
                                                Row(
                                                    modifier = Modifier.fillMaxWidth(),
                                                    horizontalArrangement = Arrangement.SpaceBetween,
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Text(
                                                        (row.syncType ?: "sync").uppercase(),
                                                        style = MaterialTheme.typography.titleMedium
                                                    )
                                                    StatusBadge(row.status, color)
                                                }
                                                Spacer(Modifier.height(4.dp))
                                                Text(
                                                    "Started: ${Formatters.formatRelativeTime(row.startedAt)} · Vouchers: ${row.vouchersSynced} · Ledgers: ${row.ledgersSynced}",
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                                row.errorMessage?.takeIf { it.isNotBlank() }?.let { err ->
                                                    Spacer(Modifier.height(4.dp))
                                                    Text(err, style = MaterialTheme.typography.bodySmall, color = SyncoraColors.Rose)
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            if (bundle.pendingQueue.isEmpty()) {
                                Box(Modifier.fillMaxSize()) {
                                    EmptyPanel(
                                        title = "Push queue is empty",
                                        subtitle = "Vouchers created or deleted from mobile appear here.",
                                        icon = Icons.Default.CloudQueue
                                    )
                                }
                            } else {
                                LazyColumn(
                                    contentPadding = PaddingValues(16.dp),
                                    verticalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    items(bundle.pendingQueue, key = { it.id }) { tx ->
                                        val color = when (tx.status.lowercase()) {
                                            "synced" -> SyncoraColors.Emerald
                                            "failed" -> SyncoraColors.Rose
                                            else -> SyncoraColors.Amber
                                        }
                                        val party = tx.voucherData?.get("party_name")?.jsonPrimitive?.content.orEmpty()
                                        val amount = tx.voucherData?.get("grand_total")?.jsonPrimitive?.content
                                            ?: tx.voucherData?.get("amount")?.jsonPrimitive?.content
                                            ?: ""
                                        Card(
                                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                                        ) {
                                            Column(modifier = Modifier.padding(14.dp)) {
                                                Row(
                                                    modifier = Modifier.fillMaxWidth(),
                                                    horizontalArrangement = Arrangement.SpaceBetween,
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Text(
                                                        party.ifBlank { tx.transactionType },
                                                        style = MaterialTheme.typography.titleMedium,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis,
                                                        modifier = Modifier.weight(1f)
                                                    )
                                                    Spacer(Modifier.width(8.dp))
                                                    StatusBadge(tx.status.uppercase(), color)
                                                }
                                                Spacer(Modifier.height(4.dp))
                                                Text(
                                                    "${tx.transactionType} · ${if (amount.isNotBlank()) Formatters.formatInr(amount.toDoubleOrNull() ?: 0.0) else "—"} · ${Formatters.formatRelativeTime(tx.createdAt)}",
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                                tx.tallyVoucherNumber?.takeIf { it.isNotBlank() }?.let { vno ->
                                                    Text("Tally Voucher #: $vno", style = MaterialTheme.typography.bodySmall, color = SyncoraColors.Emerald)
                                                }
                                                tx.errorMessage?.takeIf { it.isNotBlank() }?.let { err ->
                                                    Spacer(Modifier.height(4.dp))
                                                    Text(err, style = MaterialTheme.typography.bodySmall, color = SyncoraColors.Rose)
                                                }
                                                if (tx.status.equals("failed", ignoreCase = true)) {
                                                    Spacer(Modifier.height(8.dp))
                                                    OutlinedButton(onClick = { onRetryTx(tx.id) }) {
                                                        Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                                                        Spacer(Modifier.width(6.dp))
                                                        Text("Retry Sync")
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
}

@Composable
private fun SyncCounter(label: String, value: Int) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value.toString(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
