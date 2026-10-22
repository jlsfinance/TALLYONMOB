using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Extensions.Logging;
using TallySyncApp.Services;
using TallySyncApp.Models;
using Newtonsoft.Json;
using Squirrel;

namespace TallySyncApp
{
    /// <summary>
    /// Main Application Entry Point
    /// Tally ERP Sync Application for Windows
    ///
    /// Wiring for the LiveKeeping-parity desktop experience (see FINDINGS.md):
    /// single-instance guard, autostart, system tray + toasts, structured NLog
    /// logging, device identity, activity telemetry, real-time server channel,
    /// and an auto-update check. Each service is started defensively so a
    /// misconfiguration never prevents the app from launching.
    /// </summary>
    public partial class App : Application
    {
        private static ILoggerFactory? _loggerFactory;
        private static ILogger<App>? _logger;
        private static SyncManager? _syncManager;
        private static AuthService? _authService;
        private static AppSettings? _settings;

        // Parity services
        private static TrayService? _tray;
        private static SingleInstanceGuard? _singleInstance;
        private static StartupService? _startupService;
        private static RealtimeService? _realtime;

        private static MainWindow? _mainWindow;

        public static AuthService AuthService => _authService!;
        public static AppSettings Settings => _settings!;
        public static TrayService? Tray => _tray;
        public static RealtimeService? Realtime => _realtime;

