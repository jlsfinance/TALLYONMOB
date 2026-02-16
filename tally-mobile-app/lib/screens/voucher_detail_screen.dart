import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../models/voucher.dart';
import '../models/company.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../services/pdf_service.dart';

class VoucherDetailScreen extends StatelessWidget {
  final Voucher voucher;

  const VoucherDetailScreen({super.key, required this.voucher});

  @override
  Widget build(BuildContext context) {
    final partyName = voucher.rawData?['party_name'] ?? 'Unknown Party';
    final amount = voucher.amount ?? 0.0;

    // Get company details (optional, but good for context)
    final companyName = context.read<AuthProvider>().selectedCompanyName;

    return Scaffold(
      appBar: AppBar(
        title: Text('${voucher.voucherType} Details'),
        actions: [
          IconButton(
            icon: const Icon(Icons.share),
            onPressed: () async {
              // Find company object
              final authProvider = context.read<AuthProvider>();
              final dataProvider = context.read<DataProvider>();

              // Helper to find company by ID
              Company? company;
              try {
                company = dataProvider.companies.firstWhere(
                  (c) => c.id == authProvider.selectedCompanyId,
                );
              } catch (_) {
                // Return default if not found
                company = Company(
                    id: authProvider.selectedCompanyId ?? '',
                    name: companyName ?? 'Unknown',
                    createdAt: DateTime.now());
              }

              final pdfService = PdfService();
              await pdfService.generateAndShareVoucher(voucher, company);
            },
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header Card
            Card(
              elevation: 4,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Text(
                      '₹${amount.abs().toStringAsFixed(2)}',
                      style: TextStyle(
                        fontSize: 32,
                        fontWeight: FontWeight.bold,
                        color: amount >= 0 ? Colors.green : Colors.red,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      partyName,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w500,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      voucher.voucherNumber ?? 'No Number',
                      style: TextStyle(color: Colors.grey[600]),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 24),

            // Details Section
            const Text(
              'Transaction Details',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),

            _buildDetailRow(
                'Date',
                voucher.vchDate != null
                    ? DateFormat('dd MMM yyyy').format(voucher.vchDate!)
                    : 'N/A'),
            _buildDetailRow('Type', voucher.voucherType ?? 'Unknown'),
            _buildDetailRow(
                'Narration', voucher.narration ?? 'No narration provided'),
            // Show raw data for debugging if needed
            if (voucher.rawData != null)
              ExpansionTile(
                title: const Text("More Details"),
                children: voucher.rawData!.entries
                    .map((e) => _buildDetailRow(e.key, e.value.toString()))
                    .toList(),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: const TextStyle(
                color: Colors.grey,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontWeight: FontWeight.w500,
                fontSize: 16,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
