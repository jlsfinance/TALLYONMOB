using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Runtime.CompilerServices;
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
        public ICommand ExportReportCommand { get; }
        public ICommand ToggleAutoStartCommand { get; }
        public ICommand RunValidationCommand { get; }

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
        public ObservableCollection<ValidationIssue> ValidationIssues { get; } = new();
        public BandwidthMonitor Bandwidth => App.BandwidthMonitor;

        public bool IsAutoStartEnabled => AutoStartService.IsAutoStartEnabled();

        public string AutoStartStatusText => AutoStartService.IsAutoStartEnabled()
            ? "Currently enabled — app will launch at login"
            : "Currently disabled — app will not launch at login";

        private int _validationErrorCount;
        public int ValidationErrorCount
        {
            get => _validationErrorCount;
            set { _validationErrorCount = value; OnPropertyChanged(); }
        }

        private int _validationWarningCount;
        public int ValidationWarningCount
        {
            get => _validationWarningCount;
            set { _validationWarningCount = value; OnPropertyChanged(); }
        }

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

        // License properties
        private string _licenseStatus = "Not Validated";
        public string LicenseStatus
        {
            get => _licenseStatus;
            set { _licenseStatus = value; OnPropertyChanged(); }
        }

        // Sync staleness properties
        private string _syncStalenessText = "";
        public string SyncStalenessText
        {
            get => _syncStalenessText;
            set { _syncStalenessText = value; OnPropertyChanged(); }
        }

        private bool _isSyncStale;
        public bool IsSyncStale
        {
            get => _isSyncStale;
            set { _isSyncStale = value; OnPropertyChanged(); }
        }

        private bool _isSyncCritical;
        public bool IsSyncCritical
        {
            get => _isSyncCritical;
            set { _isSyncCritical = value; OnPropertyChanged(); }
        }

        private bool _isSyncDelayed;
        public bool IsSyncDelayed
        {
            get => _isSyncDelayed;
            set { _isSyncDelayed = value; OnPropertyChanged(); }
        }

        private string _lastSyncColor = "#059669";
        public string LastSyncColor
        {
            get => _lastSyncColor;
            set { _lastSyncColor = value; OnPropertyChanged(); }
        }

        private string _lastSyncBorderColor = "#E2E8F0";
        public string LastSyncBorderColor
        {
            get => _lastSyncBorderColor;
            set { _lastSyncBorderColor = value; OnPropertyChanged(); }
        }

        private string _licensePlan = "�";
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

        public MainViewModel()
        {
            _syncManager = App.GetSyncManager();
            _licenseService = new LicenseService();
            _status = _syncManager.Status;

            // Subscribe to status updates
            _syncManager.StatusChanged += (s, status) =>
            {
                try
                {
                    // Update Status properties in-place (don't replace the object)
                    // so WPF bindings on nested properties like Status.LastSyncTime update correctly.
                    Application.Current?.Dispatcher.BeginInvoke(new Action(() =>
                    {
                        Status.State = status.State;
                        Status.Message = status.Message;
                        Status.CurrentOperation = status.CurrentOperation;
                        Status.TotalRecords = status.TotalRecords;
                        Status.ProcessedRecords = status.ProcessedRecords;
                        Status.LastSyncTime = status.LastSyncTime;
                        Status.NextSyncTime = status.NextSyncTime;
                        Status.Error = status.Error;
                        Status.IsTallyConnected = status.IsTallyConnected;
                        Status.IsServerConnected = status.IsServerConnected;
                        Status.CompanyName = status.CompanyName;

                        UpdateSyncStaleness();
                    }));
                }
                catch { }
            };

            _syncManager.ItemSynced += (s, item) =>
            {
                try
                {
                    Application.Current?.Dispatcher.BeginInvoke(new Action(() =>
                    {
                        SyncItems.Insert(0, item);
                        if (SyncItems.Count > 200) SyncItems.RemoveAt(SyncItems.Count - 1);
                    }));
                }
                catch { }
            };

            // FIX: Subscribe to general logs
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
            ExportReportCommand = new RelayCommand(ExportReport);
            ToggleAutoStartCommand = new RelayCommand(ToggleAutoStart);
            RunValidationCommand = new RelayCommand(RunValidation);

            // Redirect Console to UI
            Console.SetOut(new ConsoleWriter(this));
            
            // Force WPF to re-evaluate Status bindings after sync_state.json restore
            // Without this, LastSyncTime restored from file won't appear in UI
            Application.Current?.Dispatcher.BeginInvoke(new Action(() =>
            {
                OnPropertyChanged(nameof(Status));
                UpdateSyncStaleness();
            }));

            // Initial functionality check
            Task.Run(async () => await LoadLogs());
            try
            {
                var exePath = Environment.ProcessPath;
                var buildStamp = !string.IsNullOrWhiteSpace(exePath) && File.Exists(exePath)
                    ? File.GetLastWriteTime(exePath).ToString("yyyy-MM-dd HH:mm:ss")
                    : "unknown";

                Log($"Build stamp: {buildStamp} | Exe: {exePath}");
            }
            catch
            {
                // Ignore build stamp logging errors.
            }

            // Auto-validate license on startup (background, no UI blocking)
            _ = Task.Run(async () =>
            {
                await Task.Delay(2000);
                try
                {
                    var authService = App.AuthService;
                    if (authService != null && authService.IsLoggedIn && !string.IsNullOrEmpty(authService.CurrentSession?.Email))
                    {
                        bool isSuperAdmin = authService.CurrentSession.Email?.Trim().ToLower() == "lovneetrathi@gmail.com";
                        Application.Current?.Dispatcher.Invoke(() =>
                        {
                            IsLicenseValid = true;
                            LicenseStatus = isSuperAdmin ? "Active (Super Admin)" : "Active (Session)";
                            LicensePlan = isSuperAdmin ? "Pro (Admin)" : "Trial";
                            LicenseDaysRemaining = isSuperAdmin ? 9999 : 7;
                        });
                        Log($"License auto-validated: {(isSuperAdmin ? "Super Admin" : "Session")}");
                    }
                }
                catch (Exception ex)
                {
                    Log($"Auto-validate skip: {ex.Message}");
                }
            });

            // Check sync staleness every 60 seconds
            var stalenessTimer = new System.Timers.Timer(60000);
            stalenessTimer.Elapsed += (s, e) =>
            {
                try
                {
                    Application.Current?.Dispatcher.BeginInvoke(new Action(() => UpdateSyncStaleness()));
                }
                catch { }
            };
            stalenessTimer.AutoReset = true;
            stalenessTimer.Start();

            // Initial staleness check
            Application.Current?.Dispatcher.BeginInvoke(new Action(() => UpdateSyncStaleness()));
        }

        private async Task StartSync()
        {
            // Check license first
            if (!IsLicenseValid)
            {
                Log("License not validated. Please login first.");
                MessageBox.Show(
                    "Please validate your license before syncing.\nGo to Settings tab and click 'Validate License'.",
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
                    {
                        message += "\n\n" + error;
                    }

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
                "⚠️ FORCE FULL RESYNC WARNING ⚠️\n\n" +
                "This will restart the sync process from scratch.\n" +
                "It will re-fetch ALL Master Data and ALL Vouchers from Tally.\n" +
                "This process may take several minutes depending on data volume.\n\n" +
                "Are you sure you want to proceed?",
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
            var authService = App.AuthService;
            if (authService == null || !authService.IsLoggedIn || string.IsNullOrEmpty(authService.CurrentSession?.Email))
            {
                Log("Please login first before validating license.");
                MessageBox.Show("Please login first in the Settings tab.", "Login Required", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            Log("Validating license...");
            LicenseStatus = "Validating...";

            // Get Tally serial
            var settings = _syncManager.GetSettings();
            string tallySerial = settings.TallySettings?.SerialNumber ?? "PENDING";
            string email = authService.CurrentSession!.Email;
            string accessToken = authService.CurrentSession.AccessToken;
            
            LicenseResult result;

            // Try with access token first
            if (!string.IsNullOrEmpty(accessToken))
            {
                result = await _licenseService.ValidateLicenseAsync(accessToken, tallySerial);
            }
            else
            {
                // Fallback: try with stored password
                string password = "";
                var syncSettings = settings.SyncSettings;
                if (!string.IsNullOrEmpty(syncSettings?.ApiKey))
                {
                    password = syncSettings.ApiKey;
                }

                if (string.IsNullOrEmpty(password))
                {
                    IsLicenseValid = false;
                    LicenseStatus = "Not Validated";
                    LicensePlan = "Unknown";
                    LicenseDaysRemaining = 0;
                    Log("No credentials available. Please login again.");
                    return;
                }

                result = await _licenseService.ValidateLicenseAsync(email, password, tallySerial);
            }

            if (result.IsValid || result.IsSuperAdmin)
            {
                IsLicenseValid = true;
                LicenseStatus = "Active";
                
                if (result.IsSuperAdmin)
                    LicensePlan = "Super Admin";
                else if (result.IsPro)
                    LicensePlan = "Pro";
                else if (result.IsTrial)
                    LicensePlan = "Trial";
                else
                    LicensePlan = result.Plan ?? "Unknown";
                
                LicenseDaysRemaining = result.DaysRemaining;
                Log($"License valid! Plan: {LicensePlan}, Days remaining: {result.DaysRemaining}");

                if (result.ShouldShowUpgradePrompt)
                {
                    Log($"Trial expiring soon! Only {result.DaysRemaining} day(s) left.");
                    MessageBox.Show(
                        $"Your free trial expires in {result.DaysRemaining} day(s)!\nUpgrade to Pro for unlimited access.",
                        "Trial Expiring Soon",
                        MessageBoxButton.OK,
                        MessageBoxImage.Information);
                }
            }
            else
            {
                IsLicenseValid = false;
                LicenseStatus = $"❌ {result.Error}";
                LicensePlan = "—";
                LicenseDaysRemaining = 0;
                
                string userMsg = LicenseService.GetUserMessage(result);
                Log($"❌ License validation failed: {result.Error}");
                MessageBox.Show(userMsg, "License Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void CopyLogs()
        {
            try
            {
                if (!string.IsNullOrEmpty(ConsoleOutput))
                {
                    Clipboard.SetText(ConsoleOutput);
                    Log("📋 Logs copied to clipboard!");
                }
                else
                {
                    Log("⚠️ No logs to copy.");
                }
            }
            catch (Exception ex)
            {
                Log($"❌ Failed to copy logs: {ex.Message}");
            }
        }

        private void ClearLogs()
        {
            ConsoleOutput = "";
            Log("🗑️ Logs cleared.");
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

            // Add live status items for the test
            SyncItems.Insert(0, new SyncItemStatus
            {
                Name = "Tally (localhost)",
                Type = "Connection",
                Status = "Processing",
                Timestamp = DateTime.Now
            });
            SyncItems.Insert(0, new SyncItemStatus
            {
                Name = "Cloud Server",
                Type = "Connection",
                Status = "Processing",
                Timestamp = DateTime.Now
            });

            var (tallyOk, serverOk, error) = await _syncManager.TestConnectionsAsync();

            // Update the test items with results
            for (int i = 0; i < SyncItems.Count; i++)
            {
                if (SyncItems[i].Type == "Connection" && SyncItems[i].Status == "Processing")
                {
                    if (SyncItems[i].Name.Contains("Tally"))
                    {
                        SyncItems[i] = new SyncItemStatus
                        {
                            Name = "Tally (localhost:9000)",
                            Type = "Connection",
                            Status = tallyOk ? "Success" : "Error",
                            Error = tallyOk ? null : "Tally not running on localhost:9000",
                            Timestamp = DateTime.Now
                        };
                    }
                    else
                    {
                        SyncItems[i] = new SyncItemStatus
                        {
                            Name = "Cloud Server",
                            Type = "Connection",
                            Status = serverOk ? "Success" : "Error",
                            Error = serverOk ? null : error ?? "Connection failed",
                            Timestamp = DateTime.Now
                        };
                    }
                }
            }

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

             // Mismatch
             var res = MessageBox.Show(
                 $"Tally Serial Number Mismatch!\n\nStored: {stored}\nCurrent: {current}\n\nDo you want to proceed and update the serial number?",
                 "Security Warning",
                 MessageBoxButton.YesNo,
                 MessageBoxImage.Warning);
                
             if (res == MessageBoxResult.Yes)
             {
                 _syncManager.UpdateTallySerial(current!);
                 Log($"Updated Tally Serial to: {current}");
                 return true;
             }
             
             Log("Sync cancelled by user due to serial mismatch.");
             return false;
        }

        private void ExportReport()
        {
            try
            {
                var companyName = Status.CompanyName ?? "Unknown";
                PdfExportService.ExportAndOpen(Status, companyName, Bandwidth);
                Log("Sync report exported to Desktop.");
            }
            catch (Exception ex)
            {
                Log($"Export failed: {ex.Message}");
            }
        }

        private void ToggleAutoStart()
        {
            AutoStartService.ToggleAutoStart();
            OnPropertyChanged(nameof(IsAutoStartEnabled));
            OnPropertyChanged(nameof(AutoStartStatusText));
            Log($"Auto-start with Windows: {(AutoStartService.IsAutoStartEnabled() ? "Enabled" : "Disabled")}");
        }

        private void RunValidation()
        {
            try
            {
                Log("Running data validation checks...");
                var issues = App.DataValidationService.RunAllValidations(null, null, null);

                Application.Current?.Dispatcher.Invoke(() =>
                {
                    ValidationIssues.Clear();
                    ValidationErrorCount = issues.Count(i => i.Severity == ValidationSeverity.Error);
                    ValidationWarningCount = issues.Count(i => i.Severity == ValidationSeverity.Warning);

                    foreach (var issue in issues.Take(100))
                        ValidationIssues.Add(issue);
                });

                Log($"Validation complete: {ValidationErrorCount} errors, {ValidationWarningCount} warnings, {issues.Count(i => i.Severity == ValidationSeverity.Info)} info");
            }
            catch (Exception ex)
            {
                Log($"Validation failed: {ex.Message}");
            }
        }

        private void UpdateSyncStaleness()
        {
            if (!Status.LastSyncTime.HasValue)
            {
                IsSyncStale = false;
                IsSyncCritical = false;
                IsSyncDelayed = false;
                SyncStalenessText = "";
                LastSyncColor = "#059669";
                LastSyncBorderColor = "#E2E8F0";
                return;
            }

            var elapsed = DateTime.Now - Status.LastSyncTime.Value;
            var hours = elapsed.TotalHours;
            var days = elapsed.TotalDays;

            if (days >= 2)
            {
                IsSyncStale = true;
                IsSyncCritical = true;
                IsSyncDelayed = false;
                SyncStalenessText = $"SYNC OVERDUE - Last sync was {(int)days} day(s) ago! Data may be outdated.";
                LastSyncColor = "#DC2626";
                LastSyncBorderColor = "#DC2626";
            }
            else if (days >= 1 || hours >= 24)
            {
                IsSyncStale = true;
                IsSyncCritical = false;
                IsSyncDelayed = true;
                SyncStalenessText = $"Sync delayed - Last sync was {(int)hours} hour(s) ago.";
                LastSyncColor = "#D97706";
                LastSyncBorderColor = "#D97706";
            }
            else
            {
                IsSyncStale = false;
                IsSyncCritical = false;
                IsSyncDelayed = false;
                SyncStalenessText = "";
                LastSyncColor = "#059669";
                LastSyncBorderColor = "#E2E8F0";
            }
        }

        public void Log(string message)
        {
            var cleanMessage = TextSanitizer.Normalize(message);
            string logMsg = $"[{DateTime.Now:HH:mm:ss}] {cleanMessage}";
            Application.Current.Dispatcher.Invoke(() =>
            {
                ConsoleOutput = logMsg + Environment.NewLine + ConsoleOutput;
                // Keep only last 100 lines
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
        private readonly Action _execute;
        public event EventHandler? CanExecuteChanged
        {
            add { }
            remove { }
        }

        public RelayCommand(Action execute) => _execute = execute;

        public bool CanExecute(object? parameter) => true;
        public void Execute(object? parameter) => _execute();
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



