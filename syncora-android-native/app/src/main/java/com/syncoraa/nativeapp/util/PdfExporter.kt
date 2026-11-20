package com.syncoraa.nativeapp.util

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import androidx.core.content.FileProvider
import com.syncoraa.nativeapp.model.Company
import com.syncoraa.nativeapp.model.Ledger
import com.syncoraa.nativeapp.model.VoucherDetail
import java.io.File
import java.io.FileOutputStream
import kotlin.math.abs

object PdfExporter {
    private const val PAGE_WIDTH = 595
    private const val PAGE_HEIGHT = 842
    private const val MARGIN = 36f

    fun exportVoucherPdf(
        context: Context,
        company: Company?,
        detail: VoucherDetail
    ): File {
        val doc = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, 1).create()
        var page = doc.startPage(pageInfo)
        var canvas = page.canvas
        var pageNumber = 1

        val titlePaint = Paint().apply {
            color = Color.parseColor("#0B8968")
            textSize = 18f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val boldPaint = Paint().apply {
            color = Color.parseColor("#111827")
            textSize = 11f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val textPaint = Paint().apply {
            color = Color.parseColor("#374151")
            textSize = 10f
        }
        val mutedPaint = Paint().apply {
            color = Color.parseColor("#6B7280")
            textSize = 9.5f
        }
        val rightPaint = Paint(textPaint).apply { textAlign = Paint.Align.RIGHT }
        val rightBoldPaint = Paint(boldPaint).apply { textAlign = Paint.Align.RIGHT }
        val linePaint = Paint().apply {
            color = Color.parseColor("#E5E7EB")
            strokeWidth = 1f
        }

        var y = MARGIN + 14f
        canvas.drawText(company?.name ?: "Syncora Company", MARGIN, y, titlePaint)
        y += 16f
        company?.gstin?.takeIf { it.isNotBlank() }?.let {
            canvas.drawText("GSTIN: $it", MARGIN, y, mutedPaint)
            y += 13f
        }
        company?.address?.takeIf { it.isNotBlank() }?.let {
            canvas.drawText(it.take(80), MARGIN, y, mutedPaint)
            y += 14f
        }

        y += 6f
        canvas.drawLine(MARGIN, y, PAGE_WIDTH - MARGIN, y, linePaint)
        y += 18f

        val v = detail.voucher
        canvas.drawText("${v.voucherType.uppercase()} VOUCHER", MARGIN, y, boldPaint)
        canvas.drawText("Date: ${Formatters.formatDateDisplay(v.voucherDate)}", PAGE_WIDTH - MARGIN, y, rightBoldPaint)
        y += 16f
        canvas.drawText("Voucher No: ${v.voucherNumber ?: "—"}", MARGIN, y, textPaint)
        v.partyName?.takeIf { it.isNotBlank() }?.let {
            canvas.drawText("Party: $it", PAGE_WIDTH - MARGIN, y, rightPaint)
        }
        y += 16f
        canvas.drawLine(MARGIN, y, PAGE_WIDTH - MARGIN, y, linePaint)
        y += 20f

        fun ensureSpace(needed: Float) {
            if (y + needed > PAGE_HEIGHT - MARGIN) {
                doc.finishPage(page)
                pageNumber++
                page = doc.startPage(PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, pageNumber).create())
                canvas = page.canvas
                y = MARGIN + 16f
            }
        }

        if (detail.stockEntries.isNotEmpty()) {
            canvas.drawText("ITEMS", MARGIN, y, boldPaint)
            canvas.drawText("QTY", 320f, y, rightBoldPaint)
            canvas.drawText("RATE", 420f, y, rightBoldPaint)
            canvas.drawText("AMOUNT", PAGE_WIDTH - MARGIN, y, rightBoldPaint)
            y += 10f
            canvas.drawLine(MARGIN, y, PAGE_WIDTH - MARGIN, y, linePaint)
            y += 15f

            for (item in detail.stockEntries) {
                ensureSpace(18f)
                canvas.drawText(item.stockItemName.take(38), MARGIN, y, textPaint)
                val qtyText = "${Formatters.formatIndianNumber(abs(item.quantity ?: 0.0), 2)} ${item.unit.orEmpty()}"
                canvas.drawText(qtyText.trim(), 320f, y, rightPaint)
                canvas.drawText(Formatters.formatInr(abs(item.rate ?: 0.0)), 420f, y, rightPaint)
                canvas.drawText(Formatters.formatInr(abs(item.amount ?: 0.0)), PAGE_WIDTH - MARGIN, y, rightPaint)
                y += 16f
            }
            y += 8f
        }

        if (detail.ledgerEntries.isNotEmpty()) {
            ensureSpace(34f)
            canvas.drawText("LEDGER ENTRIES", MARGIN, y, boldPaint)
            canvas.drawText("DR / CR", 430f, y, rightBoldPaint)
            canvas.drawText("AMOUNT", PAGE_WIDTH - MARGIN, y, rightBoldPaint)
            y += 10f
            canvas.drawLine(MARGIN, y, PAGE_WIDTH - MARGIN, y, linePaint)
            y += 15f

            for (entry in detail.ledgerEntries) {
                ensureSpace(18f)
                canvas.drawText(entry.ledgerName.take(46), MARGIN, y, textPaint)
                canvas.drawText(if (entry.isDebit == true) "Dr" else "Cr", 430f, y, rightPaint)
                canvas.drawText(Formatters.formatInr(abs(entry.amount ?: 0.0)), PAGE_WIDTH - MARGIN, y, rightPaint)
                y += 16f
            }
            y += 8f
        }

        ensureSpace(44f)
        canvas.drawLine(MARGIN, y, PAGE_WIDTH - MARGIN, y, linePaint)
        y += 18f
        canvas.drawText("TOTAL AMOUNT", MARGIN, y, boldPaint)
        canvas.drawText(Formatters.formatInr(v.effectiveAmount), PAGE_WIDTH - MARGIN, y, rightBoldPaint)
        y += 18f

        v.narration?.takeIf { it.isNotBlank() }?.let {
            ensureSpace(24f)
            canvas.drawText("Narration: ${it.take(90)}", MARGIN, y, mutedPaint)
        }

        doc.finishPage(page)
        val safeNo = (v.voucherNumber ?: v.id).replace(Regex("[^A-Za-z0-9_-]"), "_")
        val outFile = File(context.cacheDir, "Voucher_$safeNo.pdf")
        FileOutputStream(outFile).use { doc.writeTo(it) }
        doc.close()
        return outFile
    }

