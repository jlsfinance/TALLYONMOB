import 'dart:math';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:fl_chart/fl_chart.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../config/theme.dart';
import '../providers/theme_provider.dart';
import 'ledger_list_screen.dart';
import 'voucher_list_screen.dart';
import 'stock_list_screen.dart';
import 'reports_screen.dart';

/// ─── Cached Mock Data Helpers ───────────────────────────────────────────────
/// Data is generated once and reused across rebuilds to avoid per-frame allocations.

class _MockData {
  static final _rand = Random(42);

  static late final List<double> _revenueTrend = List.generate(
      12, (i) => 2.5 + sin(i * 0.5) * 0.8 + _rand.nextDouble() * 0.4);
  static late final List<double> _expenses = List.generate(
      12, (i) => 1.2 + cos(i * 0.4) * 0.4 + _rand.nextDouble() * 0.3);
  static late final List<double> _collections =
      [85, 92, 78, 95, 88, 91, 76, 94, 89, 93, 86, 90].map((e) => e / 100).toList();
  static late final List<double> _pnlRevenue = List.generate(
      12, (i) => 3.0 + sin(i * 0.5) * 0.6 + _rand.nextDouble() * 0.3);
  static late final List<double> _pnlExpense = List.generate(
      12, (i) => 1.8 + cos(i * 0.4) * 0.3 + _rand.nextDouble() * 0.2);
  static late final List<double> _netProfitMargin = List.generate(
      12, (i) => 28 + sin(i * 0.6) * 8 + _rand.nextDouble() * 4);

  static List<double> revenueTrend() => _revenueTrend;
  static List<double> expenses() => _expenses;
  static List<double> collections() => _collections;
  static List<double> pnlRevenue() => _pnlRevenue;
  static List<double> pnlExpense() => _pnlExpense;
  static List<double> netProfitMargin() => _netProfitMargin;

  // Pre-computed FlSpot lists for charts (avoids allocations per build)
  static late final List<FlSpot> revenueSpots =
      List.generate(_revenueTrend.length, (i) => FlSpot(i.toDouble(), _revenueTrend[i]));
  static late final List<FlSpot> netProfitSpots =
      List.generate(_netProfitMargin.length, (i) => FlSpot(i.toDouble(), _netProfitMargin[i]));
}

