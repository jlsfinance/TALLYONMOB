using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using TallySyncApp.Models;
using TallySyncApp.Services;

namespace TallySyncApp.ViewModels
{
    public class MainViewModel : INotifyPropertyChanged
    {
        private readonly SyncManager _syncManager;
        private readonly LicenseService _licenseService;
        private readonly Timer _licenseRefreshTimer;
        private SyncStatus _status;
        private bool _isSyncing;
        private string _consoleOutput = "";

        // Commands
        public ICommand StartSyncCommand { get; }
        public ICommand StopSyncCommand { get; }
        public ICommand ManualSyncCommand { get; }
        public ICommand ForceResyncCommand { get; }
        public ICommand CopyLogsCommand { get; }
        public ICommand ClearLogsCommand { get; }
        public ICommand ValidateLicenseCommand { get; }
        public ICommand SaveSettingsCommand { get; }
        public ICommand TestConnectionCommand { get; }
        public ICommand DeactivateLicenseCommand { get; }

        // Properties
        public SyncStatus Status
        {
            get => _status;
            set { _status = value; OnPropertyChanged(); }
        }

        public AppSettings Settings => _syncManager.GetSettings();

        public string ConsoleOutput
        {
            get => _consoleOutput;
            set { _consoleOutput = value; OnPropertyChanged(); }
        }

        public ObservableCollection<SyncLogEntry> RecentLogs { get; } = new();
        public ObservableCollection<SyncItemStatus> SyncItems { get; } = new();

        public bool IsSyncing
        {
            get => _isSyncing;
            set { _isSyncing = value; OnPropertyChanged(); }
        }

        private string _userEmail = "";
        public string UserEmail
        {
            get => _userEmail;
            set { _userEmail = value; OnPropertyChanged(); }
        }

        // ── License Properties ──
        private string _licenseStatus = "Not Validated";
        public string LicenseStatus
        {
            get => _licenseStatus;
            set { _licenseStatus = value; OnPropertyChanged(); }
        }

        private string _licensePlan = "";
        public string LicensePlan
        {
            get => _licensePlan;
            set { _licensePlan = value; OnPropertyChanged(); }
        }

        private int _licenseDaysRemaining;
        public int LicenseDaysRemaining
        {
            get => _licenseDaysRemaining;
            set { _licenseDaysRemaining = value; OnPropertyChanged(); }
        }

        private bool _isLicenseValid;
        public bool IsLicenseValid
        {
            get => _isLicenseValid;
            set { _isLicenseValid = value; OnPropertyChanged(); }
        }

        private string _licenseActivatedAt = "";
        public string LicenseActivatedAt
        {
            get => _licenseActivatedAt;
            set { _licenseActivatedAt = value; OnPropertyChanged(); }
        }

        private string _licenseExpiresAt = "";
        public string LicenseExpiresAt
        {
            get => _licenseExpiresAt;
            set { _licenseExpiresAt = value; OnPropertyChanged(); }
        }

        private string _licenseFeatures = "";
        public string LicenseFeatures
        {
            get => _licenseFeatures;
            set { _licenseFeatures = value; OnPropertyChanged(); }
        }

        private string _licenseKey = "";
        public string LicenseKey
        {
            get => _licenseKey;
            set { _licenseKey = value; OnPropertyChanged(); }
        }

        private LicenseInfo? _currentLicenseInfo;
        public LicenseInfo? CurrentLicenseInfo
        {
            get => _currentLicenseInfo;
            set { _currentLicenseInfo = value; OnPropertyChanged(); }
        }

