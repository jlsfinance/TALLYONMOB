package com.syncoraa.nativeapp

import com.syncoraa.nativeapp.model.Voucher
import com.syncoraa.nativeapp.model.VoucherLedgerEntry
import com.syncoraa.nativeapp.util.LedgerCalculator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LedgerCalculatorTest {
    @Test
    fun calculatesOpeningRollForwardRunningBalanceAndClosing() {
        val vouchers = listOf(
            Voucher(id = "v0", companyId = "c1", voucherType = "Sales", voucherNumber = "1", voucherDate = "2026-03-15"),
            Voucher(id = "v1", companyId = "c1", voucherType = "Sales", voucherNumber = "2", voucherDate = "2026-04-05"),
            Voucher(id = "v2", companyId = "c1", voucherType = "Receipt", voucherNumber = "3", voucherDate = "2026-04-12")
        )
        val entries = listOf(
            VoucherLedgerEntry(id = "e0", voucherId = "v0", ledgerName = "Acme Traders", amount = 500.0, isDebit = true),
            VoucherLedgerEntry(id = "e1", voucherId = "v1", ledgerName = "Acme Traders", amount = 1200.50, isDebit = true),
            VoucherLedgerEntry(id = "e2", voucherId = "v2", ledgerName = "Acme Traders", amount = 400.25, isDebit = false)
        )

        val result = LedgerCalculator.calculateLedgerPeriod(
            vouchers = vouchers,
            entries = entries,
            masterOpening = 1000.0,
            fromDate = "2026-04-01",
            toDate = "2027-03-31",
            masterClosing = 2300.25
        )

        assertTrue(result.openingVerified)
        assertFalse(result.masterMismatch)
        assertEquals(1500.0, result.opening, 0.001)
        assertEquals(1200.50, result.debitTotal, 0.001)
        assertEquals(400.25, result.creditTotal, 0.001)
        assertEquals(2300.25, result.closing, 0.001)
        assertEquals(2, result.transactions.size)
        assertEquals(2700.50, result.transactions[0].runningBalance, 0.001)
        assertEquals(2300.25, result.transactions[1].runningBalance, 0.001)
    }

    @Test
    fun detectsMasterClosingMismatch() {
        val vouchers = listOf(
            Voucher(id = "v1", companyId = "c1", voucherType = "Sales", voucherNumber = "1", voucherDate = "2026-04-10")
        )
        val entries = listOf(
            VoucherLedgerEntry(id = "e1", voucherId = "v1", ledgerName = "Acme Traders", amount = 500.0, isDebit = true)
        )

        val result = LedgerCalculator.calculateLedgerPeriod(
            vouchers = vouchers,
            entries = entries,
            masterOpening = 100.0,
            fromDate = "2026-04-01",
            toDate = "2027-03-31",
            masterClosing = 999.0
        )

        assertTrue(result.masterMismatch)
        assertFalse(result.openingVerified)
    }

    @Test
    fun tracksIncompleteVoucherEntriesAsUnknown() {
        val vouchers = listOf(
            Voucher(id = "v_before", companyId = "c1", voucherType = "Sales", voucherDate = "2026-03-20"),
            Voucher(id = "v_in", companyId = "c1", voucherType = "Sales", voucherDate = "2026-04-10")
        )
        val entries = listOf(
            VoucherLedgerEntry(id = "e_broken", voucherId = "v_before", ledgerName = "Acme", amount = null, isDebit = true)
        )

        val result = LedgerCalculator.calculateLedgerPeriod(
            vouchers = vouchers,
            entries = entries,
            masterOpening = 200.0,
            fromDate = "2026-04-01",
            toDate = "2027-03-31",
            masterClosing = null
        )

        assertFalse(result.openingVerified)
        assertEquals(2, result.unknownVouchers.size)
    }
}
