using System;
using System.Windows;
using System.IO;
using System.Reflection;
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
    public partial class App : System.Windows.Application
    {
        private const string LegacyLocalMockSupabaseUrl = "http://localhost:5000/api/mock/supa";
        private const string LegacyLocalMockSupabaseKey = "mock_key";

        private static ILoggerFactory? _loggerFactory;
        private static ILogger<App>? _logger;
        private static SyncManager? _syncManager;
        private static AuthService? _authService;
        private static AppSettings? _settings;
        private static TrayService? _trayService;
        private static BandwidthMonitor? _bandwidthMonitor;
        private static DataValidationService? _dataValidationService;
        private static MainWindow? _mainWindow;

        public static AuthService AuthService => _authService!;
        public static AppSettings Settings => _settings!;
        public static TrayService TrayService => _trayService!;
        public static BandwidthMonitor BandwidthMonitor => _bandwidthMonitor!;
        public static DataValidationService DataValidationService => _dataValidationService!;

        static App()
        {
            AppContext.SetSwitch("Switch.System.Windows.Input.Stylus.EnablePointerSupport", false);
        }

        protected override void OnStartup(System.Windows.StartupEventArgs e)
        {
            // DEBUG: Write immediately to confirm new code is running
            try
            {
                Directory.CreateDirectory(@"C:\Users\Admin\logs");
                File.WriteAllText(@"C:\Users\Admin\logs\tallylink-debug.log",
                    $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] NEW BUILD RUNNING\n");
            }
            catch { }

            base.OnStartup(e);

            // Initialize services
            _bandwidthMonitor = new BandwidthMonitor();
            _dataValidationService = new DataValidationService();

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

            bool startMinimized = AutoStartService.ShouldStartMinimized();

            // Check if already logged in
            if (_authService!.IsLoggedIn)
            {
                _logger?.LogInformation($"User already logged in: {_authService.CurrentSession?.Email}");
                ShowMainWindow(startMinimized);
            }
            else
            {
                if (startMinimized)
                {
                    // Auto-start with --minimized but not logged in: just show tray
                    _trayService = new TrayService(
                        () => ShowMainWindow(false),
                        () => _syncManager?.StartSync(),
                        () => _syncManager?.StopSync(),
                        () => _syncManager?.Status.State == SyncState.Syncing);
                    _trayService.Initialize();
                    NotificationService.Initialize(_trayService);
                }
                else
                {
                    ShowLoginWindow();
                }
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

            // Keep Supabase URLs as-is if they point to a real Supabase project
            var currentUrl = settings.AuthSettings.SupabaseUrl ?? string.Empty;
            bool isDirectSupabase = currentUrl.Contains(".supabase.co", StringComparison.OrdinalIgnoreCase);

            if (isDirectSupabase)
            {
                // Don't overwrite real Supabase URLs with mock URLs
                return false;
            }

            // Only build mock URL for non-Supabase endpoints (legacy InsForge)
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

        private void ShowMainWindow(bool startMinimized = false)
        {
            _trayService = new TrayService(
                () =>
                {
                    if (_mainWindow != null)
                    {
                        _mainWindow.Show();
                        _mainWindow.WindowState = WindowState.Normal;
                        _mainWindow.Activate();
                    }
                },
                () => _syncManager?.StartSync(),
                () => _syncManager?.StopSync(),
                () => _syncManager?.Status.State == SyncState.Syncing);
            _trayService.Initialize();
            NotificationService.Initialize(_trayService);

            _mainWindow = new MainWindow();
            _mainWindow.Show();

            if (startMinimized)
            {
                _mainWindow.WindowState = WindowState.Minimized;
                _mainWindow.Hide();
                _trayService.MinimizeToTray(_mainWindow);
            }
        }

        protected override void OnExit(System.Windows.ExitEventArgs e)
        {
            _logger?.LogInformation("Application shutting down...");
            _syncManager?.StopSync();
            _trayService?.Dispose();
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
            WriteCrashLog(exception);
            
            MessageBox.Show(
                $"An unexpected error occurred:\n\n{exception?.Message}\n\nThe application will now close.",
                "Critical Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }

        private void OnDispatcherUnhandledException(object sender, 
            System.Windows.Threading.DispatcherUnhandledExceptionEventArgs e)
        {
            // CRITICAL: Suppress WPF keyboard input pipeline bug (NullReferenceException)
            // This is a known .NET 8 WPF bug - flood of exceptions on every keystroke/mouse move
            if (IsWpfInputPipelineException(e.Exception))
            {
                e.Handled = true;
                return; // Silent - no logging, no popup
            }

            _logger?.LogError(e.Exception, "Dispatcher unhandled exception");
            WriteCrashLog(e.Exception);

            e.Handled = true;
        }

        private static bool IsWpfInputPipelineException(Exception exception)
        {
            var stack = exception.ToString();

            if (exception is NullReferenceException
                && (stack.Contains("KeyboardDevice", StringComparison.Ordinal)
                    || stack.Contains("MouseDevice", StringComparison.Ordinal)
                    || stack.Contains("HwndKeyboardInputProvider", StringComparison.Ordinal)
                    || stack.Contains("HwndMouseInputProvider", StringComparison.Ordinal)
                    || stack.Contains("StylusWisp", StringComparison.Ordinal)
                    || stack.Contains("TextCompositionManager", StringComparison.Ordinal)
                    || stack.Contains("InputManager", StringComparison.Ordinal)))
            {
                return true;
            }

            if (exception is ArgumentNullException argumentNull
                && stack.Contains("System.Windows.Input.TextCompositionManager", StringComparison.Ordinal))
            {
                return true;
            }

            return false;
        }

        private static void WriteCrashLog(Exception? exception)
        {
            try
            {
                var logPath = @"C:\Users\Admin\logs";
                Directory.CreateDirectory(logPath);
                File.AppendAllText(
                    Path.Combine(logPath, "tallylink-crash.log"),
                    $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}]\n{exception}\n\n");
            }
            catch
            {
            }
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