        public MainViewModel()
        {
            _syncManager = App.GetSyncManager();
            _licenseService = new LicenseService();
            _status = _syncManager.Status;

            // Subscribe to status updates
            _syncManager.StatusChanged += (s, status) =>
            {
                Status = status;
                Application.Current.Dispatcher.Invoke(() =>
                {
                    OnPropertyChanged(nameof(Status));
                });
            };

            _syncManager.ItemSynced += (s, item) =>
            {
                Application.Current.Dispatcher.Invoke(() =>
                {
                    SyncItems.Insert(0, item);
                    if (SyncItems.Count > 200) SyncItems.RemoveAt(SyncItems.Count - 1);
                });
            };

            _syncManager.SyncLogRequested += (s, msg) => Log(msg);

            // Initialize Commands
            StartSyncCommand = new RelayCommand(async () => await StartSync());
            StopSyncCommand = new RelayCommand(StopSync);
            ManualSyncCommand = new RelayCommand(async () => await ManualSync());
            ForceResyncCommand = new RelayCommand(async () => await ForceResync());
            CopyLogsCommand = new RelayCommand(CopyLogs);
            ClearLogsCommand = new RelayCommand(ClearLogs);
            ValidateLicenseCommand = new RelayCommand(async () => await ValidateLicense());
            SaveSettingsCommand = new RelayCommand(SaveSettings);
            TestConnectionCommand = new RelayCommand(async () => await TestConnection());
            DeactivateLicenseCommand = new RelayCommand(DeactivateLicense);

            // Redirect Console to UI
            Console.SetOut(new ConsoleWriter(this));

            // Load logs
            Task.Run(async () => await LoadLogs());

            // Log build info
            try
            {
                var exePath = Environment.ProcessPath;
                var buildStamp = !string.IsNullOrWhiteSpace(exePath) && File.Exists(exePath)
                    ? File.GetLastWriteTime(exePath).ToString("yyyy-MM-dd HH:mm:ss")
                    : "unknown";
                Log($"Build: {buildStamp} | v3.0.0");
            }
            catch { }

            // Auto-validate license on startup
            Task.Run(async () => await AutoValidateLicense());

            // Periodic license re-validation every 30 minutes
            _licenseRefreshTimer = new Timer(
                async _ => await PeriodicLicenseCheck(),
                null,
                TimeSpan.FromMinutes(30),
                TimeSpan.FromMinutes(30));
        }

        /// <summary>
        /// Auto-validate on startup: try cache first, then server.
        /// </summary>
        private async Task AutoValidateLicense()
        {
            // Try loading from cache first (instant UI update)
            var cached = _licenseService.LoadCachedLicense();
            if (cached != null && cached.IsValid)
            {
                Application.Current.Dispatcher.Invoke(() => ApplyLicenseInfo(cached));
                Log("License loaded from cache.");
            }

            // Then validate with server (background refresh)
            await ValidateLicense(silent: true);
        }

        /// <summary>
        /// Periodic license check (background).
        /// </summary>
        private async Task PeriodicLicenseCheck()
        {
            try
            {
                var authService = App.AuthService;
                if (authService == null || !authService.IsLoggedIn) return;

                var token = await authService.RefreshTokenIfNeededAsync();
                if (string.IsNullOrEmpty(token)) return;

                var result = await _licenseService.ValidateLicenseAsync(token);
                Application.Current.Dispatcher.Invoke(() => ApplyLicenseInfo(result));
            }
            catch { /* ignore periodic check errors */ }
        }

        /// <summary>
        /// Validates license with server. Shows error if not silent.
        /// </summary>
        private async Task ValidateLicense(bool silent = false)
        {
            try
            {
                var authService = App.AuthService;
                if (authService == null || !authService.IsLoggedIn)
                {
                    if (!silent)
                    {
                        Log("Please login first.");
                        MessageBox.Show("Please login first.", "Login Required",
                            MessageBoxButton.OK, MessageBoxImage.Warning);
                    }
                    return;
                }

                var token = await authService.RefreshTokenIfNeededAsync();
                if (string.IsNullOrEmpty(token))
                {
                    if (!silent)
                        Log("Session expired. Please login again.");
                    return;
                }

                if (!silent)
                    Log("Validating license...");

                var result = await _licenseService.ValidateLicenseAsync(token);
                Application.Current.Dispatcher.Invoke(() => ApplyLicenseInfo(result));

                if (!silent)
                {
                    if (result.IsValid)
                    {
                        Log($"License valid: {result.PlanDisplayName} | Expires: {result.ExpiresAtDisplay ?? "N/A"} | {result.DaysLeft} days left");
                    }
                    else
                    {
                        Log($"License error: {LicenseService.GetUserMessage(result)}");
                    }
                }
            }
            catch (Exception ex)
            {
                if (!silent)
                    Log($"License validation error: {ex.Message}");
            }
        }

