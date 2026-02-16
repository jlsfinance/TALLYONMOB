import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/data_provider.dart';
import '../providers/auth_provider.dart';
import '../models/voucher.dart';
import 'voucher_detail_screen.dart';

class VoucherListScreen extends StatefulWidget {
  const VoucherListScreen({super.key});

  @override
  State<VoucherListScreen> createState() => _VoucherListScreenState();
}

class _VoucherListScreenState extends State<VoucherListScreen> {
  String? _selectedType;
  DateTime? _dateFrom;
  DateTime? _dateTo;

  @override
  void initState() {
    super.initState();
    _fetchVouchers();
  }

  Future<void> _fetchVouchers() async {
    final companyId = context.read<AuthProvider>().selectedCompanyId;
    if (companyId != null) {
      await context.read<DataProvider>().fetchVouchers(
            companyId,
            type: _selectedType,
            dateFrom: _dateFrom,
            dateTo: _dateTo,
          );
    }
  }

  Future<void> _selectDateRange(BuildContext context) async {
    final DateTimeRange? picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
      initialDateRange: _dateFrom != null && _dateTo != null
          ? DateTimeRange(start: _dateFrom!, end: _dateTo!)
          : null,
    );

    if (picked != null) {
      setState(() {
        _dateFrom = picked.start;
        _dateTo = picked.end;
      });
      _fetchVouchers();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Transactions'),
        actions: [
          IconButton(
            icon: const Icon(Icons.date_range),
            onPressed: () => _selectDateRange(context),
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter Chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                if (_dateFrom != null && _dateTo != null)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: InputChip(
                      label: Text(
                        '${DateFormat('dd MMM').format(_dateFrom!)} - ${DateFormat('dd MMM').format(_dateTo!)}',
                      ),
                      onDeleted: () {
                        setState(() {
                          _dateFrom = null;
                          _dateTo = null;
                        });
                        _fetchVouchers();
                      },
                    ),
                  ),
                if (_selectedType != null)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: InputChip(
                      label: Text(_selectedType!),
                      onDeleted: () {
                        setState(() {
                          _selectedType = null;
                        });
                        _fetchVouchers();
                      },
                    ),
                  ),
              ],
            ),
          ),

          // Voucher List
          Expanded(
            child: Consumer<DataProvider>(
              builder: (context, dataProvider, child) {
                if (dataProvider.isLoading) {
                  return const Center(child: CircularProgressIndicator());
                }

                if (dataProvider.vouchers.isEmpty) {
                  return const Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.receipt_long, size: 64, color: Colors.grey),
                        SizedBox(height: 16),
                        Text(
                          'No vouchers found',
                          style: TextStyle(color: Colors.grey, fontSize: 16),
                        ),
                      ],
                    ),
                  );
                }

                return ListView.builder(
                  itemCount: dataProvider.vouchers.length,
                  padding: const EdgeInsets.all(8),
                  itemBuilder: (context, index) {
                    final Voucher voucher = dataProvider.vouchers[index];
                    return Card(
                      elevation: 2,
                      margin: const EdgeInsets.only(bottom: 8),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: _getVoucherColor(voucher.voucherType)
                              .withOpacity(0.1),
                          child: Icon(
                            _getVoucherIcon(voucher.voucherType),
                            color: _getVoucherColor(voucher.voucherType),
                            size: 20,
                          ),
                        ),
                        title: Text(
                          voucher.rawData?['party_name'] ?? 'Unknown Party',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        subtitle: Text(
                          '${voucher.voucherType} • #${voucher.voucherNumber ?? "N/A"}',
                          style: TextStyle(color: Colors.grey[600]),
                        ),
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              '₹${voucher.amount?.toStringAsFixed(2) ?? "0.00"}',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                            ),
                            Text(
                              voucher.vchDate != null
                                  ? DateFormat('dd MMM yyyy')
                                      .format(voucher.vchDate!)
                                  : 'No Date',
                              style: const TextStyle(
                                  fontSize: 12, color: Colors.grey),
                            ),
                          ],
                        ),
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) =>
                                  VoucherDetailScreen(voucher: voucher),
                            ),
                          );
                        },
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showTypeFilterDialog(),
        child: const Icon(Icons.filter_list),
      ),
    );
  }

  void _showTypeFilterDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Filter by Type'),
        content: SizedBox(
          width: double.maxFinite,
          child: Consumer<DataProvider>(
            builder: (context, provider, _) {
              final types = provider.getVoucherTypes();
              return ListView.builder(
                shrinkWrap: true,
                itemCount: types.length,
                itemBuilder: (context, index) {
                  final type = types[index];
                  return ListTile(
                    title: Text(type),
                    selected: _selectedType == type,
                    onTap: () {
                      setState(() {
                        _selectedType = type;
                      });
                      _fetchVouchers();
                      Navigator.pop(context);
                    },
                  );
                },
              );
            },
          ),
        ),
      ),
    );
  }

  IconData _getVoucherIcon(String? type) {
    if (type == null) return Icons.receipt;
    final t = type.toLowerCase();
    if (t.contains('sales')) return Icons.arrow_circle_up;
    if (t.contains('purchase')) return Icons.arrow_circle_down;
    if (t.contains('receipt')) return Icons.call_received;
    if (t.contains('payment')) return Icons.call_made;
    return Icons.receipt;
  }

  Color _getVoucherColor(String? type) {
    if (type == null) return Colors.blue;
    final t = type.toLowerCase();
    if (t.contains('sales')) return Colors.green;
    if (t.contains('purchase')) return Colors.orange;
    if (t.contains('receipt')) return Colors.teal;
    if (t.contains('payment')) return Colors.red;
    return Colors.blue;
  }
}
