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
            _logger?.LogInformation("═══════════════════════════════════════════════════════");
            _logger?.LogInformation("  🚀 Tally Sync Application Starting");
            _logger?.LogInformation($"  📅 {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
            _logger?.LogInformation("═══════════════════════════════════════════════════════");

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

        private void InitializeAuth()
        {
            var supabaseUrl = _settings?.AuthSettings?.SupabaseUrl ?? "";
            var supabaseKey = _settings?.AuthSettings?.SupabaseAnonKey ?? "";

            if (string.IsNullOrEmpty(supabaseUrl) || string.IsNullOrEmpty(supabaseKey))
            {
                // Credentials should be loaded from appsettings.json
                supabaseUrl = "";
                supabaseKey = "";
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
            base.OnExit(e);
        }

        private void InitializeLogging()
        {
            try
            {
                // Ensure logs directory exists
                string logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs");
                Directory.CreateDirectory(logPath);

                using var loggerFactory = LoggerFactory.Create(builder =>
                {
                    builder
                        .SetMinimumLevel(LogLevel.Information)
                        .AddConsole();
                });

                _logger = loggerFactory.CreateLogger<App>();
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