        /// <summary>
        /// Applies license info to UI properties.
        /// </summary>
        private void ApplyLicenseInfo(LicenseInfo license)
        {
            CurrentLicenseInfo = license;
            IsLicenseValid = license.IsValid;
            LicensePlan = license.PlanDisplayName;
            LicenseDaysRemaining = license.DaysLeft;
            LicenseStatus = license.StatusDisplay;
            LicenseActivatedAt = license.ActivatedAtDisplay ?? "";
            LicenseExpiresAt = license.ExpiresAtDisplay ?? "";
            LicenseFeatures = license.FeaturesDisplay;
            LicenseKey = license.LicenseKey ?? "";

            OnPropertyChanged(nameof(IsLicenseValid));
            OnPropertyChanged(nameof(LicensePlan));
            OnPropertyChanged(nameof(LicenseDaysRemaining));
            OnPropertyChanged(nameof(LicenseStatus));
            OnPropertyChanged(nameof(LicenseActivatedAt));
            OnPropertyChanged(nameof(LicenseExpiresAt));
            OnPropertyChanged(nameof(LicenseFeatures));
            OnPropertyChanged(nameof(LicenseKey));
        }

        /// <summary>
        /// Deactivates license (clears cache and forces re-validation).
        /// </summary>
        private void DeactivateLicense()
        {
            var result = MessageBox.Show(
                "This will sign you out and clear your cached license.\nYou will need to login again.\n\nContinue?",
                "Deactivate License",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);

            if (result == MessageBoxResult.Yes)
            {
                _licenseService.ClearCache();
                IsLicenseValid = false;
                LicensePlan = "";
                LicenseDaysRemaining = 0;
                LicenseStatus = "Deactivated";
                LicenseActivatedAt = "";
                LicenseExpiresAt = "";
                LicenseFeatures = "";
                LicenseKey = "";
                CurrentLicenseInfo = null;
                Log("License deactivated. Please login again.");
                App.Logout();
            }
        }

