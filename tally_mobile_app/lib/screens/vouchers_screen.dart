import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/app_models.dart';
import '../services/api_service.dart';
import 'voucher_detail_screen.dart';

class VouchersScreen extends StatefulWidget {
  final String companyId;

  const VouchersScreen({super.key, required this.companyId});

  @override
  State<VouchersScreen> createState() => _VouchersScreenState();
}

class _VouchersScreenState extends State<VouchersScreen> {
  List<Voucher> _vouchers = [];
  String _searchQuery = '';
  bool _loading = true;

  final NumberFormat _currencyFormat =
      NumberFormat.currency(symbol: '₹', locale: 'en_IN');

  @override
  void initState() {
    super.initState();
    _loadVouchers();
  }

  Future<void> _loadVouchers() async {
    setState(() => _loading = true);
    try {
      final vouchers =
          await context.read<ApiService>().getVouchers(widget.companyId);
      setState(() {
        _vouchers = vouchers;
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading vouchers: $e')),
        );
      }
    }
  }

  List<Voucher> get _filteredVouchers {
    if (_searchQuery.isEmpty) return _vouchers;
    final query = _searchQuery.toLowerCase();
    return _vouchers.where((v) {
      return v.voucherNumber.toLowerCase().contains(query) ||
          v.partyName.toLowerCase().contains(query);
    }).toList();
  }

  bool _isReceipt(Voucher voucher) {
    return voucher.voucherType.toLowerCase() == 'receipt';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Vouchers',
          style: GoogleFonts.inter(
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
        backgroundColor: const Color(0xFF4A90D9),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12.0),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search by voucher number or party name...',
                hintStyle: GoogleFonts.inter(),
                prefixIcon:
                    const Icon(Icons.search, color: Color(0xFF4A90D9)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide:
                      const BorderSide(color: Color(0xFF4A90D9), width: 2),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16),
              ),
              onChanged: (value) => setState(() => _searchQuery = value),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: _loadVouchers,
                    color: const Color(0xFF4A90D9),
                    child: _filteredVouchers.isEmpty
                        ? Center(
                            child: Text(
                              'No vouchers found',
                              style: GoogleFonts.inter(
                                fontSize: 16,
                                color: Colors.grey,
                              ),
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 4),
                            itemCount: _filteredVouchers.length,
                            itemBuilder: (context, index) {
                              final voucher = _filteredVouchers[index];
                              final isReceipt = _isReceipt(voucher);
                              return Card(
                                elevation: 2,
                                margin:
                                    const EdgeInsets.symmetric(vertical: 4),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: ListTile(
                                  contentPadding:
                                      const EdgeInsets.symmetric(
                                          horizontal: 16, vertical: 4),
                                  title: Text(
                                    voucher.voucherNumber,
                                    style: GoogleFonts.inter(
                                      fontWeight: FontWeight.w500,
                                      fontSize: 15,
                                    ),
                                  ),
                                  subtitle: Text(
                                    '${voucher.partyName} • ${voucher.voucherType}',
                                    style: GoogleFonts.inter(
                                      fontSize: 13,
                                      color: Colors.grey[600],
                                    ),
                                  ),
                                  trailing: Text(
                                    _currencyFormat.format(voucher.amount),
                                    style: GoogleFonts.inter(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 14,
                                      color: isReceipt
                                          ? Colors.green[700]
                                          : Colors.red[700],
                                    ),
                                  ),
                                  onTap: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (context) =>
                                            VoucherDetailScreen(
                                          voucher: voucher,
                                          companyId: widget.companyId,
                                        ),
                                      ),
                                    );
                                  },
                                ),
                              );
                            },
                          ),
                  ),
          ),
        ],
      ),
    );
  }
}
