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

            // Use Supabase URL and Key from AuthSettings
            string supabaseUrl = _settings.AuthSettings.SupabaseUrl;
            string supabaseKey = _settings.AuthSettings.SupabaseAnonKey;

            // Fallback to known values if empty (safety net)
            if (string.IsNullOrEmpty(supabaseUrl)) supabaseUrl = "https://lcsehcwocqvxrrgbmhcz.supabase.co";
            if (string.IsNullOrEmpty(supabaseKey)) supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxjc2VoY3dvY3F2eHJyZ2JtaGN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMDg4NTEsImV4cCI6MjA4NDg4NDg1MX0.NcPhO9plyRhijUd4YZlJR2Of_sGBFRKb1HvGDgCMjt4";

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
        /// Manual sync trigger
        /// </summary>
        public async Task RunManualSyncAsync()
        {
            await RunSyncAsync(isManual: true);
        }

        /// <summary>
        /// Main sync operation
        /// </summary>
        private async Task RunSyncAsync(bool isManual = false)
        {
            if (_isSyncing)
            {
                Console.WriteLine("Sync already in progress, skipping...");
                return;
            }

            _isSyncing = true;
            var overallStopwatch = Stopwatch.StartNew();

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
                
                if (companies.Count == 0)
                {
                    UpdateStatus(SyncState.Idle, "No open companies found in Tally");
                    return;
                }

                Status.TotalRecords = 0;
                Status.ProcessedRecords = 0;

                // Safety: Clear old queue on first run to avoid stuck loops
                if (_isFirstRun) 
                {
                    await _offlineQueue!.ClearQueueAsync();
                    _isFirstRun = false;
                }

                foreach (var company in companies)
                {
                    try
                    {
                        SyncLogger.Log($"--- Starting Sync for {company.Name} ---");
                        CurrentCompany = company;
                        UpdateStatus(SyncState.Syncing, $"Processing: {company.Name}");

                        // Sync company info first
                        if (serverOk)
                        {
                            // Inject OwnerId for RLS
                            if (!string.IsNullOrEmpty(App.AuthService?.CurrentSession?.UserId))
                            {
                                CurrentCompany.OwnerId = App.AuthService.CurrentSession.UserId;
                            }
                            
                            var compResult = await _apiClient!.SyncCompanyAsync(CurrentCompany);
                            if (!compResult.Success) 
                            {
                                Console.WriteLine($"⚠️ Company sync warning: {compResult.Error}");
                            }
                        }

                        // Get counts for THIS company
                        var counts = await _tallyConnector.GetRecordCountsAsync(company.Name);
                        var companyTotal = counts.Values.Sum();
                        Status.TotalRecords += companyTotal;
                        
                        // Show breakdown to user
                        string breakdown = string.Join(", ", counts.Where(c => c.Value > 0).Select(c => $"{c.Value} {c.Key}"));
                        UpdateStatus(SyncState.FetchingData, $"Found: {breakdown}", company.Name);
                        await Task.Delay(1000); // Give user a moment to see the counts
                        
                        // Process queue for this company
                        await ProcessQueueAsync();

                        // Sync each data type for THIS company
                        // Sync reference data first
                        await SyncDataTypeAsync("ledgers", async () => await _tallyConnector!.GetLedgersAsync(company.Name));
                        await SyncDataTypeAsync("stock", async () => await _tallyConnector!.GetStockItemsAsync(company.Name));
                        
                        // --- PRODUCTION INCREMENTAL SYNC ---
                        // Monthly chunks ensure we capture all vouchers (accounting isn't daily)
                        
                        // CRITICAL: Company books start date
                        DateTime booksStart = new DateTime(2024, 4, 1);
                        
                        // Start from books start for full sync, buffer applied
                        DateTime fromDate = booksStart;
                        DateTime toDate = DateTime.Today;

                        int totalMonths = ((toDate.Year - fromDate.Year) * 12) + toDate.Month - fromDate.Month + 1;
                        UpdateStatus(SyncState.Syncing, $"Voucher Sync: {fromDate:MMM yyyy} to {toDate:MMM yyyy} ({totalMonths} months)");
                        AddLog($"🔄 Voucher sync: {fromDate:dd-MMM-yy} → {toDate:dd-MMM-yy}");

                        DateTime current = fromDate;
                        bool allChunksSuccessful = true;
                        int totalVouchersFound = 0;

                        while (current < toDate)
                        {
                            // DAILY chunks to prevent Tally crashes (Out of Memory)
                            // Detailed export is heavy!
                            DateTime next = current.AddDays(1); 
                            if (next > toDate) next = toDate;
                            
                            string rangeDisplay = $"{current:dd-MMM-yyyy}";
                            UpdateStatus(SyncState.FetchingData, $"Fetching: {rangeDisplay}", "vouchers");

                            try 
                            {
                                // Fetch ALL vouchers for this month
                                var vouchers = await _tallyConnector!.GetVouchersAsync(current, next, company.Name);
                                
                                if (vouchers != null && vouchers.Count > 0)
                                {
                                    totalVouchersFound += vouchers.Count;
                                    // Upload to Supabase using UPSERT on 'voucher_id'
                                    await UploadListAsync("vouchers", vouchers, "voucher_id");
                                    
                                    // Also sync Sales and Purchases specifically for the Invoices feature
                                    var sales = vouchers.Where(v => v.VoucherType.Equals("Sales", StringComparison.OrdinalIgnoreCase)).ToList();
                                    if (sales.Count > 0) await UploadListAsync("sales", sales, "id");

                                    var purchases = vouchers.Where(v => v.VoucherType.Equals("Purchase", StringComparison.OrdinalIgnoreCase)).ToList();
                                    if (purchases.Count > 0) await UploadListAsync("purchases", purchases, "id");

                                    AddLog($"✅ {rangeDisplay}: {vouchers.Count} vouchers synced (Sales: {sales.Count}, Purchases: {purchases.Count})");
                                }
                                else
                                {
                                    AddLog($"📅 {rangeDisplay}: No vouchers");
                                }
                            } 
                            catch (Exception ex) 
                            {
                                allChunksSuccessful = false;
                                string errorMsg = $"❌ {rangeDisplay} failed: {ex.Message}";
                                Console.WriteLine(errorMsg);
                                AddLog(errorMsg);
                                // Continue to next month even if one fails
                            }

                            // 2s delay between months - gives Tally breathing room
                            await Task.Delay(2000);
                            current = next;
                        }

                        AddLog($"📊 Total vouchers synced: {totalVouchersFound}");

                        // Update metadata after successful sync
                        if (allChunksSuccessful && totalVouchersFound > 0)
                        {
                            // await _apiClient.SetMetadataAsync(company.Id, "last_vch_sync_date", toDate.ToString("yyyy-MM-dd"));
                            AddLog($"✨ Sync completed: {totalVouchersFound} vouchers up to {toDate:dd-MMM-yy}");
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"❌ Error processing company {company.Name}: {ex.Message}");
                        UpdateStatus(SyncState.Error, $"Failed: {company.Name}", ex.Message);
                    }
                }

                // Update final status
                Status.LastSyncTime = DateTime.Now;
                Status.NextSyncTime = DateTime.Now.AddMinutes(_settings.SyncSettings.SyncIntervalMinutes);
                UpdateStatus(SyncState.Completed, $"Sync completed: {Status.TotalRecords} records from {companies.Count} companies.");

                // Cleanup old queue items
                await _offlineQueue!.CleanupAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Sync failed: {ex.Message}");
                UpdateStatus(SyncState.Error, "Sync failed", ex.Message);
            }
            finally
            {
                _isSyncing = false;
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
                try
                {
                    bool success = false;
                    
                    // FIX: Strong Typing to prevent Type Erasure for Vouchers
                    if (item.DataType.Contains("voucher"))
                    {
                        var data = JsonConvert.DeserializeObject<List<Voucher>>(item.JsonData);
                        if (data != null && data.Count > 0)
                        {
                            success = await ProcessTypedBatch(item, data, "voucher_id");
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
