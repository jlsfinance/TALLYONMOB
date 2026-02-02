import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../config/theme.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _currentIndex = 0;
  bool _isLoading = true;
  Map<String, dynamic>? _summary;

  @override
  void initState() {
    super.initState();
    _loadDashboardData();
  }

  Future<void> _loadDashboardData() async {
    setState(() => _isLoading = true);
    try {
      final authProvider = context.read<AuthProvider>();
      final dataProvider = context.read<DataProvider>();

      await dataProvider.fetchDashboard(authProvider.selectedCompanyId!);
      final ds = dataProvider.dashboardSummary;
      final summary = ds != null
          ? {
              'totalSales': ds.totalSalesAmount,
              'totalPurchases': ds.totalPurchasesAmount,
              'ledgerCount': ds.totalLedgers,
              'stockCount': ds.totalStockValue,
            }
          : null;

      setState(() {
        _summary = summary;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to load data: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  String _formatCurrency(num? amount) {
    if (amount == null) return '₹0';
    if (amount >= 10000000)
      return '₹${(amount / 10000000).toStringAsFixed(2)} Cr';
    if (amount >= 100000) return '₹${(amount / 100000).toStringAsFixed(2)} L';
    return '₹${amount.toStringAsFixed(0)}';
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();

    return Scaffold(
      appBar: AppBar(
        title: Text(authProvider.selectedCompanyName ?? 'Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.swap_horiz),
            tooltip: 'Switch Company',
            onPressed: () {
              authProvider.clearSelectedCompany();
            },
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () {
              authProvider.signOut();
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadDashboardData,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Welcome message
                    Text(
                      'Welcome back! 👋',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Here\'s your business overview',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),

                    const SizedBox(height: 24),

                    // Stats cards
                    GridView.count(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      crossAxisCount: 2,
                      mainAxisSpacing: 16,
                      crossAxisSpacing: 16,
                      childAspectRatio: 1.3,
                      children: [
                        _buildStatCard(
                          'Total Sales',
                          _formatCurrency(_summary?['totalSales']),
                          Icons.trending_up,
                          AppColors.secondary,
                        ),
                        _buildStatCard(
                          'Total Purchases',
                          _formatCurrency(_summary?['totalPurchases']),
                          Icons.trending_down,
                          AppColors.error,
                        ),
                        _buildStatCard(
                          'Ledgers',
                          '${_summary?['ledgerCount'] ?? 0}',
                          Icons.account_balance_wallet,
                          AppColors.info,
                        ),
                        _buildStatCard(
                          'Stock Items',
                          '${_summary?['stockCount'] ?? 0}',
                          Icons.inventory_2,
                          AppColors.warning,
                        ),
                      ],
                    ),

                    const SizedBox(height: 24),

                    // Quick actions
                    Text(
                      'Quick Actions',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 16),

                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: [
                        _buildQuickAction('Vouchers', Icons.receipt_long),
                        _buildQuickAction('Ledgers', Icons.people),
                        _buildQuickAction('Stock', Icons.inventory),
                        _buildQuickAction('Reports', Icons.analytics),
                      ],
                    ),
                  ],
                ),
              ),
            ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.dashboard),
            label: 'Home',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.receipt_long),
            label: 'Vouchers',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.people),
            label: 'Parties',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.inventory_2),
            label: 'Items',
          ),
        ],
      ),
    );
  }

  Widget _buildStatCard(
      String title, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
              Text(
                title,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildQuickAction(String title, IconData icon) {
    return InkWell(
      onTap: () {
        // TODO: Navigate to respective screens
      },
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.surfaceLight,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 18, color: AppColors.primary),
            const SizedBox(width: 8),
            Text(title, style: Theme.of(context).textTheme.bodyMedium),
          ],
        ),
      ),
    );
  }
}