        protected override void OnStartup(StartupEventArgs e)
                {
                    // [CRITICAL] Handle Squirrel install/update/uninstall events FIRST,
                    // before any other initialization. Clowd.Squirrel uses this to
                    // manage shortcuts and release application.
                    SquirrelAwareApp.HandleEvents(
                        onInitialInstall: (v, t) => CreateShortcuts(),
                        onAppUpdate: (v, t) => CreateShortcuts(),
                        onAppUninstall: (v, t) => RemoveShortcuts()
                    );

                    base.OnStartup(e);

            // 1. Settings first (needed by several services below)
            LoadSettings();

            // 1. Check .NET 8 Desktop Runtime is installed
            if (!HasNet8Runtime())
            {
                MessageBox.Show(
                    ".NET 8 Desktop Runtime is required to run TallyLink.\n\n" +
                    "Please download and install it from:\n" +
                    "https://dotnet.microsoft.com/download/dotnet/8.0\n\n" +
                    "Then try running TallyLink again.",
                    "Missing .NET Runtime",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
                Shutdown();
                return;
            }

            // 2. Logging (NLog + a safe console logger)
            InitializeLogging();

            // Silent background update check via Clowd.Squirrel + GitHub releases
            _ = Task.Run(async () => await CheckForUpdates());

            // 3. Parse command line: /auto (login autostart) and /installation@1 (post-install)
            var cmd = CommandLineOptions.Parse(e.Args);

            // 4. Single-instance guard. If another instance is running, activate it and exit.
            _singleInstance = new SingleInstanceGuard();
            if (!_singleInstance.TryAcquire())
            {
                _logger?.LogInformation("Another TallyLink instance is already running — activating it and exiting.");
                try { _singleInstance.SignalExistingInstance(); } catch { }
                Shutdown();
                return;
            }
            _singleInstance.ActivationRequested += (s, ev) => ShowMainWindow();
            _singleInstance.StartActivationPump();

            _logger?.LogInformation("═══════════════════════════════════════════════════════");
            _logger?.LogInformation("  🚀 TallyLink Starting");
            _logger?.LogInformation($"  📅 {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
            _logger?.LogInformation($"  🧭 Mode: {(cmd.IsAutoStart ? "auto-start" : cmd.IsPostInstall ? "post-install" : "normal")}");
            _logger?.LogInformation($"  🖥  Machine: {DeviceIdentityService.Cached?.MachineName ?? "unknown"}");
            _logger?.LogInformation("═══════════════════════════════════════════════════════");

            // 5. Device identity (stable machine id used by telemetry)
            try { DeviceIdentityService.Refresh(); } catch (Exception ex) { _logger?.LogWarning(ex, "DeviceIdentity init failed"); }

            // 6. Autostart registry entry. In /auto mode ensure it is enabled.
            _startupService = new StartupService();
            try
            {
                if (cmd.IsAutoStart)
                {
                    _startupService.Sync(true);
                    _logger?.LogInformation("Autostart enabled: HKCU Run\\TallyLink");
                }
                else
                {
                    _logger?.LogInformation("Autostart state: " + _startupService.DescribeState());
                }
            }
            catch (Exception ex) { _logger?.LogWarning(ex, "StartupService failed"); }

            // 7. Auth
            InitializeAuth();

            // 8. System tray + toasts (start hidden; shown when the window is shown)
            try
            {
                _tray = new TrayService();
                _tray.Initialize(new TrayOptions
                {
                    ShowWindow = ShowMainWindow,
                    HideWindow = HideMainWindow,
                    SyncNow = () =>
                    {
                        try { App.GetSyncManager().StartSync(); } catch (Exception ex) { _logger?.LogWarning(ex, "SyncNow failed"); }
                    },
                    OpenLogFolder = () =>
                    {
                        try { Process.Start(new ProcessStartInfo(LoggingService.LogDirectory) { UseShellExecute = true }); } catch (Exception ex) { _logger?.LogWarning(ex, "OpenLogFolder failed"); }
                    },
                    Exit = () => Shutdown(),
                    Tooltip = $"TallyLink {DeviceIdentityService.Cached?.DesktopVersion ?? ""}",
                    StartHidden = true
                });
                ToastService.Attach(_tray.Icon!);
            }
            catch (Exception ex) { _logger?.LogWarning(ex, "Tray init failed"); }

            // 9. Activity telemetry (Supabase REST, offline-safe; disabled until configured)
            try
            {
                var telemetry = TelemetryService.CreateFromConfig();
                if (telemetry != null)
                {
                    telemetry.Diagnostics += (s, msg) => _logger?.LogInformation("[telemetry] {0}", msg);
                    telemetry.Start();
                    telemetry.Track("app_started", description: "desktop", level: TelemetryLevel.Info, requestFrom: "startup");
                }
            }
            catch (Exception ex) { _logger?.LogWarning(ex, "Telemetry init failed"); }

            // 10. Real-time server channel (SignalR push)
            try
            {
                var realtime = RealtimeService.CreateFromConfig();
                if (realtime != null)
                {
                    _realtime = realtime;
                    _realtime.StateChanged += (s, ev) => _logger?.LogInformation("Realtime: {0} -> {1}", ev.OldState, ev.NewState);
                    _realtime.RegisterHandler("force_sync", () =>
                    {
                        try { App.GetSyncManager().StartSync(); } catch (Exception ex) { _logger?.LogWarning(ex, "force_sync failed"); }
                    });
                    _realtime.RegisterHandler<string>("show_message", (msg) =>
                    {
                        ToastService.Show("TallyLink", msg ?? "(no message)", false);
                    });
                    _realtime.Start();
                }
            }
            catch (Exception ex) { _logger?.LogWarning(ex, "Realtime init failed"); }

            // 11. Auto-update check (non-blocking; safe offline)
            try
            {
                var updater = UpdateService.CreateFromConfig();
                if (updater != null)
                {
                    updater.Diagnostics += (s, msg) => _logger?.LogInformation("[update] {0}", msg);
                    updater.UpdateAvailableCallback = async (result) =>
                    {
                        ToastService.Show("TallyLink Update",
                            $"New version {result.LatestVersion} available.", false);
                    };
                    _ = updater.CheckAsync();
                }
            }
            catch (Exception ex) { _logger?.LogWarning(ex, "UpdateService init failed"); }

            // 12. Decide what to show
            if (cmd.IsAutoStart)
            {
                // Auto-start: if a session already exists, run in the tray only.
                if (_authService!.IsLoggedIn)
                {
                    ShowMainWindow();
                    HideMainWindow();
                }
                else
                {
                    ShowLoginWindow();
                }
            }
            else
            {
                if (_authService!.IsLoggedIn) ShowMainWindow();
                else ShowLoginWindow();
            }
        }

        /// <summary>
        /// Checks if .NET 8 Desktop Runtime is installed by looking for the shared runtime folder.
        /// </summary>
        private static bool HasNet8Runtime()
        {
            try
            {
                string runtimePath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    "dotnet", "shared", "Microsoft.WindowsDesktop.App", "8.0");
                return Directory.Exists(runtimePath);
            }
            catch
            {
                return false;
            }
        }

private async Task CheckForUpdates()
        {
            try
            {
                string repoUrl = "https://github.com/jlsfinance/TALLYONMOB";
                using (var mgr = await UpdateManager.GitHubUpdateManager(repoUrl))
                {
                    var updateInfo = await mgr.CheckForUpdate();
                    if (updateInfo.ReleasesToApply.Any())
                    {
                        _logger?.LogInformation("Update found! Silently downloading in background...");
                        await mgr.DownloadReleases(updateInfo.ReleasesToApply);
                        await mgr.ApplyReleases(updateInfo);
                        _logger?.LogInformation("Update applied successfully. Changes will take effect on next restart.");
                    }
                }
            }
            catch (Exception ex)
            {
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
            // The login window is the only window, so with the default OnLastWindowClose
            // mode WPF shuts the app down the moment it closes - the main window would be
            // created into an already dying process. Keep the app alive until we know the
            // outcome of the login.
            ShutdownMode = ShutdownMode.OnExplicitShutdown;

            var loginWindow = new LoginWindow(_authService!);
            var result = loginWindow.ShowDialog();

            if (result == true && loginWindow.LoginSuccessful)
            {
                _logger?.LogInformation($"User logged in: {_authService!.CurrentSession?.Email}");
                ShowMainWindow();
                // Main window is up: from now on closing it should end the app as before.
                ShutdownMode = ShutdownMode.OnLastWindowClose;
            }
            else
            {
                // User closed login window without logging in
                Shutdown();
            }
        }

        private void ShowMainWindow()
        {
            _mainWindow ??= new MainWindow();
            if (_mainWindow.WindowState == WindowState.Minimized)
            {
                _mainWindow.WindowState = WindowState.Normal;
            }
            _mainWindow.Show();
            _mainWindow.Activate();
            // Notify the tray of the new state; calling TrayService.ShowWindow() here would
            // recurse forever, because the tray's "Show window" callback is this very method.
            _tray?.SyncVisibilityWithWindow(true);
        }

        private void HideMainWindow()
        {
            if (_mainWindow != null)
            {
                _mainWindow.Hide();
                _mainWindow.WindowState = WindowState.Minimized;
            }
            // Same recursion hazard as ShowMainWindow(): the tray's "Hide window" callback
            // is this method, so only the state is synced and the icon is made visible.
            _tray?.SyncVisibilityWithWindow(false);
            _tray?.ShowTrayIcon();
        }

        protected override void OnExit(ExitEventArgs e)
        {
            _logger?.LogInformation("Application shutting down...");
            try { _syncManager?.StopSync(); } catch { }
            try { _realtime?.Stop(); } catch { }
            try { _tray?.Dispose(); } catch { }
            try { _singleInstance?.Release(); } catch { }
            try { _startupService?.Dispose(); } catch { }
            try { _loggerFactory?.Dispose(); } catch { }
            try { LoggingService.Shutdown(); } catch { }
            base.OnExit(e);
        }

        private void InitializeLogging()
        {
            try
            {
                // Ensure logs directory exists
                string logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs");
                Directory.CreateDirectory(logPath);
            }
            catch { }

            // NLog (structured, file + optional network targets)
            try { LoggingService.Configure(); } catch { }

            // Keep a simple ILogger<App> alive (do NOT dispose the factory in a using block).
            _loggerFactory = LoggerFactory.Create(builder =>
            {
                builder
                    .SetMinimumLevel(LogLevel.Information)
                    .AddConsole();
            });
            _logger = _loggerFactory.CreateLogger<App>();
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

            // Closing the main window must not end the app - the login window follows.
            Current.ShutdownMode = ShutdownMode.OnExplicitShutdown;

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
