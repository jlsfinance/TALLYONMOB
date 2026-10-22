import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'day_book_screen.dart';
import 'trial_balance_screen.dart';
import 'balance_sheet_screen.dart';
import 'profit_loss_screen.dart';
import 'cash_book_screen.dart';
import 'outstanding_screen.dart';

class ReportsScreen extends StatefulWidget {
  final String companyId;

  const ReportsScreen({super.key, required this.companyId});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      appBar: AppBar(
        title: Text(
          'Reports',
          style: GoogleFonts.inter(
            fontWeight: FontWeight.w600,
            color: Colors.black,
          ),
        ),
        backgroundColor: Colors.white,
        elevation: 1,
        iconTheme: const IconThemeData(color: Colors.black),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: GridView.count(
          crossAxisCount: 2,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 1.5,
          children: [
            _buildReportCard(
              icon: Icons.menu_book,
              title: 'Day Book',
              subtitle: 'All transactions',
              color: const Color(0xFF4A90D9),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => DayBookScreen(companyId: widget.companyId),
                ),
              ),
            ),
            _buildReportCard(
              icon: Icons.balance,
              title: 'Trial Balance',
              subtitle: 'Debit & Credit',
              color: const Color(0xFF7B68EE),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) =>
                      TrialBalanceScreen(companyId: widget.companyId),
                ),
              ),
            ),
            _buildReportCard(
              icon: Icons.account_balance,
              title: 'Balance Sheet',
              subtitle: 'Assets & Liabilities',
              color: const Color(0xFF20B2AA),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) =>
                      BalanceSheetScreen(companyId: widget.companyId),
                ),
              ),
            ),
            _buildReportCard(
              icon: Icons.trending_up,
              title: 'Profit & Loss',
              subtitle: 'Income & Expenses',
              color: const Color(0xFFFF8C00),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ProfitLossScreen(companyId: widget.companyId),
                ),
              ),
            ),
            _buildReportCard(
              icon: Icons.account_balance_wallet,
              title: 'Cash/Bank Book',
              subtitle: 'Cash & bank entries',
              color: const Color(0xFF3CB371),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => CashBookScreen(companyId: widget.companyId),
                ),
              ),
            ),
            _buildReportCard(
              icon: Icons.pending_actions,
              title: 'Outstanding',
              subtitle: 'Receivables & Payables',
              color: const Color(0xFFE74C3C),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) =>
                      OutstandingScreen(companyId: widget.companyId),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildReportCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
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
              Text(
                title,
                style: GoogleFonts.inter(
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                  color: Colors.black87,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: GoogleFonts.inter(
                  fontSize: 11,
                  color: Colors.grey.shade500,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
