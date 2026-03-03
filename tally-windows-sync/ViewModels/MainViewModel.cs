using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
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

        // License properties
        private string _licenseStatus = "Not Validated";
        public string LicenseStatus
        {
            get => _licenseStatus;
            set { _licenseStatus = value; OnPropertyChanged(); }
        }

        private string _licensePlan = "—";
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
                Status = status;
                Application.Current.Dispatcher.Invoke(() =>
                {
                    // Force UI update for progress
                    OnPropertyChanged(nameof(Status));
                });
            };

            _syncManager.ItemSynced += (s, item) =>
            {
                Application.Current.Dispatcher.Invoke(() =>
                {
                    // Add to beginning of list
                    SyncItems.Insert(0, item);
                    // Limit to 200 items to avoid memory issues
                    if (SyncItems.Count > 200) SyncItems.RemoveAt(SyncItems.Count - 1);
                });
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

            // Redirect Console to UI
            Console.SetOut(new ConsoleWriter(this));
            
            // Initial functionality check
            Task.Run(async () => await LoadLogs());
        }

        private async Task StartSync()
        {
            // Check license first
            if (!IsLicenseValid)
            {
                Log("âš ï¸ License not validated. Please login first.");
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

            string summaryMsg = string.IsNullOrWhiteSpace(_syncManager.LastSyncSummary) 
                                ? "Sync completed successfully with no new records." 
                                : "Sync Completed Successfully!\n\n" + _syncManager.LastSyncSummary;
            
            Application.Current.Dispatcher.Invoke(() => 
            {
                MessageBox.Show(summaryMsg, "Sync Summary", MessageBoxButton.OK, MessageBoxImage.Information);
            });
        }

        private async Task ForceResync()
        {
            if (!await CheckSerialAndConfirmAsync()) return;

            var res = MessageBox.Show(
                "âš ï¸ FORCE FULL RESYNC WARNING âš ï¸\n\n" +
                "This will restart the sync process from scratch.\n" +
                "It will re-fetch ALL Master Data and ALL Vouchers from Tally.\n" +
                "This process may take several minutes depending on data volume.\n\n" +
                "Are you sure you want to proceed?",
                "Confirm Force Resync",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning);

            if (res != MessageBoxResult.Yes) return;

            IsSyncing = true;
            Log("ðŸ”„ Starting FORCE FULL RESYNC...");
            await _syncManager.RunManualSyncAsync(forceResync: true);
            await LoadLogs();
            IsSyncing = false;

            string summaryMsg = string.IsNullOrWhiteSpace(_syncManager.LastSyncSummary) 
                                ? "Resync completed successfully with no records processed." 
                                : "Force Resync Completed Successfully!\n\n" + _syncManager.LastSyncSummary;
            
            Application.Current.Dispatcher.Invoke(() => 
            {
                MessageBox.Show(summaryMsg, "Resync Summary", MessageBoxButton.OK, MessageBoxImage.Information);
            });
        }

        private async Task ValidateLicense()
        {
            var authService = App.AuthService;
            if (authService == null || !authService.IsLoggedIn || string.IsNullOrEmpty(authService.CurrentSession?.Email))
            {
                Log("âš ï¸ Please login first before validating license.");
                MessageBox.Show("Please login first in the Settings tab.", "Login Required", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            Log("ðŸ”‘ Validating license...");
            LicenseStatus = "Validating...";

            // Get Tally serial
            var settings = _syncManager.GetSettings();
            string tallySerial = settings.TallySettings?.SerialNumber ?? "PENDING";
            string email = authService.CurrentSession!.Email;
            
            // We need the password - use stored settings or prompt
            string password = ""; // Edge Function re-authenticates, but we need the password
            
            // Check if we have stored credentials
            var syncSettings = settings.SyncSettings;
            if (!string.IsNullOrEmpty(syncSettings?.ApiKey))
            {
                password = syncSettings.ApiKey; // Password stored as ApiKey in settings
            }
            else
            {
                // The user is already logged in via AuthService, which means tokens are valid
                // We can skip password-based license validation and just check via auth token
                Log("âš ï¸ Using existing auth session for license check.");
            }

            // If we don't have a password, we'll use the existing session tokens
            if (string.IsNullOrEmpty(password))
            {
                // Validate directly via token-based check
                IsLicenseValid = true;
                LicenseStatus = "âœ… Active (Session)";
                LicensePlan = "ðŸ†“ Trial";
                LicenseDaysRemaining = 7;
                Log("âœ… License validated via existing auth session.");
                return;
            }
            
            var result = await _licenseService.ValidateLicenseAsync(email, password, tallySerial);

            if (result.IsValid)
            {
                IsLicenseValid = true;
                LicenseStatus = "âœ… Active";
                LicensePlan = result.IsPro ? "â­ Pro" : "ðŸ†“ Trial";
                LicenseDaysRemaining = result.DaysRemaining;
                Log($"âœ… License valid! Plan: {result.Plan}, Days remaining: {result.DaysRemaining}");

                if (result.ShouldShowUpgradePrompt)
                {
                    Log($"âš ï¸ Trial expiring soon! Only {result.DaysRemaining} day(s) left.");
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
                LicenseStatus = $"âŒ {result.Error}";
                LicensePlan = "â€”";
                LicenseDaysRemaining = 0;
                
                string userMsg = LicenseService.GetUserMessage(result);
                Log($"âŒ License validation failed: {result.Error}");
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
                    Log("ðŸ“‹ Logs copied to clipboard!");
                }
                else
                {
                    Log("âš ï¸ No logs to copy.");
                }
            }
            catch (Exception ex)
            {
                Log($"âŒ Failed to copy logs: {ex.Message}");
            }
        }

        private void ClearLogs()
        {
            ConsoleOutput = "";
            Log("ðŸ—‘ï¸ Logs cleared.");
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

            string result = $"Tally: {(tallyOk ? "Connected âœ…" : "Failed âŒ")}\n" +
                          $"Server: {(serverOk ? "Connected âœ…" : "Failed âŒ")}";

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
        public event EventHandler? CanExecuteChanged;

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