        private async Task StartSync()
        {
            if (!IsLicenseValid)
            {
                Log("License not validated. Please validate license first.");
                MessageBox.Show(
                    "Please validate your license before syncing.\nGo to Settings > License > Validate.",
                    "License Required",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
                return;
            }

            if (!await CheckSerialAndConfirmAsync()) return;

            try
            {
                Log("Running preflight connection check...");
                var (tallyOk, serverOk, error) = await _syncManager.TestConnectionsAsync();
                if (!tallyOk || !serverOk)
                {
                    var message = "Auto-sync cannot start until both Tally and Cloud are connected.";
                    if (!string.IsNullOrWhiteSpace(error))
                        message += "\n\n" + error;

                    Log(message);
                    MessageBox.Show(message, "Connection Required", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }

                _syncManager.StartSync();
                IsSyncing = true;
                Log("Background sync started.");
            }
            catch (Exception ex)
            {
                Log($"Error starting sync: {ex.Message}");
            }
        }

        private void StopSync()
        {
            _syncManager.StopSync();
            IsSyncing = false;
            Log("Background sync stopped.");
        }

        private async Task ManualSync()
        {
            if (!await CheckSerialAndConfirmAsync()) return;

            IsSyncing = true;
            Log("Starting manual sync...");
            await _syncManager.RunManualSyncAsync();
            await LoadLogs();
            IsSyncing = false;

            ShowSyncResult("Sync", "Sync completed successfully with no new records.");
        }

        private async Task ForceResync()
        {
            if (!await CheckSerialAndConfirmAsync()) return;

            var res = MessageBox.Show(
                "FORCE FULL RESYNC WARNING\n\n" +
                "This will re-fetch ALL Master Data and ALL Vouchers from Tally.\n" +
                "This may take several minutes.\n\nProceed?",
                "Confirm Force Resync",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning);

            if (res != MessageBoxResult.Yes) return;

            IsSyncing = true;
            Log("Starting FORCE FULL RESYNC...");
            await _syncManager.RunManualSyncAsync(forceResync: true);
            await LoadLogs();
            IsSyncing = false;

            ShowSyncResult("Resync", "Resync completed successfully with no records processed.");
        }

        private void ShowSyncResult(string titlePrefix, string emptySuccessMessage)
        {
            var status = _syncManager.Status;
            var failed = status.State == SyncState.Error;
            var summaryMsg = failed
                ? $"{titlePrefix} failed.\n\n{status.Error ?? status.Message}"
                : string.IsNullOrWhiteSpace(_syncManager.LastSyncSummary)
                    ? emptySuccessMessage
                    : $"{titlePrefix} completed successfully!\n\n{_syncManager.LastSyncSummary}";

            Application.Current.Dispatcher.Invoke(() =>
            {
                MessageBox.Show(
                    summaryMsg,
                    failed ? $"{titlePrefix} Failed" : $"{titlePrefix} Summary",
                    MessageBoxButton.OK,
                    failed ? MessageBoxImage.Warning : MessageBoxImage.Information);
            });
        }

        private async Task ValidateLicense()
        {
            await ValidateLicense(silent: false);
        }

        private void CopyLogs()
        {
            try
            {
                if (!string.IsNullOrEmpty(ConsoleOutput))
                {
                    Clipboard.SetText(ConsoleOutput);
                    Log("Logs copied to clipboard!");
                }
                else
                {
                    Log("No logs to copy.");
                }
            }
            catch (Exception ex)
            {
                Log($"Failed to copy logs: {ex.Message}");
            }
        }

        private void ClearLogs()
        {
            ConsoleOutput = "";
            Log("Logs cleared.");
        }

        private void SaveSettings()
        {
            try
            {
                _syncManager.SaveSettings(Settings);
                Log("Settings saved successfully.");
                MessageBox.Show("Settings saved!", "Success", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                Log($"Failed to save settings: {ex.Message}");
                MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private async Task TestConnection()
        {
            Log("Testing connections...");
            var (tallyOk, serverOk, error) = await _syncManager.TestConnectionsAsync();

            string result = $"Tally: {(tallyOk ? "Connected" : "Failed")}\n" +
                          $"Server: {(serverOk ? "Connected" : "Failed")}";

            if (error != null) result += $"\nError: {error}";

            Log(result);
            MessageBox.Show(result, "Connection Test", MessageBoxButton.OK,
                (tallyOk && serverOk) ? MessageBoxImage.Information : MessageBoxImage.Warning);
        }

        private async Task LoadLogs()
        {
            var logs = await _syncManager.GetSyncLogsAsync();
            Application.Current.Dispatcher.Invoke(() =>
            {
                RecentLogs.Clear();
                foreach (var log in logs) RecentLogs.Add(log);
            });
        }

        private async Task<bool> CheckSerialAndConfirmAsync()
        {
            var (isValid, current, stored, msg) = await _syncManager.CheckTallySerialAsync();

            if (isValid)
            {
                if (!string.IsNullOrEmpty(current) && string.IsNullOrEmpty(stored))
                {
                    _syncManager.UpdateTallySerial(current);
                    Log($"Captured Tally Serial: {current}");
                }
                return true;
            }

            var res = MessageBox.Show(
                $"Tally Serial Number Mismatch!\n\nStored: {stored}\nCurrent: {current}\n\nUpdate serial number?",
                "Security Warning",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning);

            if (res == MessageBoxResult.Yes)
            {
                _syncManager.UpdateTallySerial(current!);
                Log($"Updated Tally Serial to: {current}");
                return true;
            }

            Log("Sync cancelled due to serial mismatch.");
            return false;
        }

        public void Log(string message)
        {
            var cleanMessage = TextSanitizer.Normalize(message);
            string logMsg = $"[{DateTime.Now:HH:mm:ss}] {cleanMessage}";
            Application.Current.Dispatcher.Invoke(() =>
            {
                ConsoleOutput = logMsg + Environment.NewLine + ConsoleOutput;
                if (ConsoleOutput.Length > 10000)
                    ConsoleOutput = ConsoleOutput.Substring(0, 10000);
            });
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged([CallerMemberName] string? name = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        }
    }

    // Simple Command Implementation
    public class RelayCommand : ICommand
    {
        private readonly Func<Task>? _executeAsync;
        private readonly Action? _executeSync;
        public event EventHandler? CanExecuteChanged
        {
            add { }
            remove { }
        }

        public RelayCommand(Action execute) => _executeSync = execute;
        public RelayCommand(Func<Task> executeAsync) => _executeAsync = executeAsync;

        public bool CanExecute(object? parameter) => true;
        public void Execute(object? parameter)
        {
            if (_executeAsync != null)
                _executeAsync().ConfigureAwait(false);
            else
                _executeSync?.Invoke();
        }
    }

    // Capture Console Output
    public class ConsoleWriter : System.IO.StringWriter
    {
        private readonly MainViewModel _vm;
        public ConsoleWriter(MainViewModel vm) => _vm = vm;

        public override void WriteLine(string? value)
        {
            if (value != null) _vm.Log(value);
        }
    }
}
