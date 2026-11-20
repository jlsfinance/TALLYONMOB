package com.syncoraa.nativeapp.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.syncoraa.nativeapp.model.Ledger
import com.syncoraa.nativeapp.model.StockItem
import com.syncoraa.nativeapp.ui.components.LedgerPickerSheet
import com.syncoraa.nativeapp.ui.components.StockItemPickerSheet
import com.syncoraa.nativeapp.ui.components.SyncoraTopBar
import com.syncoraa.nativeapp.ui.theme.SyncoraColors
import com.syncoraa.nativeapp.util.Formatters
import com.syncoraa.nativeapp.viewmodel.AppViewModel.DraftLedgerLine
import com.syncoraa.nativeapp.viewmodel.AppViewModel.DraftStockLine
import java.time.LocalDate
import kotlin.math.abs

private val ENTRY_VOUCHER_TYPES = listOf(
    "Sales", "Purchase", "Receipt", "Payment", "Journal", "Contra", "Credit Note", "Debit Note"
)

private data class EditableStockLine(
    val itemName: String,
    val unit: String,
    val qtyText: String,
    val rateText: String,
    val gstText: String
)

private data class EditableLedgerLine(
    val ledgerName: String,
    val amountText: String,
    val isDebit: Boolean
)

private enum class PickerTarget {
    NONE, PARTY, CASH_BANK, PURCHASE_LEDGER, STOCK_ITEM, JOURNAL_LEDGER
}

