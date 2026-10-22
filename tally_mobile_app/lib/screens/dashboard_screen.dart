import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../models/app_models.dart';
import '../services/api_service.dart';
import '../services/sync_service.dart';

class DashboardScreen extends StatefulWidget {
  final String companyId;

  const DashboardScreen({super.key, required this.companyId});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late Future<DashboardSummary> _dashboardFuture;
  final currencyFormat = NumberFormat.currency(symbol: '₹', locale: 'en_IN');

  @override
  void initState() {
    super.initState();
    _dashboardFuture = _fetchDashboard();
  }

  Future<DashboardSummary> _fetchDashboard() {
    final api = context.read<ApiService>();
    return api.getDashboard(widget.companyId);
  }

  Future<void> _refresh() async {
    final sync = context.read<SyncService>();
    await sync.syncCompany(widget.companyId);
    setState(() {
      _dashboardFuture = _fetchDashboard();
    });
  }

  @override
  Widget build(BuildContext context) {
    final sync = context.watch<SyncService>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('LiveKeeping Dashboard',
            style: TextStyle(color: Colors.black)),
        backgroundColor: Colors.white,
        elevation: 1,
        iconTheme: const IconThemeData(color: Colors.black),
        actions: [
          // Sync status indicator
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Center(
              child: sync.isSyncing
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : IconButton(
                      icon: const Icon(Icons.sync, size: 20),
                      onPressed: _refresh,
                      tooltip: sync.statusText,
                    ),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16.0),
          child: FutureBuilder<DashboardSummary>(
            future: _dashboardFuture,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              } else if (snapshot.hasError) {
                return Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline,
                          size: 48, color: Colors.red),
                      const SizedBox(height: 12),
                      Text('Error: ${snapshot.error}',
                          textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      ElevatedButton.icon(
                        onPressed: _refresh,
                        icon: const Icon(Icons.refresh),
                        label: const Text('Retry'),
                      ),
                    ],
                  ),
                );
              } else if (!snapshot.hasData) {
                return const Center(child: Text('No Data'));
              }

              final data = snapshot.data!;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildSyncStatusBanner(sync),
                  const SizedBox(height: 12),
                  _buildSummaryCard(data),
                  const SizedBox(height: 20),
                  const Text('Quick Access',
                      style: TextStyle(
                          fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 10),
                  _buildGridMenu(context),
                  const SizedBox(height: 20),
                  const Text('Recent Ledgers',
                      style: TextStyle(
                          fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 10),
                  _buildRecentLedgers(),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildSyncStatusBanner(SyncService sync) {
    if (sync.lastError != null) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.red.shade50,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.red.shade200),
        ),
        child: Row(
          children: [
            Icon(Icons.warning_amber_rounded,
                size: 18, color: Colors.red.shade700),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                sync.lastError!,
                style: TextStyle(fontSize: 12, color: Colors.red.shade800),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      );
    }
    return const SizedBox.shrink();
  }

  Widget _buildSummaryCard(DashboardSummary data) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF4A90D9),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.blue.withValues(alpha: 0.3),
            blurRadius: 10,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildStatItem('Sales', data.totalSales, Colors.white),
              _buildStatItem('Purchases', data.totalPurchases,
                  Colors.white.withValues(alpha: 0.9)),
            ],
          ),
          const Divider(color: Colors.white24, height: 30),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildStatItem(
                  'Receivables', data.totalReceivables, Colors.white),
              _buildStatItem('Payables', data.totalPayables,
                  Colors.white.withValues(alpha: 0.9)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatItem(String label, double value, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style:
                TextStyle(color: color.withValues(alpha: 0.7), fontSize: 13)),
        const SizedBox(height: 4),
        Text(
          currencyFormat.format(value),
          style: TextStyle(
              color: color, fontSize: 18, fontWeight: FontWeight.bold),
        ),
      ],
    );
  }

  Widget _buildGridMenu(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: 1.5,
      children: [
        _buildMenuCard(Icons.book, 'Ledgers', Colors.blue),
        _buildMenuCard(Icons.receipt_long, 'Vouchers', Colors.purple),
        _buildMenuCard(Icons.inventory_2, 'Stock', Colors.orange),
        _buildMenuCard(Icons.pie_chart, 'Reports', Colors.green),
      ],
    );
  }

  Widget _buildMenuCard(IconData icon, String title, Color color) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withValues(alpha: 0.1),
            blurRadius: 5,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircleAvatar(
            backgroundColor: color.withValues(alpha: 0.1),
            radius: 24,
            child: Icon(icon, color: color, size: 28),
          ),
          const SizedBox(height: 8),
          Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  Widget _buildRecentLedgers() {
    return Card(
        child: ListTile(
      leading: const CircleAvatar(child: Text("A")),
      title: const Text("Abc Traders"),
      subtitle: const Text("Sundry Debtors"),
      trailing: const Text("₹10,000", style: TextStyle(color: Colors.green)),
    ));
  }
}
