using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using Microsoft.Win32;
using TallySyncApp.Models;
using TallySyncApp.Services;

namespace TallySyncApp.ViewModels
{
    public class MainViewModel : INotifyPropertyChanged, IDisposable
    {
        private readonly SyncManager _syncManager;
        private SyncStatus _status;
        private bool _isSyncing;
        private string _consoleOutput = "";

        // Commands
        public ICommand StartSyncCommand { get; }
        public ICommand StopSyncCommand { get; }
        public ICommand ManualSyncCommand { get; }
        public ICommand FullResyncCommand { get; }
        public ICommand SaveSettingsCommand { get; }
        public ICommand TestConnectionCommand { get; }
        public ICommand ToggleVoucherReconciliationCommand { get; }
        public ICommand RefreshLicenseCommand { get; }
        public ICommand LoadLicenseHistoryCommand { get; }
        public ICommand BuyLicenceCommand { get; }
        public ICommand RefreshCloudHistoryCommand { get; }
        public ICommand OpenTallyCommand { get; }
        public ICommand RefreshCompaniesCommand { get; }
        public ICommand SyncCompanyCommand { get; }
        public ICommand ResetCompanyCommand { get; }
        public ICommand OpenCompanyWebCommand { get; }
        public ICommand OpenCompanyFolderCommand { get; }
        private readonly System.Windows.Threading.DispatcherTimer _cloudRefreshTimer;
        private readonly System.Threading.CancellationTokenSource _windowLifetime = new();
        private int _cloudLoading;
        private int _companiesLoading;
        private int _licenseLoading;
        private bool _disposed;
        private List<CloudCompanySummary> _latestCloudCompanies = new();
        public ObservableCollection<CloudSyncHistoryEntry> CloudSyncHistory { get; } = new();
        public ObservableCollection<CompanyCardItem> CompanyCards { get; } = new();
        public bool HasCompanyCards => CompanyCards.Count > 0;
        private string _companiesSummaryText = "Checking Tally companies…";
        public string CompaniesSummaryText { get => _companiesSummaryText; private set { _companiesSummaryText = value; OnPropertyChanged(); } }
        private string _cloudRecordsText = "—";
        public string CloudRecordsText { get => _cloudRecordsText; private set { _cloudRecordsText = value; OnPropertyChanged(); } }
        private string _cloudRecordsDetail = "Loading from Supabase…";
        public string CloudRecordsDetail { get => _cloudRecordsDetail; private set { _cloudRecordsDetail = value; OnPropertyChanged(); } }
        private string _cloudLastSyncTime = "—";
        public string CloudLastSyncTime { get => _cloudLastSyncTime; private set { _cloudLastSyncTime = value; OnPropertyChanged(); } }
        private string _cloudLastSyncDate = "Loading from Supabase…";
        public string CloudLastSyncDate { get => _cloudLastSyncDate; private set { _cloudLastSyncDate = value; OnPropertyChanged(); } }
        private string _cloudDataStatus = "Loading cloud sync history…";
        public string CloudDataStatus { get => _cloudDataStatus; private set { _cloudDataStatus = value; OnPropertyChanged(); } }

        public ObservableCollection<LicenseHistoryEntry> LicenseHistory { get; } = new();

        public string VoucherReconciliationModeText => Settings.SyncSettings.UseSafeVoucherReconciliation
            ? "Safe reconciliation ON — click to pause"
            : "Reconciliation paused — click to enable safe reconciliation";

        // Properties
        public SyncStatus Status
        {
            get => _status;
            set
            {
                _status = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(CompanyDisplayName));
                OnPropertyChanged(nameof(IsTallyDisconnected));
                OnPropertyChanged(nameof(TallyClosedBannerText));
            }
        }

        public bool IsTallyDisconnected => !Status.IsTallyConnected;

        public string TallyClosedBannerText =>
            $"Tally is not connected on {Settings.TallySettings.Host}:{Settings.TallySettings.Port}. Click Open Tally to launch it and resume automatic sync.";

