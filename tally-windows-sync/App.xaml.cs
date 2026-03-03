using System;
using System.Windows;
using System.IO;
using Microsoft.Extensions.Logging;
using TallySyncApp.Services;
using TallySyncApp.Models;
using Newtonsoft.Json;

namespace TallySyncApp
{
    /// <summary>
    /// Main Application Entry Point
    /// Tally ERP Sync Application for Windows
    /// </summary>
    public partial class App : Application
    {
        private const string LegacyLocalMockSupabaseUrl = "http://localhost:5000/api/mock/supa";
        private const string LegacyLocalMockSupabaseKey = "mock_key";

        private static ILoggerFactory? _loggerFactory;
        private static ILogger<App>? _logger;
        private static SyncManager? _syncManager;
        private static AuthService? _authService;
        private static AppSettings? _settings;

        public static AuthService AuthService => _authService!;
        public static AppSettings Settings => _settings!;

        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            // Load settings first
            LoadSettings();

            // Initialize logging
            InitializeLogging();

            // Initialize auth service
            InitializeAuth();

            // Log startup
            _logger?.LogInformation("==============================================");
            _logger?.LogInformation("Tally Sync Application Starting");
            _logger?.LogInformation($"Start Time: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
            _logger?.LogInformation("==============================================");

            // Handle unhandled exceptions
            AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;
            DispatcherUnhandledException += OnDispatcherUnhandledException;

            // Check if already logged in
            if (_authService!.IsLoggedIn)
            {
                _logger?.LogInformation($"User already logged in: {_authService.CurrentSession?.Email}");
                ShowMainWindow();
            }
            else
            {
                // Show login window
                ShowLoginWindow();
            }
        }

        private void LoadSettings()
        {
            try
            {
                string settingsPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "appsettings.json");
                if (File.Exists(settingsPath))
                {
                    var json = File.ReadAllText(settingsPath);
                    _settings = JsonConvert.DeserializeObject<AppSettings>(json) ?? new AppSettings();

                    var migrated = NormalizeLegacyCloudConfig(_settings);
                    if (migrated)
                    {
                        SaveSettingsFile(settingsPath, _settings);
                    }
                }
                else
                {
                    _settings = new AppSettings();
                }
            }
            catch
            {
                _settings = new AppSettings();
            }
        }

        private static bool NormalizeLegacyCloudConfig(AppSettings settings)
        {
            if (settings.AuthSettings == null)
            {
                settings.AuthSettings = new AuthSettings();
            }

            var currentUrl = settings.AuthSettings.SupabaseUrl ?? string.Empty;
            bool isDirectSupabase = currentUrl.Contains(".supabase.co", StringComparison.OrdinalIgnoreCase);

            if (!isDirectSupabase)
            {
                return false;
            }

            settings.AuthSettings.SupabaseUrl = BuildMockSupabaseUrl(settings.SyncSettings?.ApiBaseUrl);
            settings.AuthSettings.SupabaseAnonKey = LegacyLocalMockSupabaseKey;
            return true;
        }

        private static string BuildMockSupabaseUrl(string? apiBaseUrl)
        {
            if (string.IsNullOrWhiteSpace(apiBaseUrl))
            {
                return LegacyLocalMockSupabaseUrl;
            }

            var baseUrl = apiBaseUrl.TrimEnd('/');

            if (baseUrl.EndsWith("/api/v1", StringComparison.OrdinalIgnoreCase))
            {
                return baseUrl[..^"/api/v1".Length] + "/api/mock/supa";
            }

            if (baseUrl.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
            {
                return baseUrl + "/mock/supa";
            }

            return baseUrl + "/api/mock/supa";
        }

        private static void SaveSettingsFile(string settingsPath, AppSettings settings)
        {
            try
            {
                var updatedJson = JsonConvert.SerializeObject(settings, Formatting.Indented);
                File.WriteAllText(settingsPath, updatedJson);
            }
            catch
            {
                // Best-effort migration write.
            }
        }

        private void InitializeAuth()
        {
            var supabaseUrl = _settings?.AuthSettings?.SupabaseUrl ?? "";
            var supabaseKey = _settings?.AuthSettings?.SupabaseAnonKey ?? "";

            if (string.IsNullOrWhiteSpace(supabaseUrl))
            {
                supabaseUrl = BuildMockSupabaseUrl(_settings?.SyncSettings?.ApiBaseUrl);
            }

            if (string.IsNullOrWhiteSpace(supabaseKey))
            {
                supabaseKey = LegacyLocalMockSupabaseKey;
            }

            _authService = new AuthService(supabaseUrl, supabaseKey);
        }

        private void ShowLoginWindow()
        {
            var loginWindow = new LoginWindow(_authService!);
            var result = loginWindow.ShowDialog();

            if (result == true && loginWindow.LoginSuccessful)
            {
                _logger?.LogInformation($"User logged in: {_authService!.CurrentSession?.Email}");
                ShowMainWindow();
            }
            else
            {
                // User closed login window without logging in
                Shutdown();
            }
        }

        private void ShowMainWindow()
        {
            var mainWindow = new MainWindow();
            mainWindow.Show();
        }

        protected override void OnExit(ExitEventArgs e)
        {
            _logger?.LogInformation("Application shutting down...");
            _syncManager?.StopSync();
            _loggerFactory?.Dispose();
            base.OnExit(e);
        }

        private void InitializeLogging()
        {
            try
            {
                // Ensure logs directory exists
                string logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs");
                Directory.CreateDirectory(logPath);

                _loggerFactory = LoggerFactory.Create(builder =>
                {
                    builder
                        .SetMinimumLevel(LogLevel.Information)
                        .AddConsole();
                });

                _logger = _loggerFactory.CreateLogger<App>();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to initialize logging: {ex.Message}", 
                    "Initialization Error", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        private void OnUnhandledException(object sender, UnhandledExceptionEventArgs e)
        {
            var exception = e.ExceptionObject as Exception;
            _logger?.LogError(exception, "Unhandled exception occurred");
            
            MessageBox.Show(
                $"An unexpected error occurred:\n\n{exception?.Message}\n\nThe application will now close.",
                "Critical Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }

        private void OnDispatcherUnhandledException(object sender, 
            System.Windows.Threading.DispatcherUnhandledExceptionEventArgs e)
        {
            _logger?.LogError(e.Exception, "Dispatcher unhandled exception");
            
            MessageBox.Show(
                $"An error occurred:\n\n{e.Exception.Message}",
                "Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);

            e.Handled = true;
        }

        public static SyncManager GetSyncManager()
        {
            _syncManager ??= new SyncManager();
            return _syncManager;
        }

        /// <summary>
        /// Logout and show login window
        /// </summary>
        public static void Logout()
        {
            _authService?.SignOut();
            
            // Close all windows
            foreach (Window window in Current.Windows)
            {
                window.Close();
            }

            // Show login again
            ((App)Current).ShowLoginWindow();
        }
    }
}
