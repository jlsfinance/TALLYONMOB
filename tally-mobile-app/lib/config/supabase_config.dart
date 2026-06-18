import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Supabase configuration
/// Replace with your actual Supabase project credentials
class SupabaseConfig {
  // Supabase URL from web dashboard
  static String get url => dotenv.env['SUPABASE_URL'] ?? '';

  // Supabase Anon Key from web dashboard
  static String get anonKey => dotenv.env['SUPABASE_ANON_KEY'] ?? '';

  // API configuration for sync backend (if needed)
  static const String apiBaseUrl =
      'https://your-api-server.com'; // TODO: Update if custom backend is deployed
  static const String apiKey = 'your_secret_sync_key_here';
}