        public string CompanyDisplayName => string.IsNullOrWhiteSpace(Status.CompanyName)
            ? "Company: Waiting for Tally…"
            : $"Company: {Status.CompanyName}";

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
            set
            {
                _isSyncing = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(CanTriggerSync));
                OnPropertyChanged(nameof(CanStopSync));
            }
        }

        private bool _isAutoSyncRunning;
        public bool IsAutoSyncRunning
        {
            get => _isAutoSyncRunning;
            private set
            {
                if (_isAutoSyncRunning == value) return;
                _isAutoSyncRunning = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(CanStartAutoSync));
                OnPropertyChanged(nameof(CanStopSync));
            }
        }

        public bool CanTriggerSync => !IsSyncing;
        public bool CanStartAutoSync => !IsAutoSyncRunning;
        public bool CanStopSync => IsSyncing || IsAutoSyncRunning;

        private string _userEmail = "";
        public string UserEmail
        {
            get => _userEmail;
            set { _userEmail = value; OnPropertyChanged(); }
        }

        private string _licensePlan = "—";
        public string LicensePlan
        {
            get => _licensePlan;
            set { _licensePlan = value; OnPropertyChanged(); }
        }

        private string _licenseDetail = "Checking…";
        public string LicenseDetail
        {
            get => _licenseDetail;
            set { _licenseDetail = value; OnPropertyChanged(); }
        }

        // --- Licence enforcement UI state ---
        private LicenseResult? _licenseResult;
        public LicenseResult? LicenseResult
        {
            get => _licenseResult;
            set { _licenseResult = value; OnPropertyChanged(); }
        }

        private bool _isLicenseBlocked;
        public bool IsLicenseBlocked
        {
            get => _isLicenseBlocked;
            set { _isLicenseBlocked = value; OnPropertyChanged(); OnPropertyChanged(nameof(IsSyncAllowed)); }
        }

        /// <summary>True when the licence permits synchronisation.</summary>
        public bool IsSyncAllowed => !IsLicenseBlocked;

        private string _licenseStatusText = "Checking…";
        public string LicenseStatusText
        {
            get => _licenseStatusText;
            set { _licenseStatusText = value; OnPropertyChanged(); }
        }

        private string _licenseStatusColor = "#9CA3AF";
        public string LicenseStatusColor
        {
            get => _licenseStatusColor;
            set { _licenseStatusColor = value; OnPropertyChanged(); }
        }

        private string _licenseBlockTitle = "";
        public string LicenseBlockTitle
        {
            get => _licenseBlockTitle;
            set { _licenseBlockTitle = value; OnPropertyChanged(); }
        }

        private string _licenseBlockMessage = "";
        public string LicenseBlockMessage
        {
            get => _licenseBlockMessage;
            set { _licenseBlockMessage = value; OnPropertyChanged(); }
        }

        private string _licenseBlockAction = "Refresh License Status";
        public string LicenseBlockAction
        {
            get => _licenseBlockAction;
            set { _licenseBlockAction = value; OnPropertyChanged(); }
        }

        // Tracks the date the last expiry warning was shown, so each 7/3/1-day warning
        // appears only once per day (not on every login / sync cycle).
        private DateTime? _lastLicenseWarningDate;
        private LicenseStatus? _lastAppliedLicenseStatus;

        public MainViewModel()
        {
            _syncManager = App.GetSyncManager();
            _status = _syncManager.Status;

            // Subscribe to status updates
            _syncManager.StatusChanged += (s, status) =>
            {
                if (_disposed) return;
                Application.Current.Dispatcher.Invoke(() =>
                {
                    Status = status;
                    // Force UI update for progress
                    OnPropertyChanged(nameof(Status));
                    OnPropertyChanged(nameof(IsTallyDisconnected));
                    OnPropertyChanged(nameof(TallyClosedBannerText));

                    // Reflect the licence gate result into the UI so the blocking screen
                    // also appears for auto-sync / background cycles (not just manual commands).
                    var lic = _syncManager.LastLicenseResult;
                    if (lic != null)
                    {
                        ApplyLicenseResult(lic);
                    }
                    if (status.State == SyncState.Completed || status.State == SyncState.Error || status.State == SyncState.Idle)
                    {
                        _ = LoadCloudSyncOverviewAsync();
                        _ = RefreshCompaniesAsync();
                    }
                });
            };
            _syncManager.CompanyProgressChanged += OnCompanyProgressChanged;
            _syncManager.SyncLogRequested += (_, message) => { if (!_disposed) Log(message); };
            _syncManager.SyncFlagsChanged += OnSyncFlagsChanged;
            RefreshSyncFlags();

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

            // Initialize Commands
            StartSyncCommand = new RelayCommand(async _ => await StartSync());
            StopSyncCommand = new RelayCommand(_ => StopSync());
            ManualSyncCommand = new RelayCommand(async _ => await ManualSync());
            FullResyncCommand = new RelayCommand(async _ => await FullResync());
            SaveSettingsCommand = new RelayCommand(_ => SaveSettings());
            TestConnectionCommand = new RelayCommand(async _ => await TestConnection());
            RefreshLicenseCommand = new RelayCommand(async _ => await RefreshLicenseAsync());
            LoadLicenseHistoryCommand = new RelayCommand(async _ => await LoadLicenseHistoryAsync());
            BuyLicenceCommand = new RelayCommand(async _ => await BuyLicenceAsync());
            RefreshCloudHistoryCommand = new RelayCommand(async _ => await LoadCloudSyncOverviewAsync());
            OpenTallyCommand = new RelayCommand(async _ => await OpenTallyAsync());
            RefreshCompaniesCommand = new RelayCommand(async _ => await RefreshCompaniesAsync());
            SyncCompanyCommand = new RelayCommand(async param => await SyncCompanyAsync(param as CompanyCardItem));
            ResetCompanyCommand = new RelayCommand(async param => await ResetCompanyAsync(param as CompanyCardItem));
            OpenCompanyWebCommand = new RelayCommand(param => OpenCompanyWeb(param as CompanyCardItem));
            OpenCompanyFolderCommand = new RelayCommand(param => OpenCompanyFolder(param as CompanyCardItem));
            _cloudRefreshTimer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
            _cloudRefreshTimer.Tick += async (_, _) => { await LoadCloudSyncOverviewAsync(); await RefreshCompaniesAsync(); await LoadLicenseAsync(); };
            _cloudRefreshTimer.Start();
            ToggleVoucherReconciliationCommand = new RelayCommand(_ => {
                if (_syncManager.SetSafeVoucherReconciliation(!Settings.SyncSettings.UseSafeVoucherReconciliation))
                {
                    OnPropertyChanged(nameof(VoucherReconciliationModeText));
                    Log("Reconciliation mode changed. The next cycle will use the selected mode.");
                }
                else MessageBox.Show("Could not save reconciliation mode.", "Settings", MessageBoxButton.OK, MessageBoxImage.Warning);
            });

            // Redirect Console to UI
            Console.SetOut(new ConsoleWriter(this));
            
            // Initial functionality check
            Task.Run(async () =>
            {
                await _syncManager.TestConnectionsAsync();
                await LoadLogs();
                await RefreshCompaniesAsync();
            });
            _ = LoadLicenseAsync();
            _ = LoadLicenseHistoryAsync();
        }

        private async Task StartSync()
        {
            if (!await EnsureLicenseForSyncAsync()) return;

            try
            {
                _syncManager.StartSync();
                RefreshSyncFlags();
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
            RefreshSyncFlags();
            Log("Background sync stopped.");
        }

        private async Task ManualSync()
        {
            if (_syncManager.IsSyncRunning) { Log("⚠️ Sync already in progress."); return; }
            if (!await CheckSerialAndConfirmAsync()) return;
            if (!await EnsureLicenseForSyncAsync()) return;
            if (_syncManager.IsSyncRunning) { Log("⚠️ Sync already in progress."); return; }

            try
            {
                IsSyncing = true;
                Log("Starting incremental sync (naya/badla hua data)...");
                await _syncManager.RunManualSyncAsync();
                await LoadLogs();
            }
            finally
            {
                RefreshSyncFlags();
            }
        }

        // Full Resync: ALTERID tracking ignore karke poora data dobara bharta hai.
        private async Task FullResync()
        {
            if (_syncManager.IsSyncRunning) { Log("⚠️ Sync already in progress."); return; }
            if (!await CheckSerialAndConfirmAsync()) return;
            if (!await EnsureLicenseForSyncAsync()) return;

            var confirm = MessageBox.Show(
                "Full resync poora historical data dobara upload karega (thoda time lagega).\n\nChalana hai?",
                "Full Resync", MessageBoxButton.YesNo, MessageBoxImage.Warning);
            if (confirm != MessageBoxResult.Yes) return;
            if (_syncManager.IsSyncRunning) { Log("⚠️ Sync already in progress."); return; }

            try
            {
                IsSyncing = true;
                Log("Starting FULL resync (poora data dobara)...");
                await _syncManager.RunManualSyncAsync(forceResync: true);
                await LoadLogs();
            }
            finally
            {
                RefreshSyncFlags();
            }
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

            string result = $"Tally: {(tallyOk ? "Connected ✅" : "Failed ❌")}\n" +
                          $"Server: {(serverOk ? "Connected ✅" : "Failed ❌")}";

            if (error != null) result += $"\nError: {error}";

            Log(result);
            MessageBox.Show(result, "Connection Test", MessageBoxButton.OK, 
                (tallyOk && serverOk) ? MessageBoxImage.Information : MessageBoxImage.Warning);
        }

        private async Task LoadLogs()
        {
            await LoadCloudSyncOverviewAsync();
        }

        internal async Task LoadCloudSyncOverviewAsync()
        {
            if (_disposed || System.Threading.Interlocked.CompareExchange(ref _cloudLoading, 1, 0) != 0) return;
            var userId = App.AuthService?.CurrentSession?.UserId;
            if (string.IsNullOrEmpty(userId)) { CloudDataStatus = "Sign in to load Supabase sync history."; System.Threading.Interlocked.Exchange(ref _cloudLoading, 0); return; }
            try
            {
                var overview = await _syncManager.GetApiClient().GetCloudSyncOverviewAsync(_windowLifetime.Token);
                if (_disposed || App.AuthService?.CurrentSession?.UserId != userId) return;
                Application.Current.Dispatcher.Invoke(() =>
                {
                    _latestCloudCompanies = overview.Companies ?? new List<CloudCompanySummary>();
                    CloudRecordsText = overview.RecordsSynced.ToString("N0");
                    CloudRecordsDetail = $"{overview.VoucherCount:N0} vouchers · {overview.LedgerCount:N0} ledgers · {overview.StockCount:N0} items";
                    CloudLastSyncTime = overview.LastSuccessfulSync?.LocalDateTime.ToString("HH:mm:ss") ?? "—";
                    CloudLastSyncDate = overview.LastSuccessfulSync?.LocalDateTime.ToString("dd MMM yyyy") ?? "No successful cloud sync yet";
                    CloudSyncHistory.Clear();
                    foreach (var row in overview.History) CloudSyncHistory.Add(row);
                    CloudDataStatus = $"Supabase · Updated {DateTime.Now:HH:mm:ss} · {overview.History.Count} recent syncs";
                });
                await RefreshCompaniesAsync();
            }
            catch (OperationCanceledException) when (_windowLifetime.IsCancellationRequested) { }
            catch (Exception error)
            {
                if (!_disposed) Application.Current.Dispatcher.Invoke(() => CloudDataStatus = "Could not refresh Supabase history. Please retry; previous cloud values are retained.");
                if (!_disposed) Log($"Cloud sync history refresh failed: {error.Message}");
            }
            finally { System.Threading.Interlocked.Exchange(ref _cloudLoading, 0); }
        }

        private void OnSyncFlagsChanged(object? sender, EventArgs e)
        {
            if (_disposed) return;
            var dispatcher = Application.Current?.Dispatcher;
            if (dispatcher == null) return;
            dispatcher.BeginInvoke(() =>
            {
                if (!_disposed) RefreshSyncFlags();
            });
        }

        private void RefreshSyncFlags()
        {
            IsSyncing = _syncManager.IsSyncRunning;
            IsAutoSyncRunning = _syncManager.IsAutoSyncRunning;
        }

        public void Dispose()
        {
            _disposed = true;
            _syncManager.SyncFlagsChanged -= OnSyncFlagsChanged;
            _syncManager.CompanyProgressChanged -= OnCompanyProgressChanged;
            _cloudRefreshTimer.Stop();
            _windowLifetime.Cancel();
        }

        private void OnCompanyProgressChanged(object? sender, CompanySyncProgressEventArgs e)
        {
            if (_disposed) return;
            var dispatcher = Application.Current?.Dispatcher;
            if (dispatcher == null) return;

            dispatcher.BeginInvoke(() =>
            {
                if (_disposed) return;
                var card = CompanyCards.FirstOrDefault(c =>
                    (!string.IsNullOrWhiteSpace(e.CompanyId) && string.Equals(c.CompanyId, e.CompanyId, StringComparison.OrdinalIgnoreCase)) ||
                    string.Equals(c.Name, e.CompanyName, StringComparison.OrdinalIgnoreCase));
                if (card == null) return;

                card.IsSyncing = e.IsSyncing;
                card.ProgressPercent = e.ProgressPercent;
                card.ProgressMessage = e.Message;
                if (e.Success == true)
                {
                    card.HasWarning = false;
                    card.WarningTitle = string.Empty;
                    card.WarningMessage = string.Empty;
                    if (e.CompletedAt.HasValue)
                        card.LastSyncAt = e.CompletedAt.Value;
                }
                else if (e.Success == false && !string.IsNullOrWhiteSpace(e.Error))
                {
                    card.HasWarning = true;
                    card.WarningTitle = "Sync Attention";
                    card.WarningMessage = e.Error;
                    if (e.CompletedAt.HasValue)
                        card.LastSyncAt = e.CompletedAt.Value;
                }
            });
        }

        internal async Task RefreshCompaniesAsync()
        {
            if (_disposed || System.Threading.Interlocked.CompareExchange(ref _companiesLoading, 1, 0) != 0)
                return;

            try
            {
                List<Company> openCompanies = new();
                try
                {
                    openCompanies = await _syncManager.GetOpenCompaniesAsync();
                }
                catch { }

                var pendingNotifs = await _syncManager.GetPendingNotificationsAsync();
                var dispatcher = Application.Current?.Dispatcher;
                if (_disposed || dispatcher == null) return;

                await dispatcher.InvokeAsync(() =>
                {
                    var merged = CompanyCardMerger.BuildCards(
                        openCompanies,
                        _latestCloudCompanies,
                        CloudSyncHistory,
                        pendingNotifs,
                        CompanyCards);

                    CompanyCards.Clear();
                    foreach (var card in merged)
                        CompanyCards.Add(card);

                    OnPropertyChanged(nameof(HasCompanyCards));
                    int openCount = merged.Count(c => c.IsOpenInTally);
                    CompaniesSummaryText = merged.Count == 0
                        ? "No companies found yet"
                        : $"{openCount} open in Tally · {merged.Count} total";
                });
            }
            catch (Exception ex)
            {
                if (!_disposed) Log($"Could not refresh companies list: {ex.Message}");
            }
            finally
            {
                System.Threading.Interlocked.Exchange(ref _companiesLoading, 0);
            }
        }

        private async Task OpenTallyAsync()
        {
            try
            {
                var exePath = TallyProcessLauncher.FindTallyExecutable(Settings.TallySettings.ExecutablePath);
                if (string.IsNullOrWhiteSpace(exePath))
                {
                    var dialog = new OpenFileDialog
                    {
                        Title = "Locate Tally Executable (tally.exe)",
                        Filter = "Tally Executable (tally.exe)|tally.exe|Executable Files (*.exe)|*.exe",
                        CheckFileExists = true,
                    };
                    if (dialog.ShowDialog() != true) return;
                    exePath = dialog.FileName;
                }

                if (!string.Equals(Settings.TallySettings.ExecutablePath, exePath, StringComparison.OrdinalIgnoreCase))
                {
                    Settings.TallySettings.ExecutablePath = exePath;
                    _syncManager.SaveSettings(Settings);
                }

                TallyProcessLauncher.LaunchTally(exePath);
                Log($"🚀 Launching Tally: {exePath}");

                for (int attempt = 0; attempt < 8; attempt++)
                {
                    if (_disposed) return;
                    await Task.Delay(2000);
                    var (tallyOk, _, _) = await _syncManager.TestConnectionsAsync();
                    if (tallyOk)
                    {
                        Log("✅ Tally connected! Refreshing companies...");
                        await RefreshCompaniesAsync();
                        return;
                    }
                }

                Log("⏳ Tally launched — please select a company inside Tally if not yet open.");
            }
            catch (Exception ex)
            {
                Log($"❌ Could not launch Tally: {ex.Message}");
                MessageBox.Show($"Could not launch Tally: {ex.Message}", "Open Tally", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        private async Task SyncCompanyAsync(CompanyCardItem? card)
        {
            if (card == null) return;
            if (!card.IsOpenInTally)
            {
                MessageBox.Show($"'{card.Name}' is closed in Tally. Open this company inside Tally to sync.", "Company Closed", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }
            if (_syncManager.IsSyncRunning) { Log("⚠️ Sync already in progress."); return; }
            if (!await CheckSerialAndConfirmAsync()) return;
            if (!await EnsureLicenseForSyncAsync()) return;
            if (_syncManager.IsSyncRunning) { Log("⚠️ Sync already in progress."); return; }

            try
            {
                IsSyncing = true;
                Log($"🔄 Starting incremental sync for {card.Name}...");
                await _syncManager.RunManualSyncAsync(forceResync: false, targetCompanyName: card.Name);
                await LoadLogs();
                await RefreshCompaniesAsync();
            }
            finally
            {
                RefreshSyncFlags();
            }
        }

        private async Task ResetCompanyAsync(CompanyCardItem? card)
        {
            if (card == null) return;
            if (!card.IsOpenInTally)
            {
                MessageBox.Show($"'{card.Name}' is closed in Tally. Open this company inside Tally to reset/resync.", "Company Closed", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }
            if (_syncManager.IsSyncRunning) { Log("⚠️ Sync already in progress."); return; }
            if (!await CheckSerialAndConfirmAsync()) return;
            if (!await EnsureLicenseForSyncAsync()) return;

            var confirm = MessageBox.Show(
                $"Full resync / reset for '{card.Name}'?\n\nPoora historical data dobara sync hoga (thoda time lag sakta hai).",
                "Reset Company Sync",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning);
            if (confirm != MessageBoxResult.Yes) return;
            if (_syncManager.IsSyncRunning) { Log("⚠️ Sync already in progress."); return; }

            try
            {
                IsSyncing = true;
                Log($"♻️ Starting full reset/resync for {card.Name}...");
                await _syncManager.RunManualSyncAsync(forceResync: true, targetCompanyName: card.Name);
                await LoadLogs();
                await RefreshCompaniesAsync();
            }
            finally
            {
                RefreshSyncFlags();
            }
        }

        private void OpenCompanyWeb(CompanyCardItem? card)
        {
            if (card == null) return;
            try
            {
                bool isDebug = false;
#if DEBUG
                isDebug = true;
#endif
                var url = TallyProcessLauncher.BuildWebDashboardUrl(Settings?.SyncSettings?.LicencePurchaseUrl, card.CompanyId, isDebug);
                Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
                Log($"🌐 Opened Web Dashboard for {card.Name}");
            }
            catch (Exception ex)
            {
                Log($"Could not open Web Dashboard: {ex.Message}");
                MessageBox.Show($"Could not open Web Dashboard: {ex.Message}", "Open Web Dashboard", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        private void OpenCompanyFolder(CompanyCardItem? card)
        {
            if (card == null) return;
            try
            {
                var folder = TallyProcessLauncher.ResolveDataFolderPath(card.DataPath, Settings?.TallySettings?.ExecutablePath);
                if (!string.IsNullOrWhiteSpace(folder) && TallyProcessLauncher.OpenFolderInExplorer(folder))
                {
                    Log($"📂 Opened Tally folder: {folder}");
                    return;
                }

                MessageBox.Show(
                    $"Tally data folder for '{card.Name}' could not be found on this PC.",
                    "Open Tally Folder",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                Log($"Could not open Tally folder: {ex.Message}");
                MessageBox.Show($"Could not open Tally folder: {ex.Message}", "Open Tally Folder", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        private async Task LoadLicenseAsync()
        {
            if (_disposed || System.Threading.Interlocked.CompareExchange(ref _licenseLoading, 1, 0) != 0) return;
            try
            {
                var lic = await _syncManager.GetApiClient().GetLicenseValidationAsync();
                ApplyLicenseResult(lic);
            }
            catch
            {
                ApplyLicenseResult(new LicenseResult
                {
                    Allowed = false,
                    Status = LicenseStatus.NetworkError,
                    IsNetworkError = true,
                    Message = "Unable to reach licence server",
                    DisplayTitle = "Licence Verification Failed",
                    DisplayMessage = "Unable to verify your licence. Please connect to the internet and try again.",
                    DisplayAction = "Refresh License Status"
                });
            }
            finally { System.Threading.Interlocked.Exchange(ref _licenseLoading, 0); }
        }

        /// <summary>
        /// Load licence history from Supabase (trial_history, user_licenses, payments) via the
        /// existing user_read_own_* RLS policies. Newest first.
        /// </summary>
        internal async Task LoadLicenseHistoryAsync()
        {
            try
            {
                var userId = App.AuthService?.CurrentSession?.UserId;
                if (string.IsNullOrEmpty(userId)) return;

                var history = await _syncManager.GetApiClient().GetLicenseHistoryAsync(userId);
                Application.Current.Dispatcher.Invoke(() =>
                {
                    LicenseHistory.Clear();
                    foreach (var h in history) LicenseHistory.Add(h);
                });
            }
            catch (Exception ex)
            {
                Log($"Licence history load failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Refresh licence status on demand (Refresh License Status button / revalidation).
        /// Does not touch any sync data or the pending queue.
        /// </summary>
        private async Task RefreshLicenseAsync()
        {
            Log("Refreshing licence status...");
            await LoadLicenseAsync();
            if (IsLicenseBlocked)
            {
                Log($"⛔ Licence blocked: {LicenseBlockMessage}");
            }
            else
            {
                Log($"✅ Licence OK: {LicenseStatusText}");
            }
        }

        /// <summary>
        /// Opens the licence purchase page INSIDE the PC Connector app using an embedded browser (WebView2).
        /// Payment is processed server-side (payment gateway webhook verifies and creates the licence).
        /// The connector never handles money or licence keys — it only re-validates on the next sync.
        /// </summary>
        private async Task BuyLicenceAsync()
        {
            try
            {
                // Web purchase page URL — configure in appsettings.json under "LicencePurchaseUrl"
                bool isDebug = false;
#if DEBUG
                isDebug = true;
#endif
                string url = LicencePurchaseLink.Resolve(Settings?.SyncSettings?.LicencePurchaseUrl, isDebug);

                Log("Opening licence purchase window...");
                
                var purchaseWindow = new LicensePurchaseWindow(url);
                purchaseWindow.Owner = System.Windows.Application.Current.MainWindow;
                purchaseWindow.WindowStartupLocation = System.Windows.WindowStartupLocation.CenterOwner;
                purchaseWindow.ShowDialog();
            }
            catch (Exception ex)
            {
                Log($"Could not open purchase page: {ex.Message}");
                MessageBox.Show("Licence खरीद पेज नहीं खुल सका। कृपया वेबसाइट पर जाकर खरीदें।", "Buy Licence",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        /// <summary>
        /// Apply a licence validation result to the UI. Idempotent.
        /// Sets the blocking-screen state and the existing KPI card properties.
        /// Never deletes, clears or resets the sync queue.
        /// </summary>
        private void ApplyLicenseResult(LicenseResult lic)
        {
            _lastAppliedLicenseStatus = lic.Status;

            _licenseResult = lic;
            LicenseResult = lic;
            Status.IsServerConnected = !lic.IsNetworkError;
            OnPropertyChanged(nameof(Status));
            IsLicenseBlocked = !lic.Allowed && !lic.IsNetworkError;
            if (lic.IsNetworkError)
            {
                LicenseDetail = "Verification pending · sync paused";
                LicenseStatusText = lic.DisplayMessage;
                Log("⚠️ Licence verification temporarily unavailable; sync paused, retry available.");
                return;
            }

            // Existing KPI card (kept for backward compatibility with the dashboard card)
            var planName = lic.PlanName;
            if (string.IsNullOrWhiteSpace(planName) || planName.Equals("Unknown", StringComparison.OrdinalIgnoreCase))
            {
                // Fall back to a friendly name based on the authoritative server status
                planName = lic.Status switch
                {
                    LicenseStatus.TrialActive => "Trial",
                    LicenseStatus.Active => "Active",
                    _ => "—"
                };
            }
            LicensePlan = planName;
            LicenseDetail = lic.Allowed
                ? $"Active · {lic.DaysLeft} days left"
                : lic.Status == LicenseStatus.Expired
                    ? $"Expired · {lic.ExpiryDate:dd MMM yyyy}"
                    : (lic.Status.ToString() ?? "Inactive").Replace('_', ' ');

            // Blocking-screen content
            LicenseStatusText = lic.Message;
            LicenseStatusColor = lic.Allowed ? "#0B8968" : "#DC2626";
            LicenseBlockTitle = lic.DisplayTitle;
            LicenseBlockMessage = lic.DisplayMessage;
            LicenseBlockAction = lic.DisplayAction;

            if (lic.Allowed)
            {
                Log($"✅ Licence OK: {lic.Status} ({lic.Message})");
                // Advisory 7 / 3 / 1 day trial-expiry warning, once per day
                if (lic.DaysLeft > 0 && lic.DaysLeft <= 7)
                {
                    ShowExpiryWarningIfDue(lic.DaysLeft);
                }
            }
            else
            {
                Log($"⛔ Licence blocked: {lic.Status} — {lic.DisplayMessage}");
            }
        }

        /// <summary>
        /// Pre-flight licence check for manual sync commands. Returns true only when
        /// synchronisation is permitted. Does not modify the pending queue.
        /// </summary>
        private async Task<bool> EnsureLicenseForSyncAsync()
        {
            try
            {
                var lic = await _syncManager.GetApiClient().GetLicenseValidationAsync();
                ApplyLicenseResult(lic);
                if (!lic.Allowed)
                {
                    Log($"⛔ Sync blocked: {lic.DisplayMessage}");
                }
                return lic.Allowed;
            }
            catch
            {
                ApplyLicenseResult(new LicenseResult
                {
                    Allowed = false,
                    Status = LicenseStatus.NetworkError,
                    IsNetworkError = true,
                    DisplayTitle = "Licence Verification Failed",
                    DisplayMessage = "Unable to verify your licence. Please connect to the internet and try again.",
                    DisplayAction = "Refresh License Status"
                });
                return false;
            }
        }

        /// <summary>
        /// Show a 7 / 3 / 1 day trial-expiry advisory, once per day.
        /// Logged (not a blocking popup) so it isn't repeated on every login.
        /// </summary>
        private void ShowExpiryWarningIfDue(int daysLeft)
        {
            var today = DateTime.Today;
            if (_lastLicenseWarningDate.HasValue && _lastLicenseWarningDate.Value.Date == today) return;

            string msg = daysLeft switch
            {
                <= 1 => "Your free trial expires tomorrow. Contact your administrator to extend or activate your licence.",
                <= 3 => $"Only {daysLeft} days left in your free trial.",
                _ => $"Your free trial expires in {daysLeft} days. Plan ahead to continue uninterrupted syncing."
            };

            Log($"⚠️ {msg}");
            _lastLicenseWarningDate = today;
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
            if (_disposed) return;
            string logMsg = $"[{DateTime.Now:HH:mm:ss}] {message}";
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
        private readonly Action<object?> _execute;
        public event EventHandler? CanExecuteChanged;

        public RelayCommand(Action<object?> execute) => _execute = execute;

        public bool CanExecute(object? parameter) => true;
        public void Execute(object? parameter) => _execute(parameter);
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
