import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';
import 'providers/company_provider.dart';
import 'services/api_service.dart';
import 'services/storage_service.dart';
import 'services/sync_service.dart';
import 'screens/dashboard_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize storage first (reads SharedPreferences)
  final storage = StorageService();
  await storage.init();

  // Create singleton services
  final apiService = ApiService();
  final syncService = SyncService(apiService, storage);
  final authProvider = AuthProvider(storage);
  final companyProvider = CompanyProvider(apiService, storage);

  // Restore any existing session
  await authProvider.restoreSession();

  // Wire token into the API service
  apiService.setToken(authProvider.token);

  // If authenticated and company was selected, restore sync timestamp
  if (authProvider.authenticated && companyProvider.selectedCompanyId != null) {
    await syncService.restoreLastSync(companyProvider.selectedCompanyId!);
  }

  runApp(
    TallyApp(
      apiService: apiService,
      storageService: storage,
      syncService: syncService,
      authProvider: authProvider,
      companyProvider: companyProvider,
    ),
  );
}

class TallyApp extends StatelessWidget {
  final ApiService apiService;
  final StorageService storageService;
  final SyncService syncService;
  final AuthProvider authProvider;
  final CompanyProvider companyProvider;

  const TallyApp({
    super.key,
    required this.apiService,
    required this.storageService,
    required this.syncService,
    required this.authProvider,
    required this.companyProvider,
  });

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: authProvider),
        ChangeNotifierProvider.value(value: companyProvider),
        ChangeNotifierProvider.value(value: syncService),
        Provider.value(value: apiService),
        Provider.value(value: storageService),
      ],
      child: MaterialApp(
        title: 'LiveKeeping Tally',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          primarySwatch: Colors.blue,
          scaffoldBackgroundColor: const Color(0xFFF3F4F6),
          textTheme: GoogleFonts.interTextTheme(
            Theme.of(context).textTheme,
          ),
        ),
        home: Consumer<AuthProvider>(
          builder: (context, auth, _) {
            if (auth.loading) {
              return const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              );
            }
            if (!auth.authenticated) {
              // TODO: Replace with login screen
              return Scaffold(
                appBar: AppBar(title: const Text('LiveKeeping Tally')),
                body: const Center(
                  child: Text('Not authenticated — login screen coming soon'),
                ),
              );
            }
            return Consumer<CompanyProvider>(
              builder: (context, companyProvider, _) {
                final companyId = companyProvider.selectedCompanyId;
                if (companyId == null) {
                  // TODO: Replace with company selection screen
                  return Scaffold(
                    appBar: AppBar(title: const Text('Select Company')),
                    body: const Center(
                      child: Text('No company selected — selector coming soon'),
                    ),
                  );
                }
                return DashboardScreen(companyId: companyId);
              },
            );
          },
        ),
      ),
    );
  }
}
