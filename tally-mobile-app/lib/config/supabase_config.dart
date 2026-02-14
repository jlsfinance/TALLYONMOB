/// Supabase configuration
/// Replace with your actual Supabase project credentials
class SupabaseConfig {
  // Supabase URL from web dashboard
  static const String url = 'https://lcsehcwocqvxrrgbmhcz.supabase.co';

  // Supabase Anon Key from web dashboard
  static const String anonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxjc2VoY3dvY3F2eHJyZ2JtaGN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMDg4NTEsImV4cCI6MjA4NDg4NDg1MX0.NcPhO9plyRhijUd4YZlJR2Of_sGBFRKb1HvGDgCMjt4';

  // API configuration for sync backend (if needed)
  static const String apiBaseUrl =
      'https://your-api-server.com'; // TODO: Update if custom backend is deployed
  static const String apiKey = 'your_secret_sync_key_here';
}
