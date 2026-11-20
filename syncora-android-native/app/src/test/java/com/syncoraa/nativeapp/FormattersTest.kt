package com.syncoraa.nativeapp

import com.syncoraa.nativeapp.util.Formatters
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

class FormattersTest {
    @Test
    fun formatsIndianCurrencyWithLakhsAndCrores() {
        assertEquals("₹1,23,456.50", Formatters.formatInr(123456.50, decimals = 2))
        assertEquals("₹10,00,000", Formatters.formatInr(1000000.0, decimals = 0))
        assertEquals("-₹50,250.00", Formatters.formatInr(-50250.0, decimals = 2))
    }

    @Test
    fun formatsCompactInr() {
        assertEquals("₹1.25Cr", Formatters.formatCompactInr(12_500_000.0))
        assertEquals("₹4.50L", Formatters.formatCompactInr(450_000.0))
        assertEquals("₹12.5K", Formatters.formatCompactInr(12_500.0))
        assertEquals("₹850", Formatters.formatCompactInr(850.0))
    }

    @Test
    fun computesIndianFinancialYearBoundariesAcrossMarchAndApril() {
        val march = Formatters.currentFinancialYear(LocalDate.of(2026, 3, 31))
        assertEquals("FY 2025-26", march.label)
        assertEquals("2025-04-01", march.fromDate)
        assertEquals("2026-03-31", march.toDate)

        val april = Formatters.currentFinancialYear(LocalDate.of(2026, 4, 1))
        assertEquals("FY 2026-27", april.label)
        assertEquals("2026-04-01", april.fromDate)
        assertEquals("2027-03-31", april.toDate)
    }
}
