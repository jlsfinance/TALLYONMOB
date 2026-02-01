import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../config/theme.dart';

class CompanySelectionScreen extends StatefulWidget {
  const CompanySelectionScreen({super.key});

  @override
  State<CompanySelectionScreen> createState() => _CompanySelectionScreenState();
}

class _CompanySelectionScreenState extends State<CompanySelectionScreen> {
  bool _isLoading = true;
  List<Map<String, dynamic>> _companies = [];

  @override
  void initState() {
    super.initState();
    _loadCompanies();
  }

  Future<void> _loadCompanies() async {
    setState(() => _isLoading = true);
    try {
      final dataProvider = context.read<DataProvider>();
      final companies = await dataProvider.getCompanies();
      setState(() {
        _companies = companies;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to load companies: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  void _selectCompany(Map<String, dynamic> company) {
    final authProvider = context.read<AuthProvider>();
    authProvider.selectCompany(company['id'], company['name']);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Select Company'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () {
              context.read<AuthProvider>().signOut();
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _companies.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.business_outlined,
                        size: 64,
                        color: AppColors.textMuted,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'No companies found',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Please sync data from Tally first',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      const SizedBox(height: 24),
                      ElevatedButton.icon(
                        onPressed: _loadCompanies,
                        icon: const Icon(Icons.refresh),
                        label: const Text('Refresh'),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadCompanies,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _companies.length,
                    itemBuilder: (context, index) {
                      final company = _companies[index];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 12),
                        child: ListTile(
                          contentPadding: const EdgeInsets.all(16),
                          leading: Container(
                            width: 48,
                            height: 48,
                            decoration: BoxDecoration(
                              gradient: AppColors.primaryGradient,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Center(
                              child: Text(
                                (company['name'] ?? 'C')[0].toUpperCase(),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                          title: Text(
                            company['name'] ?? 'Unknown Company',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          subtitle: company['gstin'] != null
                              ? Text(
                                  'GSTIN: ${company['gstin']}',
                                  style: Theme.of(context).textTheme.bodySmall,
                                )
                              : null,
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => _selectCompany(company),
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
