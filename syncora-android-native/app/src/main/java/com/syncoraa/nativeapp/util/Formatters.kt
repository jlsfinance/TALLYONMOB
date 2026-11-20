package com.syncoraa.nativeapp.util

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.pow
import kotlin.math.roundToLong

data class FinancialYearOption(
    val id: String,
    val label: String,
    val fromDate: String,
    val toDate: String
)

object Formatters {
    private val displayDateFormat = DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH)

    fun formatInr(amount: Double, decimals: Int = 2): String {
        val safe = if (amount.isFinite()) amount else 0.0
        val negative = safe < 0.0
        val scale = 10.0.pow(decimals).roundToLong().toDouble()
        val rounded = (abs(safe) * scale).roundToLong() / scale
        val formattedAbs = formatIndianNumber(rounded, decimals)
        return if (negative && rounded > 0.0) "-₹$formattedAbs" else "₹$formattedAbs"
    }

    fun formatIndianNumber(value: Double, decimals: Int = 2): String {
        val safe = if (value.isFinite()) abs(value) else 0.0
        val factor = 10.0.pow(decimals).roundToLong()
        val scaled = (safe * factor).roundToLong()
        val integerPart = scaled / factor
        val fracPart = scaled % factor

        val intStr = integerPart.toString()
        val grouped = if (intStr.length <= 3) {
            intStr
        } else {
            val lastThree = intStr.takeLast(3)
            val rest = intStr.dropLast(3)
            val sb = StringBuilder()
            var i = rest.length
            while (i > 0) {
                val start = (i - 2).coerceAtLeast(0)
                if (sb.isNotEmpty()) sb.insert(0, ',')
                sb.insert(0, rest.substring(start, i))
                i = start
            }
            "$sb,$lastThree"
        }

        return if (decimals <= 0) {
            grouped
        } else {
            val fracStr = fracPart.toString().padStart(decimals, '0')
            "$grouped.$fracStr"
        }
    }

    fun formatCompactInr(amount: Double): String {
        val safe = if (amount.isFinite()) amount else 0.0
        val prefix = if (safe < 0.0) "-₹" else "₹"
        val n = abs(safe)
        return when {
            n >= 10_000_000.0 -> "${prefix}${String.format(Locale.ENGLISH, "%.2fCr", n / 10_000_000.0)}"
            n >= 100_000.0 -> "${prefix}${String.format(Locale.ENGLISH, "%.2fL", n / 100_000.0)}"
            n >= 1_000.0 -> "${prefix}${String.format(Locale.ENGLISH, "%.1fK", n / 1_000.0)}"
            else -> "${prefix}${n.roundToLong()}"
        }
    }

    fun formatDateDisplay(isoDate: String?): String {
        if (isoDate.isNullOrBlank()) return "—"
        val datePart = isoDate.take(10)
        return runCatching {
            LocalDate.parse(datePart).format(displayDateFormat)
        }.getOrDefault(datePart)
    }

    fun formatRelativeTime(isoTimestamp: String?, now: Instant = Instant.now()): String {
        if (isoTimestamp.isNullOrBlank()) return "Never synced"
        val instant = parseInstant(isoTimestamp) ?: return formatDateDisplay(isoTimestamp)
        val seconds = Duration.between(instant, now).seconds.coerceAtLeast(0)
        return when {
            seconds < 60 -> "Just now"
            seconds < 3600 -> "${seconds / 60}m ago"
            seconds < 86_400 -> "${seconds / 3600}h ago"
            seconds < 86_400 * 30 -> "${seconds / 86_400}d ago"
            else -> formatDateDisplay(isoTimestamp)
        }
    }

    private fun parseInstant(raw: String): Instant? {
        return runCatching { Instant.parse(raw) }.getOrNull()
            ?: runCatching { OffsetDateTime.parse(raw).toInstant() }.getOrNull()
    }

    fun currentFinancialYear(today: LocalDate = LocalDate.now()): FinancialYearOption {
        val startYear = if (today.monthValue >= 4) today.year else today.year - 1
        val endYearShort = (startYear + 1) % 100
        return FinancialYearOption(
            id = "fy_${startYear}",
            label = "FY $startYear-${endYearShort.toString().padStart(2, '0')}",
            fromDate = "$startYear-04-01",
            toDate = "${startYear + 1}-03-31"
        )
    }

    fun financialYearOptions(today: LocalDate = LocalDate.now()): List<FinancialYearOption> {
        val current = currentFinancialYear(today)
        val currentStart = current.fromDate.take(4).toInt()
        val prevStart = currentStart - 1
        val prevEndShort = (prevStart + 1) % 100
        val prev = FinancialYearOption(
            id = "fy_${prevStart}",
            label = "FY $prevStart-${prevEndShort.toString().padStart(2, '0')}",
            fromDate = "$prevStart-04-01",
            toDate = "${prevStart + 1}-03-31"
        )
        val allTime = FinancialYearOption(
            id = "all",
            label = "All Time",
            fromDate = "1900-01-01",
            toDate = "2099-12-31"
        )
        return listOf(current, prev, allTime)
    }

    fun formatDrCrBalance(balance: Double): Pair<String, Boolean> {
        val isDebit = balance >= 0.0
        val suffix = if (isDebit) "Dr" else "Cr"
        return "${formatInr(abs(balance))} $suffix" to isDebit
    }
}
