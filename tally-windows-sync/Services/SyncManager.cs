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
        private NotificationService? _notificationService; // Notification Support
        private AutoUpdater? _autoUpdater;                 // Auto-Update Support
        private System.Timers.Timer? _syncTimer;
        private CancellationTokenSource? _cancellationTokenSource;
        private bool _isSyncing = false;
        private bool _isFirstRun = true;
        private readonly object _syncLock = new object();

        public SyncStatus Status { get; private set; } = new();
        public Company? CurrentCompany { get; private set; }

        public event EventHandler<SyncStatus>? StatusChanged;
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

            // Use Supabase URL and Key from AuthSettings
            string supabaseUrl = _settings.AuthSettings.SupabaseUrl;
            string supabaseKey = _settings.AuthSettings.SupabaseAnonKey;

            // Fallback to known values if empty (safety net)
            if (string.IsNullOrEmpty(supabaseUrl) || string.IsNullOrEmpty(supabaseKey))
            {
                throw new InvalidOperationException("❌ Supabase Configuration Missing! Please check appsettings.json.");
            }

            _apiClient = new ApiClient(
                supabaseUrl,
                supabaseKey,
                300
            );

            // Set User Token if logged in
            if (App.AuthService != null && App.AuthService.IsLoggedIn)
            {
                _apiClient.SetUserToken(App.AuthService.GetAccessToken() ?? "");
            }

            // Initialize Notifications
            if (!string.IsNullOrEmpty(_settings.SyncSettings.FcmServerKey))
            {
                _notificationService = new NotificationService(_settings.SyncSettings.FcmServerKey);
            }

            // Initialize Auto-Updater
            _autoUpdater = new AutoUpdater(_apiClient);

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
                catch (Exception ex)
                {
                    SyncLogger.Log($"⚠️ Tally Availability Check Error: {ex.Message}");
                }
            }

            // 2. Test Server (Always test server even if Tally is offline)
            var serverResult = await _apiClient!.TestConnectionAsync();
            Status.IsServerConnected = serverResult.Success;
            if (!serverResult.Success)
            {
                errors.AppendLine($"Cloud: {serverResult.Message}");
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

            _syncTimer = new System.Timers.Timer(_settings.SyncSettings.SyncIntervalMinutes * 60 * 1000);
            _syncTimer.Elapsed += async (s, e) => await RunSyncAsync();
            _syncTimer.AutoReset = true;
            _syncTimer.Start();

            // Calculate next sync time
            Status.NextSyncTime = DateTime.Now.AddMinutes(_settings.SyncSettings.SyncIntervalMinutes);
            UpdateStatus(SyncState.Idle, $"Auto-sync every {_settings.SyncSettings.SyncIntervalMinutes} minutes");

            Console.WriteLine($"Background sync started (interval: {_settings.SyncSettings.SyncIntervalMinutes} min)");
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
        /// Check for updates
        /// </summary>
        public async Task CheckForUpdatesAsync()
        {
            if (_autoUpdater != null)
            {
                await _autoUpdater.CheckAndApplyUpdateAsync();
            }
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
            // Startup Guard removed to allow immediate sync if Tally is open.
            // We rely on 'TestConnectionsAsync' to fail gracefully if Tally isn't ready.
            if (!isManual && _isFirstRun) 
            {
               _isFirstRun = false;
               // Proceed to sync...
            }

            // FIX 4: Hard Lock + isSyncing flag
            lock (_syncLock)
            {
                if (_isSyncing)
                {
                    Console.WriteLine("Sync already in progress, skipping...");
                    return;
                }
                _isSyncing = true;
            }
            var overallStopwatch = Stopwatch.StartNew();

            bool hasFatalError = false;
            try
            {
                // Test connections first
                var (tallyOk, serverOk, error) = await TestConnectionsAsync();
                if (!tallyOk)
                {
                    Console.WriteLine("Tally not available, skipping sync");
                    return;
                }

                // 1. Get ALL Open Companies from Tally
                var companies = await _tallyConnector!.GetOpenCompaniesAsync();
                
                // Fetch FCM Tokens for notifications
                List<string>? fcmTokens = null;
                try
                {
                    fcmTokens = await _apiClient!.GetFcmTokensAsync();
                }
                catch (Exception tokEx)
                {
                    AddLog($"⚠️ Failed to fetch FCM tokens: {tokEx.Message}");
                }

                if (companies.Count == 0)
                {
                    UpdateStatus(SyncState.Idle, "No open companies found in Tally");
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
                    var syncedVoucherIds = new List<string>();

                    try
                    {
                        SyncLogger.Log($"--- Starting Sync for {company.Name} ---");
                        CurrentCompany = company;
                        UpdateStatus(SyncState.Syncing, $"Processing: {company.Name}");

                        // Cleanup any stale 'running' syncs from previous sessions
                        await _apiClient!.FailRunningSyncsAsync(company.Id);

                        // 1. Determine Sync Type accurately
                        // Check last sync state BEFORE starting history
                        UpdateStatus(SyncState.FetchingData, "Analyzing sync state...", company.Name);
                        
                        // NOTIFICATION START
                        if (_notificationService != null)
                        {
                            await _notificationService.SendNotificationAsync(
                                "Sync Started", 
                                $"Syncing {company.Name} with Tally Link...",
                                fcmTokens
                            );
                        }

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
                            }
                            
                            var compResult = await _apiClient!.SyncCompanyAsync(CurrentCompany);
                            if (compResult.Success)
                            {
                                SyncLogger.Log($"✅ Company metadata synced: {company.Name}");
                                if (company.FinancialYearStart != null)
                                {
                                    AddLog($"📅 Financial Year: {company.FinancialYearStart:dd-MMM-yyyy} to {company.FinancialYearEnd:dd-MMM-yyyy}");
                                }
                            }
                            else 
                            {
                                SyncLogger.Log($"⚠️ Company sync warning: {compResult.Error}");
                                Console.WriteLine($"⚠️ Company sync warning: {compResult.Error}");
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
                        AddLog("⏩ Using ALTERID-balanced sync flow (skipped statistics count)");
                        Status.TotalRecords = 0; // 0 indicates indeterminate/calculating
                        Status.ProcessedRecords = 0;
                        
                        // Process queue for this company
                        try 
                        {
                            await ProcessQueueAsync();
                        }
                        catch (Exception pqEx)
                        {
                            AddLog($"⚠️ Offline Queue Error: {pqEx.Message}");
                            SyncLogger.Log($"[QUEUE-CRASH] {pqEx}");
                        }

                        // ===========================================
                        // TWO-WAY SYNC: Push Cloud entries TO Tally
                        // ===========================================
                        await ProcessPendingTransactionsAsync(company);

                        // ===========================================
                        // ALTERID-BASED INCREMENTAL SYNC
                        // ===========================================
                        // CACHE STOCK HSN (Critical for HSN Fallback)
                        // ===========================================
                        UpdateStatus(SyncState.FetchingData, $"Caching Stock Items HSN...");
                        var stockItems = await _tallyConnector!.GetStockItemsAsync(company.Name);
                        var hsnCache = stockItems
                            .Where(s => !string.IsNullOrEmpty(s.HsnCode))
                            .GroupBy(s => s.Name)
                            .ToDictionary(g => g.Key, g => (string?)g.First().HsnCode, StringComparer.OrdinalIgnoreCase);
                        
                        SyncLogger.Log($"📦 Cached {hsnCache.Count} HSN codes from {stockItems.Count} items");
                        AddLog($"📦 HSN Cache: {hsnCache.Count} valid codes found in {stockItems.Count} items");

                        // LEDGER CACHE: Resolve names to IDs for ledger_transactions
                        var ledgers = await _tallyConnector!.GetLedgersAsync(company.Name);
                        var ledgerCache = ledgers
                            .GroupBy(l => l.Name)
                            .ToDictionary(g => g.Key, g => g.First().Id, StringComparer.OrdinalIgnoreCase);
                        
                        AddLog($"📝 Ledger Cache: {ledgerCache.Count} names mapped to IDs");
                        
                        // DEBUG: Check for missing HSN codes
                        if (hsnCache.Count == 0 && stockItems.Count > 0)
                        {
                            AddLog($"⚠️ WARNING: {stockItems.Count} stock items found but ZERO HSN codes!");
                            AddLog("   → Check if HSN codes are filled in Tally Masters");
                        }

                        // TEMP DEBUG: Print sample HSN mappings
                        if (hsnCache.Any())
                        {
                            AddLog($"📋 Sample HSN Cache Entries:");
                            foreach (var entry in hsnCache.Take(5))
                            {
                                AddLog($"   {entry.Key} → {entry.Value}");
                            }
                        }
                        
                        // Sync Stock Items (Always update masters to ensure HSN/GST rates are fresh)
                        try
                        {
                            if (stockItems.Any())
                            {
                                 // Inject company ID for proper data isolation
                                 foreach (var item in stockItems) item.CompanyId = company.Id;
                                 
                                 await UploadListAsync("stock_items", stockItems, "id");
                                 stockSynced += stockItems.Count;
                                 AddLog($"📦 Synced {stockItems.Count} Stock Items");
                            }
                        }
                        catch (Exception stockEx)
                        {
                            AddLog($"⚠️ Stock Item Sync Failed: {stockEx.Message}");
                            SyncLogger.Log($"[STOCK-FAIL] {stockEx}");
                        }

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
                            foreach (var l in allLedgers) l.CompanyId = company.Id;
                            await UploadListAsync("ledgers", allLedgers, "id");
                            ledgersSynced += allLedgers.Count;

                            // FIX 3: Voucher sync protected by EnableVoucherSync flag
                            if (!_settings.SyncSettings.EnableVoucherSync && !forceResync)
                            {
                                AddLog("⏭ Historical voucher sync skipped (Flag disabled)");
                                continue;
                            }

                            // Use Company FY Start if available, else default to 2024
                            DateTime booksStart = company.FinancialYearStart ?? new DateTime(2024, 4, 1); 
                            DateTime toDate = DateTime.Today;
                            
                            // Rough estimate of months for progress bar (kept simple)
                            int totalMonths = ((toDate.Year - booksStart.Year) * 12) + toDate.Month - booksStart.Month + 1;
                            
                            Status.TotalRecords = totalMonths; 
                            Status.ProcessedRecords = 0;
                            
                            UpdateStatus(SyncState.Syncing, $"First Sync: {booksStart:MMM yyyy} to {toDate:MMM yyyy}");
                            AddLog($"📚 Historical sync: {booksStart:dd-MMM-yy} → {toDate:dd-MMM-yy}");
                            
                            DateTime current = booksStart;
                            int totalVouchersFound = 0;
                            int chunksProcessed = 0;
                            bool allChunksSuccessful = true;

                            try
                            {
                                while (current <= toDate)
                                {
                                    // SPEED OPTIMIZATION: Chunk by 10 DAYS to avoid Payload Too Large errors
                                    DateTime rangeEnd = current.AddDays(9); // 10 days inclusive (current + 9)
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
                                            // FIX: Use 'company_id,master_id' for consistent UPSERT based on Tally GUID.
                                            // This prevents duplicates if the VoucherID generation logic changes or dates are edited.
                                             await UploadListAsync("vouchers", allVouchers, "company_id,master_id");
                                             vouchersSynced += allVouchers.Count;
                                             AddLog($"✅ {allVouchers.Count} vouchers ({rangeDisplay})");

                                             // 2. Extract and Upload Ledger Transactions (CA-READY Logic)
                                             var ledgerTxns = ExtractLedgerTransactions(allVouchers, ledgerCache);
                                             if (ledgerTxns.Any())
                                             {
                                                 await UploadListAsync("ledger_transactions", ledgerTxns, "company_id,ledger_name,voucher_id");
                                                 AddLog($"   🏛 {ledgerTxns.Count} ledger entries synced");
                                             }

                                             // 3. Extract Sales Locally (No extra Tally call)
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
                                                 salesSynced += sales.Count;
    
                                                 var salesItems = sales.Where(s => s.Items != null).SelectMany(s => s.Items!).ToList();
                                                 if (salesItems.Any()) await UploadListAsync("sales_items", salesItems, "id");
                                                AddLog($"   📊 {salesVouchers.Count} sales synced");
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
                                                 purchasesSynced += purchases.Count;

                                                 var purchaseItems = purchases.Where(p => p.Items != null).SelectMany(p => p.Items!).ToList();
                                                 if (purchaseItems.Any()) await UploadListAsync("purchase_items", purchaseItems, "id");
                                                 AddLog($"   🛒 {purchaseVouchers.Count} purchases synced");
                                            }
                                        }

                                        // Track Progress
                                        chunksProcessed++;
                                        // Status.ProcessedRecords = chunksProcessed; // Progress bar might be off, but acceptable
                                        UpdateStatus(SyncState.Syncing, $"Synced chunk {chunksProcessed} ({rangeEnd:dd-MMM})...");
                                    } 
                                    catch (Exception ex) 
                                    {
                                        allChunksSuccessful = false;
                                        AddLog($"❌ {rangeDisplay}: {ex.Message}");
                                    }

                                    // 2-second delay to let Tally memory settle
                                    await Task.Delay(2000);
                                    // 2-second delay to let Tally memory settle
                                    await Task.Delay(1500);
                                    current = rangeEnd.AddDays(1);
                                }
                            }
                            catch (Exception flowEx)
                            {
                                AddLog($"⚠️ Historical Voucher Sync Error: {flowEx.Message}");
                            }
                            AddLog($"📊 First sync complete: {totalVouchersFound} vouchers");
                        }
                        else
                        {
                            // ======= INCREMENTAL SYNC: ALTERID-BASED =======
                            // This catches ANY modification - even 6-month old entries!
                            AddLog($"🔄 Incremental sync (Checking ALTERID > {lastVoucherAlterId})");
                            SyncLogger.Log($"[INCREMENTAL] Fetching changes after AlterID: {lastVoucherAlterId}");
                            UpdateStatus(SyncState.Syncing, "Checking for modifications...");
                            
                            // Calculate total to sync first (for progress bar)
                            int totalToSync = 0;
                            List<Ledger> finalLedgers = new List<Ledger>();
                            List<Voucher> finalVouchers = new List<Voucher>();

                            // 1. Check Ledgers
                            if (lastLedgerAlterId > 0)
                            {
                                finalLedgers = await _tallyConnector!.GetModifiedLedgersAsync(company.Name, lastLedgerAlterId);
                                totalToSync += finalLedgers.Count;
                            }
                            
                            // 2. Check Vouchers
                            // FIX: Removed flag check to ensure modified vouchers always sync
                            try
                            {
                                finalVouchers = await _tallyConnector!.GetModifiedVouchersAsync(company.Name, lastVoucherAlterId, hsnCache);
                                totalToSync += finalVouchers.Count;
                            }
                            catch (Exception modVchEx)
                            {
                                AddLog($"⚠️ Failed to check modified vouchers: {modVchEx.Message}");
                                SyncLogger.Log($"[MOD-VOUCHER-FAIL] {modVchEx}");
                            }

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
                                 foreach (var l in finalLedgers) l.CompanyId = company.Id;
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
                                // First time for ledgers - full sync
                                await SyncDataTypeAsync("ledgers", async () => await _tallyConnector!.GetLedgersAsync(company.Name));
                            }
                            
                            // 2. Sync modified VOUCHERS
                            // Use 'finalVouchers' instead of 'modifiedVouchers'
                            if (finalVouchers.Count > 0)
                            {
                                // FIX: Use 'master_id' as unique key
                                 await UploadListAsync("vouchers", finalVouchers, "company_id,master_id");
                                 vouchersSynced += finalVouchers.Count;
                                 AddLog($"📝 Synced {finalVouchers.Count} modified vouchers");
                                 
                                 // Sync ledger transactions for modified vouchers
                                 var ledgerTxns = ExtractLedgerTransactions(finalVouchers, ledgerCache);
                                 if (ledgerTxns.Any())
                                 {
                                     await UploadListAsync("ledger_transactions", ledgerTxns, "company_id,ledger_name,voucher_id");
                                     AddLog($"   🏛 {ledgerTxns.Count} ledger entries synced");
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
                                
                                // FIX: Use Local Filtering instead of Re-Fetching from Tally
                                // Re-fetching with "Sales" filter fails for custom voucher types (e.g. "GST Invoice")
                                // We already have the modified vouchers in 'finalVouchers'. Just process them!
                                
                                // --- PROCESS SALES ---
                                var salesVouchers = finalVouchers.Where(v => v.VoucherType.Contains("Sales", StringComparison.OrdinalIgnoreCase)).ToList();
                                if (salesVouchers.Count > 0)
                                {
                                    AddLog($"   📊 Processing {salesVouchers.Count} Modified Sales...");
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
                                    salesSynced += sales.Count;
                                    
                                    var salesItems = sales.Where(s => s.Items != null).SelectMany(s => s.Items!).ToList();
                                    if (salesItems.Any()) 
                                    {
                                        await UploadListAsync("sales_items", salesItems, "id");
                                        AddLog($"   📦 {salesItems.Count} sales items synced");
                                    }
                                }

                                // --- PROCESS PURCHASES ---
                                var purchaseVouchers = finalVouchers.Where(v => v.VoucherType.Contains("Purchase", StringComparison.OrdinalIgnoreCase)).ToList();
                                if (purchaseVouchers.Count > 0)
                                {
                                    AddLog($"   🛒 Processing {purchaseVouchers.Count} Modified Purchases...");
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
                                    purchasesSynced += purchases.Count;
                                    
                                    var purchaseItems = purchases.Where(p => p.Items != null).SelectMany(p => p.Items!).ToList();
                                    if (purchaseItems.Any()) 
                                    {
                                        await UploadListAsync("purchase_items", purchaseItems, "id");
                                        AddLog($"   📦 {purchaseItems.Count} purchase items synced");
                                    }
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
                        // DELETE DETECTION (Lightweight MasterID Check)
                        // ===========================================
                        if (!isFirstSync) 
                        {
                            try 
                            {
                                UpdateStatus(SyncState.Syncing, "Performing lightweight delete detection...");
                                AddLog("🗑 Checking for deleted vouchers...");

                                // 1. Fetch ALL Master IDs from Tally (Fast)
                                var tallyIds = await _tallyConnector!.GetVoucherMasterIdsAsync(company.Name);
                                
                                if (tallyIds != null && tallyIds.Count > 0)
                                {
                                    // 2. Fetch ALL Master IDs from Cloud (Fast)
                                    var cloudIds = await _apiClient!.GetCloudVoucherMasterIdsAsync(company.Id);
                                    
                                    if (cloudIds.Count > 0)
                                    {
                                        // 3. Find IDs present in Cloud but missing in Tally
                                        // FIX: Use case-insensitive comparison for GUIDs/MasterIDs to prevent false positives
                                        var deletedIds = cloudIds.Except(tallyIds, StringComparer.OrdinalIgnoreCase).ToList();
                                        
                                        if (deletedIds.Count > 0)
                                        {
                                            AddLog($"🗑 Found {deletedIds.Count} deleted vouchers in Tally. Syncing deletion...");
                                            
                                            // 4. Soft Delete in Cloud
                                            int deletedCount = await _apiClient.MarkVouchersAsDeletedByMasterIdAsync(company.Id, deletedIds);
                                            AddLog($"✅ Successfully marked {deletedCount} vouchers as deleted.");
                                        }
                                        else
                                        {
                                            AddLog("✅ No deleted vouchers found.");
                                        }
                                    }
                                }
                            }
                            catch (Exception ex)
                            {
                                AddLog($"⚠️ Delete detection skipped: {ex.Message}");
                            }
                        }
                                    
                        /* Orphaned code removed */

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
                            
                            // NOTIFICATION SUCCESS
                            if (_notificationService != null)
                            {
                                int total = ledgersSynced + vouchersSynced + salesSynced + purchasesSynced + stockSynced;
                                string body = total > 0 
                                    ? $"Synced {total} records for {company.Name}" 
                                    : $"{company.Name} is up to date.";
                                    
                                await _notificationService.SendNotificationAsync("Sync Completed", body, fcmTokens);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        hasFatalError = true;
                        Console.WriteLine($"❌ Error processing company {company.Name}: {ex.Message}");
                        UpdateStatus(SyncState.Error, $"Failed: {company.Name}", ex.Message);
                        AddLog($"❌ SYNC CRASHED for {company.Name}: {ex.Message}");
                        SyncLogger.Log($"[CRASH] {ex}"); // Logs ex.ToString() which includes StackTrace
                        
                        // NOTIFICATION ERROR
                        if (_notificationService != null)
                        {
                            await _notificationService.SendNotificationAsync("Sync Failed", $"{company.Name}: {ex.Message}", fcmTokens);
                        }

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
                } // End of foreach

                // Final Status Update
                Status.LastSyncTime = DateTime.Now;
                Status.NextSyncTime = DateTime.Now.AddMinutes(_settings.SyncSettings.SyncIntervalMinutes);
                
                if (hasFatalError)
                {
                    UpdateStatus(SyncState.Error, "Sync finished with errors. Check logs.");
                }
                else
                {
                    string msg = Status.TotalRecords == 0 
                        ? "Sync completed. No changes found." 
                        : $"Sync completed! Processed {Status.TotalRecords} records.";
                    UpdateStatus(SyncState.Completed, msg);
                }

                // Cleanup old queue items
                await _offlineQueue!.CleanupAsync();
            }
            catch (Exception ex)
            {
                hasFatalError = true;
                Console.WriteLine($"Sync failed: {ex.Message}");
                UpdateStatus(SyncState.Error, "Sync failed", ex.Message);
            }
            finally
            {
                lock (_syncLock)
                {
                    _isSyncing = false;
                }
                overallStopwatch.Stop();
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
                // FIX: Removed dangerous skip logic for sales/purchases
                // Previously, failed sales/purchases were discarded. NOW we retry them.
                SyncLogger.Log($"🔄 Retrying queued item: {item.DataType} (ID: {item.Id})");


                try
                {
                    bool success = false;
                    
                    // FIX: Strong Typing to prevent Type Erasure for Vouchers
                    if (item.DataType.Contains("voucher"))
                    {
                        var data = JsonConvert.DeserializeObject<List<Voucher>>(item.JsonData);
                        if (data != null && data.Count > 0)
                        {
                            success = await ProcessTypedBatch(item, data, "company_id,master_id");
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

        private List<LedgerTransaction> ExtractLedgerTransactions(List<Voucher> vouchers, Dictionary<string, string> ledgerCache)
        {
            var txns = new List<LedgerTransaction>();
            foreach (var v in vouchers)
            {
                if (v.LedgerEntries == null) continue;

                for (int i = 0; i < v.LedgerEntries.Count; i++)
                {
                    var entry = v.LedgerEntries[i];
                    
                    // Resolve Ledger ID from Name
                    ledgerCache.TryGetValue(entry.LedgerName, out string? resolvedLedgerId);

                    txns.Add(new LedgerTransaction
                    {
                        // FIX #1: Surgical PK generation
                        Id = $"{v.CompanyId}*{entry.LedgerName}*{v.VoucherId}", 
                        CompanyId = v.CompanyId,
                        LedgerId = resolvedLedgerId,
                        LedgerName = entry.LedgerName,
                        VoucherId = v.VoucherId,
                        MasterId = v.MasterId,
                        VoucherDate = v.VoucherDate,
                        VoucherType = v.VoucherType,
                        VoucherNumber = v.VoucherNumber,
                        Narration = v.Narration,
                        // FIX #2: Correct Accounting signs (Always ABS, direction follows columns)
                        Debit = entry.IsDebit ? Math.Abs(entry.Amount) : 0,
                        Credit = !entry.IsDebit ? Math.Abs(entry.Amount) : 0,
                        Amount = entry.IsDebit ? Math.Abs(entry.Amount) : -Math.Abs(entry.Amount),
                        IsDebit = entry.IsDebit
                    });
                }
            }
            return txns;
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
                                          $"Created from LiveKeeping App";

                        AddLog($"   → {transaction.TransactionType}: {partyLedger} ₹{amount:N0}");

                        // Push to Tally
                        var (success, voucherNumber, error) = await _tallyConnector.PushVoucherToTallyAsync(
                            company.Name,
                            transaction.TransactionType,
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
        /// Purge all company data (Reset)
        /// </summary>
        public async Task PurgeCompanyDataAsync()
        {
            if (CurrentCompany == null || _apiClient == null) return;
            
            UpdateStatus(SyncState.Syncing, "Resetting Cloud Data...", "Purge");
            AddLog("🗑️ Starting Full Data Reset...");
            
            var result = await _apiClient.PurgeCompanyDataAsync(CurrentCompany.Id);
            
            if (result.Success)
            {
                AddLog("✅ Data Reset Successful.");
                // Clear offline queue too
                await _offlineQueue!.ClearQueueAsync(CurrentCompany.Id);
                AddLog("✅ Offline Queue Cleared.");
                UpdateStatus(SyncState.Idle, "Data Reset Complete");
                
                
                // Force resync on next run
                 // We should probably reset metadata locally or just let the next sync handle it
            }
            else
            {
                AddLog($"❌ Data Reset Failed: {result.Error}");
                UpdateStatus(SyncState.Error, "Reset Failed", result.Error);
            }
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

