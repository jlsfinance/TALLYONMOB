using System;
using System.Windows;
using System.IO;
using Microsoft.Extensions.Logging;
using TallySyncApp.Services;
using TallySyncApp.Models;
using TallySyncApp.Views;
using Newtonsoft.Json;
using System.Windows.Threading;
using Clowd.Squirrel;
using System.Linq;
using System.Threading.Tasks;

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

        protected override async void OnStartup(StartupEventArgs e)
        {
            // [CRITICAL] Handle Squirrel Install/Update events
            SquirrelAwareApp.HandleEvents(
                onInitialInstall: (v, t) => CreateShortcuts(),
                onAppUpdate: (v, t) => CreateShortcuts(),
                onAppUninstall: (v, t) => RemoveShortcuts()
            );

            base.OnStartup(e);

            // Prevent app from closing when LoginWindow closes before MainWindow opens
            ShutdownMode = ShutdownMode.OnExplicitShutdown;

            // Load settings first
            LoadSettings();

            // Initialize logging
            InitializeLogging();

            // Check for updates in background (Silent)
            _ = Task.Run(async () => await CheckForUpdates());

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

        private async Task CheckForUpdates()
        {
            try
            {
                // GitHub Repo URL (Using correct format for Clowd.Squirrel)
                string repoUrl = "https://github.com/jlsfinance/TALLYONMOB";

                using (var mgr = await UpdateManager.GitHubUpdateManager(repoUrl))
                {
                    var updateInfo = await mgr.CheckForUpdate();

                    if (updateInfo.ReleasesToApply.Any())
                    {
                        _logger?.LogInformation($"Update found! Silently downloading in background...");

                        // Silent download and apply
                        await mgr.DownloadReleases(updateInfo.ReleasesToApply);
                        await mgr.ApplyReleases(updateInfo);
                        
                        _logger?.LogInformation("Update applied successfully. Changes will take effect on next restart.");
                    }
                }
            }
            catch (Exception ex)
            {
                // NEVER crash app if update fails, just log it
                _logger?.LogError($"Silent update check failed: {ex.Message}");
            }
        }

        private void CreateShortcuts()
        {
            using (var mgr = new UpdateManager(""))
            {
                mgr.CreateShortcutForThisExe(ShortcutLocation.Desktop | ShortcutLocation.StartMenu);
            }
        }

        private void RemoveShortcuts()
        {
            using (var mgr = new UpdateManager(""))
            {
                mgr.RemoveShortcutForThisExe(ShortcutLocation.Desktop | ShortcutLocation.StartMenu);
            }
        }
        
        private void ShowWelcomeMessage()
        {
            MessageBox.Show("Welcome to TallyLink! Installation Complete.", "TallyLink", MessageBoxButton.OK, MessageBoxImage.Information);
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
            this.MainWindow = mainWindow;
            mainWindow.Show();
            
            // Now that main window is open, we can close the app when it's closed
            ShutdownMode = ShutdownMode.OnMainWindowClose;
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
