package com.syncoraa.nativeapp.util

import com.syncoraa.nativeapp.model.Voucher
import com.syncoraa.nativeapp.model.VoucherLedgerEntry
import kotlin.math.abs
import kotlin.math.roundToLong

data class LedgerPeriodTransaction(
    val voucher: Voucher,
    val ledgerDebit: Double,
    val ledgerCredit: Double,
    val runningBalance: Double,
    val entries: List<VoucherLedgerEntry>
)

data class LedgerPeriodResult(
    val opening: Double,
    val openingVerified: Boolean,
    val debitTotal: Double,
    val creditTotal: Double,
    val closing: Double,
    val transactions: List<LedgerPeriodTransaction>,
    val unknownVouchers: List<Voucher>,
    val masterMismatch: Boolean
)

/**
 * Exact Kotlin port of `tally-web-dashboard/src/lib/ledgerPeriod.mjs` so opening,
 * period Debit/Credit, running balances, and closing balance match Tally and Web to the paisa.
 */
object LedgerCalculator {
    private fun roundMoney(value: Double): Double = (value * 100.0).roundToLong() / 100.0

    fun calculateLedgerPeriod(
        vouchers: List<Voucher>,
        entries: List<VoucherLedgerEntry>,
        masterOpening: Double?,
        fromDate: String,
        toDate: String = "9999-12-31",
        masterClosing: Double? = null
    ): LedgerPeriodResult {
        val entriesByVoucher = entries.groupBy { it.voucherId }
        var opening = if (masterOpening != null && masterOpening.isFinite()) masterOpening else 0.0
        var openingVerified = masterOpening != null && masterOpening.isFinite()

        var debitTotal = 0.0
        var creditTotal = 0.0
        var historyNet = 0.0
        var historyComplete = true

        val orderedVouchers = vouchers.sortedWith(
            compareBy<Voucher>({ it.voucherDate.take(10) }, { it.id })
        )

        val rawPeriodRows = mutableListOf<Triple<Voucher, Double, Pair<Double, List<VoucherLedgerEntry>>>>()
        val unknown = mutableListOf<Voucher>()

        for (voucher in orderedVouchers) {
            val rows = entriesByVoucher[voucher.id].orEmpty()
            val complete = rows.isNotEmpty() && rows.all { row ->
                row.isDebit != null && row.amount != null && row.amount.isFinite()
            }
            val date = voucher.voucherDate.take(10)
            val beforePeriod = date < fromDate

            if (!complete) {
                historyComplete = false
                if (date <= toDate) unknown.add(voucher)
                if (beforePeriod) openingVerified = false
            }

            val verifiedRows = if (complete) rows else emptyList()
            val debit = verifiedRows
                .filter { it.isDebit == true }
                .sumOf { (abs(it.amount ?: 0.0) * 100.0).roundToLong() } / 100.0
            val credit = verifiedRows
                .filter { it.isDebit == false }
                .sumOf { (abs(it.amount ?: 0.0) * 100.0).roundToLong() } / 100.0

            historyNet += debit - credit
            if (beforePeriod) {
                opening += debit - credit
            } else if (date <= toDate) {
                debitTotal += debit
                creditTotal += credit
                rawPeriodRows.add(Triple(voucher, debit, credit to verifiedRows))
            }
        }

        val masterMismatch = masterClosing != null &&
            masterClosing.isFinite() &&
            historyComplete &&
            roundMoney((masterOpening ?: 0.0) + historyNet) != roundMoney(masterClosing)

        if (masterMismatch) {
            openingVerified = false
        }

        val roundedOpening = roundMoney(opening)
        var running = roundedOpening
        val transactions = rawPeriodRows.map { (voucher, debit, creditAndRows) ->
            val (credit, rows) = creditAndRows
            running = roundMoney(running + debit - credit)
            LedgerPeriodTransaction(
                voucher = voucher,
                ledgerDebit = roundMoney(debit),
                ledgerCredit = roundMoney(credit),
                runningBalance = running,
                entries = rows
            )
        }

        val roundedDebit = roundMoney(debitTotal)
        val roundedCredit = roundMoney(creditTotal)
        val closing = roundMoney(roundedOpening + roundedDebit - roundedCredit)

        return LedgerPeriodResult(
            opening = roundedOpening,
            openingVerified = openingVerified,
            debitTotal = roundedDebit,
            creditTotal = roundedCredit,
            closing = closing,
            transactions = transactions,
            unknownVouchers = unknown,
            masterMismatch = masterMismatch
        )
    }
}
