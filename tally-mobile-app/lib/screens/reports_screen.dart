import 'package:flutter/material.dart';

class ReportsScreen extends StatelessWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Reports'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildReportCard(
            context,
            'Day Book',
            'View daily transactions',
            Icons.calendar_today,
            Colors.blue,
            () {
              // Navigate to Day Book (Could be a filtered VoucherListScreen)
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                  content: Text('Day Book feature coming soon')));
            },
          ),
          const SizedBox(height: 16),
          _buildReportCard(
            context,
            'Outstanding Report',
            'View receivables and payables',
            Icons.money_off,
            Colors.red,
            () {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                  content: Text('Outstanding Report feature coming soon')));
            },
          ),
          const SizedBox(height: 16),
          _buildReportCard(
            context,
            'Stock Summary',
            'View inventory valuation',
            Icons.inventory,
            Colors.orange,
            () {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                  content: Text('Stock Summary feature coming soon')));
            },
          ),
          const SizedBox(height: 16),
          _buildReportCard(
            context,
            'Profit & Loss',
            'View financial performance',
            Icons.show_chart,
            Colors.green,
            () {
              ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('P&L feature coming soon')));
            },
          ),
        ],
      ),
    );
  }

  Widget _buildReportCard(BuildContext context, String title, String subtitle,
      IconData icon, Color color, VoidCallback onTap) {
    return Card(
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        contentPadding: const EdgeInsets.all(16),
        leading: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: color.withOpacity(0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: color, size: 28),
        ),
        title: Text(
          title,
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
        ),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.arrow_forward_ios, size: 16),
        onTap: onTap,
      ),
    );
  }
}