/// ─── Months ─────────────────────────────────────────────────────────────────

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// ─── Dashboard Screen ───────────────────────────────────────────────────────

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen>
    with SingleTickerProviderStateMixin {
  int _currentIndex = 0;
  bool _isLoading = true;
  Map<String, dynamic>? _summary;

  late AnimationController _entranceCtrl;
  late List<Animation<double>> _entranceAnims;

  @override
  void initState() {
    super.initState();
    _entranceCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    _entranceAnims = List.generate(
      8,
      (i) => CurvedAnimation(
        parent: Tween<double>(begin: 0, end: 1).animate(
          CurvedAnimation(
            parent: _entranceCtrl,
            curve: Interval(i * 0.08, 0.6 + i * 0.04, curve: Curves.easeOutCubic),
          ),
        ),
        curve: Curves.easeOutCubic,
      ),
    );
    _loadDashboardData();
  }

  @override
  void dispose() {
    _entranceCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadDashboardData() async {
    setState(() => _isLoading = true);
    try {
      final authProvider = context.read<AuthProvider>();
      final dataProvider = context.read<DataProvider>();
      if (authProvider.selectedCompanyId != null) {
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
        if (mounted) setState(() => _summary = summary);
      }
    } catch (_) {}
    if (mounted) {
      setState(() => _isLoading = false);
      _entranceCtrl.forward();
    }
  }

  void _onItemTapped(int index) => setState(() => _currentIndex = index);

  String _fmt(num? amount) {
    if (amount == null) return '₹0';
    if (amount >= 10000000) return '₹${(amount / 10000000).toStringAsFixed(2)} Cr';
    if (amount >= 100000) return '₹${(amount / 100000).toStringAsFixed(2)} L';
    return '₹${amount.toStringAsFixed(0)}';
  }

  // ── Build ──

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final screens = <Widget>[
      _buildHomeContent(),
      const VoucherListScreen(),
      const LedgerListScreen(),
      const StockListScreen(),
    ];

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: Text(authProvider.selectedCompanyName ?? 'Dashboard'),
        actions: [
          _buildThemeToggle(),
          IconButton(
            icon: const Icon(Icons.swap_horiz),
            tooltip: 'Switch Company',
            onPressed: () => authProvider.clearSelectedCompany(),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => authProvider.signOut(),
          ),
        ],
      ),
      body: _isLoading && _currentIndex == 0
          ? const _ShimmerLoading()
          : screens[_currentIndex],
      bottomNavigationBar: _buildBottomNav(),
    );
  }

  Widget _buildThemeToggle() {
    return Consumer<ThemeProvider>(
      builder: (context, themeProvider, _) {
        return IconButton(
          icon: Icon(
            themeProvider.isDark ? Icons.light_mode : Icons.dark_mode,
          ),
          onPressed: () => themeProvider.toggle(),
        );
      },
    );
  }

  Widget _buildBottomNav() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      decoration: BoxDecoration(
        color: (isDark ? Colors.white : Colors.black).withOpacity(0.10),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: (isDark ? Colors.white : Colors.black).withOpacity(0.08),
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: _onItemTapped,
          type: BottomNavigationBarType.fixed,
          backgroundColor: Colors.transparent,
          elevation: 0,
          selectedItemColor: AppColors.primary,
          unselectedItemColor: isDark ? AppColors.textMutedDark : AppColors.textMutedLight,
          items: const [
            BottomNavigationBarItem(icon: Icon(Icons.dashboard), label: 'Home'),
            BottomNavigationBarItem(icon: Icon(Icons.receipt_long), label: 'Vouchers'),
            BottomNavigationBarItem(icon: Icon(Icons.people), label: 'Parties'),
            BottomNavigationBarItem(icon: Icon(Icons.inventory_2), label: 'Items'),
          ],
        ),
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HOME CONTENT — Analytics Dashboard
  // ═══════════════════════════════════════════════════════════════════════

  Widget _buildHomeContent() {
    return RefreshIndicator(
      onRefresh: _loadDashboardData,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, kToolbarHeight + 60, 16, 100),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildWelcome(),
            const SizedBox(height: 20),
            _buildKpiRow(),
            const SizedBox(height: 20),
            _buildSection('Revenue Charts', Icons.trending_up, _buildRevenueCharts()),
            const SizedBox(height: 20),
            _buildSection('Loan Stats', Icons.account_balance, _buildLoanStats()),
            const SizedBox(height: 20),
            _buildSection('Customer Metrics', Icons.people_outline, _buildCustomerMetrics()),
          ],
        ),
      ),
    );
  }

  // ── Welcome ──

  Widget _buildWelcome() {
    return FadeTransition(
      opacity: _entranceAnims[0],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Welcome back! 👋',
            style: Theme.of(context).textTheme.displaySmall,
          ),
          const SizedBox(height: 4),
          Text(
            'Here\'s your business overview',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }

  // ── Animated Section Wrapper ──

  Widget _buildSection(String title, IconData icon, Widget content) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 12),
          child: Row(
            children: [
              Icon(icon, size: 18, color: AppColors.primary),
              const SizedBox(width: 8),
              Text(title, style: Theme.of(context).textTheme.titleLarge),
            ],
          ),
        ),
        content,
      ],
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // KPI ROW — Top stats cards
  // ═══════════════════════════════════════════════════════════════════════

  Widget _buildKpiRow() {
    return Column(
      children: [
        // Row 1
        Row(
          children: [
            Expanded(child: _entranceWrap(1, _kpiCard(
              'Total Sales', _fmt(_summary?['totalSales']),
              Icons.trending_up, AppColors.successGradient, '+12.5%',
            ))),
            const SizedBox(width: 12),
            Expanded(child: _entranceWrap(2, _kpiCard(
              'Total Purchases', _fmt(_summary?['totalPurchases']),
              Icons.trending_down, AppColors.dangerGradient, '-3.2%',
            ))),
          ],
        ),
        const SizedBox(height: 12),
        // Row 2
        Row(
          children: [
            Expanded(child: _entranceWrap(3, _kpiCard(
              'Ledgers', '${_summary?['ledgerCount'] ?? 0}',
              Icons.account_balance_wallet, AppColors.primaryGradient, null,
            ))),
            const SizedBox(width: 12),
            Expanded(child: _entranceWrap(4, _kpiCard(
              'Stock Value', _fmt(_summary?['stockCount']),
              Icons.inventory_2, AppColors.warningGradient, '+8.1%',
            ))),
          ],
        ),
      ],
    );
  }

  Widget _kpiCard(String title, String value, IconData icon,
      Gradient gradient, String? change) {
    return GlassCard(
      padding: const EdgeInsets.all(16),
      blur: 24,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  gradient: gradient,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: Colors.white, size: 18),
              ),
              if (change != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: change.startsWith('+')
                        ? AppColors.secondary.withOpacity(0.15)
                        : AppColors.error.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    change,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: change.startsWith('+') ? AppColors.secondary : AppColors.error,
                    ),
                  ),
                ),
            ],
          ),
          const Spacer(),
          Text(
            value,
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            title,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // REVENUE CHARTS
  // ═══════════════════════════════════════════════════════════════════════

  Widget _buildRevenueCharts() {
    return Column(
      children: [
        Row(
          children: [
            Expanded(child: _entranceWrap(0, _chartCard(
              'Revenue Trend', _areaChart(), height: 180,
            ))),
            const SizedBox(width: 12),
            Expanded(child: _entranceWrap(0, _chartCard(
              'Expense Distribution', _barChart(), height: 180,
            ))),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _entranceWrap(0, _chartCard(
              'Collections', _donutChart(), height: 180,
            ))),
            const SizedBox(width: 12),
            Expanded(child: _entranceWrap(0, _chartCard(
              'P&L Trend', _groupedBarChart(), height: 180,
            ))),
          ],
        ),
        const SizedBox(height: 12),
        _entranceWrap(0, _chartCard(
          'Net Profit Margin', _lineChart(), height: 180,
        )),
      ],
    );
  }

  // ── Area Chart ──

  Widget _areaChart() {
    final data = _MockData.revenueTrend();
    return _ChartBase(data: data, color: AppColors.primary, isArea: true);
  }

  // ── Bar Chart ──

  Widget _barChart() {
    final data = _MockData.expenses();
    return BarChart(
      BarChartData(
        alignment: BarChartAlignment.spaceAround,
        maxY: data.reduce((a, b) => a > b ? a : b) * 1.3,
        barTouchData: BarTouchData(enabled: false),
        titlesData: FlTitlesData(
          show: true,
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              getTitlesWidget: (v, _) => Text(
                _months[v.toInt() % 12].substring(0, 3),
                style: const TextStyle(fontSize: 8, color: AppColors.textMutedDark),
              ),
              reservedSize: 16,
            ),
          ),
          leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
          topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
        ),
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          horizontalInterval: 0.5,
          getDrawingHorizontalLine: (v) => FlLine(
            color: Colors.white.withOpacity(0.05),
            strokeWidth: 0.5,
          ),
        ),
        borderData: FlBorderData(show: false),
        barGroups: List.generate(data.length, (i) => BarChartGroupData(
          x: i,
          barRods: [
            BarChartRodData(
              toY: data[i],
              color: AppColors.error.withOpacity(0.8),
              width: 8,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(4),
                topRight: Radius.circular(4),
              ),
            ),
          ],
        )),
      ),
    );
  }

  // ── Donut Chart ──

  Widget _donutChart() {
    return PieChart(
      PieChartData(
        sectionsSpace: 2,
        centerSpaceRadius: 30,
        sections: [
          PieChartSectionData(value: 68, color: AppColors.secondary, radius: 24,
            title: '68%', titleStyle: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white)),
          PieChartSectionData(value: 18, color: AppColors.warning, radius: 20,
            title: '18%', titleStyle: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white)),
          PieChartSectionData(value: 14, color: AppColors.error, radius: 20,
            title: '14%', titleStyle: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white)),
        ],
      ),
    );
  }

  // ── Grouped Bar Chart ──

  Widget _groupedBarChart() {
    final rev = _MockData.pnlRevenue();
    final exp = _MockData.pnlExpense();
    return BarChart(
      BarChartData(
        alignment: BarChartAlignment.spaceAround,
        maxY: rev.reduce((a, b) => a > b ? a : b) * 1.3,
        barTouchData: BarTouchData(enabled: false),
        titlesData: FlTitlesData(
          show: true,
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              getTitlesWidget: (v, _) => Text(
                _months[v.toInt() % 12].substring(0, 3),
                style: const TextStyle(fontSize: 8, color: AppColors.textMutedDark),
              ),
              reservedSize: 16,
            ),
          ),
          leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
          topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
        ),
        gridData: FlGridData(
          show: true, drawVerticalLine: false,
          getDrawingHorizontalLine: (v) => FlLine(
            color: Colors.white.withOpacity(0.05), strokeWidth: 0.5,
          ),
        ),
        borderData: FlBorderData(show: false),
        barGroups: List.generate(rev.length, (i) => BarChartGroupData(
          x: i,
          barRods: [
            BarChartRodData(
              toY: rev[i], color: AppColors.secondary.withOpacity(0.85),
              width: 6, borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(3), topRight: Radius.circular(3),
              ),
            ),
            BarChartRodData(
              toY: exp[i], color: AppColors.error.withOpacity(0.6),
              width: 6, borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(3), topRight: Radius.circular(3),
              ),
            ),
          ],
        )),
      ),
    );
  }

  // ── Line Chart ──

  Widget _lineChart() {
    final data = _MockData.netProfitMargin();
    return LineChart(
      LineChartData(
        minY: 0,
        maxY: data.reduce((a, b) => a > b ? a : b) * 1.2,
        lineTouchData: LineTouchData(enabled: false),
        gridData: FlGridData(
          show: true, drawVerticalLine: false,
          getDrawingHorizontalLine: (v) => FlLine(
            color: Colors.white.withOpacity(0.05), strokeWidth: 0.5,
          ),
        ),
        titlesData: FlTitlesData(
          show: true,
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              getTitlesWidget: (v, _) => Text(
                _months[v.toInt() % 12].substring(0, 3),
                style: const TextStyle(fontSize: 8, color: AppColors.textMutedDark),
              ),
              reservedSize: 16,
            ),
          ),
          leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
          topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
        ),
        borderData: FlBorderData(show: false),
        lineBarsData: [
          LineChartBarData(
            spots: _MockData.netProfitSpots,
            isCurved: true,
            color: AppColors.accent,
            barWidth: 2.5,
            isStrokeCapRound: true,
            dotData: FlDotData(
              show: true,
              getDotPainter: (spot, percent, bar, index) => FlDotCirclePainter(
                radius: 3,
                color: AppColors.accent,
                strokeWidth: 2,
                strokeColor: AppColors.backgroundDark,
              ),
            ),
            belowBarData: BarAreaData(
              show: true,
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  AppColors.accent.withOpacity(0.3),
                  AppColors.accent.withOpacity(0.0),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LOAN STATS
  // ═══════════════════════════════════════════════════════════════════════

  Widget _buildLoanStats() {
    return Column(
      children: [
        // KPI row
        Row(
          children: [
            Expanded(child: _entranceWrap(0, _miniKpi(
              'Active Loans', '1,247', Icons.account_balance, AppColors.primary,
              '▲ 23 this month',
            ))),
            const SizedBox(width: 12),
            Expanded(child: _entranceWrap(0, _miniKpi(
              'Amount Disbursed', '₹12.3 Cr', Icons.payments, AppColors.secondary,
              '▲ ₹45L this month',
            ))),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _entranceWrap(0, _miniKpi(
              'NPA Ratio', '2.34%', Icons.warning_amber, AppColors.warning,
              '▼ 0.12% from last month',
            ))),
            const SizedBox(width: 12),
            Expanded(child: _entranceWrap(0, _miniKpi(
              'Avg Ticket Size', '₹1.08 L', Icons.receipt, AppColors.info,
              '▲ 5.4% growth',
            ))),
          ],
        ),
        const SizedBox(height: 16),
        // Activity feed
        _entranceWrap(0, GlassCard(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Recent Activity', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              _activityItem(Icons.check_circle, 'Loan approved — Rajesh Sharma',
                  '₹5,00,000 • 2 min ago', AppColors.secondary),
              _activityItem(Icons.pending_actions, 'KYC pending — Priya Patel',
                  'Awaiting documents • 15 min ago', AppColors.warning),
              _activityItem(Icons.warning, 'EMI overdue — Ravi Kumar',
                  '₹12,500 • 3 days overdue', AppColors.error),
              _activityItem(Icons.check_circle, 'Loan approved — Sneha Gupta',
                  '₹3,50,000 • 1 hr ago', AppColors.secondary),
              _activityItem(Icons.info_outline, 'New application — Amit Singh',
                  '₹2,00,000 • 2 hrs ago', AppColors.info),
            ],
          ),
        )),
      ],
    );
  }

  Widget _activityItem(IconData icon, String title, String subtitle, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: color.withOpacity(0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 16, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleSmall),
                Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CUSTOMER METRICS
  // ═══════════════════════════════════════════════════════════════════════

  Widget _buildCustomerMetrics() {
    return Column(
      children: [
        Row(
          children: [
            Expanded(child: _entranceWrap(0, _miniKpi(
              'Total Customers', '4,832', Icons.people, AppColors.primary,
              '▲ 124 new this month',
            ))),
            const SizedBox(width: 12),
            Expanded(child: _entranceWrap(0, _miniKpi(
              'KYC Completed', '4,201', Icons.verified_user, AppColors.secondary,
              '86.9% completion rate',
            ))),
          ],
        ),
        const SizedBox(height: 16),
        // Daily Briefing card
        _entranceWrap(0, GlassCard(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.wb_sunny, size: 18, color: AppColors.warning),
                  const SizedBox(width: 8),
                  Text('Daily Briefing', style: Theme.of(context).textTheme.titleMedium),
                ],
              ),
              const SizedBox(height: 12),
              _briefingRow('New Registrations', '7 today', AppColors.primary),
              const SizedBox(height: 8),
              _briefingRow('KYC Pending Review', '23', AppColors.warning),
              const SizedBox(height: 8),
              _briefingRow('Applications In Progress', '15', AppColors.info),
              const SizedBox(height: 8),
              _briefingRow('Disbursements Today', '₹2.8 L', AppColors.secondary),
            ],
          ),
        )),
      ],
    );
  }

  Widget _briefingRow(String label, String value, Color color) {
    return Row(
      children: [
        Container(
          width: 8, height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(label, style: Theme.of(context).textTheme.bodyMedium),
        ),
        Text(value, style: Theme.of(context).textTheme.titleSmall?.copyWith(
          fontWeight: FontWeight.w600,
        )),
      ],
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  Widget _miniKpi(String title, String value, IconData icon,
      Color color, String subtitle) {
    return GlassCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: color.withOpacity(0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 16, color: color),
          ),
          const SizedBox(height: 10),
          Text(value, style: Theme.of(context).textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.bold,
          )),
          Text(title, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 4),
          Text(subtitle, style: TextStyle(
            fontSize: 10,
            color: subtitle.startsWith('▲')
                ? AppColors.secondary
                : subtitle.startsWith('▼')
                    ? AppColors.error
                    : Theme.of(context).textTheme.bodySmall?.color,
          )),
        ],
      ),
    );
  }

  Widget _chartCard(String title, Widget chart, {double height = 180}) {
    return GlassCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          SizedBox(height: height, child: chart),
        ],
      ),
    );
  }

  Widget _entranceWrap(int idx, Widget child) {
    return FadeTransition(
      opacity: _entranceAnims[idx < _entranceAnims.length ? idx : idx % _entranceAnims.length],
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, 0.2),
          end: Offset.zero,
        ).animate(_entranceAnims[idx < _entranceAnims.length ? idx : idx % _entranceAnims.length]),
        child: child,
      ),
    );
  }
}

