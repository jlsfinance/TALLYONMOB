using System;
using System.Collections.Generic;
using System.Linq;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Timers;
using System.Text;
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
        private OfflineQueueService? _offlineQueue;
        private System.Timers.Timer? _syncTimer;
        private CancellationTokenSource? _cancellationTokenSource;
        private bool _isSyncing = false;
        private bool _isFirstRun = true;
        private readonly object _syncLock = new object();
        private Dictionary<string, string> _hsnCache = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        public SyncStatus Status { get; private set; } = new();
        public Company? CurrentCompany { get; private set; }

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

        /// <summary>
        /// Initialize all services
        /// </summary>
        private void InitializeServices()
        {
            // Dispose existing services
            _tallyConnector?.Dispose();
            _apiClient?.Dispose();
            _offlineQueue?.Dispose();

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
                _apiClient.SetUserToken(App.AuthService.GetAccessToken() ?? "");
            }

            _offlineQueue = new OfflineQueueService(_settings.Database.Path);
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
            AddLog($"🔐 Tally License Serial updated to: {newSerial}");
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

            _cancellationTokenSource = new CancellationTokenSource();

            // FIX: Mark first run complete when user explicitly starts auto-sync
            _isFirstRun = false;

            _syncTimer = new System.Timers.Timer(_settings.SyncSettings.SyncIntervalMinutes * 60 * 1000);
            _syncTimer.Elapsed += async (s, e) => await RunSyncAsync();
            _syncTimer.AutoReset = true;
            _syncTimer.Start();

            // Calculate next sync time
            Status.NextSyncTime = DateTime.Now.AddMinutes(_settings.SyncSettings.SyncIntervalMinutes);
            UpdateStatus(SyncState.Idle, $"Auto-sync every {_settings.SyncSettings.SyncIntervalMinutes} minutes");

            Console.WriteLine($"Background sync started (interval: {_settings.SyncSettings.SyncIntervalMinutes} min)");

            // FIX: Trigger immediate first sync when auto-sync is started
            _ = Task.Run(async () => 
            {
                await Task.Delay(2000); // Small delay to let UI update
                await RunSyncAsync(isManual: false, forceResync: false);
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

            // FIX 4: Hard Lock + isSyncing flag
            lock (_syncLock)
            {
                if (_isSyncing)
                {
                     AddLog("⚠️ Sync already in progress, skipping request.");
                     Console.WriteLine("Sync already in progress, skipping...");
                     return;
                }
                _isSyncing = true;
            }
            var overallStopwatch = Stopwatch.StartNew();

            try
            {
                // AUDIT FIX: Auto-refresh auth token before sync to prevent 401 expiry failures
                if (App.AuthService != null && App.AuthService.IsLoggedIn)
                {
                    try
                    {
                        var freshToken = await App.AuthService.RefreshTokenIfNeededAsync();
                        if (!string.IsNullOrEmpty(freshToken))
                        {
                            _apiClient!.SetUserToken(freshToken);
                        }
                    }
                    catch (Exception refreshEx)
                    {
                        AddLog($"⚠️ Token refresh failed: {refreshEx.Message} — continuing with existing token");
                    }
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

                // 1. Get ALL Open Companies from Tally
                AddLog("🔍 Fetching open companies from Tally...");
                var companies = await _tallyConnector!.GetOpenCompaniesAsync();
                
                AddLog($"🔍 Found {companies.Count} companies in Tally.");
                foreach (var c in companies)
                {
                     AddLog($"   🏢 Discovered: {c.Name} (ID: {c.Id})");
                }

                if (companies.Count == 0)
                {
                    UpdateStatus(SyncState.Idle, "No open companies found in Tally");
                    AddLog("❌ No companies returned by Tally. Check if Tally is open and companies are loaded.");
                    return;
                }

                Status.TotalRecords = 0;
                Status.ProcessedRecords = 0;

                // Safety: Clear old queue on first run to avoid stuck loops
                if (_isFirstRun || isManual) 
                {
                    await _offlineQueue!.ClearQueueAsync();
                    if (isManual) AddLog("🧹 Cleared error queue for fresh start.");
                    _isFirstRun = false;
                }

                foreach (var company in companies)
                {
                    // ===== SYNC HISTORY TRACKING - declare outside try for catch access =====
                    string syncType = "incremental"; // Default
                    string? syncHistoryId = null;
                    int ledgersSynced = 0, vouchersSynced = 0, salesSynced = 0, purchasesSynced = 0, stockSynced = 0;
                    int masterDataSynced = 0;
                    decimal totalSalesAmountFetched = 0;
                    var highValueAlerts = new List<string>();
                    const decimal HighValueThreshold = 50000; // ₹50,000 threshold for alerts
                    var syncedVoucherIds = new List<string>();

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
                        UpdateStatus(SyncState.Syncing, $"Processing: {company.Name}");

                        // Cleanup any stale 'running' syncs from previous sessions
                        await _apiClient!.FailRunningSyncsAsync(company.Id);

                        // 1. Determine Sync Type accurately
                        // Check last sync state BEFORE starting history
                        long lastVoucherAlterId = await _apiClient!.GetMaxAlterIdAsync(company.Id, "vouchers");
                        long lastLedgerAlterId = await _apiClient.GetMaxAlterIdAsync(company.Id, "ledgers");
                        
                        bool isFirstSync = lastVoucherAlterId == 0 || forceResync;
                        
                        if (forceResync) syncType = "force";
                        else if (isFirstSync) syncType = "full";
                        else syncType = "incremental"; // Even manual clicks are incremental if data exists

                        // Start sync history record
                        syncHistoryId = await _apiClient!.StartSyncHistoryAsync(company.Id, syncType);

                        // Sync company info first
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
                            
                            var compResult = await _apiClient!.SyncCompanyAsync(CurrentCompany);
                            if (compResult.Success)
                            {
                                SyncLogger.Log($"✅ Company metadata synced: {company.Name}");
                                AddLog($"✅ Company registered in Cloud: {company.Name} (ID: {company.Id})");

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
                            }
                        }

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

                        // FIX 2: Status.TotalRecords logic - Reset properly at start of company sync
                        Status.TotalRecords = 0; 
                        Status.ProcessedRecords = 0;
                        
                        // Process queue for this company
                        await ProcessQueueAsync();

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
                            if (stockItems.Any() && (isFirstSync || forceResync || stockItems.Count != stockSynced)) // Simplified condition
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

                            // Full historical voucher sync (date-based for first time)
                            DateTime booksStart = new DateTime(2024, 4, 1); 
                            DateTime toDate = DateTime.Today;
                            
                            int totalMonths = ((toDate.Year - booksStart.Year) * 12) + toDate.Month - booksStart.Month + 1;
                            Status.TotalRecords = totalMonths; // Use months as progress units for historical sync
                            Status.ProcessedRecords = 0;
                            
                            UpdateStatus(SyncState.Syncing, $"First Sync: {booksStart:MMM yyyy} to {toDate:MMM yyyy} ({totalMonths} months)");
                            AddLog($"📚 Historical sync: {booksStart:dd-MMM-yy} → {toDate:dd-MMM-yy}");
                            
                            DateTime current = booksStart;
                            bool allChunksSuccessful = true;
                            int totalVouchersFound = 0;
                            int monthsProcessed = 0;

                            while (current <= toDate)
                            {
                                // CRITICAL: Reduced chunk size to 7 days (instead of 30) to prevent Tally memory crashes
                                DateTime rangeEnd = current.AddDays(7);
                                if (rangeEnd > toDate) rangeEnd = toDate;
                                
                                string rangeDisplay = $"{current:dd-MMM} to {rangeEnd:dd-MMM-yy}";
                                UpdateStatus(SyncState.FetchingData, $"Historical: {rangeDisplay}", "vouchers");
                                
                                try 
                                {
                                    // OPTIMIZATION: Fetch ALL vouchers for this period ONCE.
                                    // This prevents Tally from generating heavy XMLs 3 times per period.
                                    var allVouchers = await _tallyConnector!.GetVouchersAsync(current, rangeEnd, company.Name, hsnCache);
                                    
                                    if (allVouchers != null && allVouchers.Count > 0)
                                    {
                                        totalVouchersFound += allVouchers.Count;
                                        
                                        // 1. Upload all vouchers (General list)
                                        await UploadListAsync("vouchers", allVouchers, "id");
                                        vouchersSynced += allVouchers.Count;
                                        AddLog($"✅ {allVouchers.Count} vouchers ({rangeDisplay})");
                                        
                                        // 2. Sync voucher line items (ledger entries and stock entries)
                                        var (ledgerEntries, stockEntries) = await _apiClient!.SyncVoucherEntriesAsync(company.Id, allVouchers);
                                        if (ledgerEntries > 0 || stockEntries > 0)
                                        {
                                            AddLog($"   📋 {ledgerEntries} ledger entries, {stockEntries} stock entries");
                                        }

                                        // 2. Extract Sales Locally (No extra Tally call)
                                        var salesVouchers = allVouchers.Where(v => v.VoucherType.Contains("Sales", StringComparison.OrdinalIgnoreCase)).ToList();
                                        if (salesVouchers.Count > 0)
                                        {
                                            var sales = _tallyConnector.MapVouchersToSales(salesVouchers, company.Name);
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
                                            await UploadListAsync("sales", salesFlat, "id");
                                            salesSynced += salesVouchers.Count;

                                            var salesItems = sales.Where(s => s.Items != null).SelectMany(s => s.Items!).ToList();
                                            if (salesItems.Any()) await UploadListAsync("sales_items", salesItems, "id");
                                            AddLog($"   📊 {salesVouchers.Count} sales synced");

                                            // TRACK FOR SMART ALERTS
                                            totalSalesAmountFetched += sales.Sum(s => s.NetAmount);
                                            foreach (var s in sales.Where(s => s.NetAmount >= HighValueThreshold))
                                            {
                                                highValueAlerts.Add($"💰 High Value Sale: <b>{s.PartyLedgerName}</b> - ₹{s.NetAmount:N0}");
                                            }
                                        }

                                        // 3. Extract Purchases Locally (No extra Tally call)
                                        var purchaseVouchers = allVouchers.Where(v => v.VoucherType.Contains("Purchase", StringComparison.OrdinalIgnoreCase)).ToList();
                                        if (purchaseVouchers.Count > 0)
                                        {
                                            var purchases = _tallyConnector.MapVouchersToPurchases(purchaseVouchers, company.Name);
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
                                            await UploadListAsync("purchases", purchasesFlat, "id");
                                            purchasesSynced += purchaseVouchers.Count;

                                            var purchaseItems = purchases.Where(p => p.Items != null).SelectMany(p => p.Items!).ToList();
                                            if (purchaseItems.Any()) await UploadListAsync("purchase_items", purchaseItems, "id");
                                            AddLog($"   🛒 {purchaseVouchers.Count} purchases synced");
                                        }
                                    }

                                    // 4. Extract Allocations & Notes (Batched Vouchers)
                                    if (allVouchers.Count > 0)
                                    {
                                        var billAllocations = _tallyConnector.ExtractBillAllocations(allVouchers, company.Name);
                                        if (billAllocations.Count > 0) await UploadListAsync("bill_allocations", billAllocations, "id");

                                        var bankAllocations = _tallyConnector.ExtractBankAllocations(allVouchers, company.Name);
                                        if (bankAllocations.Count > 0) await UploadListAsync("bank_allocations", bankAllocations, "id");

                                        var notes = _tallyConnector.ExtractDebitCreditNotes(allVouchers, company.Name);
                                        if (notes.Count > 0) await UploadListAsync("debit_credit_notes", notes, "id");
                                    }

                                    // Track Progress
                                    if (current.Month != rangeEnd.Month || rangeEnd == toDate)
                                    {
                                        monthsProcessed++;
                                        Status.ProcessedRecords = monthsProcessed;
                                        UpdateStatus(SyncState.Syncing, $"Synced {monthsProcessed}/{totalMonths} months...");
                                    }
                                } 
                                catch (Exception ex) 
                                {
                                    allChunksSuccessful = false;
                                    AddLog($"❌ {rangeDisplay}: {ex.Message}");
                                }

                                // 2-second delay to let Tally memory settle
                                await Task.Delay(2000);
                                current = rangeEnd.AddDays(1);
                            }

                            AddLog($"📊 First sync complete: {totalVouchersFound} vouchers");
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
                            List<Voucher> finalVouchers = new List<Voucher>();

                            // 1. Check Ledgers - Always attempt fetch (use 0 for first incremental pass)
                            finalLedgers = await _tallyConnector!.GetModifiedLedgersAsync(company.Name, lastLedgerAlterId);
                            totalToSync += finalLedgers.Count;
                            
                            // 2. Check Vouchers
                            // FIX: Removed flag check to ensure modified vouchers always sync
                            finalVouchers = await _tallyConnector!.GetModifiedVouchersAsync(company.Name, lastVoucherAlterId, hsnCache);
                            totalToSync += finalVouchers.Count;

                            // Update Status counts
                            Status.TotalRecords = totalToSync;
                            Status.ProcessedRecords = 0;

                            if (totalToSync == 0)
                            {
                                UpdateStatus(SyncState.Syncing, "No changes found.");
                                AddLog($"✅ System is up to date.");
                            }
                            else
                            {
                                UpdateStatus(SyncState.Syncing, $"Found {totalToSync} changes to sync...");
                            }

                            // 1. Sync modified LEDGERS
                            if (finalLedgers.Count > 0)
                            {
                                await UploadListAsync("ledgers", finalLedgers, "id");
                                ledgersSynced += finalLedgers.Count;
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
                            
                            // 2. Sync modified VOUCHERS
                            // Use 'finalVouchers' instead of 'modifiedVouchers'
                            if (finalVouchers.Count > 0)
                            {
                                await UploadListAsync("vouchers", finalVouchers, "id");
                                vouchersSynced += finalVouchers.Count;
                                AddLog($"📝 Synced {finalVouchers.Count} modified vouchers");
                                
                                // Sync voucher line items (ledger entries and stock entries)
                                var (ledgerEntries, stockEntries) = await _apiClient!.SyncVoucherEntriesAsync(company.Id, finalVouchers);
                                if (ledgerEntries > 0 || stockEntries > 0)
                                {
                                    AddLog($"   📋 {ledgerEntries} ledger entries, {stockEntries} stock entries");
                                }
                                
                                
                                // Show sample of what was modified
                                foreach (var v in finalVouchers.Take(5))
                                {
                                    AddLog($"   📄 {v.VoucherType} #{v.VoucherNumber} ({v.VoucherDate:dd-MMM-yy}) - ALTERID: {v.AlterId}");
                                }

                                if (finalVouchers.Any())
                                {
                                    var lastDate = finalVouchers.Max(v => v.VoucherDate);
                                    AddLog($"🕒 Last Entry Found: {lastDate:dd-MMM-yyyy}");
                                }
                                
                                // Also sync Sales/Purchases for modified vouchers
                                // Optimization: Map existing vouchers instead of re-fetching from Tally
                                if (finalVouchers.Any())
                                {
                                    // 1. Map existing vouchers to Sales
                                    var salesVouchers = finalVouchers.Where(v => v.VoucherType.Contains("Sales", StringComparison.OrdinalIgnoreCase)).ToList();
                                    if (salesVouchers.Count > 0)
                                    {
                                        var sales = _tallyConnector.MapVouchersToSales(salesVouchers, company.Name);
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
                                        await UploadListAsync("sales", salesFlat, "id");
                                        salesSynced += salesVouchers.Count;

                                        var salesItems = sales.Where(s => s.Items != null).SelectMany(s => s.Items!).ToList();
                                        if (salesItems.Any()) await UploadListAsync("sales_items", salesItems, "id");
                                        AddLog($"   📊 {salesVouchers.Count} sales updated locally");
                                        
                                        // TRACK FOR SMART ALERTS
                                        totalSalesAmountFetched += sales.Sum(s => s.NetAmount);
                                        foreach (var s in sales.Where(s => s.NetAmount >= HighValueThreshold))
                                        {
                                            highValueAlerts.Add($"💰 High Value Sale: <b>{s.PartyLedgerName}</b> - ₹{s.NetAmount:N0}");
                                        }
                                    }

                                    // 2. Map existing vouchers to Purchases
                                    var purchaseVouchers = finalVouchers.Where(v => v.VoucherType.Contains("Purchase", StringComparison.OrdinalIgnoreCase)).ToList();
                                    if (purchaseVouchers.Count > 0)
                                    {
                                        var purchases = _tallyConnector.MapVouchersToPurchases(purchaseVouchers, company.Name);
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
                                        await UploadListAsync("purchases", purchasesFlat, "id");
                                        purchasesSynced += purchaseVouchers.Count;

                                        var purchaseItems = purchases.Where(p => p.Items != null).SelectMany(p => p.Items!).ToList();
                                        if (purchaseItems.Any()) await UploadListAsync("purchase_items", purchaseItems, "id");
                                        AddLog($"   🛒 {purchaseVouchers.Count} purchases updated locally");
                                    }

                                    // 3. Extract Allocations & Notes (Incremental)
                                    var billAllocations = _tallyConnector.ExtractBillAllocations(finalVouchers, company.Name);
                                    if (billAllocations.Count > 0) await UploadListAsync("bill_allocations", billAllocations, "id");

                                    var bankAllocations = _tallyConnector.ExtractBankAllocations(finalVouchers, company.Name);
                                    if (bankAllocations.Count > 0) await UploadListAsync("bank_allocations", bankAllocations, "id");

                                    var notes = _tallyConnector.ExtractDebitCreditNotes(finalVouchers, company.Name);
                                    if (notes.Count > 0) await UploadListAsync("debit_credit_notes", notes, "id");
                                }
                            }
                            else
                            {
                                AddLog($"✅ No voucher modifications detected - data is up to date!");
                            }
                            
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
                        // DELETE DETECTION: DISABLED FOR PERFORMANCE
                        // Scanning 2 years of vouchers every sync causes Tally to hang.
                        // We will implement a lighter Delete detection in future (e.g. ID-only fetch).
                        // ===========================================
                        /*
                        if (!isFirstSync && serverOk)
                        {
                             // ... Disabled ...
                        }
                        */
                                    
                        /* Orphaned code removed */

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
                            await _apiClient!.UpdateSyncHistoryAsync(
                                syncHistoryId,
                                "completed",
                                ledgersSynced,
                                vouchersSynced,
                                salesSynced,
                                purchasesSynced,
                                stockSynced,
                                Status.TotalRecords,
                                syncedVoucherIds
                            );
                            AddLog($"📜 Sync history saved: {syncType} sync completed");
                        }

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
                                    
                                    await _apiClient.SendTelegramNotificationAsync(tgChatId, telegramMsg);
                                    
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

                                    AddLog($"📨 Telegram notification sent to user.");
                                }
                            }
                        }
                        catch (Exception tgEx)
                        {
                            SyncLogger.Log($"⚠️ Telegram notification failed: {tgEx.Message}");
                        }
                    }
                    catch (Exception ex)
                    {
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
                            await _apiClient!.UpdateSyncHistoryAsync(
                                syncHistoryId,
                                "failed",
                                errorMessage: ex.Message
                            );
                        }
                    }
                }

                // Update final status to avoid "1 records" confusion
                Status.LastSyncTime = DateTime.Now;
                Status.NextSyncTime = DateTime.Now.AddMinutes(_settings.SyncSettings.SyncIntervalMinutes);
                
                string msg = Status.TotalRecords == 0 
                    ? "Sync completed. No changes found." 
                    : $"Sync completed! Processed {Status.TotalRecords} records.";
                
                UpdateStatus(SyncState.Completed, msg);

                // Cleanup old queue items
                await _offlineQueue!.CleanupAsync();
            }
            catch (Exception ex)
            {
                AddLog($"🔥 CRITICAL SYNC FAILURE: {ex.Message}");
                Console.WriteLine($"Sync failed: {ex.Message}");
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
                    if (_cancellationTokenSource?.IsCancellationRequested == true) break;

                    var result = await _apiClient!.SyncDataAsync(CurrentCompany!.Id, dataType, batch, onConflict);

                    if (result.Success)
                    {
                        successCount += batch.Count;
                    }
                    else
                    {
                        failedCount += batch.Count;
                        await _offlineQueue!.EnqueueAsync(CurrentCompany!.Id, dataType, batch);
                        UpdateStatus(SyncState.Uploading, $"Error: {result.Error}", dataType);
                        SyncLogger.Log($"❌ BATCH FAILED {dataType}: {result.Error}");
                    }

                    Status.ProcessedRecords += batch.Count;
                    UpdateStatus(SyncState.Uploading, $"Syncing {dataType}: {successCount + failedCount}/{data.Count}", dataType);
                }

                stopwatch.Stop();
                await _offlineQueue!.LogSyncAsync(dataType, data.Count, failedCount == 0, failedCount > 0 ? $"{failedCount} failed" : null, (int)stopwatch.ElapsedMilliseconds);
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
            var pendingItems = await _offlineQueue!.GetPendingItemsAsync();

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
                    if (item.DataType.Contains("voucher"))
                    {
                        var data = JsonConvert.DeserializeObject<List<Voucher>>(item.JsonData);
                        if (data != null && data.Count > 0)
                        {
                            success = await ProcessTypedBatch(item, data, "id");
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
            try
            {
                if (_apiClient == null || _tallyConnector == null) return;

                // Fetch pending transactions from cloud
                var pending = await _apiClient.GetPendingTransactionsAsync(company.Id);

                if (pending.Count == 0)
                {
                    // No pending - that's fine, silent return
                    return;
                }

                AddLog($"📤 Found {pending.Count} pending entries to push to Tally");
                UpdateStatus(SyncState.Syncing, $"Pushing {pending.Count} entries to Tally...");

                int successCount = 0;
                int failCount = 0;

                foreach (var transaction in pending)
                {
                    try
                    {
                        // Parse voucher data from JSON
                        var voucherData = transaction.VoucherData;
                        
                        if (voucherData == null)
                        {
                            await _apiClient.UpdatePendingTransactionStatusAsync(
                                transaction.Id, "failed", null, "No voucher data provided");
                            failCount++;
                            continue;
                        }

                        // Extract fields from voucher data
                        string partyLedger = voucherData.party_ledger_name?.ToString() ?? 
                                            voucherData.partyLedgerName?.ToString() ?? 
                                            voucherData.party_name?.ToString() ?? "";
                        
                        decimal amount = 0;
                        if (voucherData.net_amount != null)
                            decimal.TryParse(voucherData.net_amount.ToString(), out amount);
                        else if (voucherData.amount != null)
                            decimal.TryParse(voucherData.amount.ToString(), out amount);
                        else if (voucherData.total_amount != null)
                            decimal.TryParse(voucherData.total_amount.ToString(), out amount);

                        DateTime voucherDate = DateTime.Today;
                        if (voucherData.invoice_date != null)
                            DateTime.TryParse(voucherData.invoice_date.ToString(), out voucherDate);
                        else if (voucherData.voucher_date != null)
                            DateTime.TryParse(voucherData.voucher_date.ToString(), out voucherDate);

                        string narration = voucherData.narration?.ToString() ?? 
                                          $"Created from TallySync App";

                        // CRITICAL FIX: Normalize the voucher type 
                        // Database may store "VOUCHERS" (table name) instead of valid Tally types
                        string normalizedType = NormalizeTallyVoucherType(transaction.TransactionType, voucherData);

                        AddLog($"   → {normalizedType}: {partyLedger} ₹{amount:N0}");

                        // Push to Tally with normalized type
                        var (success, voucherNumber, error) = await _tallyConnector.PushVoucherToTallyAsync(
                            company.Name,
                            normalizedType,
                            voucherDate,
                            partyLedger,
                            amount,
                            narration
                        );

                        if (success)
                        {
                            // Mark as synced in cloud
                            await _apiClient.UpdatePendingTransactionStatusAsync(
                                transaction.Id, "synced", voucherNumber);
                            AddLog($"   ✅ Created in Tally: {voucherNumber}");
                            successCount++;
                        }
                        else
                        {
                            // Mark as failed
                            await _apiClient.UpdatePendingTransactionStatusAsync(
                                transaction.Id, "failed", null, error);
                            AddLog($"   ❌ Failed: {error}");
                            failCount++;
                        }
                    }
                    catch (Exception ex)
                    {
                        await _apiClient.UpdatePendingTransactionStatusAsync(
                            transaction.Id, "failed", null, ex.Message);
                        failCount++;
                    }

                    // Brief delay between pushes
                    await Task.Delay(200);
                }

                if (successCount > 0)
                {
                    AddLog($"✅ Two-Way Sync: {successCount} entries pushed to Tally");
                }
                if (failCount > 0)
                {
                    AddLog($"⚠️ {failCount} entries failed - will retry on next sync");
                }
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"❌ ProcessPendingTransactionsAsync error: {ex.Message}");
            }
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

        public void Dispose()
        {
            StopSync();
            _tallyConnector?.Dispose();
            _apiClient?.Dispose();
            _offlineQueue?.Dispose();
            _cancellationTokenSource?.Dispose();
        }
    }
}
