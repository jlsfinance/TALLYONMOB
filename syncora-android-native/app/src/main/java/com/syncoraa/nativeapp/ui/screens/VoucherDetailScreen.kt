package com.syncoraa.nativeapp.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.syncoraa.nativeapp.model.Company
import com.syncoraa.nativeapp.model.Voucher
import com.syncoraa.nativeapp.model.VoucherDetail
import com.syncoraa.nativeapp.ui.components.ErrorPanel
import com.syncoraa.nativeapp.ui.components.LoadingPanel
import com.syncoraa.nativeapp.ui.components.StatusBadge
import com.syncoraa.nativeapp.ui.components.SyncoraTopBar
import com.syncoraa.nativeapp.ui.components.voucherTypeColor
import com.syncoraa.nativeapp.ui.theme.SyncoraColors
import com.syncoraa.nativeapp.util.Formatters
import com.syncoraa.nativeapp.util.PdfExporter
import com.syncoraa.nativeapp.viewmodel.AsyncState
import kotlin.math.abs

@Composable
fun VoucherDetailScreen(
    voucherId: String,
    company: Company?,
    detailState: AsyncState<VoucherDetail>,
    onLoad: (String) -> Unit,
    onDelete: (Voucher) -> Unit,
    onBack: () -> Unit,
    onNotify: (String) -> Unit
) {
    val context = LocalContext.current
    var showDeleteConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(voucherId) {
        onLoad(voucherId)
    }

    val detail = detailState.data
    val voucher = detail?.voucher

    if (showDeleteConfirm && voucher != null) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Delete from Tally?") },
            text = {
                Text("Queue deletion for ${voucher.voucherType} #${voucher.voucherNumber ?: ""}? The desktop connector will delete it from Tally on the next sync.")
            },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteConfirm = false
                    onDelete(voucher)
                }) {
                    Text("Queue Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancel") }
            }
        )
    }

    Scaffold(
        topBar = {
            SyncoraTopBar(
                title = voucher?.let { "${it.voucherType} #${it.voucherNumber ?: "—"}" } ?: "Voucher Details",
                subtitle = voucher?.let { Formatters.formatDateDisplay(it.voucherDate) },
                onBack = onBack,
                actions = {
                    if (detail != null) {
                        IconButton(onClick = {
                            runCatching {
                                val file = PdfExporter.exportVoucherPdf(context, company, detail)
                                PdfExporter.sharePdf(context, file, "${detail.voucher.voucherType} #${detail.voucher.voucherNumber ?: ""}")
                            }.onFailure {
                                onNotify("PDF export failed: ${it.message}")
                            }
                        }) {
                            Icon(Icons.Default.PictureAsPdf, contentDescription = "Share Invoice PDF")
                        }
                        if (!voucher?.guid.isNullOrBlank()) {
                            IconButton(onClick = { showDeleteConfirm = true }) {
                                Icon(
                                    Icons.Default.DeleteOutline,
                                    contentDescription = "Delete from Tally",
                                    tint = MaterialTheme.colorScheme.error
                                )
                            }
                        }
                    }
                }
            )
        }
    ) { padding ->
        when {
            detailState.loading && detail == null -> androidx.compose.foundation.layout.Box(Modifier.padding(padding)) {
                LoadingPanel("Loading voucher details...")
            }
            detailState.error != null && detail == null -> androidx.compose.foundation.layout.Box(Modifier.padding(padding)) {
                ErrorPanel(detailState.error) { onLoad(voucherId) }
            }
            detail != null && voucher != null -> {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Row(
                                    Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    StatusBadge(voucher.voucherType, voucherTypeColor(voucher.voucherType))
                                    StatusBadge(
                                        if (!voucher.guid.isNullOrBlank()) "Synced" else "Pending",
                                        if (!voucher.guid.isNullOrBlank()) SyncoraColors.Emerald else SyncoraColors.Amber
                                    )
                                }
                                Text(
                                    text = voucher.partyName?.takeIf { it.isNotBlank() } ?: "No Party Ledger",
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = Formatters.formatInr(voucher.effectiveAmount),
                                    style = MaterialTheme.typography.headlineSmall,
                                    color = MaterialTheme.colorScheme.primary,
                                    fontWeight = FontWeight.Bold
                                )
                                voucher.narration?.takeIf { it.isNotBlank() }?.let {
                                    Text(
                                        text = "Narration: $it",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }

                    if (detail.stockEntries.isNotEmpty()) {
                        item {
                            Text(
                                "Inventory Items (${detail.stockEntries.size})",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        items(detail.stockEntries, key = { it.id.ifBlank { it.stockItemName + it.amount } }) { item ->
                            Card(
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(14.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(item.stockItemName, style = MaterialTheme.typography.titleMedium)
                                        Text(
                                            "${Formatters.formatIndianNumber(abs(item.quantity ?: 0.0), 2)} ${item.unit.orEmpty()} × ${Formatters.formatInr(abs(item.rate ?: 0.0))}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    Text(
                                        Formatters.formatInr(abs(item.amount ?: 0.0)),
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }

                    if (detail.ledgerEntries.isNotEmpty()) {
                        item {
                            Text(
                                "Ledger Entries (${detail.ledgerEntries.size})",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        item {
                            Card(
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                            ) {
                                Column(modifier = Modifier.padding(14.dp)) {
                                    detail.ledgerEntries.forEachIndexed { idx, entry ->
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(vertical = 8.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text(
                                                entry.ledgerName,
                                                style = MaterialTheme.typography.bodyMedium,
                                                modifier = Modifier.weight(1f)
                                            )
                                            val isDr = entry.isDebit == true
                                            Text(
                                                "${Formatters.formatInr(abs(entry.amount ?: 0.0))} ${if (isDr) "Dr" else "Cr"}",
                                                style = MaterialTheme.typography.bodyMedium,
                                                fontWeight = FontWeight.SemiBold,
                                                color = if (isDr) SyncoraColors.Emerald else SyncoraColors.Rose
                                            )
                                        }
                                        if (idx < detail.ledgerEntries.lastIndex) {
                                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
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
