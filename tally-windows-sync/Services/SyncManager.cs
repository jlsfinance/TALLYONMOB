using System;
using System.Collections.Generic;
using System.Linq;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Timers;
using Newtonsoft.Json;
using TallySyncApp.Models;
using TallySyncApp;

namespace TallySyncApp.Services
{
    /// <summary>
    /// SyncManager - Orchestrates the entire sync process
    /// Manages background sync, retry logic, and status updates
    /// </summary>
    public class SyncManager : IDisposable
    {
        private readonly AppSettings _settings;
        private TallyConnector? _tallyConnector;
        private ApiClient? _apiClient;
        private TallyVoucherPusher? _voucherPusher;
        private OfflineQueueService? _offlineQueue;
        private System.Timers.Timer? _syncTimer;
        private CancellationTokenSource? _cancellationTokenSource;
        private bool _isSyncing = false;
        private VoucherBatchJournal? _voucherJournal;
        private CloudSyncProgress? _cloudHistoryProgress;
        // Set when a full-history index could not prove it covers the cloud data.
        // Drives "partial" sync history instead of "completed".
        private string? _historicalCoverageError;
        private readonly object _syncLock = new object();
        private Dictionary<string, string> _hsnCache = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        // Vouchers created by the current incremental scan; each one gets a PDF sent to Telegram.
        private readonly List<Voucher> _vouchersToPdf = new List<Voucher>();

        // Local SQLite store for company identity mappings (GUID + path + source -> company_id).
        // Lazy-initialized on first use with the logged-in user's owner_id.
        private CompanyMappingStore? _mappingStore;
        private readonly object _mappingStoreLock = new object();

        // Vouchers per Tally request. Small batches keep Tally (and low-end PCs) alive.
        private const int TALLY_BATCH_SIZE = 100;

        public SyncStatus Status { get; private set; } = new();
        public Company? CurrentCompany { get; private set; }

        // Last licence validation result, exposed so the UI can reflect it without
        // making a duplicate RPC call. One validation per sync cycle.
        public LicenseResult? LastLicenseResult { get; private set; }

        public event EventHandler<SyncStatus>? StatusChanged;
        public event EventHandler<SyncItemStatus>? ItemSynced;
        public event EventHandler<string>? SyncLogRequested;

        public SyncManager()
        {
            // DIAGNOSTIC TEST: Attempt to upload 1 dummy voucher
            // Note: Constructors cannot be async, so we run this as a fire-and-forget task.
            // This is for diagnostic purposes only and should not block the constructor.
            _settings = LoadSettings();
            InitializeServices();
        }

        /// <summary>
        /// Load settings from appsettings.json
        /// </summary>
        private AppSettings LoadSettings()
        {
            try
            {
                var path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "appsettings.json");
                if (File.Exists(path))
                {
                    var json = File.ReadAllText(path);
                    return JsonConvert.DeserializeObject<AppSettings>(json) ?? new AppSettings();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to load settings: {ex.Message}");
            }
            return new AppSettings();
        }

        /// <summary>
        /// Save settings to appsettings.json
        /// </summary>
        public void SaveSettings(AppSettings settings)
        {
            try
            {
                var path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "appsettings.json");
                var json = JsonConvert.SerializeObject(settings, Formatting.Indented);
                File.WriteAllText(path, json);
                
                // Reinitialize services with new settings
                InitializeServices();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to save settings: {ex.Message}");
            }
        }

