import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'screens/dashboard_screen.dart';

const String defaultCompanyId =
    String.fromEnvironment('DEFAULT_COMPANY_ID', defaultValue: '');
const String configuredApiBaseUrl =
    String.fromEnvironment('API_BASE_URL', defaultValue: '');

void main() {
  runApp(const TallyApp());
}

class TallyApp extends StatelessWidget {
  const TallyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LiveKeeping Tally',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        primarySwatch: Colors.blue,
        scaffoldBackgroundColor: const Color(0xFFF3F4F6),
        textTheme: GoogleFonts.interTextTheme(
          Theme.of(context).textTheme,
        ),
      ),
      home: defaultCompanyId.isNotEmpty
          ? const DashboardScreen(companyId: defaultCompanyId)
          : const MissingConfigurationScreen(),
    );
  }
}

class MissingConfigurationScreen extends StatelessWidget {
  const MissingConfigurationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final apiValue = configuredApiBaseUrl.isEmpty
        ? '(not set)'
        : configuredApiBaseUrl;

    return Scaffold(
      appBar: AppBar(title: const Text('LiveKeeping Setup')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Mobile app is not configured yet',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            const Text(
              'Pass runtime configuration before shipping this app:',
              style: TextStyle(fontSize: 16),
            ),
            const SizedBox(height: 16),
            const SelectableText(
              '--dart-define=API_BASE_URL=https://your-api.example.com/api/v1/data',
            ),
            const SizedBox(height: 8),
            const SelectableText(
              '--dart-define=DEFAULT_COMPANY_ID=your-company-id',
            ),
            const SizedBox(height: 24),
            const Text(
              'Current values',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            SelectableText('API_BASE_URL: $apiValue'),
            const SizedBox(height: 8),
            const SelectableText('DEFAULT_COMPANY_ID: (not set)'),
          ],
        ),
      ),
    );
  }
}