    fun exportLedgerStatementPdf(
        context: Context,
        company: Company?,
        ledger: Ledger,
        periodLabel: String,
        result: LedgerPeriodResult
    ): File {
        val doc = PdfDocument()
        var pageNumber = 1
        var page = doc.startPage(PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, pageNumber).create())
        var canvas = page.canvas

        val titlePaint = Paint().apply {
            color = Color.parseColor("#0B8968")
            textSize = 17f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val boldPaint = Paint().apply {
            color = Color.parseColor("#111827")
            textSize = 10.5f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val textPaint = Paint().apply {
            color = Color.parseColor("#374151")
            textSize = 9.5f
        }
        val mutedPaint = Paint().apply {
            color = Color.parseColor("#6B7280")
            textSize = 9f
        }
        val rightPaint = Paint(textPaint).apply { textAlign = Paint.Align.RIGHT }
        val rightBoldPaint = Paint(boldPaint).apply { textAlign = Paint.Align.RIGHT }
        val linePaint = Paint().apply {
            color = Color.parseColor("#E5E7EB")
            strokeWidth = 1f
        }

        var y = MARGIN + 14f
        canvas.drawText(company?.name ?: "Syncora Company", MARGIN, y, titlePaint)
        y += 16f
        canvas.drawText("Ledger Statement: ${ledger.name}", MARGIN, y, boldPaint)
        canvas.drawText(periodLabel, PAGE_WIDTH - MARGIN, y, rightPaint)
        y += 14f
        canvas.drawText("Group: ${ledger.effectiveGroup}", MARGIN, y, mutedPaint)
        y += 10f
        canvas.drawLine(MARGIN, y, PAGE_WIDTH - MARGIN, y, linePaint)
        y += 16f

        val (openStr, _) = Formatters.formatDrCrBalance(result.opening)
        val (closeStr, _) = Formatters.formatDrCrBalance(result.closing)
        canvas.drawText("Opening: $openStr", MARGIN, y, textPaint)
        canvas.drawText("Closing: $closeStr", PAGE_WIDTH - MARGIN, y, rightBoldPaint)
        y += 14f
        canvas.drawText("Total Debit: ${Formatters.formatInr(result.debitTotal)}", MARGIN, y, textPaint)
        canvas.drawText("Total Credit: ${Formatters.formatInr(result.creditTotal)}", PAGE_WIDTH - MARGIN, y, rightPaint)
        y += 12f
        canvas.drawLine(MARGIN, y, PAGE_WIDTH - MARGIN, y, linePaint)
        y += 16f

        fun drawHeader() {
            canvas.drawText("DATE", MARGIN, y, boldPaint)
            canvas.drawText("PARTICULARS", 106f, y, boldPaint)
            canvas.drawText("DEBIT", 380f, y, rightBoldPaint)
            canvas.drawText("CREDIT", 465f, y, rightBoldPaint)
            canvas.drawText("BALANCE", PAGE_WIDTH - MARGIN, y, rightBoldPaint)
            y += 8f
            canvas.drawLine(MARGIN, y, PAGE_WIDTH - MARGIN, y, linePaint)
            y += 14f
        }

        drawHeader()
        for (tx in result.transactions) {
            if (y + 18f > PAGE_HEIGHT - MARGIN) {
                doc.finishPage(page)
                pageNumber++
                page = doc.startPage(PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, pageNumber).create())
                canvas = page.canvas
                y = MARGIN + 14f
                drawHeader()
            }
            canvas.drawText(Formatters.formatDateDisplay(tx.voucher.voucherDate), MARGIN, y, textPaint)
            val label = "${tx.voucher.voucherType} #${tx.voucher.voucherNumber ?: ""}".trim()
            canvas.drawText(label.take(28), 106f, y, textPaint)
            canvas.drawText(
                if (tx.ledgerDebit > 0) Formatters.formatInr(tx.ledgerDebit) else "—",
                380f, y, rightPaint
            )
            canvas.drawText(
                if (tx.ledgerCredit > 0) Formatters.formatInr(tx.ledgerCredit) else "—",
                465f, y, rightPaint
            )
            val (balStr, _) = Formatters.formatDrCrBalance(tx.runningBalance)
            canvas.drawText(balStr, PAGE_WIDTH - MARGIN, y, rightPaint)
            y += 16f
        }

        doc.finishPage(page)
        val safeName = ledger.name.replace(Regex("[^A-Za-z0-9_-]"), "_").take(36)
        val outFile = File(context.cacheDir, "Statement_$safeName.pdf")
        FileOutputStream(outFile).use { doc.writeTo(it) }
        doc.close()
        return outFile
    }

    fun sharePdf(context: Context, file: File, title: String) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, title)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, title))
    }
}
