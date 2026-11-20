package com.syncoraa.nativeapp.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.syncoraa.nativeapp.model.Company
import com.syncoraa.nativeapp.model.Ledger
import com.syncoraa.nativeapp.ui.components.EmptyPanel
import com.syncoraa.nativeapp.ui.components.ErrorPanel
import com.syncoraa.nativeapp.ui.components.FinancialYearChipRow
import com.syncoraa.nativeapp.ui.components.LoadingPanel
import com.syncoraa.nativeapp.ui.components.StatusBadge
import com.syncoraa.nativeapp.ui.components.SyncoraTopBar
import com.syncoraa.nativeapp.ui.components.voucherTypeColor
import com.syncoraa.nativeapp.ui.theme.SyncoraColors
import com.syncoraa.nativeapp.util.FinancialYearOption
import com.syncoraa.nativeapp.util.Formatters
import com.syncoraa.nativeapp.util.LedgerPeriodResult
import com.syncoraa.nativeapp.util.PdfExporter
import com.syncoraa.nativeapp.viewmodel.AsyncState

@Composable
fun LedgerDetailScreen(
    ledgerId: String,
    company: Company?,
    ledger: Ledger?,
    fyOptions: List<FinancialYearOption>,
    initialFy: FinancialYearOption,
    statementState: AsyncState<LedgerPeriodResult>,
    onLoadStatement: (String, String, String) -> Unit,
    onOpenVoucher: (String) -> Unit,
    onBack: () -> Unit,
    onNotify: (String) -> Unit
) {
    val context = LocalContext.current
    var activeFy by remember { mutableStateOf(initialFy) }

    LaunchedEffect(ledgerId, activeFy) {
        onLoadStatement(ledgerId, activeFy.fromDate, activeFy.toDate)
    }

    val result = statementState.data
    Scaffold(
        topBar = {
            SyncoraTopBar(
                title = ledger?.name ?: "Ledger Statement",
                subtitle = ledger?.effectiveGroup,
                onBack = onBack,
                actions = {
                    if (ledger != null && result != null) {
                        IconButton(onClick = {
                            runCatching {
                                val file = PdfExporter.exportLedgerStatementPdf(
                                    context,
                                    company,
                                    ledger,
                                    activeFy.label,
                                    result
                                )
                                PdfExporter.sharePdf(context, file, "Statement - ${ledger.name}")
                            }.onFailure {
                                onNotify("PDF export failed: ${it.message}")
                            }
                        }) {
                            Icon(Icons.Default.PictureAsPdf, contentDescription = "Share Statement PDF")
                        }
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
            FinancialYearChipRow(
                options = fyOptions,
                selected = activeFy,
                onSelect = { activeFy = it },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
            )

            when {
                statementState.loading && result == null -> LoadingPanel("Computing ledger statement...")
                statementState.error != null && result == null -> ErrorPanel(statementState.error) {
                    onLoadStatement(ledgerId, activeFy.fromDate, activeFy.toDate)
                }
                result != null -> {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        if (ledger != null && (!ledger.phone.isNullOrBlank() || !ledger.email.isNullOrBlank() || !ledger.gstin.isNullOrBlank())) {
                            item {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    ledger.phone?.takeIf { it.isNotBlank() }?.let { phone ->
                                        AssistChip(
                                            onClick = {
                                                context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")))
                                            },
                                            label = { Text(phone) },
                                            leadingIcon = { Icon(Icons.Default.Call, contentDescription = null, Modifier.size(16.dp)) }
                                        )
                                    }
                                    ledger.email?.takeIf { it.isNotBlank() }?.let { email ->
                                        AssistChip(
                                            onClick = {
                                                context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$email")))
                                            },
                                            label = { Text(email, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                                            leadingIcon = { Icon(Icons.Default.Email, contentDescription = null, Modifier.size(16.dp)) }
                                        )
                                    }
                                }
                            }
                        }

                        item {
                            val (openStr, openDr) = Formatters.formatDrCrBalance(result.opening)
                            val (closeStr, closeDr) = Formatters.formatDrCrBalance(result.closing)
                            Card(
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                            ) {
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        SummaryMetric("Opening Balance", openStr, if (openDr) SyncoraColors.Emerald else SyncoraColors.Rose)
                                        SummaryMetric("Closing Balance", closeStr, if (closeDr) SyncoraColors.Emerald else SyncoraColors.Rose, alignEnd = true)
                                    }
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        SummaryMetric("Total Debit", Formatters.formatInr(result.debitTotal), SyncoraColors.Emerald)
                                        SummaryMetric("Total Credit", Formatters.formatInr(result.creditTotal), SyncoraColors.Rose, alignEnd = true)
                                    }
                                    if (result.masterMismatch || !result.openingVerified) {
                                        Surface(
                                            color = SyncoraColors.Amber.copy(alpha = 0.14f),
                                            shape = MaterialTheme.shapes.small
                                        ) {
                                            Text(
                                                text = if (result.masterMismatch) {
                                                    "Computed running balance differs slightly from Tally master closing — run a full sync if vouchers were edited."
                                                } else {
                                                    "Some older vouchers have incomplete ledger breakdown."
                                                },
                                                style = MaterialTheme.typography.bodySmall,
                                                color = SyncoraColors.Amber,
                                                modifier = Modifier.padding(10.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        item {
                            Text(
                                "Transactions (${result.transactions.size})",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        if (result.transactions.isEmpty()) {
                            item {
                                EmptyPanel(
                                    title = "No transactions in ${activeFy.label}",
                                    subtitle = "Switch period to All Time or another FY to view entries.",
                                    icon = Icons.Default.ReceiptLong
                                )
                            }
                        } else {
                            items(result.transactions.reversed(), key = { it.voucher.id }) { tx ->
                                val v = tx.voucher
                                val (runStr, runDr) = Formatters.formatDrCrBalance(tx.runningBalance)
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
                                            Row(
                                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                StatusBadge(v.voucherType, voucherTypeColor(v.voucherType))
                                                Text(
                                                    "#${v.voucherNumber ?: "—"}",
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                            }
                                            Spacer(Modifier.height(4.dp))
                                            Text(
                                                Formatters.formatDateDisplay(v.voucherDate),
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                            v.narration?.takeIf { it.isNotBlank() }?.let {
                                                Text(
                                                    it,
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                            }
                                        }
                                        Spacer(Modifier.width(12.dp))
                                        Column(horizontalAlignment = Alignment.End) {
                                            if (tx.ledgerDebit > 0) {
                                                Text(
                                                    "+${Formatters.formatInr(tx.ledgerDebit)} Dr",
                                                    style = MaterialTheme.typography.titleMedium,
                                                    color = SyncoraColors.Emerald,
                                                    fontWeight = FontWeight.Bold
                                                )
                                            } else if (tx.ledgerCredit > 0) {
                                                Text(
                                                    "-${Formatters.formatInr(tx.ledgerCredit)} Cr",
                                                    style = MaterialTheme.typography.titleMedium,
                                                    color = SyncoraColors.Rose,
                                                    fontWeight = FontWeight.Bold
                                                )
                                            }
                                            Text(
                                                "Bal: $runStr",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = if (runDr) MaterialTheme.colorScheme.onSurfaceVariant else SyncoraColors.Rose
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

@Composable
private fun SummaryMetric(
    label: String,
    value: String,
    color: androidx.compose.ui.graphics.Color,
    alignEnd: Boolean = false
) {
    Column(horizontalAlignment = if (alignEnd) Alignment.End else Alignment.Start) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(2.dp))
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = color)
    }
}