@Composable
fun CreateVoucherScreen(
    companyName: String,
    ledgers: List<Ledger>,
    stockItems: List<StockItem>,
    submitting: Boolean,
    onSubmit: (
        voucherType: String,
        voucherDate: String,
        voucherNumber: String,
        partyName: String,
        narration: String,
        cashBankLedger: String,
        purchaseLedger: String,
        moneyAmount: Double,
        isIgst: Boolean,
        stockLines: List<DraftStockLine>,
        ledgerLines: List<DraftLedgerLine>
    ) -> Unit,
    onNotify: (String) -> Unit,
    onBack: () -> Unit
) {
    var voucherType by remember { mutableStateOf("Sales") }
    var voucherDate by remember { mutableStateOf(LocalDate.now().toString()) }
    var voucherNumber by remember { mutableStateOf("") }
    var partyName by remember { mutableStateOf("") }
    var cashBankLedger by remember { mutableStateOf("") }
    var purchaseLedger by remember { mutableStateOf("") }
    var moneyAmountText by remember { mutableStateOf("") }
    var narration by remember { mutableStateOf("") }
    var isIgst by remember { mutableStateOf(false) }

    val stockLines = remember { mutableStateListOf<EditableStockLine>() }
    val ledgerLines = remember {
        mutableStateListOf(
            EditableLedgerLine("", "", true),
            EditableLedgerLine("", "", false)
        )
    }

    var pickerTarget by remember { mutableStateOf(PickerTarget.NONE) }
    var editingLedgerLineIndex by remember { mutableStateOf(0) }

    val isMoneyVoucher = voucherType == "Receipt" || voucherType == "Payment"
    val isLedgerVoucher = voucherType == "Journal" || voucherType == "Contra"
    val isItemVoucher = !isMoneyVoucher && !isLedgerVoucher

    val cashBankLedgers = remember(ledgers) {
        ledgers.filter {
            val g = it.effectiveGroup.lowercase()
            g.contains("cash") || g.contains("bank")
        }.ifEmpty { ledgers }
    }
    val purchaseLedgers = remember(ledgers) {
        ledgers.filter { it.effectiveGroup.lowercase().contains("purchase") }.ifEmpty { ledgers }
    }
    val partyLedgers = remember(ledgers, voucherType) {
        val preferred = when (voucherType) {
            "Sales", "Receipt", "Credit Note" -> ledgers.filter {
                val g = it.effectiveGroup.lowercase()
                g.contains("debtor") || g.contains("creditor") || g.contains("cash")
            }
            "Purchase", "Payment", "Debit Note" -> ledgers.filter {
                val g = it.effectiveGroup.lowercase()
                g.contains("creditor") || g.contains("debtor") || g.contains("cash")
            }
            else -> ledgers
        }
        preferred.ifEmpty { ledgers }
    }

    val taxableTotal = stockLines.sumOf {
        (it.qtyText.toDoubleOrNull() ?: 0.0) * (it.rateText.toDoubleOrNull() ?: 0.0)
    }
    val gstTotal = stockLines.sumOf {
        val taxable = (it.qtyText.toDoubleOrNull() ?: 0.0) * (it.rateText.toDoubleOrNull() ?: 0.0)
        taxable * ((it.gstText.toDoubleOrNull() ?: 0.0) / 100.0)
    }
    val grandTotal = when {
        isMoneyVoucher -> moneyAmountText.toDoubleOrNull() ?: 0.0
        isLedgerVoucher -> ledgerLines.filter { it.isDebit }.sumOf { it.amountText.toDoubleOrNull() ?: 0.0 }
        else -> taxableTotal + gstTotal
    }

    if (pickerTarget == PickerTarget.PARTY) {
        LedgerPickerSheet(
            title = "Select Party Ledger",
            ledgers = partyLedgers,
            onSelect = { partyName = it.name; pickerTarget = PickerTarget.NONE },
            onDismiss = { pickerTarget = PickerTarget.NONE }
        )
    } else if (pickerTarget == PickerTarget.CASH_BANK) {
        LedgerPickerSheet(
            title = "Select Cash / Bank Ledger",
            ledgers = cashBankLedgers,
            onSelect = { cashBankLedger = it.name; pickerTarget = PickerTarget.NONE },
            onDismiss = { pickerTarget = PickerTarget.NONE }
        )
    } else if (pickerTarget == PickerTarget.PURCHASE_LEDGER) {
        LedgerPickerSheet(
            title = "Select Purchase Ledger",
            ledgers = purchaseLedgers,
            onSelect = { purchaseLedger = it.name; pickerTarget = PickerTarget.NONE },
            onDismiss = { pickerTarget = PickerTarget.NONE }
        )
    } else if (pickerTarget == PickerTarget.JOURNAL_LEDGER) {
        LedgerPickerSheet(
            title = "Select Ledger",
            ledgers = ledgers,
            onSelect = { chosen ->
                val cur = ledgerLines[editingLedgerLineIndex]
                ledgerLines[editingLedgerLineIndex] = cur.copy(ledgerName = chosen.name)
                pickerTarget = PickerTarget.NONE
            },
            onDismiss = { pickerTarget = PickerTarget.NONE }
        )
    } else if (pickerTarget == PickerTarget.STOCK_ITEM) {
        StockItemPickerSheet(
            items = stockItems,
            onSelect = { item ->
                stockLines.add(
                    EditableStockLine(
                        itemName = item.name,
                        unit = item.effectiveUnit,
                        qtyText = "1",
                        rateText = if (item.effectiveRate > 0) item.effectiveRate.toString() else "0",
                        gstText = (item.gstRate ?: 0.0).toString()
                    )
                )
                pickerTarget = PickerTarget.NONE
            },
            onDismiss = { pickerTarget = PickerTarget.NONE }
        )
    }

    Scaffold(
        topBar = {
            SyncoraTopBar(
                title = "New Voucher",
                subtitle = "$companyName · Queued to Tally",
                onBack = onBack
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text("Voucher Type", style = MaterialTheme.typography.labelMedium)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                ENTRY_VOUCHER_TYPES.forEach { t ->
                    FilterChip(
                        selected = voucherType == t,
                        onClick = { voucherType = t },
                        label = { Text(t) }
                    )
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = voucherDate,
                    onValueChange = { voucherDate = it },
                    label = { Text("Date (YYYY-MM-DD)") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp)
                )
                OutlinedTextField(
                    value = voucherNumber,
                    onValueChange = { voucherNumber = it },
                    label = { Text("Voucher No (Optional)") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp)
                )
            }

            if (!isLedgerVoucher) {
                SelectorField(
                    label = "Party Ledger *",
                    value = partyName,
                    placeholder = "Tap to select party",
                    onClick = { pickerTarget = PickerTarget.PARTY }
                )
            }

            if (isMoneyVoucher) {
                SelectorField(
                    label = "Cash / Bank Account *",
                    value = cashBankLedger,
                    placeholder = "Tap to select cash or bank ledger",
                    onClick = { pickerTarget = PickerTarget.CASH_BANK }
                )
                OutlinedTextField(
                    value = moneyAmountText,
                    onValueChange = { moneyAmountText = it },
                    label = { Text("Amount (₹) *") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                )
            }

            if (voucherType == "Purchase") {
                SelectorField(
                    label = "Purchase Account *",
                    value = purchaseLedger,
                    placeholder = "Tap to select purchase ledger",
                    onClick = { pickerTarget = PickerTarget.PURCHASE_LEDGER }
                )
            }

            if (isItemVoucher) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Stock Items (${stockLines.size})", style = MaterialTheme.typography.titleMedium)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("IGST", style = MaterialTheme.typography.bodySmall)
                        Spacer(Modifier.width(6.dp))
                        Switch(checked = isIgst, onCheckedChange = { isIgst = it })
                    }
                }

                stockLines.forEachIndexed { index, line ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                    ) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    line.itemName,
                                    style = MaterialTheme.typography.titleMedium,
                                    modifier = Modifier.weight(1f)
                                )
                                IconButton(onClick = { stockLines.removeAt(index) }) {
                                    Icon(Icons.Default.Delete, contentDescription = "Remove item", tint = SyncoraColors.Rose)
                                }
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(
                                    value = line.qtyText,
                                    onValueChange = { stockLines[index] = line.copy(qtyText = it) },
                                    label = { Text("Qty (${line.unit})") },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                    singleLine = true,
                                    modifier = Modifier.weight(1f)
                                )
                                OutlinedTextField(
                                    value = line.rateText,
                                    onValueChange = { stockLines[index] = line.copy(rateText = it) },
                                    label = { Text("Rate") },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                    singleLine = true,
                                    modifier = Modifier.weight(1f)
                                )
                                OutlinedTextField(
                                    value = line.gstText,
                                    onValueChange = { stockLines[index] = line.copy(gstText = it) },
                                    label = { Text("GST %") },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                    singleLine = true,
                                    modifier = Modifier.weight(0.8f)
                                )
                            }
                        }
                    }
                }

                OutlinedButton(
                    onClick = { pickerTarget = PickerTarget.STOCK_ITEM },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text("Add Stock Item")
                }
            }

            if (isLedgerVoucher) {
                Text("Debit & Credit Ledger Lines", style = MaterialTheme.typography.titleMedium)
                ledgerLines.forEachIndexed { index, line ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                    ) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    FilterChip(
                                        selected = line.isDebit,
                                        onClick = { ledgerLines[index] = line.copy(isDebit = true) },
                                        label = { Text("Dr") }
                                    )
                                    FilterChip(
                                        selected = !line.isDebit,
                                        onClick = { ledgerLines[index] = line.copy(isDebit = false) },
                                        label = { Text("Cr") }
                                    )
                                }
                                if (ledgerLines.size > 2) {
                                    IconButton(onClick = { ledgerLines.removeAt(index) }) {
                                        Icon(Icons.Default.Delete, contentDescription = "Remove line", tint = SyncoraColors.Rose)
                                    }
                                }
                            }
                            SelectorField(
                                label = "Ledger *",
                                value = line.ledgerName,
                                placeholder = "Tap to choose ledger",
                                onClick = {
                                    editingLedgerLineIndex = index
                                    pickerTarget = PickerTarget.JOURNAL_LEDGER
                                }
                            )
                            OutlinedTextField(
                                value = line.amountText,
                                onValueChange = { ledgerLines[index] = line.copy(amountText = it) },
                                label = { Text("Amount (₹) *") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }
                }
                OutlinedButton(
                    onClick = { ledgerLines.add(EditableLedgerLine("", "", true)) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text("Add Ledger Line")
                }
            }

            OutlinedTextField(
                value = narration,
                onValueChange = { narration = it },
                label = { Text("Narration") },
                minLines = 2,
                maxLines = 4,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )

            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (isItemVoucher) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Taxable Value", style = MaterialTheme.typography.bodySmall)
                            Text(Formatters.formatInr(taxableTotal), style = MaterialTheme.typography.bodySmall)
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(if (isIgst) "IGST" else "CGST + SGST", style = MaterialTheme.typography.bodySmall)
                            Text(Formatters.formatInr(gstTotal), style = MaterialTheme.typography.bodySmall)
                        }
                        HorizontalDivider(Modifier.padding(vertical = 4.dp))
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Grand Total", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(
                            Formatters.formatInr(grandTotal),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }

            Button(
                onClick = {
                    val dateValid = Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(voucherDate.trim())
                    if (!dateValid) {
                        onNotify("Enter voucher date as YYYY-MM-DD.")
                        return@Button
                    }
                    if (!isLedgerVoucher && partyName.isBlank()) {
                        onNotify("Select a party ledger.")
                        return@Button
                    }
                    if (isMoneyVoucher) {
                        val amt = moneyAmountText.toDoubleOrNull() ?: 0.0
                        if (amt <= 0.0 || cashBankLedger.isBlank()) {
                            onNotify("Enter a valid amount and select Cash/Bank ledger.")
                            return@Button
                        }
                    }
                    if (voucherType == "Purchase" && purchaseLedger.isBlank()) {
                        onNotify("Select a purchase ledger.")
                        return@Button
                    }
                    val draftStock = if (isItemVoucher) {
                        val mapped = stockLines.mapNotNull { line ->
                            val q = line.qtyText.toDoubleOrNull() ?: 0.0
                            val r = line.rateText.toDoubleOrNull() ?: 0.0
                            val g = line.gstText.toDoubleOrNull() ?: 0.0
                            if (line.itemName.isBlank() || q <= 0.0) null
                            else DraftStockLine(line.itemName, q, r, line.unit, g)
                        }
                        if (mapped.isEmpty()) {
                            onNotify("Add at least one stock item with positive quantity.")
                            return@Button
                        }
                        mapped
                    } else emptyList()

                    val draftLedgers = if (isLedgerVoucher) {
                        val mapped = ledgerLines.map { line ->
                            DraftLedgerLine(
                                ledgerName = line.ledgerName,
                                amount = line.amountText.toDoubleOrNull() ?: 0.0,
                                isDebit = line.isDebit
                            )
                        }
                        val dr = mapped.filter { it.isDebit }.sumOf { it.amount }
                        val cr = mapped.filter { !it.isDebit }.sumOf { it.amount }
                        if (mapped.size < 2 || mapped.any { it.ledgerName.isBlank() || it.amount <= 0.0 } || abs(dr - cr) > 0.01) {
                            onNotify("Ensure all ledger lines are filled and Total Dr equals Total Cr.")
                            return@Button
                        }
                        mapped
                    } else emptyList()

                    onSubmit(
                        voucherType,
                        voucherDate.trim(),
                        voucherNumber.trim(),
                        partyName.trim(),
                        narration.trim(),
                        cashBankLedger.trim(),
                        purchaseLedger.trim(),
                        moneyAmountText.toDoubleOrNull() ?: 0.0,
                        isIgst,
                        draftStock,
                        draftLedgers
                    )
                },
                enabled = !submitting,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                shape = RoundedCornerShape(12.dp)
            ) {
                if (submitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                    Spacer(Modifier.width(8.dp))
                }
                Text("Queue $voucherType for Tally")
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun SelectorField(
    label: String,
    value: String,
    placeholder: String,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(3.dp))
            Text(
                text = value.ifBlank { placeholder },
                style = MaterialTheme.typography.bodyLarge,
                color = if (value.isBlank()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface
            )
        }
    }
}
