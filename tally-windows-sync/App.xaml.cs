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
        private static bool _hasShownTrayMinimizeHint;
        private static bool _isExiting;

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
            ShutdownMode = ShutdownMode.OnExplicitShutdown;

            // 1. Settings first (needed by several services below)
            LoadSettings();

            // 2. Logging (NLog + a safe console logger)
            InitializeLogging();

            // Auto-check GitHub Releases & stage updates silently in background (Antigravity-style)
            GitHubAutoUpdater.StatusChanged += (_, st) =>
            {
                if (st.State == AutoUpdateState.ReadyToInstall && !string.IsNullOrWhiteSpace(st.LatestVersion))
                {
                    try
                    {
                        ToastService.Show(
                            "SYNCORA Update Ready",
                            $"Version v{st.LatestVersion} downloaded. Click Restart & Update in the app to apply.",
                            false);
                    }
                    catch { }
                }
            };
            GitHubAutoUpdater.StartBackgroundUpdater();

            // 3. Parse command line: /auto (login autostart) and /installation@1 (post-install)
            var cmd = CommandLineOptions.ParseFromEnvironment();

            // 4. Single-instance guard. If another instance is running, activate it and exit.
            _singleInstance = new SingleInstanceGuard();
            if (!_singleInstance.TryAcquire())
            {
                _logger?.LogInformation("Another TallyLink instance is already running — activating it and exiting.");
                try { _singleInstance.SignalExistingInstance(); } catch { }
                Shutdown();
                return;
            }
            _singleInstance.ActivationRequested += (s, ev) => Dispatcher.BeginInvoke(ShowMainWindow);
            _singleInstance.StartActivationPump();

            _logger?.LogInformation("═══════════════════════════════════════════════════════");
            _logger?.LogInformation("  🚀 TallyLink Starting");
            _logger?.LogInformation($"  📅 {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
            _logger?.LogInformation($"  🧭 Mode: {(cmd.IsAutoStart ? "auto-start" : cmd.IsPostInstall ? "post-install" : "normal")}");
            _logger?.LogInformation($"  🖥  Machine: {DeviceIdentityService.Cached?.MachineName ?? "unknown"}");
            _logger?.LogInformation("═══════════════════════════════════════════════════════");

            // 5. Device identity (stable machine id used by telemetry)
            try { DeviceIdentityService.Refresh(); } catch (Exception ex) { _logger?.LogWarning(ex, "DeviceIdentity init failed"); }

            // 6. Autostart registry entry: always sync on startup (not only in /auto) so
            // normal launches & updates register HKCU\...\Run\SyncoraConnector automatically.
            _startupService = new StartupService();
            try
            {
#if !DEBUG
                var desiredStartWithWindows = _settings?.SyncSettings?.StartWithWindows ?? true;
                _startupService.Sync(desiredStartWithWindows);
#endif
                _logger?.LogInformation("Autostart state: " + _startupService.DescribeState());
            }
            catch (Exception ex) { _logger?.LogWarning(ex, "StartupService failed"); }

            try
            {
                Microsoft.Win32.SystemEvents.SessionSwitch += OnSystemSessionSwitch;
            }
            catch { }

            // 7. Auth
            InitializeAuth();

            // 8. System tray + toasts (always visible so Close X -> Tray works anytime like Livekeeping)
            try
            {
                _tray = new TrayService();
                _tray.Initialize(new TrayOptions
                {
                    ShowWindow = () => Dispatcher.BeginInvoke(ShowMainWindow),
                    HideWindow = () => Dispatcher.BeginInvoke(() => HideMainWindow(showHintToast: false)),
                    SyncNow = () =>
                    {
                        try { TriggerImmediateSync(); } catch (Exception ex) { _logger?.LogWarning(ex, "SyncNow failed"); }
                    },
                    OpenLogFolder = () =>
                    {
                        try { Process.Start(new ProcessStartInfo(LoggingService.LogDirectory) { UseShellExecute = true }); } catch (Exception ex) { _logger?.LogWarning(ex, "OpenLogFolder failed"); }
                    },
                    Exit = () => Dispatcher.BeginInvoke(() => RequestTrayExit(confirm: true)),
                    #if DEBUG
                    Tooltip = $"SYNCORA Debug {DeviceIdentityService.Cached?.DesktopVersion ?? ""}",
#else
                    Tooltip = $"SYNCORA {DeviceIdentityService.Cached?.DesktopVersion ?? ""}",
#endif
                    StartHidden = false
                });
                ToastService.Attach(_tray.Icon!);
                GetSyncManager().StatusChanged += OnSyncManagerStatusChangedForTray;
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
                        try { TriggerImmediateSync(); } catch (Exception ex) { _logger?.LogWarning(ex, "force_sync failed"); }
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
                // Auto-start at PC boot: stay completely silent in System Tray with zero window flash.
                if (_authService!.IsLoggedIn)
                {
                    _tray?.ShowTrayIcon();
                    _tray?.SyncVisibilityWithWindow(false);
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

            // 13. Auto-sync must survive a restart: StartSync() used to be reachable only
            // from the tray "Sync Now", the UI button, or a SignalR force_sync push which
            // meant a relaunched app silently did nothing until the user clicked something.
            if (_authService!.IsLoggedIn && !cmd.IsPostInstall)
            {
                try { GetSyncManager().StartSync(); }
                catch (Exception ex) { _logger?.LogWarning(ex, "Auto-sync start failed"); }
            }
            else if (_authService!.IsLoggedIn && cmd.IsPostInstall)
            {
                GetSyncManager().StopSync();
                _logger?.LogInformation("Post-install verification: auto-sync paused. Use Auto-Sync to resume.");
            }

            // 14. Auto-start bundled WhatsApp QR helper silently if already linked (works even in /auto tray startup)
            if (_authService!.IsLoggedIn && WhatsAppHelperManager.HasSavedSession())
            {
                _ = Task.Run(async () =>
                {
                    try { await WhatsAppHelperManager.EnsureStartedAsync(); }
                    catch (Exception ex) { _logger?.LogWarning(ex, "WhatsApp helper auto-start failed"); }
                });
            }
        }

        /// <summary>
        /// Checks if .NET 8 Desktop Runtime is installed by looking for the shared runtime folder.
        /// </summary>
        private static bool HasNet8Runtime()
        {
            try
            {
                // Installed folders are versioned (8.0.23), never a bare "8.0".
                string runtimeRoot = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    "dotnet", "shared", "Microsoft.WindowsDesktop.App");
                return Directory.Exists(runtimeRoot) && Directory.EnumerateDirectories(runtimeRoot)
                    .Any(d => Version.TryParse(Path.GetFileName(d), out var v) && v.Major == 8);
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
            }
            else
            {
                // User closed login window without logging in
                Shutdown();
            }
        }

        private void ShowMainWindow()
        {
            if (_mainWindow == null || _mainWindow.IsClosed)
                _mainWindow = new MainWindow();

            _mainWindow.ShowInTaskbar = true;
            if (!_mainWindow.IsVisible)
                _mainWindow.Show();
            if (_mainWindow.WindowState == WindowState.Minimized)
                _mainWindow.WindowState = WindowState.Normal;

            _mainWindow.Activate();
            try
            {
                _mainWindow.Topmost = true;
                _mainWindow.Topmost = false;
            }
            catch { }

            _tray?.ShowTrayIcon();
            _tray?.SyncVisibilityWithWindow(true);
        }

        internal void HideMainWindow(bool showHintToast = false)
        {
            if (_mainWindow != null)
            {
                _mainWindow.Hide();
            }
            _tray?.SyncVisibilityWithWindow(false);
            _tray?.ShowTrayIcon();

            if (showHintToast && !_hasShownTrayMinimizeHint)
            {
                _hasShownTrayMinimizeHint = true;
                try
                {
                    ToastService.Show(
                        "SYNCORA Running in Background",
                        "Auto-sync & WhatsApp notifications stay active. Right-click the tray icon to Quit.",
                        false);
                }
                catch { }
            }
        }

        internal void RequestTrayExit(bool confirm = true)
        {
            if (_isExiting) return;
            if (confirm)
            {
                var answer = MessageBox.Show(
                    "Quit SYNCORA Connector?\n\nAuto-sync aur WhatsApp notifications tab tak ruk jayenge jab tak app dobara nahi kholte.",
                    "Quit SYNCORA Connector",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Question);
                if (answer != MessageBoxResult.Yes) return;
            }

            _isExiting = true;
            if (_mainWindow != null)
                _mainWindow.AllowRealClose = true;
            Shutdown();
        }

        public void ApplyStartWithWindows(bool enabled)
        {
            try
            {
                _startupService?.Sync(enabled);
                _logger?.LogInformation("Autostart updated: " + (_startupService?.DescribeState() ?? enabled.ToString()));
            }
            catch (Exception ex)
            {
                _logger?.LogWarning(ex, "ApplyStartWithWindows failed");
            }
        }

        private void OnSyncManagerStatusChangedForTray(object? sender, SyncStatus status)
        {
            try
            {
                _tray?.SetStatus(status.Message, status.IsServerConnected);
            }
            catch { }
        }

        private void OnSystemSessionSwitch(object? sender, Microsoft.Win32.SessionSwitchEventArgs e)
        {
            if (e.Reason != Microsoft.Win32.SessionSwitchReason.SessionUnlock) return;
            if (_authService?.IsLoggedIn != true) return;

            _ = Task.Run(async () =>
            {
                try
                {
                    var mgr = GetSyncManager();
                    if (!mgr.IsAutoSyncRunning)
                        Dispatcher.BeginInvoke(() => { try { mgr.StartSync(); } catch { } });
                    if (WhatsAppHelperManager.HasSavedSession())
                        await WhatsAppHelperManager.EnsureStartedAsync();
                }
                catch { }
            });
        }

        protected override void OnExit(ExitEventArgs e)
        {
            _logger?.LogInformation("Application shutting down...");
            try { Microsoft.Win32.SystemEvents.SessionSwitch -= OnSystemSessionSwitch; } catch { }
            try { if (_syncManager != null) _syncManager.StatusChanged -= OnSyncManagerStatusChangedForTray; } catch { }
            try { WhatsAppHelperManager.StopOwnedHelper(); } catch { }
            try { _syncManager?.StopSync(); } catch { }
            try { _realtime?.Stop(); } catch { }
            try { _tray?.Dispose(); } catch { }
            try { _singleInstance?.Release(); } catch { }
            try { _startupService?.Dispose(); } catch { }
            try { _loggerFactory?.Dispose(); } catch { }
            try { LoggingService.Shutdown(); } catch { }
            try
            {
                if (GitHubAutoUpdater.TryGetReadyPendingUpdate(out var nextVer, out _))
                {
                    _logger?.LogInformation($"Applying downloaded update v{nextVer} on exit...");
                    GitHubAutoUpdater.LaunchPendingUpdate(relaunchAfterInstall: false);
                }
            }
            catch { }
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

            // First line, so the log folder is never empty on a fresh install.
            try { LoggingService.AppLogger.Info($"TallyLink started {DateTime.Now:O}"); } catch { }

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
            try { LoggingService.AppLogger.Error(exception, "Unhandled exception occurred"); } catch { }

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
            try { LoggingService.AppLogger.Error(e.Exception, "Dispatcher unhandled exception"); } catch { }

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

        private static void TriggerImmediateSync()
        {
            var mgr = GetSyncManager();
            if (mgr.IsAutoSyncRunning) _ = mgr.RunManualSyncAsync();
            else mgr.StartSync();
        }

        /// <summary>
        /// Logout and show login window
        /// </summary>
        public static void Logout()
        {
            _authService?.SignOut();

            // Closing the main window must not end the app - the login window follows.
            Current.ShutdownMode = ShutdownMode.OnExplicitShutdown;

            // Close all windows (bypass close-to-tray interception on logout)
            if (_mainWindow != null)
            {
                _mainWindow.AllowRealClose = true;
            }
            foreach (Window window in Current.Windows)
            {
                window.Close();
            }
            _mainWindow = null;

            // Show login again
            ((App)Current).ShowLoginWindow();
        }
    }
}
