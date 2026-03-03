import 'dart:io';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw; // Use pw for pdf widgets
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:intl/intl.dart';
import '../models/voucher.dart';
import '../models/company.dart';

class PdfService {
  Future<void> generateAndShareVoucher(
      Voucher voucher, Company? company) async {
    final pdf = pw.Document();

    // Load font if needed (optional, using standard font for now)
    // final font = await rootBundle.load("assets/fonts/OpenSans-Regular.ttf");
    // final ttf = pw.Font.ttf(font);

    final partyName = voucher.rawData?['party_name'] ?? 'Unknown Party';
    final amount = voucher.amount ?? 0.0;

    pdf.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        build: (pw.Context context) {
          return pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              // Header
              pw.Header(
                level: 0,
                child: pw.Row(
                  mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                  children: [
                    pw.Text(company?.name ?? 'My Company',
                        style: pw.TextStyle(
                            fontSize: 24, fontWeight: pw.FontWeight.bold)),
                    pw.Text('INVOICE',
                        style: pw.TextStyle(
                            fontSize: 24,
                            fontWeight: pw.FontWeight.bold,
                            color: PdfColors.grey)),
                  ],
                ),
              ),
              pw.SizedBox(height: 20),

              // Company Details
              if (company != null) ...[
                pw.Text(company.address ?? ''),
                if (company.gstin != null) pw.Text('GSTIN: ${company.gstin}'),
                pw.SizedBox(height: 20),
              ],

              pw.Divider(),

              // Voucher Details
              pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      pw.Text('Billed To:',
                          style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                      pw.Text(partyName,
                          style: const pw.TextStyle(fontSize: 18)),
                    ],
                  ),
                  pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.end,
                    children: [
                      pw.Text('Voucher No: ${voucher.voucherNumber ?? "N/A"}'),
                      pw.Text(
                          'Date: ${voucher.vchDate != null ? DateFormat('dd-MM-yyyy').format(voucher.vchDate!) : "N/A"}'),
                      pw.Text('Type: ${voucher.voucherType ?? "Unknown"}'),
                    ],
                  ),
                ],
              ),

              pw.SizedBox(height: 30),

              // Table for items (Simplified for now as Items aren't fully structured in Voucher model yet)
              pw.Container(
                decoration: pw.BoxDecoration(
                  border: pw.Border.all(color: PdfColors.grey),
                ),
                child: pw.Column(
                  children: [
                    // Table Header
                    pw.Container(
                      color: PdfColors.grey300,
                      padding: const pw.EdgeInsets.all(8),
                      child: pw.Row(
                        children: [
                          pw.Expanded(
                              flex: 3,
                              child: pw.Text('Description',
                                  style: pw.TextStyle(
                                      fontWeight: pw.FontWeight.bold))),
                          pw.Expanded(
                              flex: 1,
                              child: pw.Text('Amount',
                                  textAlign: pw.TextAlign.right,
                                  style: pw.TextStyle(
                                      fontWeight: pw.FontWeight.bold))),
                        ],
                      ),
                    ),
                    // Item Row (Using Narration as description for now)
                    pw.Padding(
                      padding: const pw.EdgeInsets.all(8),
                      child: pw.Row(
                        children: [
                          pw.Expanded(
                              flex: 3,
                              child: pw.Text(
                                  voucher.narration ?? 'Transaction Details')),
                          pw.Expanded(
                              flex: 1,
                              child: pw.Text(amount.toStringAsFixed(2),
                                  textAlign: pw.TextAlign.right)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              pw.SizedBox(height: 20),

              // Total
              pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.end,
                children: [
                  pw.Text('Total: ',
                      style: pw.TextStyle(
                          fontSize: 16, fontWeight: pw.FontWeight.bold)),
                  pw.Text('INR ${amount.toStringAsFixed(2)}',
                      style: pw.TextStyle(
                          fontSize: 16, fontWeight: pw.FontWeight.bold)),
                ],
              ),

              pw.Spacer(),

              pw.Divider(),
              pw.Center(
                  child: pw.Text('This is a computer generated invoice.')),
            ],
          );
        },
      ),
    );

    // Save PDF file
    final output = await getTemporaryDirectory();
    final file =
        File("${output.path}/voucher_${voucher.voucherNumber ?? 'doc'}.pdf");
    await file.writeAsBytes(await pdf.save());

    // Share PDF file
    await Share.shareXFiles(
      [XFile(file.path)],
      text: 'Sharing Invoice from ${company?.name ?? "Tally Mobile"}',
    );
  }
}
