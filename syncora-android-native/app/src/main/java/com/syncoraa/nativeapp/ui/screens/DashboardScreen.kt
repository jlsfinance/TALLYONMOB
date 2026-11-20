package com.syncoraa.nativeapp.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.CloudSync
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.syncoraa.nativeapp.model.Company
import com.syncoraa.nativeapp.model.DashboardSummary
import com.syncoraa.nativeapp.model.LicenseInfo
import com.syncoraa.nativeapp.model.MonthlyBarPoint
import com.syncoraa.nativeapp.ui.components.EmptyPanel
import com.syncoraa.nativeapp.ui.components.ErrorPanel
import com.syncoraa.nativeapp.ui.components.FinancialYearChipRow
import com.syncoraa.nativeapp.ui.components.KpiCard
import com.syncoraa.nativeapp.ui.components.LoadingPanel
import com.syncoraa.nativeapp.ui.components.StatusBadge
import com.syncoraa.nativeapp.ui.components.SyncoraTopBar
import com.syncoraa.nativeapp.ui.components.voucherTypeColor
import com.syncoraa.nativeapp.ui.theme.SyncoraColors
import com.syncoraa.nativeapp.util.FinancialYearOption
import com.syncoraa.nativeapp.util.Formatters
import com.syncoraa.nativeapp.viewmodel.AsyncState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    company: Company,
    license: LicenseInfo?,
    fyOptions: List<FinancialYearOption>,
    selectedFy: FinancialYearOption,
    dashboardState: AsyncState<DashboardSummary>,
    onSelectFy: (FinancialYearOption) -> Unit,
    onRefresh: () -> Unit,
    onSwitchCompany: () -> Unit,
    onOpenCreateVoucher: () -> Unit,
    onOpenOutstandings: () -> Unit,
    onOpenSyncStatus: () -> Unit,
    onOpenVoucher: (String) -> Unit
) {
    Scaffold(
        topBar = {
            SyncoraTopBar(
                title = company.name,
                subtitle = "Last sync: ${Formatters.formatRelativeTime(dashboardState.data?.lastSyncAt ?: company.lastSyncAt)}",
                actions = {
                    license?.let {
                        val color = if (it.isActiveOrTrial) SyncoraColors.Emerald else SyncoraColors.Amber
                        StatusBadge(
                            text = if (it.status == "trial") "Trial ${it.daysLeft}d" else it.planName,
                            color = color,
                            modifier = Modifier.padding(end = 12.dp)
                        )
                    }
                }
            )
        }
    ) { padding ->
        val summary = dashboardState.data
        when {
            dashboardState.loading && summary == null -> Box(Modifier.padding(padding)) {
                LoadingPanel("Loading business overview...")
            }
            dashboardState.error != null && summary == null -> Box(Modifier.padding(padding)) {
                ErrorPanel(dashboardState.error, onRetry = onRefresh)
            }
            else -> {
                PullToRefreshBox(
                    isRefreshing = dashboardState.loading,
                    onRefresh = onRefresh,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                ) {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        item {
                            FinancialYearChipRow(
                                options = fyOptions,
                                selected = selectedFy,
                                onSelect = onSelectFy
                            )
                        }

                        if (summary != null) {
                            if (summary.pendingQueueCount > 0) {
                                item {
                                    Card(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable { onOpenSyncStatus() },
                                        colors = CardDefaults.cardColors(
                                            containerColor = SyncoraColors.Amber.copy(alpha = 0.14f)
                                        ),
                                        border = BorderStroke(1.dp, SyncoraColors.Amber.copy(alpha = 0.4f))
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(14.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Icon(
                                                Icons.Default.CloudSync,
                                                contentDescription = null,
                                                tint = SyncoraColors.Amber
                                            )
                                            Spacer(Modifier.width(10.dp))
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(
                                                    "${summary.pendingQueueCount} voucher(s) waiting for Tally sync",
                                                    style = MaterialTheme.typography.titleMedium,
                                                    color = MaterialTheme.colorScheme.onSurface
                                                )
                                                Text(
                                                    "Tap to check Tally Push Queue",
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                            }
                                        }
                                    }
                                }
                            }

                            item {
                                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        KpiCard(
                                            title = "Sales",
                                            value = Formatters.formatCompactInr(summary.totalSales),
                                            subtitle = selectedFy.label,
                                            accent = SyncoraColors.Emerald,
                                            icon = Icons.Default.TrendingUp,
                                            modifier = Modifier.weight(1f)
                                        )
                                        KpiCard(
                                            title = "Purchase",
                                            value = Formatters.formatCompactInr(summary.totalPurchases),
                                            subtitle = selectedFy.label,
                                            accent = SyncoraColors.Blue,
                                            icon = Icons.Default.ShoppingCart,
                                            modifier = Modifier.weight(1f)
                                        )
                                    }
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        KpiCard(
                                            title = "Receivables",
                                            value = Formatters.formatCompactInr(summary.totalReceivables),
                                            subtitle = "Debtors to collect",
                                            accent = Color(0xFF14B8A6),
                                            icon = Icons.Default.ArrowDownward,
                                            modifier = Modifier.weight(1f),
                                            onClick = onOpenOutstandings
                                        )
                                        KpiCard(
                                            title = "Payables",
                                            value = Formatters.formatCompactInr(summary.totalPayables),
                                            subtitle = "Creditors to pay",
                                            accent = SyncoraColors.Rose,
                                            icon = Icons.Default.ArrowUpward,
                                            modifier = Modifier.weight(1f),
                                            onClick = onOpenOutstandings
                                        )
                                    }
                                }
                            }

                            item {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    QuickActionChip("New Voucher", Icons.Default.Add, onOpenCreateVoucher)
                                    QuickActionChip("Outstanding", Icons.Default.AccountBalanceWallet, onOpenOutstandings)
                                    QuickActionChip("Sync Queue", Icons.Default.CloudSync, onOpenSyncStatus)
                                    QuickActionChip("Companies", Icons.Default.Business, onSwitchCompany)
                                }
                            }

                            item {
                                Card(
                                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(14.dp),
                                        horizontalArrangement = Arrangement.SpaceEvenly
                                    ) {
                                        CountPill("Ledgers", summary.ledgerCount)
                                        CountPill("Vouchers", summary.voucherCount)
                                        CountPill("Stock Items", summary.stockCount)
                                        CountPill("Receipts", 0, customText = Formatters.formatCompactInr(summary.totalReceipts))
                                    }
                                }
                            }

                            if (summary.monthlySeries.isNotEmpty()) {
                                item {
                                    MonthlySalesPurchaseChart(points = summary.monthlySeries)
                                }
                            }

                            item {
                                Text(
                                    text = "Recent Vouchers",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold
                                )
                            }

                            if (summary.recentVouchers.isEmpty()) {
                                item {
                                    EmptyPanel(
                                        title = "No vouchers in ${selectedFy.label}",
                                        subtitle = "Try switching financial year or create a new voucher.",
                                        icon = Icons.Default.ReceiptLong
                                    )
                                }
                            } else {
                                items(summary.recentVouchers, key = { it.id }) { v ->
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

@Composable
private fun QuickActionChip(label: String, icon: ImageVector, onClick: () -> Unit) {
    AssistChip(
        onClick = onClick,
        label = { Text(label) },
        leadingIcon = { Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp)) }
    )
}

@Composable
private fun CountPill(label: String, count: Int, customText: String? = null) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = customText ?: count.toString(),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun MonthlySalesPurchaseChart(points: List<MonthlyBarPoint>) {
    val maxVal = points.maxOfOrNull { maxOf(it.sales, it.purchases) }?.takeIf { it > 0.0 } ?: 1.0
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Monthly Trend", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    LegendDot("Sales", SyncoraColors.Emerald)
                    LegendDot("Purchase", SyncoraColors.Blue)
                }
            }
            Spacer(Modifier.height(14.dp))
            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(140.dp)
            ) {
                val groupCount = points.size.coerceAtLeast(1)
                val groupWidth = size.width / groupCount
                val barWidth = (groupWidth * 0.28f).coerceIn(10f, 34f)
                val gap = 6f
                points.forEachIndexed { idx, p ->
                    val centerX = groupWidth * idx + groupWidth / 2f
                    val salesHeight = ((p.sales / maxVal) * (size.height - 12f)).toFloat().coerceAtLeast(4f)
                    val purchHeight = ((p.purchases / maxVal) * (size.height - 12f)).toFloat().coerceAtLeast(4f)

                    drawRoundRect(
                        color = SyncoraColors.Emerald,
                        topLeft = Offset(centerX - barWidth - gap / 2f, size.height - salesHeight),
                        size = Size(barWidth, salesHeight),
                        cornerRadius = CornerRadius(6f, 6f)
                    )
                    drawRoundRect(
                        color = SyncoraColors.Blue,
                        topLeft = Offset(centerX + gap / 2f, size.height - purchHeight),
                        size = Size(barWidth, purchHeight),
                        cornerRadius = CornerRadius(6f, 6f)
                    )
                }
            }
            Spacer(Modifier.height(6.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceAround) {
                points.forEach { p ->
                    Text(
                        text = p.label,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun LegendDot(label: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Surface(modifier = Modifier.size(8.dp), shape = RoundedCornerShape(4.dp), color = color) {}
        Spacer(Modifier.width(5.dp))
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