/// ── Reusable Chart Base (Area/Line) ─────────────────────────────────────────

class _ChartBase extends StatelessWidget {
  final List<double> data;
  final Color color;
  final bool isArea;
  final List<FlSpot> spots;

  _ChartBase({
    required this.data,
    required this.color,
    this.isArea = false,
  }) : spots = List.generate(data.length, (i) => FlSpot(i.toDouble(), data[i]));

  @override
  Widget build(BuildContext context) {
    return LineChart(
      LineChartData(
        minY: 0,
        maxY: data.reduce((a, b) => a > b ? a : b) * 1.3,
        lineTouchData: LineTouchData(enabled: false),
        gridData: FlGridData(
          show: true, drawVerticalLine: false,
          getDrawingHorizontalLine: (v) => FlLine(
            color: Colors.white.withOpacity(0.05), strokeWidth: 0.5,
          ),
        ),
        titlesData: FlTitlesData(
          show: true,
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              getTitlesWidget: (v, _) => Text(
                _months[v.toInt() % 12].substring(0, 3),
                style: const TextStyle(fontSize: 8, color: AppColors.textMutedDark),
              ),
              reservedSize: 16,
            ),
          ),
          leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
          topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
        ),
        borderData: FlBorderData(show: false),
        lineBarsData: [
          LineChartBarData(
            spots: spots,
            isCurved: true,
            color: color,
            barWidth: 2.5,
            isStrokeCapRound: true,
            dotData: const FlDotData(show: false),
            belowBarData: isArea ? BarAreaData(
              show: true,
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [color.withOpacity(0.4), color.withOpacity(0.0)],
              ),
            ) : null,
          ),
        ],
      ),
    );
  }
}

/// ── Shimmer Loading State ───────────────────────────────────────────────────

class _ShimmerLoading extends StatelessWidget {
  const _ShimmerLoading();

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, kToolbarHeight + 60, 16, 100),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const ShimmerWidget(height: 24, width: 200),
          const SizedBox(height: 4),
          const ShimmerWidget(height: 16, width: 160),
          const SizedBox(height: 20),
          Row(children: [
            Expanded(child: _shimmerCard()),
            const SizedBox(width: 12),
            Expanded(child: _shimmerCard()),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: _shimmerCard()),
            const SizedBox(width: 12),
            Expanded(child: _shimmerCard()),
          ]),
          const SizedBox(height: 24),
          const ShimmerWidget(height: 180),
          const SizedBox(height: 16),
          const ShimmerWidget(height: 180),
          const SizedBox(height: 16),
          const ShimmerWidget(height: 200),
        ],
      ),
    );
  }

  Widget _shimmerCard() {
    return const ShimmerWidget(height: 120);
  }
}