        // Switches take effect at the next reconciliation; do not dispose services mid-sync.
        public bool SetSafeVoucherReconciliation(bool enabled)
        {
            var previous = _settings.SyncSettings.UseSafeVoucherReconciliation;
            try
            {
                _settings.SyncSettings.UseSafeVoucherReconciliation = enabled;
                var path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "appsettings.json");
                var tempPath = path + ".reconcile-" + Guid.NewGuid().ToString("N") + ".tmp";
                File.WriteAllText(tempPath, JsonConvert.SerializeObject(_settings, Formatting.Indented));
                if (File.Exists(path)) File.Replace(tempPath, path, null);
                else File.Move(tempPath, path);
                return true;
            }
            catch (Exception ex)
            {
                _settings.SyncSettings.UseSafeVoucherReconciliation = previous;
                SyncLogger.Log($"[Reconcile] Could not save mode: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Initialize all services
        /// </summary>
        private void InitializeServices()
        {
            // Dispose existing services
            _tallyConnector?.Dispose();
            _apiClient?.Dispose();
            _offlineQueue?.Dispose();
            _voucherJournal?.Dispose();

            // Create new instances
            _tallyConnector = new TallyConnector(
                _settings.TallySettings.Host,
                _settings.TallySettings.Port,
                _settings.TallySettings.TimeoutSeconds
            );
            
            // Wire up Tally logs to UI
            _tallyConnector.LogReceived += (s, msg) => AddLog(msg);

            // Use Supabase URL and Key from AuthSettings
            string supabaseUrl = _settings.AuthSettings.SupabaseUrl;
            string supabaseKey = _settings.AuthSettings.SupabaseAnonKey;

            // Fallback to known values if empty (safety net) - Ensure these are empty for production/Git
            if (string.IsNullOrEmpty(supabaseUrl)) supabaseUrl = "";
            if (string.IsNullOrEmpty(supabaseKey)) supabaseKey = "";

            _apiClient = new ApiClient(
                supabaseUrl,
                supabaseKey,
                300,
                _settings.SyncSettings.TelegramBotToken
            );

            // Set User Token if logged in
            if (App.AuthService != null && App.AuthService.IsLoggedIn)
            {
                _apiClient.SetUserToken(App.AuthService.GetAccessToken() ?? "", App.AuthService.CurrentSession?.UserId);
            }

            // Long syncs outlive the 60-minute JWT (a full historical backfill takes ~1 hour).
            // Force a refresh on 401 so the run keeps going instead of failing every batch.
            _apiClient.TokenRefresher = async () =>
            {
                if (App.AuthService == null) return null;
                await App.AuthService.RefreshTokenAsync();
                return App.AuthService.GetAccessToken();
            };

            _offlineQueue = new OfflineQueueService(_settings.Database.Path);
            _voucherJournal = new VoucherBatchJournal();
        }

        /// <summary>
        /// Test connections to Tally and Server independently
        /// </summary>
        public async Task<(bool TallyConnected, bool ServerConnected, string? Error)> TestConnectionsAsync()
        {
            UpdateStatus(SyncState.Connecting, "Testing connections...");
            StringBuilder errors = new StringBuilder();

            // 1. Test Tally
            var tallyResult = await _tallyConnector!.TestConnectionAsync();
            Status.IsTallyConnected = tallyResult.Success;
            if (!tallyResult.Success)
            {
                errors.AppendLine($"Tally: {tallyResult.Message}");
            }
            else
            {
                // Note: We don't fail the connection test just because a company isn't active/selected yet.
                // We'll handle company detection in the sync loop.
                try
                {
                    CurrentCompany = await _tallyConnector.GetActiveCompanyAsync();
                    if (CurrentCompany != null)
                    {
                        Status.CompanyName = CurrentCompany.Name;
                    }
                }
                catch {}
            }

            // 2. Test Server (Always test server even if Tally is offline)
            var serverResult = await _apiClient!.TestConnectionAsync();
            Status.IsServerConnected = serverResult.Success;
            if (!serverResult.Success)
            {
                errors.AppendLine($"Cloud: {serverResult.Message}");
                AddLog($"❌ Cloud Connection Failed: {serverResult.Message}");
            }
            else 
            {
                 // AddLog("✅ Cloud Connected"); // Optional: prevent spam
            }

            // Update UI State
            if (Status.IsTallyConnected && Status.IsServerConnected)
            {
                UpdateStatus(SyncState.Idle, "All systems connected");
            }
            else if (!Status.IsTallyConnected && !Status.IsServerConnected)
            {
                UpdateStatus(SyncState.Error, "All systems offline", errors.ToString().Trim());
            }
            else
            {
                string msg = Status.IsTallyConnected ? "Cloud Offline" : "Tally Offline";
                UpdateStatus(SyncState.Error, msg, errors.ToString().Trim());
            }

            return (Status.IsTallyConnected, Status.IsServerConnected, errors.Length > 0 ? errors.ToString().Trim() : null);
        }

        /// <summary>
        /// Check Tally Serial Number against stored value
        /// </summary>
        public async Task<(bool IsValid, string? CurrentSerial, string? StoredSerial, string Message)> CheckTallySerialAsync()
        {
            try
            {
                if (_tallyConnector == null) return (false, null, null, "Tally connector not initialized");

                var currentSerial = await _tallyConnector.GetTallySerialNumberAsync();
                
                // If we can't get it, we default to valid to avoid blocking valid usage on errors
                if (string.IsNullOrEmpty(currentSerial))
                {
                    return (true, null, _settings.TallySettings.SerialNumber, "Could not fetch Tally Serial Number");
                }

                var storedSerial = _settings.TallySettings.SerialNumber;

                // First run: Valid (will need to be saved)
                if (string.IsNullOrEmpty(storedSerial))
                {
                    return (true, currentSerial, null, "First run");
                }

                // Verification
                if (!storedSerial.Equals(currentSerial, StringComparison.OrdinalIgnoreCase))
                {
                    return (false, currentSerial, storedSerial, "Serial number mismatch");
                }

                return (true, currentSerial, storedSerial, "Verified");
            }
            catch (Exception ex)
            {
                return (true, null, null, $"Error checking serial: {ex.Message}");
            }
        }

        /// <summary>
        /// Update stored Tally Serial Number
        /// </summary>
        public void UpdateTallySerial(string newSerial)
        {
            _settings.TallySettings.SerialNumber = newSerial;
            SaveSettings(_settings);
            SyncLogRequested?.Invoke(this, $"🔐 Tally License Serial updated to: {newSerial}");
        }

        /// <summary>
        /// P3: re-fetch vouchers that exist in Tally (VT+VN known) but are missing in cloud,
        /// through the standard voucher upload path (vouchers + entries + sales/purchases).
        /// </summary>
        private async Task RepairMissingVouchersAsync(Company company, List<(string VoucherType, string VoucherNumber)> missing, Dictionary<string, string> hsnCache)
        {
            const int VnsPerRequest = 60;
            int repaired = 0;

            foreach (var vtGroup in missing.GroupBy(m => m.VoucherType))
            {
                var vns = vtGroup.Select(m => m.VoucherNumber).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

                for (int i = 0; i < vns.Count; i += VnsPerRequest)
                {
                    List<Voucher> fetched;
                    try
                    {
                        fetched = await _tallyConnector!.GetVouchersByTypeAndNumbersAsync(company.Name, vtGroup.Key, vns.Skip(i).Take(VnsPerRequest).ToList(), hsnCache);
                    }
                    catch (Exception ex)
                    {
                        AddLog($"   ⚠️ Repair fetch failed ({vtGroup.Key}): {ex.Message}");
                        break;
                    }
                    if (fetched.Count == 0) continue;

                    try
                    {
                        await PersistVoucherBatchesAsync(company, fetched, new List<string>(), _cancellationTokenSource?.Token ?? default);
                        repaired += fetched.Count;
                    }
                    catch (Exception ex)
                    {
                        AddLog($"   ⚠️ Repair upload failed: {ex.Message}");
                        throw;
                    }

                    await Task.Delay(300);
                }
            }

            AddLog($"🧩 P3 repair complete: {repaired} voucher(s) re-synced");
        }

        public ApiClient GetApiClient() => _apiClient!;

        /// <summary>
        /// Centralised licence gate. Returns the licence result; Allowed=true only when
        /// synchronisation is permitted. Enforced inside RunSyncAsync() so every entry
        /// point (manual, auto, background, tray, force_sync, pending-queue retry) passes
        /// through it. The decision is based solely on server-side data (validate_user_license
        /// RPC, server clock) — never the local PC clock or a client-side cached flag.
        /// </summary>
        public async Task<LicenseResult> ValidateLicenseBeforeSyncAsync()
        {
            var lic = await _apiClient!.GetLicenseValidationAsync();
            LastLicenseResult = lic;
            Status.IsServerConnected = !lic.IsNetworkError;

            if (!lic.Allowed)
            {
                AddLog($"⛔ Sync blocked by licence: {lic.Status} ({lic.Message})");
                SyncLogger.Log($"[License] BLOCKED: {lic.Status} ({lic.Message})");
                UpdateStatus(SyncState.Error, lic.DisplayTitle, lic.DisplayMessage);
            }
            else
            {
                AddLog($"✅ Licence OK: {lic.Status} ({lic.Message})");
                SyncLogger.Log($"[License] OK: {lic.Status} ({lic.Message})");
                // Clear a previous licence-error state so the UI can return to idle
                if (Status.State == SyncState.Error
                    && !string.IsNullOrEmpty(Status.Error)
                    && Status.Error.IndexOf("licence", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    UpdateStatus(SyncState.Idle, "Ready");
                }
            }

            return lic;
        }

        /// <summary>
        /// Returns true if the current (cached) licence state permits synchronisation.
        /// Used by the UI to enable/disable sync controls without an extra RPC call.
        /// </summary>
        public bool IsSyncPermittedByLicense()
        {
            return LastLicenseResult?.Allowed == true;
        }

        /// <summary>
        /// Start background sync timer
        /// </summary>
        public async Task<List<Company>> GetOpenCompaniesAsync()
        {
            if (_tallyConnector == null) return new List<Company>();
            return await _tallyConnector.GetOpenCompaniesAsync();
        }

        public void StartSync()
        {
            if (_syncTimer != null) return;

            lock (_syncLock)
            {
                if (_isSyncing && _cancellationTokenSource?.IsCancellationRequested == true)
                    throw new InvalidOperationException("Previous sync is stopping. Please try again shortly.");
                if (!_isSyncing || _cancellationTokenSource == null)
                {
                    _cancellationTokenSource?.Dispose();
                    _cancellationTokenSource = new CancellationTokenSource();
                }
            }
            var startupToken = _cancellationTokenSource.Token;

            _syncTimer = new System.Timers.Timer(_settings.SyncSettings.SyncIntervalMinutes * 60 * 1000);
            _syncTimer.Elapsed += async (s, e) => { if (!startupToken.IsCancellationRequested) await RunSyncAsync(); };
            _syncTimer.AutoReset = true;
            _syncTimer.Start();

            // Calculate next sync time
            Status.NextSyncTime = DateTime.Now.AddMinutes(_settings.SyncSettings.SyncIntervalMinutes);
            UpdateStatus(SyncState.Idle, $"Auto-sync every {_settings.SyncSettings.SyncIntervalMinutes} minutes");

            Console.WriteLine($"Background sync started (interval: {_settings.SyncSettings.SyncIntervalMinutes} min)");

            // FIX: Trigger immediate first sync when auto-sync is started
            _ = Task.Run(async () => 
            {
                try
                {
                    await Task.Delay(2000, startupToken); // Stop also cancels a not-yet-started pass.
                    startupToken.ThrowIfCancellationRequested();
                    await RunSyncAsync(isManual: false, forceResync: false);
                }
                catch (OperationCanceledException) when (startupToken.IsCancellationRequested) { }
            });
        }

        /// <summary>
        /// Stop background sync
        /// </summary>
        public void StopSync()
        {
            _syncTimer?.Stop();
            _syncTimer?.Dispose();
            _syncTimer = null;

            _cancellationTokenSource?.Cancel();
            Status.NextSyncTime = null;

            UpdateStatus(SyncState.Idle, "Sync stopped");
            Console.WriteLine("Background sync stopped");
        }

        /// <summary>
        /// Manual sync trigger
        /// </summary>
        public async Task RunManualSyncAsync(bool forceResync = false)
        {
            await RunSyncAsync(isManual: true, forceResync: forceResync);
        }

        /// <summary>
        /// Main sync operation
        /// </summary>
        private async Task RunSyncAsync(bool isManual = false, bool forceResync = false)
        {
            AddLog($"🚀 Sync requested (Manual: {isManual}, Force: {forceResync})");
            CancellationToken runToken;

            // FIX 4: Hard Lock + isSyncing flag
            lock (_syncLock)
            {
                if (_isSyncing)
                {
                     AddLog("⚠️ Sync already in progress, skipping request.");
                     Console.WriteLine("Sync already in progress, skipping...");
                     return;
                }
                var cancellation = SyncRunCancellation.Prepare(_cancellationTokenSource, isManual);
                if (cancellation == null) return;
                _cancellationTokenSource = cancellation;
                runToken = cancellation.Token;
                _isSyncing = true;
            }
            var overallStopwatch = Stopwatch.StartNew();

            try
            {
                // ===== LICENCE GATE (enforced for every sync entry point) =====
                // Manual, Auto-Sync, background timer, tray Sync Now, SignalR force_sync,
                // and pending-queue retry all funnel through RunSyncAsync(), so a single
                // check here blocks them all without touching the sync queue.
                var licence = await ValidateLicenseBeforeSyncAsync();
                if (!licence.Allowed)
                {
                    // Sync is blocked. Do NOT clear or touch the pending queue — queued
                    // transactions must resume safely once the licence is reactivated.
                    return;
                }

                // AUDIT FIX: Auto-refresh auth token before sync to prevent 401 expiry failures
                if (App.AuthService != null && App.AuthService.IsLoggedIn)
                {
                    try
                    {
                        var freshToken = await App.AuthService.RefreshTokenIfNeededAsync();
                        if (!string.IsNullOrEmpty(freshToken))
                        {
                            _apiClient!.SetUserToken(freshToken, App.AuthService.CurrentSession?.UserId);
                        }
                        else
                        {
                            AddLog("⚠️ Auth token unavailable (refresh failed) — uploads may fail with 401 this cycle");
                        }
                    }
                    catch (Exception refreshEx)
                    {
                        AddLog($"⚠️ Token refresh failed: {refreshEx.Message} — continuing with existing token");
                    }
                }
                else
                {
                    AddLog("⚠️ Not logged in — token refresh skipped (401s expected)");
                }

                // Test connections first
                AddLog("🔄 Testing connections...");
                var (tallyOk, serverOk, error) = await TestConnectionsAsync();
                if (!tallyOk)
                {
                    AddLog("❌ Tally not available. Ensure Tally Prime is open and running on localhost.");
                    Console.WriteLine("Tally not available, skipping sync");
                    return;
                }

                // Retry any pending cloud identity mappings from a previous interrupted sync
                if (App.AuthService?.IsLoggedIn == true && !string.IsNullOrEmpty(App.AuthService.CurrentSession?.UserId))
                {
                    await SyncPendingMappingsAsync(App.AuthService.CurrentSession.UserId);
                }

                // P2: license guard - this Tally serial must belong to the logged-in account.
                // Another account already bound to it = shared license => block syncing.
                try
                {
                    var tallySerial = await _tallyConnector!.GetTallySerialNumberAsync();
                    if (!string.IsNullOrEmpty(tallySerial) && App.AuthService?.IsLoggedIn == true)
                    {
                        var (claim, boundUser) = await _apiClient!.TryClaimTallySerialAsync(
                            tallySerial, DeviceIdentityService.Current.MachineId, DeviceIdentityService.Current.MachineName);
                        if (claim == "in_use")
                        {
                            AddLog($"⛔ Tally license blocked (P2): serial {tallySerial} is already bound to another user. Sync stopped.");
                            UpdateStatus(SyncState.Error, "Tally license in use",
                                "This Tally serial is bound to a different account. Contact support to transfer it.");
                            return;
                        }
                        SyncLogger.Log($"[P2] serial claim: {claim}");
                    }
                }
                catch (Exception licEx)
                {
                    AddLog($"⚠️ License check skipped: {licEx.Message}");
                    SyncLogger.Log($"⚠️ License check error: {licEx.Message}");
                }

                // 1. Get ALL Open Companies from Tally
                AddLog("🔍 Fetching open companies from Tally...");
                var companies = await _tallyConnector!.GetOpenCompaniesAsync();
                
                AddLog($"🔍 Found {companies.Count} companies in Tally.");
                foreach (var c in companies)
                {
                     AddLog($"   🏢 Discovered: {c.Name} (ID: {c.Id})");
                }

                // LK parity: notification retry ledger re-announce - issues that failed an
                // earlier sync cycle are re-announced until cleared, capped at retries.
                try
                {
                    var pendingNotifs = await _offlineQueue!.GetPendingNotificationsAsync();
                    if (pendingNotifs.Count > 0)
                    {
                        foreach (var (ntype, cid, desc, retry) in pendingNotifs)
                            AddLog($"🔔 Still failing: {cid} - {desc} (attempt {retry + 1}/{OfflineQueueService.MaxNotificationRetries})");

                        var tgUid = App.AuthService?.CurrentSession?.UserId;
                        if (!string.IsNullOrEmpty(tgUid))
                        {
                            var tgChat = await _apiClient!.GetTelegramChatIdAsync(tgUid);
                            if (!string.IsNullOrEmpty(tgChat))
                            {
                                var names = string.Join(", ", pendingNotifs.Select(p => p.CompanyId));
                                var withRetry = pendingNotifs.Max(p => p.RetryCount) + 1;
                                await _apiClient.SendTelegramNotificationAsync(tgChat,
                                    $"🔔 <b>Sync still failing</b>: {names}\n\n<i>Attempt {withRetry}/{OfflineQueueService.MaxNotificationRetries}</i>");
                            }
                        }
                    }
                }
                catch (Exception nEx) { SyncLogger.Log($"⚠️ Notification re-announce failed: {nEx.Message}"); }

                if (companies.Count == 0)
                {
                    UpdateStatus(SyncState.Idle, "No open companies found in Tally");
                    AddLog("❌ No companies returned by Tally. Check if Tally is open and companies are loaded.");
                    return;
                }

                Status.TotalRecords = 0;
                Status.ProcessedRecords = 0;

                // Pending uploads survive application restarts and manual syncs.

                var failedCompanies = new List<string>();
                string? lastCompanyError = null;
                foreach (var company in companies)
                {
                    runToken.ThrowIfCancellationRequested();
                    // ===== SYNC HISTORY TRACKING - declare outside try for catch access =====
                    string syncType = "incremental"; // Default
                    string? syncHistoryId = null;
                    int ledgersSynced = 0, vouchersSynced = 0, salesSynced = 0, purchasesSynced = 0, stockSynced = 0;
                    int masterDataSynced = 0;
                    decimal totalSalesAmountFetched = 0;
                    var highValueAlerts = new List<string>();
                    var syncedVoucherIds = new List<string>();
                    _historicalCoverageError = null;
                    _cloudHistoryProgress = null;

                    try
                    {
                        SyncLogger.Log($"--- Starting Sync for {company.Name} ---");
                        
                        // TELEGRAM: Start Notification
                        try 
                        {
                            var uid = App.AuthService?.CurrentSession?.UserId;
                            if (!string.IsNullOrEmpty(uid)) 
                            {
                                var chatId = await _apiClient!.GetTelegramChatIdAsync(uid);
                                if (!string.IsNullOrEmpty(chatId)) 
                                {
                                    await _apiClient.SendTelegramNotificationAsync(chatId, $"🚀 <b>Sync Started: {company.Name}</b>\n\n<i>Time: {DateTime.Now:HH:mm:ss}</i>");
                                }
                            }
                        } 
                        catch (Exception tgEx) { SyncLogger.Log($"⚠️ Telegram Start notification failed: {tgEx.Message}"); }

                        CurrentCompany = company;
                        Status.CompanyName = company.Name;
                        UpdateStatus(SyncState.Syncing, $"Processing: {company.Name}");

                        // Sync company info first
                        // Declare ownerId here so it's in scope for the entire company processing block
                        string ownerId = CurrentCompany.OwnerId ?? App.AuthService.CurrentSession?.UserId ?? string.Empty;

                        if (serverOk)
                        {
                            // Inject OwnerId for RLS
                            if (!string.IsNullOrEmpty(App.AuthService?.CurrentSession?.UserId))
                            {
                                CurrentCompany.OwnerId = App.AuthService.CurrentSession.UserId;
                                AddLog($"👤 Assigned Owner ID: {CurrentCompany.OwnerId} to {CurrentCompany.Name}");
                            }
                            else
                            {
                                AddLog($"⚠️ Warning: No Owner ID assigned. Company might not be visible on website if RLS is enabled.");
                            }

                            // Keep previously synced rows/checkpoints when the folder moves.
                            // A local GUID mapping is independent of its recorded data path.
                            await EnsureMappingStoreInitializedAsync(VoucherOwnerId);
                            if (!string.IsNullOrWhiteSpace(CurrentCompany.TallyGuid))
                            {
                                var known = _mappingStore!.GetByGuid(VoucherOwnerId, CurrentCompany.TallyGuid)
                                    .Select(map => new ExistingCompanyIdentity(map.SupabaseCompanyId, map.TallyGuid)).ToList();
                                if (known.Count > 0)
                                {
                                    var resolved = CompanyCloudIdentity.Resolve(CurrentCompany.Name, CurrentCompany.TallyGuid, null, known);
                                    if (!Guid.TryParse(resolved, out _)) throw new InvalidDataException("Saved company mapping has an invalid cloud ID.");
                                    CurrentCompany.Id = resolved;
                                }
                            }
                            var compResult = await _apiClient!.SyncCompanyAsync(CurrentCompany);
                            if (compResult.Success)
                            {
                                SyncLogger.Log($"✅ Company metadata synced: {company.Name}");
                                AddLog($"✅ Company registered in Cloud: {company.Name} (ID: {company.Id})");

                                // Record identity in every extractor mode, including FastExtractor.
                                // The existing retry flow confirms new mappings with the cloud.
                                if (!string.IsNullOrWhiteSpace(company.TallyGuid))
                                {
                                    var identity = new CompanyIdentityMap
                                    {
                                        SupabaseCompanyId = company.Id, TallyGuid = company.TallyGuid,
                                        DataPath = company.DataPath ?? "", SourceId = GenerateSourceId(company.DataPath ?? ""),
                                        OwnerId = VoucherOwnerId, RegisteredAt = DateTime.UtcNow, LastSeenAt = DateTime.UtcNow,
                                        IsActive = true, IsVerified = false, ConfirmationState = "pending"
                                    };
                                    if (_mappingStore!.GetByGuidAndPath(VoucherOwnerId, company.TallyGuid, identity.DataPath) == null &&
                                        !_mappingStore.SaveWithPendingState(identity))
                                        throw new IOException("Could not persist company identity; stopped before data sync.");
                                }

                                if (company.FinancialYearStart != null)
                                {
                                    AddLog($"📅 Financial Year: {company.FinancialYearStart:dd-MMM-yyyy} to {company.FinancialYearEnd:dd-MMM-yyyy}");
                                }
                            }
                            else 
                            {
                                // FULL ERROR OUTPUT FOR DEBUGGING
                                Console.WriteLine($"=== COMPANY SYNC ERROR ===");
                                Console.WriteLine($"Company: {company.Name}");
                                Console.WriteLine($"Company ID: {company.Id}");
                                Console.WriteLine($"Owner ID: {CurrentCompany.OwnerId}");
                                Console.WriteLine($"Error: {compResult.Error}");
                                Console.WriteLine($"===========================");
                                
                                AddLog($"❌ Company registration FAILED: {compResult.Error}");
                                SyncLogger.Log($"⚠️ Company sync warning: {compResult.Error}");
                                failedCompanies.Add(company.Name);
                                lastCompanyError = compResult.Error;

                                // Company row is the membership anchor for ALL child-table RLS
                                // (child policies check company_id IN owned companies). If it could
                                // not be created/updated - usually: this company name is already
                                // owned by ANOTHER account on cloud - skip this company's data pass,
                                // otherwise every child batch dies with 42501 and floods the queue.
                                AddLog("⏭ Skipping data sync for this company (register failed).");
                                AddLog($"   ℹ️ {compResult.Error}");

                                // LK parity: remember this failure so later sync cycles
                                // re-announce it until the company syncs successfully.
                                await _offlineQueue!.UpsertNotificationAsync("not_synced", company.Name, compResult.Error ?? "register failed");
                                continue;                            }
                        }

                        // NOTE: ye check company sync ke BAAD hi hona chahiye — SyncCompanyAsync
                        // company.Id ko deterministic UUID me convert karta hai. Pehle karne se query
                        // purane (Tally wale) id pe chalti thi, 0 rows aati thi aur har sync
                        // "first sync" banke poora history dobara uthata tha.
                        await _apiClient!.FailRunningSyncsAsync(company.Id);

                        long lastVoucherAlterId = _voucherJournal!.GetCheckpoint(VoucherOwnerId, company.Id)
                            ?? await _apiClient!.GetMaxAlterIdAsync(company.Id, "vouchers");
                        _voucherJournal.EnsureCheckpoint(VoucherOwnerId, company.Id, lastVoucherAlterId);
                        long lastLedgerAlterId = await _apiClient.GetMaxAlterIdAsync(company.Id, "ledgers");

                        bool isFirstSync = lastVoucherAlterId == 0 || forceResync;

                        if (forceResync) syncType = "force";
                        else if (isFirstSync) syncType = "full";
                        else syncType = "incremental";

                        syncHistoryId = await _apiClient!.StartSyncHistoryAsync(company.Id, syncType);
                        if (!string.IsNullOrEmpty(syncHistoryId)) _cloudHistoryProgress = new CloudSyncProgress { HistoryId = syncHistoryId };
                        AddLog($"🔎 Sync type: {syncType} (last voucher ALTERID: {lastVoucherAlterId}, ledger: {lastLedgerAlterId})");

                        /* 
                        // FIX 2: Disable GetRecordCountsAsync - It hits Tally too hard for vouchers
                        var counts = await _tallyConnector.GetRecordCountsAsync(company.Name);
                        var companyTotal = counts.Values.Sum();
                        Status.TotalRecords += companyTotal;
                        
                        // Show breakdown to user
                        string breakdown = string.Join(", ", counts.Where(c => c.Value > 0).Select(c => $"{c.Value} {c.Key}"));
                        UpdateStatus(SyncState.FetchingData, $"Found: {breakdown}", company.Name);
                        await Task.Delay(1000); // Give user a moment to see the counts
                        */
                        // FIX 1: HSN Cache MUST be scoped per company to avoid cross-contamination
                        _hsnCache.Clear();
                        _vouchersToPdf.Clear();

                        // FIX 2: Status.TotalRecords logic - Reset properly at start of company sync
                        Status.TotalRecords = 0; 
                        Status.ProcessedRecords = 0;
                        
                        // Complete interrupted batches BEFORE any new voucher work.
                        var resumed = await ReplayVoucherBatchesAsync(company, highValueAlerts, runToken);
                        vouchersSynced += resumed.Vouchers;
                        salesSynced += resumed.Sales;
                        purchasesSynced += resumed.Purchases;
                        totalSalesAmountFetched += resumed.SalesAmount;
                        await ProcessQueueAsync();
                        lastVoucherAlterId = _voucherJournal.GetCheckpoint(VoucherOwnerId, company.Id) ?? lastVoucherAlterId;
                        isFirstSync = lastVoucherAlterId == 0 || forceResync;

                        // ===========================================
                        // TWO-WAY SYNC: Push Cloud entries TO Tally
                        // ===========================================
                        await ProcessPendingTransactionsAsync(company);

                        // ===========================================
                        // ALTERID-BASED INCREMENTAL SYNC
                        // ===========================================
                        // CACHE STOCK HSN (Critical for HSN Fallback)
                        // ===========================================
                        // Optimization: Fetch stock items to populate cache for this company
                        // Since we cleared cache above, this will always run for usage in this session
                        if (_hsnCache.Count == 0)
                        {
                            UpdateStatus(SyncState.FetchingData, $"Caching Stock Items HSN...");
                            var stockItems = await _tallyConnector!.GetStockItemsAsync(company.Name);
                            _hsnCache = stockItems
                                .Where(s => !string.IsNullOrEmpty(s.HsnCode))
                                .GroupBy(s => s.Name)
                                .ToDictionary(g => g.Key, g => g.First().HsnCode, StringComparer.OrdinalIgnoreCase);
                            
                            SyncLogger.Log($"📦 Cached {_hsnCache.Count} HSN codes from {stockItems.Count} items");
                            AddLog($"📦 HSN Cache: {_hsnCache.Count} valid codes found in {stockItems.Count} items");
                            
                            // Sync Stock Items (Only if needed or force/first)
                            // GST and group changes do not change the item count.
                            if (stockItems.Any())
                            {
                                 await UploadListAsync("stock_items", stockItems, "id");
                                 stockSynced = stockItems.Count;
                                 AddLog($"📦 Synced {stockItems.Count} Stock Items");
                            }
                        }
                        else
                        {
                            AddLog($"📦 Using cached HSN ({_hsnCache.Count} items)");
                        }

                        // ===========================================
                        // MASTER DATA SYNC (All 8 collection types)
                        // Runs on first sync, force resync, or manual sync
                        // ===========================================
                        if (isFirstSync || forceResync || isManual)
                        {
                            AddLog($"📋 Syncing Master Data...");
                            UpdateStatus(SyncState.FetchingData, "Fetching master data...");

                            try
                            {
                                // 1. Ledger Groups
                                var ledgerGroups = await _tallyConnector!.GetLedgerGroupsAsync(company.Name);
                                if (ledgerGroups.Count > 0)
                                {
                                    await UploadListAsync("ledger_groups", ledgerGroups, "company_id,name");
                                    masterDataSynced += ledgerGroups.Count;
                                    AddLog($"   📋 {ledgerGroups.Count} Ledger Groups");
                                }

                                // 2. Cost Centres
                                var costCentres = await _tallyConnector!.GetCostCentresAsync(company.Name);
                                if (costCentres.Count > 0)
                                {
                                    await UploadListAsync("cost_centres", costCentres, "company_id,name");
                                    masterDataSynced += costCentres.Count;
                                    AddLog($"   🏭 {costCentres.Count} Cost Centres");
                                }

                                // 3. Godowns
                                var godowns = await _tallyConnector!.GetGodownsAsync(company.Name);
                                if (godowns.Count > 0)
                                {
                                    await UploadListAsync("godowns", godowns, "company_id,name");
                                    masterDataSynced += godowns.Count;
                                    AddLog($"   📦 {godowns.Count} Godowns");
                                }

                                // 4. Stock Groups
                                var stockGroups = await _tallyConnector!.GetStockGroupsAsync(company.Name);
                                if (stockGroups.Count > 0)
                                {
                                    await UploadListAsync("stock_groups", stockGroups, "company_id,name");
                                    masterDataSynced += stockGroups.Count;
                                    AddLog($"   📊 {stockGroups.Count} Stock Groups");
                                }

                                // 5. Stock Categories
                                var stockCategories = await _tallyConnector!.GetStockCategoriesAsync(company.Name);
                                if (stockCategories.Count > 0)
                                {
                                    await UploadListAsync("stock_categories", stockCategories, "company_id,name");
                                    masterDataSynced += stockCategories.Count;
                                    AddLog($"   📂 {stockCategories.Count} Stock Categories");
                                }

                                // 6. Currencies
                                var currencies = await _tallyConnector!.GetCurrenciesAsync(company.Name);
                                if (currencies.Count > 0)
                                {
                                    await UploadListAsync("currencies", currencies, "company_id,name");
                                    masterDataSynced += currencies.Count;
                                    AddLog($"   💱 {currencies.Count} Currencies");
                                }

                                // 7. Voucher Types
                                var voucherTypes = await _tallyConnector!.GetVoucherTypesAsync(company.Name);
                                if (voucherTypes.Count > 0)
                                {
                                    await UploadListAsync("voucher_types", voucherTypes, "company_id,name");
                                    masterDataSynced += voucherTypes.Count;
                                    AddLog($"   📝 {voucherTypes.Count} Voucher Types");
                                }

                                // 8. Units of Measure
                                var units = await _tallyConnector!.GetUnitsAsync(company.Name);
                                if (units.Count > 0)
                                {
                                    await UploadListAsync("units", units, "company_id,name");
                                    masterDataSynced += units.Count;
                                    AddLog($"   📐 {units.Count} Units");
                                }

                                // 9. Budgets
                                var budgets = await _tallyConnector!.GetBudgetsAsync(company.Name);
                                if (budgets.Count > 0)
                                {
                                    await UploadListAsync("budgets", budgets, "company_id,name");
                                    masterDataSynced += budgets.Count;
                                    AddLog($"   💰 {budgets.Count} Budgets");
                                }

                                // 10. Price Lists
                                var priceLists = await _tallyConnector!.GetPriceListsAsync(company.Name);
                                if (priceLists.Count > 0)
                                {
                                    await UploadListAsync("price_lists", priceLists, "id");
                                    masterDataSynced += priceLists.Count;
                                    AddLog($"   🏷️ {priceLists.Count} Price Lists (Levels)");
                                }

                                AddLog($"✅ Master Data Sync Complete: {masterDataSynced} total items");
                            }
                            catch (Exception mdEx)
                            {
                                AddLog($"⚠️ Master data sync partial failure: {mdEx.Message}");
                                SyncLogger.Log($"Master data error: {mdEx.Message}");
                            }
                        }
                        
                        var hsnCache = _hsnCache;

                        // ===========================================
                        // ALTERID-BASED INCREMENTAL SYNC
                        // Catches ALL modifications - even 6-month old entries!
                        // ===========================================
                        
                        // 1. Check if this is first sync (no data in cloud yet)
                        // Moved to top of loop
                        // lastVoucherAlterId/lastLedgerAlterId already fetched
                        
                        if (forceResync) AddLog("⚠️ FORCE RESYNC ENABLED: Ignoring tracking IDs");
                        
                        if (isFirstSync)
                        {
                            // ======= FIRST TIME: FULL HISTORICAL SYNC =======
                            AddLog($"🆕 First sync detected - fetching ALL historical data");
                            UpdateStatus(SyncState.Syncing, "First Sync: Fetching all ledgers...");
                            
                            // Sync ALL ledgers first (reference data)
                            var allLedgers = await _tallyConnector!.GetLedgersAsync(company.Name);
                            if (allLedgers.Count > 0)
                            {
                                await UploadListAsync("ledgers", allLedgers, "id");
                                ledgersSynced += allLedgers.Count;
                                AddLog($"✅ Synced {allLedgers.Count} historical ledgers");
                            }

                            // FIX 3: Voucher sync protected by EnableVoucherSync flag
                            if (!_settings.SyncSettings.EnableVoucherSync && !forceResync)
                            {
                                AddLog("⏭ Historical voucher sync skipped (Flag disabled)");
                                continue;
                            }

                            if (_settings.SyncSettings.UseFastExtractor)
                            {
                                AddLog("⚡ [FastExtractor] LiveKeeping Mode Active - Zero-Hang Sync Running");
                                var (fVouchers, fSales, fSalesAmt, fPurchases) = await SyncHistoricalVouchersFastAsync(
                                    company, hsnCache, highValueAlerts, runToken);
                                vouchersSynced += fVouchers;
                                purchasesSynced += fPurchases;
                                salesSynced += fSales;
                                totalSalesAmountFetched += fSalesAmt;
                            }
                            else
                            {
                            // Full historical voucher sync: 100 vouchers per Tally request.
                            // Small batches keep Tally memory low and let weak PCs keep up.
                            int totalVouchersFound = 0;

                            UpdateStatus(SyncState.Syncing, "First Sync: reading voucher index...");
                            // Windowed ALTERID index (bounded windows - no single heavy Tally request).
                            var (alterIds, completeness) = await _tallyConnector!.GetVoucherAlterIdsWindowedAsync(company.Name);

                            // Register company identity with cloud (GUID + Data Path + Source ID)
                            // Source ID is stable per (PC, data path) — prevents duplicate mappings on re-sync.
                            // Mapping is saved locally as PENDING until cloud confirms activation.
                            string registerSourceId = GenerateSourceId(company.DataPath ?? "");
                            var registerResult = await _apiClient!.RegisterCompanyIdentityAsync(
                                company.Id,
                                company.TallyGuid ?? "",  // Tally GUID from GetOpenCompaniesAsync
                                company.DataPath ?? "", // Data path from Tally company info
                                registerSourceId,  // Source ID - stable per PC + directory
                                false  // switch_main_path = false for new registration
                            );

                            if (!registerResult.Success)
                            {
                                // Try to extract a user-friendly message from the response body
                                string userMsg = registerResult.Message ?? registerResult.Error ?? "unknown error";
                                try
                                {
                                    var errorBody = Newtonsoft.Json.JsonConvert.DeserializeObject<Dictionary<string, object?>>(registerResult.Message ?? "{}");
                                    if (errorBody != null && errorBody.TryGetValue("message", out var innerMsg) && innerMsg != null)
                                        userMsg = innerMsg.ToString()!;
                                }
                                catch { }

                                string logMsg = $"❌ Company identity registration FAILED: {userMsg}. Cannot sync without confirmed cloud identity.";
                                AddLog(logMsg);
                                SyncLogger.Log($"[CompanyIdentity] {company.Name}: {userMsg}");
                                failedCompanies.Add(company.Name);
                                lastCompanyError = "Company identity registration failed: " + userMsg;
                                continue; // Skip this company - cannot sync without identity mapping
                            }

                            // Save mapping locally as PENDING (cloud activation not yet confirmed)
                            var pendingMap = new CompanyIdentityMap
                            {
                                SupabaseCompanyId = company.Id,
                                TallyGuid = company.TallyGuid ?? "",
                                DataPath = company.DataPath ?? "",
                                SourceId = registerSourceId,
                                OwnerId = ownerId,
                                RegisteredAt = DateTime.UtcNow,
                                LastSeenAt = DateTime.UtcNow,
                                IsVerified = false,
                                IsActive = true,
                                ConfirmationState = "pending",
                            };
                            bool pendingSaved = _mappingStore!.SaveWithPendingState(pendingMap);
                            if (!pendingSaved)
                            {
                                // Duplicate already exists locally — check if it's pending and needs confirmation
                                var existing = _mappingStore.GetByGuidAndPath(ownerId, company.TallyGuid ?? "", company.DataPath ?? "");
                                if (existing != null && existing.ConfirmationState == "pending")
                                {
                                    AddLog($"⚠️ Local mapping already pending for '{company.Name}'. Will retry cloud confirmation.");
                                }
                                else
                                {
                                    AddLog($"⚠️ Could not save pending mapping locally for '{company.Name}'.");
                                }
                            }

                            SyncLogger.Log($"✅ Company identity registered (pending cloud confirm): {company.Name} (ALTERID: {alterIds.Count} vouchers)");

                            if (alterIds.Count == 0)
                            {
                                AddLog("⚠️ No vouchers found in Tally");
                                continue;
                            }

                            int totalBatches = (alterIds.Count + TALLY_BATCH_SIZE - 1) / TALLY_BATCH_SIZE;
                            Status.TotalRecords = alterIds.Count;
                            Status.ProcessedRecords = 0;

                            AddLog($"📚 Historical voucher sync: {alterIds.Count} vouchers in {totalBatches} batches of {TALLY_BATCH_SIZE}");

                            for (int batchNo = 0; batchNo < totalBatches; batchNo++)
                            {
                                var ids = alterIds.OrderBy(id => id).Skip(batchNo * TALLY_BATCH_SIZE).Take(TALLY_BATCH_SIZE).ToList();
                                string rangeDisplay = $"batch {batchNo + 1}/{totalBatches}";

                                try 
                                {
                                    var allVouchers = await _tallyConnector!.GetVouchersByAlterRangeAsync(company.Name, ids.First(), ids.Last(), hsnCache);
                                    if (allVouchers.Count == 0) throw new IOException("Tally did not return the requested batch; checkpoint retained.");

                                        if (ids.Except(allVouchers.Select(v => long.TryParse(v.AlterId, out var n) ? n : 0)).Any())
                                            throw new IOException("Tally returned an incomplete voucher batch; checkpoint retained.");
                                        var saved = await PersistVoucherBatchesAsync(company, allVouchers, highValueAlerts, runToken);
                                        totalVouchersFound += saved.Vouchers;
                                        vouchersSynced += saved.Vouchers;
                                        salesSynced += saved.Sales;
                                        purchasesSynced += saved.Purchases;
                                        totalSalesAmountFetched += saved.SalesAmount;
                                    // Track Progress
                                    Status.ProcessedRecords = totalVouchersFound;
                                    UpdateStatus(SyncState.Syncing, $"Synced {totalVouchersFound} vouchers...");
                                } 
                                catch (Exception ex) 
                                {
                                    AddLog($"❌ {rangeDisplay}: {ex.Message}");
                                    throw;
                                }

                                // Tally stops answering when it is overloaded (big company, huge export).
                                // Marching through the remaining batches then keeps it hung, so bail out.
                                if (_tallyConnector!.ConsecutiveFailures >= 3)
                                {
                                    AddLog("❌ Tally is not responding - historical sync aborted. Will retry on next cycle.");
                                    break;
                                }

                                // Short pause so Tally can release memory between batches
                                await Task.Delay(500);
                            }

                            AddLog($"📊 First sync complete: {totalVouchersFound} vouchers");
                        }
                        }
                    else
                    {
                        // ======= INCREMENTAL SYNC: ALTERID-BASED =======
                            // This catches ANY modification - even 6-month old entries!
                            AddLog($"🔄 Incremental sync (ALTERID > {lastVoucherAlterId})");
                            UpdateStatus(SyncState.Syncing, "Checking for modifications...");
                            
                            // Calculate total to sync first (for progress bar)
                            int totalToSync = 0;
                            List<Ledger> finalLedgers = new List<Ledger>();

                            // 1. Check Ledgers - Always attempt fetch (use 0 for first incremental pass)
                            finalLedgers = await _tallyConnector!.GetModifiedLedgersAsync(company.Name, lastLedgerAlterId);
                            totalToSync += finalLedgers.Count;
                            
                            // Each indexed payload batch must have complete ALTERID coverage.
                            using var indexExtractor = new TallyFastExtractor($"http://{_settings.TallySettings.Host}:{_settings.TallySettings.Port}", TALLY_BATCH_SIZE, 40);
                            var changedIds = await indexExtractor.GetModifiedVoucherAlterIdsAsync(company.Name, lastVoucherAlterId,
                                runToken);
                            Status.TotalRecords = finalLedgers.Count + changedIds.Count;
                            Status.ProcessedRecords = 0;

                            // 1. Sync modified LEDGERS
                            if (finalLedgers.Count > 0)
                            {
                                await UploadListAsync("ledgers", finalLedgers, "id");
                                ledgersSynced += finalLedgers.Count;
                                Status.ProcessedRecords += finalLedgers.Count;
                                AddLog($"📝 Updated {finalLedgers.Count} modified ledgers");
                                foreach (var l in finalLedgers.Take(3))
                                {
                                    AddLog($"   → {l.Name} (ALTERID: {l.AlterId})");
                                }
                            }
                            else if (lastLedgerAlterId == 0)
                            {
                                // First time for ledgers - full sync (no ALTERID data yet)
                                AddLog($"📝 No ALTERID data for ledgers yet - performing full ledger sync");
                                await SyncDataTypeAsync("ledgers", async () => await _tallyConnector!.GetLedgersAsync(company.Name));
                            }
                            
                            if (changedIds.Count > 0)
                            {
                                var saved = await SyncHistoricalVouchersFastAsync(company, hsnCache, highValueAlerts,
                                    runToken, changedIds, pdfForEachVoucher: true);
                                vouchersSynced += saved.VouchersSynced;
                                salesSynced += saved.SalesSynced;
                                purchasesSynced += saved.PurchasesSynced;
                                totalSalesAmountFetched += saved.TotalSalesAmount;
                            }
                            else AddLog("✅ No voucher modifications detected.");

                            // 3. OPTIMIZATION: Removed redundant "Last 7 Days" re-fetch.
                            // The AlterID logic above already captures ALL new and modified vouchers efficiently.
                            // Re-fetching recent days caused Tally hangs due to heavy XML generation.
                            /*
                            var recentDate = DateTime.Today.AddDays(-7);
                            UpdateStatus(SyncState.FetchingData, "Checking recent entries...");
                            
                            var recentVouchers = await _tallyConnector.GetVouchersAsync(recentDate, DateTime.Today, company.Name);
                            if (recentVouchers != null && recentVouchers.Count > 0)
                            {
                                // ...
                            }
                            */
                            
                            AddLog($"📊 Incremental sync complete: {Status.TotalRecords} total records processed");
                        }

                        // ===========================================
                        // LK PARITY: party-wise Outstanding snapshot (receivable/payable)
                        // ===========================================
                        if (serverOk)
                        {
                            try
                            {
                                var outstanding = await _tallyConnector!.GetOutstandingSummariesAsync(company.Name);
                                if (outstanding.Count > 0)
                                {
                                    var osResult = await _apiClient!.ReplaceOutstandingsAsync(company.Id, outstanding);
                                    AddLog(osResult.Success
                                        ? $"💰 Outstanding: {outstanding.Count} party bill(s) uploaded (snapshot)"
                                        : $"⚠️ Outstanding upload failed: {osResult.Error}");
                                }
                            }
                            catch (Exception osEx)
                            {
                                SyncLogger.Log($"⚠️ Outstanding sync error: {osEx.Message}");
                            }
                        }

                        // ===========================================
                        // SERVER PUSH: tally_push_queue consumer (web -> TallyLink).
                        // Poll-based for now; realtime ws subscriber is a transport
                        // swap on the same table/flow.
                        // ===========================================
                        if (serverOk)
                        {
                            try
                            {
                                var pushes = await _apiClient!.FetchPendingPushesAsync(company.Id);
                                foreach (var push in pushes)
                                {
                                    AddLog($"⚡ Server push: {push.Action} ({company.Name})");
                                    string status = "done";
                                    string? pushError = null;
                                    try
                                    {
                                        if (push.Action == "sync")
                                        {
                                            // current pass already syncs this company - ack.
                                        }
                                        else if (push.Action == "import_voucher")
                                        {
                                            var voucherPusher = new TallyVoucherPusher(_tallyConnector!, _apiClient!);
                                            var (synced, failed) = await voucherPusher.ProcessPendingTransactionsAsync(company.Id, company.Name);
                                            AddLog($"⚡ Import into Tally: {synced} pushed, {failed} failed");
                                        }
                                        else
                                        {
                                            status = "failed";
                                            pushError = $"unknown action: {push.Action}";
                                        }
                                    }
                                    catch (Exception pEx)
                                    {
                                        status = "failed";
                                        pushError = pEx.Message;
                                    }
                                    await _apiClient.AckPushAsync(push.Id, status, pushError);
                                }
                            }
                            catch (Exception pqEx)
                            {
                                SyncLogger.Log($"⚠️ Push queue processing failed: {pqEx.Message}");
                            }
                        }

                        // ===========================================
                        // P1/P3 RECONCILIATION (light: index-only fetch)
                        // First sync uploads everything fresh - nothing to purge/repair.
                        // ===========================================
                        if (!isFirstSync && serverOk && _settings.SyncSettings.UseSafeVoucherReconciliation)
                        {
                            var (repairVouchers, repairSales, repairSalesAmount, repairPurchases) = await ReconcileVoucherIdentitiesAsync(company, hsnCache, highValueAlerts, runToken);
                            vouchersSynced += repairVouchers;
                            purchasesSynced += repairPurchases;
                            salesSynced += repairSales;
                            totalSalesAmountFetched += repairSalesAmount;
                        }
                        else if (!isFirstSync && serverOk)
                        {
                            var voucherIndex = await _tallyConnector!.GetVoucherIndexFullAsync(company.Name);
                            if (voucherIndex.Count > 0)
                            {
                                var cloudVoucherCount = await _apiClient!.GetVoucherCountAsync(company.Id);
                                bool coverageOk = VerifyIndexCoverage(company, voucherIndex, cloudVoucherCount);

                                // P1: delete cloud vouchers that no longer exist in Tally.
                                // Full index goes up (guid + type/number + alterId) - LK parity.
                                if (coverageOk)
                                {
                                    var purged = await _apiClient!.PurgeDeletedVouchersAsync(company.Id, voucherIndex);
                                    if (purged > 0)
                                        AddLog($"🗑 P1: removed {purged} voucher(s) deleted in Tally (entries/sales/purchases cleaned too)");
                                    else if (purged < 0)
                                        AddLog("⚠️ P1 skipped: Tally index looked truncated (safety guard)");
                                }
                                else
                                {
                                    AddLog("⚠️ P1 skipped: index coverage not verified (no deletion).");
                                }

                                // P3: re-fetch vouchers present in Tally but missing in cloud
                                var missingPairs = await _apiClient!.FindMissingVouchersAsync(company.Id, voucherIndex);
                                if (missingPairs.Count > 0 && _settings?.SyncSettings?.UseFastExtractor != true)
                                {
                                    AddLog($"🧩 P3: repairing {missingPairs.Count} missing voucher(s)...");
                                    await RepairMissingVouchersAsync(company, missingPairs, hsnCache);
                                }

                                // The pair match above cannot see a voucher whose number repeats in
                                // another year, so also compare row counts: a gap means whole years
                                // never reached the cloud. Backfill by ALTERID (covers every year).
                                // Only on an explicit Full Resync / manual sync - never automatically.
                                SyncLogger.Log($"[P3] Tally index {voucherIndex.Count}, cloud {cloudVoucherCount}");
                                if (coverageOk && (forceResync || isManual) && cloudVoucherCount >= 0 && voucherIndex.Count > cloudVoucherCount + 5)
                                {
                                    SyncLogger.Log($"🧩 P3: Tally has {voucherIndex.Count} vouchers, cloud has {cloudVoucherCount} - backfilling by ALTERID...");
                                    var (bv, bs, ba, bp) = await SyncHistoricalVouchersFastAsync(company, hsnCache, highValueAlerts, runToken);
                                    vouchersSynced += bv;
                                    purchasesSynced += bp;
                                    salesSynced += bs;
                                    totalSalesAmountFetched += ba;
                                }
                                else if (!coverageOk && voucherIndex.Count > cloudVoucherCount + 5)
                                {
                                    AddLog("⚠️ P3 backfill withheld: full-history index not verified. Run Full Resync to repair.");
                                }
                            }
                            else
                            {
                                AddLog("⚠️ Voucher index empty - purge/repair skipped (safety)");
                            }
                        }
                                    
                        /* Orphaned code removed */

                        // LK parity: company synced OK - clear its notification ledger rows.
                        await _offlineQueue!.ClearNotificationAsync("not_synced", company.Name);

                        // =====  SYNC SUMMARY =====
                        AddLog($"");
                        AddLog($"═══════════════════════════════════════════════════");
                        AddLog($"📊 SYNC SUMMARY - {company.Name}");
                        AddLog($"═══════════════════════════════════════════════════");
                        AddLog($"   📦 Stock Items:  {stockSynced}");
                        AddLog($"   📒 Ledgers:      {ledgersSynced}");
                        AddLog($"   📄 Vouchers:     {vouchersSynced}");
                        AddLog($"   💰 Sales:        {salesSynced}");
                        AddLog($"   🛒 Purchases:    {purchasesSynced}");
                        AddLog($"   📋 Master Data:  {masterDataSynced}");
                        AddLog($"───────────────────────────────────────────────────");
                        AddLog($"   ✅ Total:        {stockSynced + ledgersSynced + vouchersSynced + salesSynced + purchasesSynced + masterDataSynced}");
                        AddLog($"═══════════════════════════════════════════════════");
                        AddLog($"");

                        // ===== UPDATE SYNC HISTORY =====
                        if (!string.IsNullOrEmpty(syncHistoryId))
                        {
                            string finalStatus = _historicalCoverageError == null ? "completed" : "partial";
                            await _apiClient!.UpdateSyncHistoryAsync(
                                syncHistoryId,
                                finalStatus,
                                _cloudHistoryProgress?.Ledgers ?? ledgersSynced,
                                _cloudHistoryProgress?.Vouchers ?? vouchersSynced,
                                _cloudHistoryProgress?.Sales ?? salesSynced,
                                _cloudHistoryProgress?.Purchases ?? purchasesSynced,
                                _cloudHistoryProgress?.Stock ?? stockSynced,
                                Math.Max(Status.TotalRecords, _cloudHistoryProgress?.Total ?? 0),
                                syncedVoucherIds,
                                _historicalCoverageError
                            );
                            AddLog($"📜 Sync history saved: {syncType} sync {finalStatus}" +
                                   (_historicalCoverageError != null ? $" - {_historicalCoverageError}" : ""));
                        }
                        // Web dashboard reads companies.last_sync_at for "last synced N ago".
                        await _apiClient!.MarkCompanySyncedAsync(company.Id);

                        // ===== PUSH SYNC (Cloud -> Tally) =====
                        await ProcessPendingTransactionsAsync(company);

                        // ===== TELEGRAM NOTIFICATION =====
                        try
                        {
                            var currentUserId = App.AuthService?.CurrentSession?.UserId;
                            if (!string.IsNullOrEmpty(currentUserId))
                            {
                                var tgChatId = await _apiClient!.GetTelegramChatIdAsync(currentUserId);
                                if (!string.IsNullOrEmpty(tgChatId))
                                {
                                    int totalSynced = vouchersSynced + ledgersSynced + stockSynced;
                                    string telegramMsg;
                                    
                                    if (totalSynced > 0 || masterDataSynced > 0)
                                    {
                                        var sb = new StringBuilder();
                                        sb.AppendLine($"✅ <b>Sync Completed: {company.Name}</b>");
                                        sb.AppendLine();
                                        
                                        sb.AppendLine("📊 <b>Performance Stats:</b>");
                                        if (vouchersSynced > 0) sb.AppendLine($"• Vouchers: <code>{vouchersSynced}</code>");
                                        if (ledgersSynced > 0) sb.AppendLine($"• Ledgers: <code>{ledgersSynced}</code>");
                                        if (stockSynced > 0) sb.AppendLine($"• Items: <code>{stockSynced}</code>");
                                        if (masterDataSynced > 0) sb.AppendLine($"• Master Data: <code>{masterDataSynced}</code>");
                                        sb.AppendLine();

                                        if (totalSalesAmountFetched > 0)
                                        {
                                            sb.AppendLine("💰 <b>Sales Summary:</b>");
                                            sb.AppendLine($"• Total Amount: <b>₹{totalSalesAmountFetched:N2}</b>");
                                            sb.AppendLine();
                                        }

                                        if (highValueAlerts.Count > 0)
                                        {
                                            sb.AppendLine("⚠️ <b>Smart Alerts:</b>");
                                            foreach (var alert in highValueAlerts.Take(5)) // Limit to 5 alerts
                                            {
                                                sb.AppendLine($"• {alert}");
                                            }
                                            if (highValueAlerts.Count > 5) sb.AppendLine($"<i>...and {highValueAlerts.Count - 5} more</i>");
                                            sb.AppendLine();
                                        }

                                        sb.AppendLine($"<i>Time: {DateTime.Now:HH:mm:ss}</i>");
                                        telegramMsg = sb.ToString();
                                    }
                                    else
                                    {
                                        telegramMsg = $"✅ <b>Sync Status: {company.Name}</b>\n\n" +
                                                     $"📊 No changes detected. All data is up to date.\n\n" +
                                                     $"<i>Time: {DateTime.Now:HH:mm:ss}</i>";
                                    }
                                    
                                    var telegramSent = await _apiClient.SendTelegramNotificationAsync(tgChatId, telegramMsg);
                                    
                                    // SEND DAILY CLOSING REPORT (If after 8 PM)
                                    if (DateTime.Now.Hour >= 20 && totalSynced > 0)
                                    {
                                        var reportSb = new StringBuilder();
                                        reportSb.AppendLine("📊 <b>Daily Closing Report</b>");
                                        reportSb.AppendLine($"<i>{DateTime.Now:dd MMM yyyy}</i>\n");
                                        reportSb.AppendLine($"💰 Total Sales: <b>₹{totalSalesAmountFetched:N0}</b>");
                                        reportSb.AppendLine($"📥 New Vouchers: <b>{vouchersSynced}</b>");
                                        
                                        if (highValueAlerts.Count > 0)
                                        {
                                            reportSb.AppendLine("\n🌟 <b>Top Deals:</b>");
                                            foreach(var alert in highValueAlerts.Take(3)) reportSb.AppendLine($"• {alert}");
                                        }

                                        reportSb.AppendLine("\n📈 <i>Data synced successfully to Cloud.</i>");
                                        await _apiClient.SendTelegramNotificationAsync(tgChatId, reportSb.ToString());
                                    }

                                    AddLog(telegramSent ? "📨 Telegram notification sent to user." : "⚠️ Telegram notification could not be sent.");
                                }
                            }
                        }
                        catch (Exception tgEx)
                        {
                            SyncLogger.Log($"⚠️ Telegram notification failed: {tgEx.Message}");
                        }

                        // ===== NEW VOUCHER PDFs → TELEGRAM =====
                        if (!isFirstSync)
                        {
                            try
                            {
                                await SendNewVoucherPdfsAsync(company);
                            }
                            catch (Exception pdfEx)
                            {
                                SyncLogger.Log($"📄 Voucher PDF batch failed: {pdfEx.Message}");
                            }
                        }
                    }
                    catch (Exception) when (runToken.IsCancellationRequested)
                    {
                        await PublishCloudSyncProgressAsync("partial", "Stopped by user; checkpoint retained.");
                        throw new OperationCanceledException(runToken);
                    }
                    catch (Exception ex)
                    {
                        failedCompanies.Add(company.Name);
                        lastCompanyError = ex.GetBaseException().Message;
                        Console.WriteLine($"❌ Error processing company {company.Name}: {ex.Message}");
                        UpdateStatus(SyncState.Error, $"Failed: {company.Name}", ex.Message);

                        // TELEGRAM: Error Notification
                        try 
                        {
                            var uid = App.AuthService?.CurrentSession?.UserId;
                            if (!string.IsNullOrEmpty(uid)) 
                            {
                                var chatId = await _apiClient!.GetTelegramChatIdAsync(uid);
                                if (!string.IsNullOrEmpty(chatId)) 
                                {
                                    await _apiClient.SendTelegramNotificationAsync(chatId, $"❌ <b>Sync Failed: {company.Name}</b>\n\nError: {ex.Message}\n\n<i>Time: {DateTime.Now:HH:mm:ss}</i>");
                                }
                            }
                        } 
                        catch (Exception tgEx) { SyncLogger.Log($"⚠️ Telegram Error notification failed: {tgEx.Message}"); }
                        
                        // Update sync history with error
                        if (!string.IsNullOrEmpty(syncHistoryId))
                        {
                            await PublishCloudSyncProgressAsync("failed", ex.Message);
                        }
                    }
                }

                runToken.ThrowIfCancellationRequested();

                // Update final status to avoid "1 records" confusion
                Status.NextSyncTime = DateTime.Now.AddMinutes(_settings.SyncSettings.SyncIntervalMinutes);

                if (failedCompanies.Count > 0)
                {
                    var failedNames = string.Join(", ", failedCompanies.Distinct());
                    AddLog($"❌ Sync failed for: {failedNames}");
                    UpdateStatus(SyncState.Error, $"Sync failed: {failedNames}", lastCompanyError);
                    return;
                }
                Status.LastSyncTime = DateTime.Now;
                
                string msg = Status.TotalRecords == 0 
                    ? "Sync completed. No changes found." 
                    : $"Sync completed! Processed {Status.TotalRecords} records.";
                
                UpdateStatus(SyncState.Completed, msg);

                // Session completed - clear the session-level notification ledger row.
                await _offlineQueue!.ClearNotificationAsync("sync_issue", "__session__");

                // Cleanup old queue items
                await _offlineQueue!.CleanupAsync();
            }
            catch (Exception) when (runToken.IsCancellationRequested)
            {
                AddLog("⏹ Sync stopped. Pending batches and checkpoint retained.");
                UpdateStatus(SyncState.Idle, "Sync stopped; pending batches will resume next time.");
            }
            catch (Exception ex)
            {
                AddLog($"🔥 CRITICAL SYNC FAILURE: {ex.Message}");
                Console.WriteLine($"Sync failed: {ex.Message}");

                // LK parity: remember the crash so the next sync start re-announces it.
                await _offlineQueue!.UpsertNotificationAsync("sync_issue", "__session__", ex.Message);
                UpdateStatus(SyncState.Error, "Sync crashed", ex.Message);
            }
            finally
            {
                overallStopwatch.Stop();
                AddLog($"🏁 Sync session ended. Duration: {overallStopwatch.Elapsed:mm\\:ss}");
                lock (_syncLock)
                {
                    _isSyncing = false;
                }
            }
        }

        /// <summary>
        /// Sync a specific data type by fetching and then uploading
        /// </summary>
        private async Task SyncDataTypeAsync<T>(string dataType, Func<Task<List<T>>> fetchFunc)
        {
            UpdateStatus(SyncState.FetchingData, $"Fetching {dataType}...", dataType);
            var data = await fetchFunc();
            await UploadListAsync(dataType, data);
        }

        /// <summary>
        /// Upload a pre-fetched list of data to the API with conflict resolution
        /// </summary>
        private async Task UploadListAsync<T>(string dataType, List<T> data, string onConflict = "id")
        {
            var stopwatch = Stopwatch.StartNew();
            
            try
            {
                if (data == null || data.Count == 0)
                {
                    await _offlineQueue!.LogSyncAsync(dataType, 0, true, null, (int)stopwatch.ElapsedMilliseconds);
                    return;
                }

                UpdateStatus(SyncState.Uploading, $"Syncing {dataType}: 0/{data.Count}", dataType);

                // Upload in batches
                var batchSize = Math.Max(_settings.SyncSettings.BatchSize, 100); // Force at least 100
            var batches = ChunkList(data, batchSize);
                var successCount = 0;
                var failedCount = 0;

                foreach (var batch in batches)
                {
                    (_cancellationTokenSource?.Token ?? default).ThrowIfCancellationRequested();

                    var result = await _apiClient!.SyncDataAsync(CurrentCompany!.Id, dataType, batch, onConflict);

                    if (result.Success)
                    {
                        successCount += batch.Count;
                        _cloudHistoryProgress?.AddStandalone(dataType, batch.Count);
                    }
                    else
                    {
                        failedCount += batch.Count;
                        await _offlineQueue!.EnqueueAsync(CurrentCompany!.Id, dataType, batch);
                        UpdateStatus(SyncState.Uploading, $"Error: {result.Error}", dataType);
                        SyncLogger.Log($"❌ BATCH FAILED {dataType}: {result.Error}");
                    }

                    UpdateStatus(SyncState.Uploading, $"Syncing {dataType}: {successCount + failedCount}/{data.Count}", dataType);

                    // Sync Status page isi event se bharta hai (pehle kabhi raise hi nahi hota tha -> page hamesha khaali).
                    ItemSynced?.Invoke(this, new SyncItemStatus
                    {
                        Name = $"{dataType} ({batch.Count})",
                        Type = dataType,
                        Status = result.Success ? "Success" : "Error",
                        Error = result.Success ? null : result.Error
                    });
                }

                stopwatch.Stop();
                if (failedCount > 0) _historicalCoverageError = $"{dataType}: {failedCount} records remain queued for retry.";
                await PublishCloudSyncProgressAsync();
                await _offlineQueue!.LogSyncAsync(dataType, data.Count, failedCount == 0, failedCount > 0 ? $"{failedCount} failed" : null, (int)stopwatch.ElapsedMilliseconds);
            }
            catch (OperationCanceledException) when (_cancellationTokenSource?.IsCancellationRequested == true)
            {
                throw;
            }
            catch (Exception ex)
            {
                stopwatch.Stop();
                await _offlineQueue!.LogSyncAsync(dataType, 0, false, ex.Message, (int)stopwatch.ElapsedMilliseconds);
            }
        }

        /// <summary>
        /// Process pending queue items
        /// </summary>
        private async Task ProcessQueueAsync()
        {
            // Licence gate: never process the pending queue without a valid licence.
            // Uses the cached result from RunSyncAsync() so no duplicate RPC is made.
            if (!IsSyncPermittedByLicense())
            {
                SyncLogger.Log("⛔ Queue processing blocked: no valid licence");
                return;
            }

            var pendingItems = await _offlineQueue!.GetPendingItemsAsync(companyId: CurrentCompany!.Id);

            if (pendingItems.Count == 0) return;

            UpdateStatus(SyncState.Retrying, $"Retrying {pendingItems.Count} queued batches...");

            foreach (var item in pendingItems)
            {
                // SAFETY: Skip sales/purchases from queue as they might be poisoned with nested items
                if (item.DataType == "sales" || item.DataType == "purchases")
                {
                    SyncLogger.Log($"⚠️ Skipping queued {item.DataType} retry (preventing nested data issue)");
                    await _offlineQueue.MarkCompletedAsync(item.Id);
                    continue;
                }

                try
                {
                    bool success = false;
                    
                    // FIX: Strong Typing to prevent Type Erasure for Vouchers
                    if (item.DataType == "vouchers")
                    {
                        var data = JsonConvert.DeserializeObject<List<Voucher>>(item.JsonData);
                        if (data != null && data.Count > 0)
                        {
                            await PersistVoucherBatchesAsync(CurrentCompany!, data, new List<string>(), _cancellationTokenSource?.Token ?? default);
                            success = true;
                        }
                    }
                    else if (item.DataType.Contains("ledger"))
                    {
                        var data = JsonConvert.DeserializeObject<List<Ledger>>(item.JsonData);
                        if (data != null && data.Count > 0)
                        {
                            success = await ProcessTypedBatch(item, data, "id");
                        }
                    }
                    else if (item.DataType.Contains("stock"))
                    {
                         // Stock items
                        var data = JsonConvert.DeserializeObject<List<object>>(item.JsonData);
                         if (data != null && data.Count > 0)
                        {
                            success = await ProcessTypedBatch(item, data, "id");
                        }
                    }
                    else
                    {
                        // Fallback for others
                        var data = JsonConvert.DeserializeObject<List<object>>(item.JsonData);
                        if (data != null && data.Count > 0)
                        {
                             success = await ProcessTypedBatch(item, data, "id");
                        }
                    }

                    if (success)
                    {
                        await _offlineQueue.MarkCompletedAsync(item.Id);
                    }
                }
                catch (Exception ex)
                {
                    await _offlineQueue.MarkFailedAsync(item.Id, ex.Message);
                    SyncLogger.Log($"❌ QUEUE ITEM FAILED: {ex.Message}");
                    if (item.DataType == "vouchers") throw;
                }
            }
        }

        // Helper to process batches with correct type
        private async Task<bool> ProcessTypedBatch<T>(SyncQueueItem item, List<T> data, string pk)
        {
            var batchSize = Math.Max(_settings.SyncSettings.BatchSize, 100);
            var batches = ChunkList(data, batchSize);
            
            foreach (var batch in batches)
            {
                SyncLogger.Log($"QUEUE RETRY → {item.DataType} | PK={pk} | Batch={batch.Count}");
                var result = await _apiClient!.SyncDataAsync(item.CompanyId, item.DataType, batch, pk);
                
                if (!result.Success)
                {
                    SyncLogger.Log($"❌ RETRY FAILED: {result.Error}");
                    return false;
                }
            }
            return true;
        }

        /// <summary>
        /// Get queue statistics
        /// </summary>
        public async Task<(int Pending, int Failed, int Completed)> GetQueueStatsAsync()
        {
            return await _offlineQueue!.GetQueueStatsAsync();
        }

        /// <summary>
        /// Get recent sync logs
        /// </summary>
        public async Task<List<SyncLogEntry>> GetSyncLogsAsync(int limit = 50)
        {
            return await _offlineQueue!.GetRecentLogsAsync(limit);
        }

        /// <summary>
        /// Get current settings
        /// </summary>
        public AppSettings GetSettings() => _settings;

        /// <summary>
        /// Update status and notify listeners
        /// </summary>
        private void UpdateStatus(SyncState state, string message, string? entityName = null)
        {
            Status.State = state;
            Status.Message = message;
            Status.CurrentOperation = entityName;
            Status.Error = state == SyncState.Error ? entityName : null;

            StatusChanged?.Invoke(this, Status);
        }

        private void AddLog(string message)
        {
            SyncLogRequested?.Invoke(this, message);
        }

        /// <summary>
        /// Split list into batches
        /// </summary>
        private static List<List<T>> ChunkList<T>(List<T> list, int chunkSize)
        {
            var chunks = new List<List<T>>();
            for (int i = 0; i < list.Count; i += chunkSize)
            {
                chunks.Add(list.GetRange(i, Math.Min(chunkSize, list.Count - i)));
            }
            return chunks;
        }

        /// <summary>
        /// Helper to get display name from any Tally model
        /// </summary>
        private string GetItemDisplayName(object item)
        {
            if (item == null) return "Unknown";
            
            // Try to find Name, VoucherNumber, or InvoiceNumber property
            var type = item.GetType();
            var nameProp = type.GetProperty("Name") ?? 
                           type.GetProperty("VoucherNumber") ?? 
                           type.GetProperty("InvoiceNumber");
            
            if (nameProp != null)
            {
                return nameProp.GetValue(item)?.ToString() ?? "Unnamed";
            }

            return item.ToString() ?? "Unnamed";
        }

        // ============================================
        // TWO-WAY SYNC: Push Cloud entries TO Tally
        // ============================================

        /// <summary>
        /// Process pending transactions from Cloud and push them to Tally
        /// Called when Tally is open and sync runs
        /// </summary>
        private async Task ProcessPendingTransactionsAsync(Company company)
        {
            // Two-way push delegates to TallyVoucherPusher: rich voucher XML (items,
            // GST split, resolved real Sales ledger) instead of the old stub push.
            if (_tallyConnector == null || _apiClient == null) return;
            _voucherPusher ??= new TallyVoucherPusher(_tallyConnector, _apiClient);
            await _voucherPusher.ProcessPendingTransactionsAsync(company.Id, company.Name);
        }

        /// <summary>
        /// Normalize voucher type from database format to valid Tally voucher type.
        /// Database may store table names like "VOUCHERS" or generic types.
        /// Tally requires exact type names: Sales, Purchase, Receipt, Payment, Journal, etc.
        /// </summary>
        private string NormalizeTallyVoucherType(string rawType, dynamic voucherData)
        {
            if (string.IsNullOrEmpty(rawType)) return "Receipt";

            // 1. First try to get the actual voucher type from the voucher data itself
            string? typeFromData = null;
            try
            {
                typeFromData = voucherData?.voucher_type_name?.ToString() ??
                               voucherData?.voucherTypeName?.ToString() ??
                               voucherData?.voucher_type?.ToString() ??
                               voucherData?.voucherType?.ToString() ??
                               voucherData?.type?.ToString();
            }
            catch { /* dynamic access may fail, ignore */ }

            // If we found a type in voucher data and it's a valid Tally type, use it
            if (!string.IsNullOrEmpty(typeFromData))
            {
                var normalizedFromData = MapToTallyType(typeFromData);
                if (normalizedFromData != null)
                {
                    SyncLogger.Log($"   📎 Resolved voucher type from data: '{rawType}' → '{normalizedFromData}'");
                    return normalizedFromData;
                }
            }

            // 2. Try to map the raw type directly
            var mapped = MapToTallyType(rawType);
            if (mapped != null) return mapped;

            // 3. If type is generic (VOUCHERS, TRANSACTION, etc.), try to infer from data shape
            var upperType = rawType.Trim().ToUpper();
            if (upperType == "VOUCHERS" || upperType == "TRANSACTION" || upperType == "ENTRY")
            {
                // Try to infer from amount sign or available fields
                try
                {
                    bool hasItems = voucherData?.items != null;
                    string? cashBankLedger = voucherData?.cash_bank_ledger?.ToString();

                    if (hasItems)
                    {
                        // Has inventory items → likely Sales or Purchase
                        return "Sales";
                    }
                    else if (!string.IsNullOrEmpty(cashBankLedger))
                    {
                        // Has cash/bank ledger → likely Receipt or Payment
                        return "Receipt";
                    }
                }
                catch { /* dynamic access may fail */ }

                // Default fallback for generic types
                SyncLogger.Log($"   ⚠️ Could not determine voucher type from '{rawType}', defaulting to 'Receipt'");
                return "Receipt";
            }

            // 4. Last resort: return as-is (may fail in Tally if not valid)
            SyncLogger.Log($"   ⚠️ Unknown voucher type: '{rawType}', passing as-is to Tally");
            return rawType;
        }

        /// <summary>
        /// Map common variations to exact Tally voucher type names.
        /// Returns null if no mapping found.
        /// </summary>
        private static string? MapToTallyType(string type)
        {
            if (string.IsNullOrEmpty(type)) return null;

            return type.Trim().ToUpper() switch
            {
                // Exact matches
                "SALES" => "Sales",
                "SALE" => "Sales",
                "SALES INVOICE" => "Sales",
                "PURCHASE" => "Purchase",
                "PURCHASES" => "Purchase",
                "PURCHASE INVOICE" => "Purchase",
                "RECEIPT" => "Receipt",
                "RECEIPTS" => "Receipt",
                "PAYMENT" => "Payment",
                "PAYMENTS" => "Payment",
                "JOURNAL" => "Journal",
                "JOURNALS" => "Journal",
                "CONTRA" => "Contra",
                "CREDIT NOTE" => "Credit Note",
                "CREDIT_NOTE" => "Credit Note",
                "CREDITNOTE" => "Credit Note",
                "DEBIT NOTE" => "Debit Note",
                "DEBIT_NOTE" => "Debit Note",
                "DEBITNOTE" => "Debit Note",
                "SALES ORDER" => "Sales Order",
                "PURCHASE ORDER" => "Purchase Order",
                "DELIVERY NOTE" => "Delivery Note",
                "RECEIPT NOTE" => "Receipt Note",
                _ => null // Unknown
            };
        }

        /// <summary>
        /// Every full index retrieval is logged with its real coverage. A partial index
        /// (missing dates, or fewer vouchers than the cloud) must not be treated as
        /// complete history and must never drive deletions.
        /// </summary>
        private bool VerifyIndexCoverage(Company company, List<VoucherIndexEntry> index, int cloudCount)
        {
            var dated = index.Where(e => e.Date.HasValue).ToList();
            string minDate = dated.Count > 0 ? dated.Min(e => e.Date)!.Value.ToString("yyyy-MM-dd") : "unknown";
            string maxDate = dated.Count > 0 ? dated.Max(e => e.Date)!.Value.ToString("yyyy-MM-dd") : "unknown";
            bool ok = index.Count > 0
                && (dated.Count == 0 || dated.Count >= index.Count * 9 / 10)
                // Cloud rows include soft-deleted ones, and Tally deletions are legitimate;
                // only a material shortfall (missing years) means coverage is unproven.
                && (cloudCount < 0 || index.Count >= cloudCount - Math.Max(5, cloudCount / 10));
            string line = $"[Completeness] {company.Name} ({company.Id}) requested=1900-01-01..{DateTime.Today:yyyy-MM-dd} " +
                          $"index={index.Count} dates={minDate}..{maxDate} cloud={cloudCount} verified={ok}";
            SyncLogger.Log(line);
            AddLog(line);
            if (!ok)
            {
                _historicalCoverageError = $"Historical index incomplete: Tally {index.Count} ({minDate}..{maxDate}) vs cloud {cloudCount}.";
                AddLog("⚠️ Historical coverage not verified - sync will be marked partial and deletion is not allowed.");
            }
            return ok;
        }

        private async Task<(int, int, decimal, int)> ReconcileVoucherIdentitiesAsync(Company company, Dictionary<string, string> hsnCache, List<string> highValueAlerts, CancellationToken ct)
        {
            try
            {
                var tally = await _tallyConnector!.GetVoucherIndexFullAsync(company.Name);
                if (ct.IsCancellationRequested || tally.Count == 0) { AddLog("⚠️ Reconciliation skipped: Tally index unavailable."); return (0, 0, 0, 0); }
                var cloud = await _apiClient!.GetVoucherIdentitySnapshotAsync(company.Id);
                if (ct.IsCancellationRequested || cloud == null) { AddLog("⚠️ Reconciliation skipped: cloud identity snapshot incomplete."); return (0, 0, 0, 0); }
                bool coverageOk = VerifyIndexCoverage(company, tally, cloud.Count);
                var diff = VoucherReconciliation.Compare(tally, cloud);
                SyncLogger.Log($"[Reconcile] Tally={tally.Count}, cloud={cloud.Count}, repair={diff.MissingAlterIds.Count}, possible_deleted={diff.PossibleDeletedIds.Count}, ambiguous={diff.AmbiguousRows}.");
                AddLog($"🔎 Reconcile: {diff.MissingAlterIds.Count} missing/changed, {diff.PossibleDeletedIds.Count} possible deleted, {diff.AmbiguousRows} ambiguous.");
                foreach (var suspect in cloud.Where(v => diff.PossibleDeletedIds.Contains(v.Id)).Take(20))
                {
                    var description = $"{suspect.PartyName ?? "Unknown party"} | {suspect.VoucherType ?? "Voucher"} #{suspect.VoucherNumber ?? "?"} | id {suspect.Id}".Replace("\r", " ").Replace("\n", " ");
                    SyncLogger.Log($"[Reconcile] Possible deleted (not yet confirmed): {description}");
                }
                // A half-loaded company (wrong data folder, restore in progress) answers with a tiny
                // index; deleting on that basis hides real vouchers on the web. Trust deletions only
                // when Tally still sees at least half of what the cloud has.
                if (diff.PossibleDeletedIds.Count > cloud.Count / 2)
                {
                    AddLog($"⚠️ Deletion skipped: Tally index has {tally.Count} vouchers vs {cloud.Count} on web — company data may not be fully loaded.");
                    SyncLogger.Log($"[Reconcile] Deletion skipped: mass delete {diff.PossibleDeletedIds.Count}/{cloud.Count}.");
                }
                else if (diff.PossibleDeletedIds.Count > 0 && coverageOk && _settings.SyncSettings.UseSafeVoucherReconciliation && !ct.IsCancellationRequested)
                {
                    var secondIndex = await _tallyConnector!.GetVoucherIndexFullAsync(company.Name);
                    var tallyAlterIds = await _tallyConnector!.GetVoucherAlterIdsAsync(company.Name);
                    var candidates = VoucherReconciliation.SafeDeleteCandidates(tally, secondIndex, tallyAlterIds, cloud, diff, out var safetyReason, company.Id);
                    if (candidates.Count == 0)
                    {
                        AddLog("⚠️ Deletion skipped: identity or snapshot safety checks did not pass.");
                        SyncLogger.Log($"[Reconcile] Deletion skipped: {safetyReason}.");
                    }
                    foreach (var voucher in candidates)
                    {
                        if (ct.IsCancellationRequested || !_settings.SyncSettings.UseSafeVoucherReconciliation) break;
                        var label = $"{voucher.PartyName ?? "Unknown party"} | {voucher.VoucherType ?? "Voucher"} #{voucher.VoucherNumber ?? "?"} | id {voucher.Id}".Replace("\r", " ").Replace("\n", " ");
                        if (await _apiClient!.SoftDeleteReconciledVoucherAsync(company.Id, voucher))
                        {
                            AddLog($"🗑 Deleted in Tally; hidden on web: {label}");
                            SyncLogger.Log($"[Reconcile] Soft-deleted: {label}");
                        }
                        else
                        {
                            AddLog($"⚠️ Could not verify web deletion: {label}");
                            SyncLogger.Log($"[Reconcile] Delete not confirmed: {label}");
                        }
                    }
                }
                if (diff.MissingAlterIds.Count == 0 || !_settings.SyncSettings.UseSafeVoucherReconciliation) return (0, 0, 0, 0);
                AddLog($"🧩 Repairing {diff.MissingAlterIds.Count} identified voucher(s) by ALTERID.");
                return await SyncHistoricalVouchersFastAsync(company, hsnCache, highValueAlerts, ct,
                    diff.MissingAlterIds, pdfForEachVoucher: true);
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"[Reconcile] Aborted safely: {ex.Message}");
                AddLog("⚠️ Reconciliation stopped; pending batches will be retried first next cycle.");
                throw;
            }
        }

        private string VoucherOwnerId => App.AuthService?.CurrentSession?.UserId
            ?? throw new InvalidOperationException("Sign in before resuming voucher batches.");

        private async Task PublishCloudSyncProgressAsync(string status = "running", string? error = null)
        {
            var progress = _cloudHistoryProgress;
            if (progress == null) return;
            var saved = await _apiClient!.UpdateSyncHistoryAsync(progress.HistoryId, status,
                progress.Ledgers, progress.Vouchers, progress.Sales, progress.Purchases, progress.Stock,
                Math.Max(Status.TotalRecords, progress.Total), errorMessage: error);
            if (!saved) SyncLogger.Log("Cloud history progress update failed; voucher checkpoint is unaffected.");
        }

        private async Task UploadRequiredVoucherDataAsync<T>(string table, List<T> rows, string conflict = "id")
        {
            int sent = 0;
            UpdateStatus(SyncState.Uploading, $"Uploading {table.Replace('_', ' ')}: 0/{rows.Count}", table);
            foreach (var batch in rows.Chunk(TALLY_BATCH_SIZE))
            {
                (_cancellationTokenSource?.Token ?? default).ThrowIfCancellationRequested();
                var result = await _apiClient!.SyncDataAsync(CurrentCompany!.Id, table, batch.ToList(), conflict);
                if (!result.Success) throw new IOException($"{table} upload failed: {result.Error}");
                sent += batch.Length;
                UpdateStatus(SyncState.Uploading, $"Uploading {table.Replace('_', ' ')}: {sent}/{rows.Count}", table);
            }
        }

        private async Task<(int Vouchers, int Sales, decimal SalesAmount, int Purchases)> ReplayVoucherBatchesAsync(
            Company company, List<string> highValueAlerts, CancellationToken ct)
        {
            int voucherCount = 0, salesCount = 0, purchaseCount = 0;
            decimal salesAmount = 0;
            int batchVoucherCount = 0, batchSalesCount = 0, batchPurchaseCount = 0;
            await _voucherJournal!.ReplayAsync(VoucherOwnerId, company.Id, async (json, token) =>
            {
                var vouchers = VoucherBatchPayloadCodec.Deserialize(json);
                batchVoucherCount = vouchers.Count;
                batchSalesCount = 0;
                batchPurchaseCount = 0;
                if (vouchers.Count == 0) throw new InvalidDataException("Saved voucher batch is empty.");
                token.ThrowIfCancellationRequested();
                await UploadRequiredVoucherDataAsync("vouchers", vouchers);
                await _apiClient!.SyncVoucherEntriesAsync(company.Id, vouchers, requireComplete: true,
                    progress: (stage, done, total) => UpdateStatus(SyncState.Uploading, $"Uploading {stage}: {done}/{total}", stage));
                const decimal HighValueThreshold = 50000;
                var salesVouchers = vouchers.Where(v => v.VoucherType.Contains("Sales", StringComparison.OrdinalIgnoreCase)).ToList();
                if (salesVouchers.Count > 0)
                {
                    var sales = _tallyConnector!.MapVouchersToSales(salesVouchers, company.Name);
                    if (sales.Count > 0)
                    {
                        var salesFlat = sales.Select(s => new {
                            id = s.Id, voucher_id = s.VoucherId, company_id = s.CompanyId,
                            invoice_number = s.InvoiceNumber, invoice_date = s.InvoiceDate,
                            party_ledger_id = s.PartyLedgerId, party_ledger_name = s.PartyLedgerName,
                            party_gstin = s.PartyGstin, place_of_supply = s.PlaceOfSupply,
                            gross_amount = s.GrossAmount, discount_amount = s.DiscountAmount,
                            taxable_amount = s.TaxableAmount, cgst_amount = s.CgstAmount,
                            sgst_amount = s.SgstAmount, igst_amount = s.IgstAmount,
                            cess_amount = s.CessAmount, round_off = s.RoundOff,
                            net_amount = s.NetAmount, is_cancelled = s.IsCancelled,
                            narration = s.Narration, master_id = s.MasterId, alter_id = s.AlterId
                        }).ToList();
                        await UploadRequiredVoucherDataAsync("sales", salesFlat, "id");
                        salesCount += sales.Count;
                        batchSalesCount += sales.Count;

                        var salesItems = sales.Where(s => s.Items != null).SelectMany(s => s.Items!).ToList();
                        if (salesItems.Any()) await UploadRequiredVoucherDataAsync("sales_items", salesItems, "id");

                        salesAmount += sales.Sum(s => s.NetAmount);
                        foreach (var s in sales.Where(s => s.NetAmount >= HighValueThreshold))
                        {
                            highValueAlerts.Add($"💰 High Value Sale: <b>{s.PartyLedgerName}</b> - ₹{s.NetAmount:N0}");
                        }
                    }
                }

                var purchaseVouchers = vouchers.Where(v => v.VoucherType.Contains("Purchase", StringComparison.OrdinalIgnoreCase)).ToList();
                if (purchaseVouchers.Count > 0)
                {
                    var purchases = _tallyConnector!.MapVouchersToPurchases(purchaseVouchers, company.Name);
                    if (purchases.Count > 0)
                    {
                        var purchasesFlat = purchases.Select(p => new {
                            id = p.Id, voucher_id = p.VoucherId, company_id = p.CompanyId,
                            invoice_number = p.InvoiceNumber, invoice_date = p.InvoiceDate,
                            party_ledger_id = p.PartyLedgerId, party_ledger_name = p.PartyLedgerName,
                            party_gstin = p.PartyGstin, gross_amount = p.GrossAmount,
                            discount_amount = p.DiscountAmount, taxable_amount = p.TaxableAmount,
                            cgst_amount = p.CgstAmount, sgst_amount = p.SgstAmount,
                            igst_amount = p.IgstAmount, cess_amount = p.CessAmount,
                            round_off = p.RoundOff, net_amount = p.NetAmount,
                            is_cancelled = p.IsCancelled, narration = p.Narration,
                            master_id = p.MasterId, alter_id = p.AlterId
                        }).ToList();
                        await UploadRequiredVoucherDataAsync("purchases", purchasesFlat, "id");
                        purchaseCount += purchases.Count;
                        batchPurchaseCount += purchases.Count;

                        var purchaseItems = purchases.Where(p => p.Items != null).SelectMany(p => p.Items!).ToList();
                        if (purchaseItems.Any()) await UploadRequiredVoucherDataAsync("purchase_items", purchaseItems, "id");
                    }
                }

                var billAlloc = _tallyConnector!.ExtractBillAllocations(vouchers, company.Name);
                if (billAlloc.Count > 0) await UploadRequiredVoucherDataAsync("bill_allocations", billAlloc, "id");

                var bankAlloc = _tallyConnector!.ExtractBankAllocations(vouchers, company.Name);
                if (bankAlloc.Count > 0) await UploadRequiredVoucherDataAsync("bank_allocations", bankAlloc, "id");

                var notes = _tallyConnector!.ExtractDebitCreditNotes(vouchers, company.Name);
                if (notes.Count > 0) await UploadRequiredVoucherDataAsync("debit_credit_notes", notes, "id");


                token.ThrowIfCancellationRequested();
                voucherCount += vouchers.Count;
            }, ct, async _ =>
            {
                // This runs only AFTER the durable batch checkpoint has committed.
                _cloudHistoryProgress?.AddCompletedVoucherBatch(batchVoucherCount, batchSalesCount, batchPurchaseCount);
                Status.ProcessedRecords += batchVoucherCount;
                UpdateStatus(SyncState.Syncing, $"Saved {Status.ProcessedRecords} vouchers with all dependent data.");
                await PublishCloudSyncProgressAsync();
            });
            if (voucherCount > 0) AddLog($"✅ Fully saved {voucherCount} vouchers with all dependent data; checkpoint committed.");
            return (voucherCount, salesCount, salesAmount, purchaseCount);
        }

        private async Task<(int Vouchers, int Sales, decimal SalesAmount, int Purchases)> PersistVoucherBatchesAsync(
            Company company, List<Voucher> vouchers, List<string> highValueAlerts, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            var ordered = vouchers.Select(v => new { Voucher = v, Alter = long.TryParse(v.AlterId, out var id) ? id : 0 })
                .OrderBy(v => v.Alter).ToList();
            if (ordered.Any(v => v.Alter <= 0)) throw new InvalidDataException("Cannot checkpoint vouchers without a valid ALTERID.");
            var batches = ordered.Chunk(TALLY_BATCH_SIZE).Select(batch => new VoucherBatchPayload(
                VoucherBatchPayloadCodec.Serialize(batch.Select(v => v.Voucher).ToList()), batch.Max(v => v.Alter))).ToList();
            _voucherJournal!.Enqueue(VoucherOwnerId, company.Id, batches);
            return await ReplayVoucherBatchesAsync(company, highValueAlerts, ct);
        }

        private async Task<(int VouchersSynced, int SalesSynced, decimal TotalSalesAmount, int PurchasesSynced)> SyncHistoricalVouchersFastAsync(
            Company company, 
            Dictionary<string, string> hsnCache,
            List<string> highValueAlerts,
            CancellationToken ct,
            IReadOnlyCollection<long>? onlyAlterIds = null,
            bool pdfForEachVoucher = false)
        {
            int totalVouchers = 0;
            int totalSales = 0;
            int totalPurchases = 0;
            decimal salesAmount = 0;

            using var extractor = new TallyFastExtractor($"http://{_settings.TallySettings.Host}:{_settings.TallySettings.Port}", _settings.SyncSettings.BatchSize, 40);

            List<long> alterIds;
            int cloudBefore = -1;
            if (onlyAlterIds != null)
            {
                alterIds = onlyAlterIds.Where(n => n > 0).Distinct().OrderBy(n => n).ToList();
            }
            else
            {
                AddLog("⚡ [FastExtractor] Reading full voucher index...");
                SyncLogger.Log("[FastExtractor] Historical: reading full voucher index");
                var index = await _tallyConnector!.GetVoucherIndexFullAsync(company.Name);
                alterIds = index.Select(e => long.TryParse((e.AlterId ?? string.Empty).Trim(), out var n) ? n : 0)
                    .Where(n => n > 0).Distinct().OrderBy(n => n).ToList();

                cloudBefore = await _apiClient!.GetVoucherCountAsync(company.Id);
                VerifyIndexCoverage(company, index, cloudBefore);
            }

            if (alterIds.Count == 0)
            {
                AddLog("⚠️ [FastExtractor] Tally returned no voucher ALTERIDs. Skipping historical voucher sync.");
                return (0, 0, 0, 0);
            }

            int batchCount = (alterIds.Count + TALLY_BATCH_SIZE - 1) / TALLY_BATCH_SIZE;
            AddLog($"📚 [FastExtractor] Historical sync: {alterIds.Count} vouchers in {batchCount} ALTERID batches ({alterIds[0]}..{alterIds[^1]})");
            SyncLogger.Log($"[FastExtractor] Historical sync: {alterIds.Count} vouchers in {batchCount} ALTERID batches ({alterIds[0]}..{alterIds[^1]})");
            Status.TotalRecords = alterIds.Count;
            Status.ProcessedRecords = 0;

            for (int batchNo = 0; batchNo < batchCount; batchNo++)
            {
                ct.ThrowIfCancellationRequested();

                var batch = alterIds.Skip(batchNo * TALLY_BATCH_SIZE).Take(TALLY_BATCH_SIZE).ToList();
                string rangeDisplay = $"batch {batchNo + 1}/{batchCount}";
                try
                {
                    UpdateStatus(SyncState.FetchingData, $"Reading vouchers ({rangeDisplay})…", "vouchers");
                    var vouchers = _settings.SyncSettings.UseFastExtractor
                        ? await extractor.GetVouchersByAlterIdsAsync(company.Name, batch, hsnCache, ct)
                        : await _tallyConnector!.GetVouchersByAlterRangeAsync(company.Name, batch.First(), batch.Last(), hsnCache);
                    ct.ThrowIfCancellationRequested();
                    if (batch.Except(vouchers.Select(v => long.TryParse(v.AlterId, out var id) ? id : 0)).Any())
                        throw new IOException($"Tally returned an incomplete {rangeDisplay}; checkpoint retained.");
                    // A voucher is "new" only if the cloud did not have its id before this upload;
                    // re-synced (repaired) rows must not be sent to Telegram again.
                    List<Voucher>? newVouchers = null;
                    if (pdfForEachVoucher)
                    {
                        var existingIds = await _apiClient!.GetExistingVoucherIdsAsync(company.Id, vouchers);
                        newVouchers = vouchers.Where(v => !existingIds.Contains(v.Id)).ToList();
                    }

                    var saved = await PersistVoucherBatchesAsync(company, vouchers, highValueAlerts, ct);
                    totalVouchers += saved.Vouchers;
                    totalSales += saved.Sales;
                    totalPurchases += saved.Purchases;
                    salesAmount += saved.SalesAmount;

                    if (newVouchers != null && newVouchers.Count > 0) _vouchersToPdf.AddRange(newVouchers);

                    Status.ProcessedRecords = totalVouchers;
                    UpdateStatus(SyncState.Syncing, $"Saved {totalVouchers}/{alterIds.Count} vouchers with all dependent data.");
                    AddLog($"✅ [FastExtractor] {vouchers.Count} vouchers ({rangeDisplay})");
                }
                catch (Exception ex)
                {
                    AddLog($"❌ [FastExtractor] {rangeDisplay}: {ex.Message}");
                    throw;
                }

                if (_tallyConnector!.ConsecutiveFailures >= 3)
                {
                    AddLog("❌ Tally not responding - historical sync aborted. Will retry next cycle.");
                    break;
                }
                await Task.Delay(500, ct);
            }

            AddLog($"📊 [FastExtractor] Historical sync complete: {totalVouchers} vouchers");
            if (cloudBefore >= 0)
            {
                int cloudAfter = await _apiClient!.GetVoucherCountAsync(company.Id);
                string line = $"[Completeness] {company.Name} ({company.Id}) fetched={totalVouchers} " +
                              $"inserted={(cloudAfter >= 0 ? Math.Max(0, cloudAfter - cloudBefore) : -1)} cloudBefore={cloudBefore} cloudAfter={cloudAfter}";
                SyncLogger.Log(line);
                AddLog(line);
            }
            return (totalVouchers, totalSales, salesAmount, totalPurchases);
        }

        /// <summary>
        /// Renders every voucher created by this incremental scan, sends it to the linked Telegram
        /// chat, and deletes the temp PDF the moment the send finishes (success or failure).
        /// </summary>
        private async Task SendNewVoucherPdfsAsync(Company company)
        {
            if (_vouchersToPdf.Count == 0) return;

            var userId = App.AuthService?.CurrentSession?.UserId;
            if (string.IsNullOrEmpty(userId))
            {
                AddLog("📄 Voucher PDFs skipped: not signed in.");
                _vouchersToPdf.Clear();
                return;
            }

            var chatId = await _apiClient!.GetTelegramChatIdAsync(userId);
            if (string.IsNullOrWhiteSpace(chatId))
            {
                AddLog("📄 Voucher PDFs skipped: Telegram is not linked to this account.");
                _vouchersToPdf.Clear();
                return;
            }

            int sent = 0, failed = 0;
            AddLog($"📄 Sending {_vouchersToPdf.Count} new voucher PDF(s) to Telegram...");

            foreach (var voucher in _vouchersToPdf)
            {
                string? pdfPath = null;
                try
                {
                    pdfPath = await VoucherPdfRenderer.RenderAsync(company, voucher, CancellationToken.None);
                    var caption = $"{company.Name}\n{voucher.VoucherType} #{voucher.VoucherNumber} · {voucher.VoucherDate:dd-MM-yyyy}" +
                                  (string.IsNullOrWhiteSpace(voucher.PartyName) ? string.Empty : $"\n{voucher.PartyName}") +
                                  $"\n₹{voucher.TotalAmount:N2}";

                    if (await _apiClient.SendTelegramDocumentAsync(chatId, pdfPath, caption)) sent++;
                    else failed++;
                }
                catch (Exception ex)
                {
                    failed++;
                    SyncLogger.Log($"📄 PDF failed for {voucher.VoucherType} #{voucher.VoucherNumber}: {ex.Message}");
                    // If nothing has gone through yet the renderer itself is broken - stop instead of
                    // grinding through every voucher.
                    if (sent == 0 && failed >= 3)
                    {
                        SyncLogger.Log("📄 Voucher PDF rendering failed 3 times — aborting this batch.");
                        break;
                    }
                }
                finally
                {
                    if (pdfPath != null)
                    {
                        try { File.Delete(pdfPath); } catch { /* temp file */ }
                    }
                }
            }

            _vouchersToPdf.Clear();
            AddLog($"📄 Voucher PDFs → Telegram: {sent} sent, {failed} failed.");
        }


        // ============================================
        // MAIN PATH SWITCHING: Path conflict detection and transfer
        // ============================================

        /// <summary>
        /// Lazily initialize the CompanyMappingStore for the logged-in user.
        /// Uses the default LocalAppData\Syncora\company_mapping.db path.
        /// </summary>
        public async Task EnsureMappingStoreInitializedAsync(string ownerId)
        {
            if (_mappingStore != null) return;
            lock (_mappingStoreLock)
            {
                if (_mappingStore != null) return;
                _mappingStore = new CompanyMappingStore();
            }
        }

        /// <summary>
        /// Generate a stable source ID from machine ID + data path.
        /// Same PC + same path = same source ID; different path (copy) = different source ID.
        /// Prevents duplicate identity mappings on re-sync.
        /// </summary>
        private static string GenerateSourceId(string dataPath)
        {
            var machineId = DeviceIdentityService.Current?.MachineId ?? Environment.MachineName;
            var input = $"{machineId}|{dataPath}";
            using var md5 = MD5.Create();
            var hash = md5.ComputeHash(Encoding.UTF8.GetBytes(input));
            return BitConverter.ToString(hash).Replace("-", "").Substring(0, 16);
        }

        /// <summary>
        /// Retry all pending cloud identity mappings for the logged-in user.
        /// Called after network interruption to confirm previously-registered paths.
        /// Idempotent: re-registering an already-confirmed mapping returns the existing record.
        /// </summary>
        public async Task SyncPendingMappingsAsync(string ownerId)
        {
            try
            {
                await EnsureMappingStoreInitializedAsync(ownerId);
                var pending = _mappingStore!.GetPendingMappings(ownerId);
                if (pending.Count == 0) return;

                AddLog($"🔄 Retrying {pending.Count} pending company identity mapping(s)...");

                foreach (var map in pending)
                {
                    var registerResult = await _apiClient!.RegisterCompanyIdentityAsync(
                        map.SupabaseCompanyId,
                        map.TallyGuid,
                        map.DataPath,
                        map.SourceId,
                        false  // switch_main_path = false for retry
                    );

                    if (registerResult.Success)
                    {
                        _mappingStore.ConfirmCloudActivation(
                            ownerId, map.SupabaseCompanyId, map.TallyGuid,
                            map.DataPath, map.SourceId);
                        AddLog($"✅ Pending mapping confirmed: {map.TallyGuid} → {map.DataPath}");
                    }
                    else
                    {
                        AddLog($"⚠️ Pending mapping retry failed: {map.TallyGuid} — {registerResult.Error}");
                    }
                }
            }
            catch (Exception ex)
            {
                AddLog($"❌ Sync pending mappings error: {ex.Message}");
                SyncLogger.Log($"[PendingMappings] Error: {ex.Message}");
            }
        }

        public void Dispose()
        {
            StopSync();
            _tallyConnector?.Dispose();
            _apiClient?.Dispose();
            _offlineQueue?.Dispose();
            _voucherJournal?.Dispose();
            _cancellationTokenSource?.Dispose();
        }
    }
}
