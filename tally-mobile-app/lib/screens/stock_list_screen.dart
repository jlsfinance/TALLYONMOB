import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/data_provider.dart';
import '../providers/auth_provider.dart';
import '../models/sale.dart';

class StockListScreen extends StatefulWidget {
  const StockListScreen({super.key});

  @override
  State<StockListScreen> createState() => _StockListScreenState();
}

class _StockListScreenState extends State<StockListScreen> {
  final TextEditingController _searchController = TextEditingController();
  List<Stock> _filteredStock = [];
  bool _isInit = true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_isInit) {
      _fetchStock();
      _isInit = false;
    }
  }

  Future<void> _fetchStock() async {
    final companyId = context.read<AuthProvider>().selectedCompanyId;
    if (companyId != null) {
      await context.read<DataProvider>().fetchStock(companyId);
    }
  }

  void _filterStock(String query) {
    final allStock = context.read<DataProvider>().stockItems;
    if (query.isEmpty) {
      setState(() {
        _filteredStock = allStock;
      });
    } else {
      setState(() {
        _filteredStock = allStock
            .where((item) =>
                item.itemName.toLowerCase().contains(query.toLowerCase()))
            .toList();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Stock Items'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(60),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search items...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: IconButton(
                  icon: const Icon(Icons.clear),
                  onPressed: () {
                    _searchController.clear();
                    _filterStock('');
                  },
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16),
              ),
              onChanged: _filterStock,
            ),
          ),
        ),
      ),
      body: Consumer<DataProvider>(
        builder: (context, dataProvider, child) {
          if (dataProvider.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          // Initial load
          if (_searchController.text.isEmpty &&
              _filteredStock.isEmpty &&
              dataProvider.stockItems.isNotEmpty) {
            _filteredStock = dataProvider.stockItems;
          }

          if (dataProvider.stockItems.isEmpty) {
            return const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.inventory_2_outlined,
                      size: 64, color: Colors.grey),
                  SizedBox(height: 16),
                  Text(
                    'No stock items found',
                    style: TextStyle(color: Colors.grey, fontSize: 16),
                  ),
                ],
              ),
            );
          }

          if (_filteredStock.isEmpty && _searchController.text.isNotEmpty) {
            return const Center(
              child: Text('No items match your search'),
            );
          }

          final displayList = _searchController.text.isEmpty
              ? dataProvider.stockItems
              : _filteredStock;

          return ListView.builder(
            itemCount: displayList.length,
            padding: const EdgeInsets.all(8),
            itemBuilder: (context, index) {
              final Stock item = displayList[index];
              return Card(
                elevation: 2,
                margin: const EdgeInsets.only(bottom: 8),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: Colors.orange.withOpacity(0.1),
                    child: Text(
                      item.itemName.isNotEmpty
                          ? item.itemName[0].toUpperCase()
                          : '?',
                      style: const TextStyle(
                        color: Colors.orange,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  title: Text(
                    item.itemName,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  subtitle: Text('Unit: ${item.baseUnit ?? "N/A"}'),
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        'Qty: ${item.closingStock?.toStringAsFixed(2) ?? "0"}',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      Text(
                        'Val: ₹${item.closingValue?.toStringAsFixed(2) ?? "0.00"}',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
