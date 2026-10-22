import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/app_models.dart';
import '../services/api_service.dart';

class LedgersScreen extends StatefulWidget {
  final String companyId;

  const LedgersScreen({super.key, required this.companyId});

  @override
  State<LedgersScreen> createState() => _LedgersScreenState();
}

class _LedgersScreenState extends State<LedgersScreen> {
  List<Ledger> _ledgers = [];
  String _searchQuery = '';
  bool _loading = true;

  final NumberFormat _currencyFormat =
      NumberFormat.currency(symbol: '₹', locale: 'en_IN');

  @override
  void initState() {
    super.initState();
    _loadLedgers();
  }

  Future<void> _loadLedgers() async {
    setState(() => _loading = true);
    try {
      final ledgers =
          await context.read<ApiService>().getLedgers(widget.companyId);
      setState(() {
        _ledgers = ledgers;
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading ledgers: $e')),
        );
      }
    }
  }

  List<Ledger> get _filteredLedgers {
    if (_searchQuery.isEmpty) return _ledgers;
    return _ledgers
        .where(
            (l) => l.name.toLowerCase().contains(_searchQuery.toLowerCase()))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Ledgers',
          style: GoogleFonts.inter(
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
        backgroundColor: const Color(0xFF4A90D9),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () {
              showSearch(
                context: context,
                delegate: _LedgerSearchDelegate(
                  ledgers: _ledgers,
                  currencyFormat: _currencyFormat,
                ),
              );
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12.0),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Filter ledgers...',
                hintStyle: GoogleFonts.inter(),
                prefixIcon: const Icon(Icons.filter_list,
                    color: Color(0xFF4A90D9)),
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
              onChanged: (value) =>
                  setState(() => _searchQuery = value),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: _loadLedgers,
                    color: const Color(0xFF4A90D9),
                    child: _filteredLedgers.isEmpty
                        ? Center(
                            child: Text(
                              'No ledgers found',
                              style: GoogleFonts.inter(
                                fontSize: 16,
                                color: Colors.grey,
                              ),
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 4),
                            itemCount: _filteredLedgers.length,
                            itemBuilder: (context, index) {
                              final ledger = _filteredLedgers[index];
                              final isPositive =
                                  ledger.closingBalance >= 0;
                              return Card(
                                elevation: 2,
                                margin: const EdgeInsets.symmetric(vertical: 4),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: ListTile(
                                  contentPadding: const EdgeInsets.symmetric(
                                      horizontal: 16, vertical: 4),
                                  title: Text(
                                    ledger.name,
                                    style: GoogleFonts.inter(
                                      fontWeight: FontWeight.w500,
                                      fontSize: 15,
                                    ),
                                  ),
                                  subtitle: ledger.parentGroup != null
                                      ? Text(
                                          ledger.parentGroup!,
                                          style: GoogleFonts.inter(
                                            fontSize: 13,
                                            color: Colors.grey[600],
                                          ),
                                        )
                                      : null,
                                  trailing: Text(
                                    _currencyFormat
                                        .format(ledger.closingBalance),
                                    style: GoogleFonts.inter(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 14,
                                      color: isPositive
                                          ? Colors.green[700]
                                          : Colors.red[700],
                                    ),
                                  ),
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

class _LedgerSearchDelegate extends SearchDelegate<String> {
  final List<Ledger> ledgers;
  final NumberFormat currencyFormat;

  _LedgerSearchDelegate({required this.ledgers, required this.currencyFormat});

  @override
  ThemeData appBarTheme(BuildContext context) {
    return Theme.of(context).copyWith(
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFF4A90D9),
        iconTheme: IconThemeData(color: Colors.white),
      ),
      inputDecorationTheme: const InputDecorationTheme(
        hintStyle: TextStyle(color: Colors.white70),
      ),
      textTheme: const TextTheme(
        titleLarge: TextStyle(color: Colors.white, fontSize: 18),
      ),
    );
  }

  @override
  List<Widget> buildActions(BuildContext context) {
    return [
      IconButton(
        icon: const Icon(Icons.clear),
        onPressed: () => query = '',
      ),
    ];
  }

  @override
  Widget buildLeading(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.arrow_back),
      onPressed: () => close(context, ''),
    );
  }

  @override
  Widget buildResults(BuildContext context) => _buildSearchResults();

  @override
  Widget buildSuggestions(BuildContext context) => _buildSearchResults();

  Widget _buildSearchResults() {
    final filtered = ledgers
        .where((l) => l.name.toLowerCase().contains(query.toLowerCase()))
        .toList();

    if (filtered.isEmpty) {
      return Center(
        child: Text(
          'No ledgers found',
          style: GoogleFonts.inter(fontSize: 16, color: Colors.grey),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      itemCount: filtered.length,
      itemBuilder: (context, index) {
        final ledger = filtered[index];
        final isPositive = ledger.closingBalance >= 0;
        return Card(
          elevation: 2,
          margin: const EdgeInsets.symmetric(vertical: 4),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          child: ListTile(
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            title: Text(
              ledger.name,
              style: GoogleFonts.inter(
                fontWeight: FontWeight.w500,
                fontSize: 15,
              ),
            ),
            subtitle: ledger.parentGroup != null
                ? Text(
                    ledger.parentGroup!,
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      color: Colors.grey[600],
                    ),
                  )
                : null,
            trailing: Text(
              currencyFormat.format(ledger.closingBalance),
              style: GoogleFonts.inter(
                fontWeight: FontWeight.w600,
                fontSize: 14,
                color: isPositive ? Colors.green[700] : Colors.red[700],
              ),
            ),
          ),
        );
      },
    );
  }
}
