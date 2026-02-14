using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using TallySyncApp.Models;

namespace TallySyncApp.Services
{
    /// <summary>
    /// ApiClient - Handles communication directly with Supabase via REST API (PostgREST)
    /// Uploads data to the cloud database
    /// </summary>
    public class ApiClient : IDisposable
    {
        private readonly HttpClient _httpClient;
        private readonly string _supabaseUrl;
        private readonly string _apiKey; // Anon Key
        private string? _userToken; // Bearer Token for Auth
        private readonly string _telegramBotToken;

        public ApiClient(string supabaseUrl, string apiKey, int timeoutSeconds = 60, string telegramBotToken = "")
        {
            _supabaseUrl = supabaseUrl.TrimEnd('/');
            _apiKey = apiKey;
            _telegramBotToken = telegramBotToken;

            // FIX: Disable proxy to avoid intermittent DNS/connection issues (WSANO_DATA)
            var handler = new HttpClientHandler
            {
                UseProxy = false,
                AllowAutoRedirect = true
            };

            _httpClient = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(timeoutSeconds)
            };
            
            // Default headers for all requests
            _httpClient.DefaultRequestHeaders.Add("apikey", _apiKey);
            _httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        }

        public void SetUserToken(string token)
        {
            _userToken = token;
        }

        private void AddAuthHeader()
        {
            // Always prefer User Token if available (for RLS), otherwise Anon Key
            if (!string.IsNullOrEmpty(_userToken))
            {
                _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _userToken);
            }
            else
            {
                _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
            }
        }

        /// <summary>
        /// Test connection to Supabase
        /// </summary>
        public async Task<(bool Success, string? Message)> TestConnectionAsync()
        {
            string url = $"{_supabaseUrl}/rest/v1/companies?select=count&limit=0";
            try
            {
                AddAuthHeader();
                // Simple health check: Try to fetch count of companies (limit 0)
                // This validates URL and Key
                var request = new HttpRequestMessage(HttpMethod.Get, url);
                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    return (true, "Connected to Supabase successfully");
                }
                return (false, $"Supabase error: {response.StatusCode} ({url})");
            }
            catch (Exception ex)
            {
                return (false, $"Connection error to {url}: {ex.Message}");
            }
        }

        /// <summary>
        /// Sync company information
        /// </summary>
        public async Task<ApiResponse<object>> SyncCompanyAsync(Company company)
        {
            // ACTUAL SUPABASE SCHEMA: id UUID, name TEXT (UNIQUE), gstin, address, phone, email
            // Generate deterministic UUID from Tally company name/id
            string companyUuid;
            if (Guid.TryParse(company.Id, out var existingGuid))
            {
                companyUuid = existingGuid.ToString();
            }
            else
            {
                // Generate deterministic UUID from company ID or name
                companyUuid = GenerateDeterministicGuid(company.Id ?? company.Name).ToString();
            }

            var companyData = new Dictionary<string, object?>
            {
                ["id"] = companyUuid,
                ["name"] = company.Name,
                ["gstin"] = company.Gstin,
                ["address"] = company.Address,
                ["state"] = company.State,
                ["phone"] = company.Phone,
                ["email"] = company.Email
            };

            // Store the UUID back for other operations
            company.Id = companyUuid;

            return await UpsertAsync<object>("companies", new List<Dictionary<string, object?>> { companyData }, "id");
        }

        /// <summary>
        /// Sync a batch of data
        /// </summary>
        /// <summary>
        /// Sync a batch of data
        /// </summary>
        public async Task<ApiResponse<SyncResultDetails>> SyncDataAsync<T>(
            string companyId, 
            string dataType, 
            List<T> data, 
            string onConflict = "id")
        {
            // Map dataType to table name
            string tableName = dataType.ToLower();
            
            // These new master data tables use exact table names - check them FIRST
            var exactTableNames = new HashSet<string> {
                "ledger_groups", "cost_centres", "godowns", "stock_groups", "stock_categories",
                "currencies", "voucher_types", "units", "budgets", "budget_allocations",
                "bank_allocations", "bill_allocations", "gst_details", "price_lists", 
                "debit_credit_notes", "sales", "sales_items", "purchases", "purchase_items",
                "voucher_ledger_entries", "voucher_stock_entries"
            };
            
            if (!exactTableNames.Contains(tableName))
            {
                // Legacy mapping for old data types
                if (tableName.Contains("vouchers")) tableName = "vouchers";
                else if (tableName.Contains("ledgers")) tableName = "ledgers";
                else if (tableName.Contains("stock")) tableName = "stock_items";
            }
            
            // Convert company_id to UUID if it's a string name
            string companyUuid;
            if (Guid.TryParse(companyId, out var existingGuid))
            {
                companyUuid = existingGuid.ToString();
            }
            else
            {
                // Generate deterministic UUID from company name/id string
                companyUuid = GenerateDeterministicGuid(companyId).ToString();
            }

            // Explicit Log for Debugging
            SyncLogger.Log($"API CALL → table={tableName}, on_conflict={onConflict}, items={data.Count}");

            // Assign company_id and convert to dictionary for Supabase
            var itemsWithCompanyId = new List<Dictionary<string, object>>();
            foreach (var item in data)
            {
                var json = JsonConvert.SerializeObject(item);
                var dict = JsonConvert.DeserializeObject<Dictionary<string, object>>(json);
                if (dict != null)
                {
                    dict["company_id"] = companyUuid;
                    
                    // =============================================
                    // VOUCHERS TABLE MAPPING
                    // Schema: id, company_id, voucher_number, voucher_type, voucher_date, party_name, 
                    //         party_ledger_id, narration, total_amount, grand_total, master_id, alter_id
                    // =============================================
                    if (tableName == "vouchers")
                    {
                        // Keep voucher_date as-is (correct column name)
                        // Keep total_amount as-is (correct column name)
                        // Keep party_name as-is (correct column name)
                        
                        // Remove nested data - will be synced separately to voucher_ledger_entries/voucher_stock_entries
                        dict.Remove("ledger_entries");
                        dict.Remove("inventory_entries");
                        
                        // Generate deterministic UUID from voucher_id string
                        // This allows upsert to work correctly while maintaining UUID type in Supabase
                        if (dict.ContainsKey("voucher_id"))
                        {
                            string voucherId = dict["voucher_id"]?.ToString() ?? Guid.NewGuid().ToString();
                            dict["id"] = GenerateDeterministicGuid(voucherId).ToString();
                        }
                        dict.Remove("voucher_id"); // Remove the string version
                    }
                    // =============================================
                    // LEDGERS TABLE MAPPING
                    // Schema: id, company_id, name, parent, ledger_type, opening_balance, current_balance,
                    //         gstin, email, phone, pan, master_id, alter_id
                    // =============================================
                    else if (tableName == "ledgers")
                    {
                        // Map parent_group -> parent (C# model uses ParentGroup, table uses parent)
                        if (dict.ContainsKey("parent_group"))
                        {
                            dict["parent"] = dict["parent_group"];
                            dict.Remove("parent_group");
                        }
                        
                        // Map ledger_group -> ledger_type
                        if (dict.ContainsKey("ledger_group"))
                        {
                            dict["ledger_type"] = dict["ledger_group"];
                            dict.Remove("ledger_group");
                        }
                        
                        // Map closing_balance -> current_balance
                        if (dict.ContainsKey("closing_balance"))
                        {
                            dict["current_balance"] = dict["closing_balance"];
                            dict.Remove("closing_balance");
                        }
                        
                        // Ensure ID is a valid UUID (Tally GUIDs may not be valid UUIDs)
                        if (dict.ContainsKey("id"))
                        {
                            string ledgerId = dict["id"]?.ToString() ?? Guid.NewGuid().ToString();
                            // If it's not a valid UUID, generate deterministic one
                            if (!Guid.TryParse(ledgerId, out _))
                            {
                                dict["id"] = GenerateDeterministicGuid(ledgerId).ToString();
                            }
                        }
                        
                        // Remove unsupported columns
                        dict.Remove("alias");
                        dict.Remove("credit_period");
                        dict.Remove("credit_limit");
                        // NOTE: address column now exists in ledgers table - DO NOT REMOVE
                    }
                    // =============================================
                    // STOCK ITEMS TABLE MAPPING
                    // Schema: id, company_id, name, unit, opening_stock, current_stock, rate,
                    //         master_id, alter_id, stock_group, hsn_code, gst_rate
                    // =============================================
                    else if (tableName == "stock_items")
                    {
                        // Map base_unit -> unit
                        if (dict.ContainsKey("base_unit"))
                        {
                            dict["unit"] = dict["base_unit"];
                            dict.Remove("base_unit");
                        }
                        
                        // Map opening_balance -> opening_stock
                        if (dict.ContainsKey("opening_balance"))
                        {
                            dict["opening_stock"] = dict["opening_balance"];
                            dict.Remove("opening_balance");
                        }
                        
                        // Map closing_balance -> current_stock
                        if (dict.ContainsKey("closing_balance"))
                        {
                            dict["current_stock"] = dict["closing_balance"];
                            dict.Remove("closing_balance");
                        }
                        
                        // Keep: stock_group, hsn_code, gst_rate (already match schema)
                        // Note: hsn_code uses snake_case which matches both model and DB
                        // Keep: opening_value, closing_value (stock valuation amounts)
                        
                        // Ensure ID is a valid UUID (Tally GUIDs may not be valid UUIDs)
                        if (dict.ContainsKey("id"))
                        {
                            string stockId = dict["id"]?.ToString() ?? Guid.NewGuid().ToString();
                            // If it's not a valid UUID, generate deterministic one
                            if (!Guid.TryParse(stockId, out _))
                            {
                                dict["id"] = GenerateDeterministicGuid(stockId).ToString();
                            }
                        }
                        
                        // Remove unsupported columns (but keep opening_value, closing_value!)
                        dict.Remove("alias");
                        dict.Remove("stock_category");
                        dict.Remove("inward_quantity");
                        dict.Remove("inward_value");
                        dict.Remove("outward_quantity");
                        dict.Remove("outward_value");
                    }
                    // =============================================
                    // NEW MASTER DATA TABLES
                    // These use UPSERT on (company_id, name) composite key
                    // ID is auto-generated by Supabase via gen_random_uuid()
                    // =============================================
                    else if (exactTableNames.Contains(tableName))
                    {
                        // For master data tables, ensure ID is a valid UUID or let Supabase generate it
                        if (dict.ContainsKey("id"))
                        {
                            string itemId = dict["id"]?.ToString() ?? "";
                            if (!Guid.TryParse(itemId, out _))
                            {
                                // Generate deterministic UUID from the non-UUID ID string
                                dict["id"] = GenerateDeterministicGuid(itemId).ToString();
                            }
                        }
                        
                        // For voucher-linked tables, convert voucher_id to UUID
                        if (dict.ContainsKey("voucher_id"))
                        {
                            string vId = dict["voucher_id"]?.ToString() ?? "";
                            if (!string.IsNullOrEmpty(vId) && !Guid.TryParse(vId, out _))
                            {
                                dict["voucher_id"] = GenerateDeterministicGuid(vId).ToString();
                            }
                        }
                    }
                    
                    itemsWithCompanyId.Add(dict);
                }
            }

            // Perform Upsert
            var result = await UpsertAsync<object>(tableName, itemsWithCompanyId, onConflict);
            
            return new ApiResponse<SyncResultDetails>
            {
                Success = result.Success,
                Message = result.Message,
                Error = result.Error,
                Details = new SyncResultDetails
                {
                    Total = data.Count,
                    Success = result.Success,
                    Count = result.Success ? data.Count : 0,
                    Failed = result.Success ? 0 : data.Count
                }
            };
        }

        /// <summary>
        /// Sync voucher line items (ledger entries and stock/inventory entries) to their respective tables
        /// </summary>
        public async Task<(int LedgerEntriesSynced, int StockEntriesSynced)> SyncVoucherEntriesAsync(
            string companyId, 
            List<Voucher> vouchers)
        {
            int ledgerEntriesSynced = 0;
            int stockEntriesSynced = 0;
            
            try
            {
                // Convert company_id to UUID if it's a string name
                string companyUuid;
                if (Guid.TryParse(companyId, out var existingGuid))
                {
                    companyUuid = existingGuid.ToString();
                }
                else
                {
                    companyUuid = GenerateDeterministicGuid(companyId).ToString();
                }

                // 1. Extract and sync Ledger Entries to voucher_ledger_entries
                var allLedgerEntries = new List<Dictionary<string, object>>();
                foreach (var voucher in vouchers)
                {
                    if (voucher.LedgerEntries != null && voucher.LedgerEntries.Count > 0)
                    {
                        int ledgerIdx = 0;
                        foreach (var entry in voucher.LedgerEntries)
                        {
                            // Generate deterministic ID from voucher+ledger+index for uniqueness
                            string entryKey = $"{voucher.VoucherId}|ledger|{entry.LedgerName}|{ledgerIdx}";
                            allLedgerEntries.Add(new Dictionary<string, object>
                            {
                                ["id"] = GenerateDeterministicGuid(entryKey).ToString(),
                                ["company_id"] = companyUuid,
                                ["voucher_id"] = GenerateDeterministicGuid(voucher.VoucherId).ToString(),
                                ["ledger_name"] = entry.LedgerName ?? "",
                                ["amount"] = entry.Amount,
                                ["is_debit"] = entry.IsDebit
                            });
                            ledgerIdx++;
                        }
                    }
                }
                
                if (allLedgerEntries.Count > 0)
                {
                    SyncLogger.Log($"📝 Syncing {allLedgerEntries.Count} voucher ledger entries...");
                    var ledgerResult = await UpsertAsync<object>("voucher_ledger_entries", allLedgerEntries, "id");
                    if (ledgerResult.Success) ledgerEntriesSynced = allLedgerEntries.Count;
                    else SyncLogger.Log($"⚠️ Ledger entries sync failed: {ledgerResult.Error}");
                }
                
                // 2. Extract and sync Inventory/Stock Entries to voucher_stock_entries
                var allStockEntries = new List<Dictionary<string, object>>();
                foreach (var voucher in vouchers)
                {
                    if (voucher.InventoryEntries != null && voucher.InventoryEntries.Count > 0)
                    {
                        int stockIdx = 0;
                        foreach (var entry in voucher.InventoryEntries)
                        {
                            bool isInward = voucher.VoucherType.Contains("Purchase", StringComparison.OrdinalIgnoreCase);
                            
                            // Generate deterministic ID from voucher+item+index for uniqueness
                            string entryKey = $"{voucher.VoucherId}|stock|{entry.StockItemName}|{stockIdx}";
                            allStockEntries.Add(new Dictionary<string, object>
                            {
                                ["id"] = GenerateDeterministicGuid(entryKey).ToString(),
                                ["company_id"] = companyUuid,
                                ["voucher_id"] = GenerateDeterministicGuid(voucher.VoucherId).ToString(),
                                ["stock_item_name"] = entry.StockItemName ?? "",
                                ["quantity"] = entry.Quantity,
                                ["rate"] = entry.Rate,
                                ["amount"] = entry.Amount,
                                ["unit"] = entry.Unit ?? "",
                                ["hsn_code"] = entry.HsnCode ?? "",
                                ["is_inward"] = isInward,
                                ["discount_percent"] = entry.DiscountPercent,
                                ["tax_rate"] = entry.TaxRate ?? 0m
                            });
                            stockIdx++;
                        }
                    }
                }
                
                if (allStockEntries.Count > 0)
                {
                    SyncLogger.Log($"📦 Syncing {allStockEntries.Count} voucher stock entries...");
                    var stockResult = await UpsertAsync<object>("voucher_stock_entries", allStockEntries, "id");
                    if (stockResult.Success) stockEntriesSynced = allStockEntries.Count;
                    else SyncLogger.Log($"⚠️ Stock entries sync failed: {stockResult.Error}");
                }
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"❌ SyncVoucherEntriesAsync error: {ex.Message}");
            }
            
            return (ledgerEntriesSynced, stockEntriesSynced);
        }

        /// <summary>
        /// Get all application settings from app_settings table
        /// </summary>
        public async Task<Dictionary<string, string>> GetAppSettingsAsync()
        {
            try
            {
                AddAuthHeader();
                var url = $"{_supabaseUrl}/rest/v1/app_settings?select=key,value";
                var response = await _httpClient.GetStringAsync(url);
                var items = JsonConvert.DeserializeObject<List<Dictionary<string, string>>>(response);
                
                var settings = new Dictionary<string, string>();
                if (items != null)
                {
                    foreach (var item in items)
                    {
                        if (item.ContainsKey("key") && item.ContainsKey("value"))
                        {
                            settings[item["key"]] = item["value"];
                        }
                    }
                }
                return settings;
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ GetAppSettingsAsync error: {ex.Message}");
                return new Dictionary<string, string>();
            }
        }

        /// <summary>
        /// Get metadata value from Supabase
        /// </summary>
        public async Task<string?> GetMetadataAsync(string companyId, string key)
        {
            try
            {
                AddAuthHeader();
                var url = $"{_supabaseUrl}/rest/v1/sync_metadata?company_id=eq.{companyId}&sync_key=eq.{key}&select=sync_value";
                var response = await _httpClient.GetStringAsync(url);
                var items = JsonConvert.DeserializeObject<List<Dictionary<string, string>>>(response);
                return items != null && items.Count > 0 ? items[0]["sync_value"] : null;
            }
            catch { return null; }
        }

        /// <summary>
        /// Set metadata value in Supabase
        /// </summary>
        public async Task SetMetadataAsync(string companyId, string key, string value)
        {
            try
            {
                var payload = new { company_id = companyId, sync_key = key, sync_value = value };
                await UpsertAsync<object>("sync_metadata", payload, "company_id,sync_key");
            }
            catch { }
        }

        /// <summary>
        /// Get maximum ALTERID from a table for incremental sync
        /// This allows us to fetch only records modified after last sync
        /// </summary>
        public async Task<long> GetMaxAlterIdAsync(string companyId, string tableName)
        {
            try
            {
                AddAuthHeader();
                // Query to get MAX(alter_id) for a company - MUST exclude NULLs explicitly
                var url = $"{_supabaseUrl}/rest/v1/{tableName}?company_id=eq.{companyId}&alter_id=not.is.null&select=alter_id&order=alter_id.desc&limit=1";
                var response = await _httpClient.GetStringAsync(url);
                
                SyncLogger.Log($"[DEBUG] GetMaxAlterIdAsync for {tableName}: Response = {response}");
                
                var items = JsonConvert.DeserializeObject<List<Dictionary<string, object>>>(response);
                if (items != null && items.Count > 0 && items[0].ContainsKey("alter_id"))
                {
                    var alterIdValue = items[0]["alter_id"];
                    if (alterIdValue != null)
                    {
                        // Trim spaces before parsing (Tally sometimes adds leading spaces)
                        string alterIdStr = alterIdValue.ToString()?.Trim() ?? "";
                        if (long.TryParse(alterIdStr, out long alterId))
                        {
                            SyncLogger.Log($"[DEBUG] {tableName} max alter_id = {alterId}");
                            return alterId;
                        }
                    }
                }
                SyncLogger.Log($"[DEBUG] {tableName} max alter_id = 0 (no data or null found)");
                return 0; // No records yet, start from beginning
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ GetMaxAlterIdAsync error: {ex.Message}");
                return 0;
            }
        }

        /// <summary>
        /// Get sync state for incremental sync
        /// </summary>
        public async Task<SyncStateInfo?> GetSyncStateAsync(string companyId, string dataType)
        {
            try
            {
                AddAuthHeader();
                // Fetch from sync_state table
                var request = new HttpRequestMessage(HttpMethod.Get, $"{_supabaseUrl}/rest/v1/sync_state?company_id=eq.{companyId}&data_type=eq.{dataType}&select=last_sync_at,last_alter_id,is_initial_sync_complete");
                var response = await _httpClient.SendAsync(request);
                
                if (!response.IsSuccessStatusCode) return null;

                var content = await response.Content.ReadAsStringAsync();
                var states = JsonConvert.DeserializeObject<List<SyncStateInfo>>(content); // Returns array
                return states != null && states.Count > 0 ? states[0] : null;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Generic Upsert to Supabase
        /// </summary>
        private async Task<ApiResponse<T>> UpsertAsync<T>(string table, object payload, string onConflict = "id")
        {
            try
            {
                AddAuthHeader();

                var json = JsonConvert.SerializeObject(payload, new JsonSerializerSettings
                {
                    NullValueHandling = NullValueHandling.Ignore,
                    DateFormatString = "yyyy-MM-dd"
                });

                var content = new StringContent(json, Encoding.UTF8, "application/json");
                
                // Header for Upsert (Merge)
                content.Headers.Add("Prefer", "resolution=merge-duplicates,return=minimal");

                // PostgREST needs ?on_conflict=column_name for upsert to work correctly on non-primary-key unique constraints
                string url = $"{_supabaseUrl}/rest/v1/{table}?on_conflict={onConflict}";
                
                // DEBUG: Print JSON for Vouchers to catch data issues
                if (table == "vouchers") 
                {
                    SyncLogger.Log($"DEBUG UPLOAD VOUCHERS: {json}");
                }
                
                // DEBUG: Print JSON for Companies to catch registration issues
                if (table == "companies") 
                {
                    SyncLogger.Log($"DEBUG UPLOAD COMPANY: {json}");
                }

                var response = await _httpClient.PostAsync(url, content);
                
                if (!response.IsSuccessStatusCode)
                {
                    var responseContent = await response.Content.ReadAsStringAsync();
                    return new ApiResponse<T>
                    {
                        Success = false,
                        Error = $"Supabase HTTP {(int)response.StatusCode}: {responseContent}"
                    };
                }

                return new ApiResponse<T> { Success = true, Message = "Sync successful" };
            }
            catch (Exception ex)
            {
                return new ApiResponse<T>
                {
                    Success = false,
                    Error = $"Request failed: {ex.Message}"
                };
            }
        }

        // ============================================
        // TWO-WAY SYNC: Cloud -> Tally
        // ============================================

        /// <summary>
        /// Get pending transactions from cloud that need to be pushed to Tally
        /// </summary>
        public async Task<List<PendingTransaction>> GetPendingTransactionsAsync(string companyId)
        {
            try
            {
                AddAuthHeader();
                var url = $"{_supabaseUrl}/rest/v1/pending_transactions?company_id=eq.{companyId}&status=eq.pending&order=created_at.asc";
                var response = await _httpClient.GetStringAsync(url);
                
                var transactions = JsonConvert.DeserializeObject<List<PendingTransaction>>(response);
                return transactions ?? new List<PendingTransaction>();
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ GetPendingTransactionsAsync error: {ex.Message}");
                return new List<PendingTransaction>();
            }
        }

        /// <summary>
        /// Update pending transaction status after Tally sync attempt
        /// </summary>
        public async Task<bool> UpdatePendingTransactionStatusAsync(string transactionId, string status, string? tallyVoucherNumber = null, string? errorMessage = null)
        {
            try
            {
                AddAuthHeader();
                
                var updates = new Dictionary<string, object?>
                {
                    { "status", status }
                };
                
                if (!string.IsNullOrEmpty(tallyVoucherNumber))
                {
                    updates["tally_voucher_number"] = tallyVoucherNumber;
                    updates["synced_at"] = DateTime.UtcNow.ToString("o");
                }
                
                if (!string.IsNullOrEmpty(errorMessage))
                {
                    updates["error_message"] = errorMessage;
                }
                
                var json = JsonConvert.SerializeObject(updates);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                
                var url = $"{_supabaseUrl}/rest/v1/pending_transactions?id=eq.{transactionId}";
                
                var request = new HttpRequestMessage(HttpMethod.Patch, url)
                {
                    Content = content
                };
                
                var response = await _httpClient.SendAsync(request);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ UpdatePendingTransactionStatusAsync error: {ex.Message}");
                return false;
            }
        }

        // ============================================
        // VOUCHER DELETE DETECTION
        // ============================================

        /// <summary>
        /// Get all voucher IDs from cloud for a company
        /// </summary>
        public async Task<List<string>> GetCloudVoucherIdsAsync(string companyId)
        {
            try
            {
                AddAuthHeader();
                
                var url = $"{_supabaseUrl}/rest/v1/vouchers?company_id=eq.{companyId}&select=voucher_id";
                var response = await _httpClient.GetAsync(url);
                
                if (response.IsSuccessStatusCode)
                {
                    var content = await response.Content.ReadAsStringAsync();
                    var items = JsonConvert.DeserializeObject<List<Dictionary<string, object>>>(content);
                    return items?.Select(i => i["voucher_id"]?.ToString() ?? "").Where(id => !string.IsNullOrEmpty(id)).ToList() ?? new List<string>();
                }
                return new List<string>();
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ GetCloudVoucherIdsAsync error: {ex.Message}");
                return new List<string>();
            }
        }

        /// <summary>
        /// Mark vouchers as deleted (soft delete)
        /// </summary>
        public async Task<int> MarkVouchersAsDeletedAsync(string companyId, List<string> voucherIds)
        {
            if (voucherIds.Count == 0) return 0;

            try
            {
                AddAuthHeader();
                
                int deleted = 0;
                
                // Process in batches of 100
                foreach (var batch in voucherIds.Chunk(100))
                {
                    var idsParam = string.Join(",", batch.Select(id => $"\"{id}\""));
                    var url = $"{_supabaseUrl}/rest/v1/vouchers?company_id=eq.{companyId}&voucher_id=in.({idsParam})";
                    
                    var updates = new { is_deleted = true, deleted_at = DateTime.UtcNow.ToString("o") };
                    var json = JsonConvert.SerializeObject(updates);
                    var content = new StringContent(json, Encoding.UTF8, "application/json");
                    
                    var request = new HttpRequestMessage(HttpMethod.Patch, url) { Content = content };
                    var response = await _httpClient.SendAsync(request);
                    
                    if (response.IsSuccessStatusCode)
                    {
                        deleted += batch.Length;
                    }
                }
                
                return deleted;
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ MarkVouchersAsDeletedAsync error: {ex.Message}");
                return 0;
            }
        }

        /// <summary>
        /// Hard delete vouchers from cloud
        /// </summary>
        public async Task<int> DeleteVouchersAsync(string companyId, List<string> voucherIds)
        {
            if (voucherIds.Count == 0) return 0;

            try
            {
                AddAuthHeader();
                
                int deleted = 0;
                
                // Process in batches of 100
                foreach (var batch in voucherIds.Chunk(100))
                {
                    var idsParam = string.Join(",", batch.Select(id => $"\"{id}\""));
                    var url = $"{_supabaseUrl}/rest/v1/vouchers?company_id=eq.{companyId}&voucher_id=in.({idsParam})";
                    
                    var request = new HttpRequestMessage(HttpMethod.Delete, url);
                    var response = await _httpClient.SendAsync(request);
                    
                    if (response.IsSuccessStatusCode)
                    {
                        deleted += batch.Length;
                    }
                }
                
                return deleted;
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ DeleteVouchersAsync error: {ex.Message}");
                return 0;
            }
        }

        // ============================================
        // SYNC HISTORY METHODS
        // ============================================

        /// <summary>
        /// Start a new sync history record
        /// </summary>
        public async Task<string?> StartSyncHistoryAsync(string companyId, string syncType)
        {
            try
            {
                AddAuthHeader();
                
                var record = new Dictionary<string, object>
                {
                    ["company_id"] = companyId,
                    ["sync_type"] = syncType,
                    ["started_at"] = DateTime.UtcNow.ToString("o"),
                    ["status"] = "running"
                };
                
                var json = JsonConvert.SerializeObject(record);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                
                var request = new HttpRequestMessage(HttpMethod.Post, $"{_supabaseUrl}/rest/v1/sync_history")
                {
                    Content = content
                };
                request.Headers.Add("Prefer", "return=representation");
                
                var response = await _httpClient.SendAsync(request);
                if (response.IsSuccessStatusCode)
                {
                    var responseBody = await response.Content.ReadAsStringAsync();
                    var items = JsonConvert.DeserializeObject<List<Dictionary<string, object>>>(responseBody);
                    if (items != null && items.Count > 0 && items[0].ContainsKey("id"))
                    {
                        return items[0]["id"]?.ToString();
                    }
                }
                return null;
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ StartSyncHistoryAsync error: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Update sync history record with counts and status
        /// </summary>
        public async Task<bool> UpdateSyncHistoryAsync(
            string syncHistoryId, 
            string status,
            int ledgersSynced = 0,
            int vouchersSynced = 0,
            int salesSynced = 0,
            int purchasesSynced = 0,
            int stockSynced = 0,
            int totalRecords = 0,
            List<string>? voucherIds = null,
            string? errorMessage = null)
        {
            try
            {
                AddAuthHeader();
                
                var updates = new Dictionary<string, object>
                {
                    ["status"] = status,
                    ["ledgers_synced"] = ledgersSynced,
                    ["vouchers_synced"] = vouchersSynced,
                    ["sales_synced"] = salesSynced,
                    ["purchases_synced"] = purchasesSynced,
                    ["stock_synced"] = stockSynced,
                    ["total_records"] = totalRecords
                };
                
                if (status == "completed" || status == "failed")
                {
                    updates["completed_at"] = DateTime.UtcNow.ToString("o");
                }
                
                if (voucherIds != null && voucherIds.Count > 0)
                {
                    // Store voucher IDs for rollback capability (limit to prevent huge arrays)
                    updates["voucher_ids"] = voucherIds.Take(10000).ToArray();
                }
                
                if (!string.IsNullOrEmpty(errorMessage))
                {
                    updates["error_message"] = errorMessage;
                }
                
                var json = JsonConvert.SerializeObject(updates);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                
                var url = $"{_supabaseUrl}/rest/v1/sync_history?id=eq.{syncHistoryId}";
                
                var request = new HttpRequestMessage(HttpMethod.Patch, url)
                {
                    Content = content
                };
                
                var response = await _httpClient.SendAsync(request);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ UpdateSyncHistoryAsync error: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Mark all 'running' syncs for a company as failed (used on app startup)
        /// </summary>
        public async Task FailRunningSyncsAsync(string companyId)
        {
            try
            {
                AddAuthHeader();
                
                var updates = new 
                { 
                    status = "failed", 
                    error_message = "App restarted/crashed during sync",
                    completed_at = DateTime.UtcNow.ToString("o")
                };
                
                var json = JsonConvert.SerializeObject(updates);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                
                var url = $"{_supabaseUrl}/rest/v1/sync_history?company_id=eq.{companyId}&status=eq.running";
                
                var request = new HttpRequestMessage(HttpMethod.Patch, url)
                {
                    Content = content
                };
                
                await _httpClient.SendAsync(request);
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ FailRunningSyncsAsync error: {ex.Message}");
            }
        }

        /// <summary>
        /// Generate a deterministic GUID from a string using MD5 hash
        /// This ensures the same input always produces the same UUID
        /// </summary>
        private static Guid GenerateDeterministicGuid(string input)
        {
            using (var md5 = System.Security.Cryptography.MD5.Create())
            {
                byte[] hash = md5.ComputeHash(Encoding.UTF8.GetBytes(input));
                return new Guid(hash);
            }
        }

        public void Dispose()
        {
            _httpClient?.Dispose();
        }

        /// <summary>
        /// Fetch Telegram Chat ID for the current user
        /// </summary>
        public async Task<string?> GetTelegramChatIdAsync(string userId)
        {
            try
            {
                AddAuthHeader();
                var url = $"{_supabaseUrl}/rest/v1/user_profiles?id=eq.{userId}&select=telegram_chat_id";
                var response = await _httpClient.GetAsync(url);
                
                if (response.IsSuccessStatusCode)
                {
                    var content = await response.Content.ReadAsStringAsync();
                    var users = JsonConvert.DeserializeObject<List<dynamic>>(content);
                    if (users != null && users.Count > 0)
                    {
                        return users[0].telegram_chat_id?.ToString();
                    }
                }
                return null;
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ Failed to fetch Telegram Chat ID: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Send Telegram Notification directly via Bot API
        /// </summary>
        public async Task SendTelegramNotificationAsync(string chatId, string message)
        {
            try
            {
                var botToken = _telegramBotToken;
                if (string.IsNullOrEmpty(botToken))
                {
                    SyncLogger.Log("⚠️ Telegram Bot Token not configured in appsettings.json");
                    return;
                }
                var url = $"https://api.telegram.org/bot{botToken}/sendMessage";
                
                var payload = new
                {
                    chat_id = chatId,
                    text = message,
                    parse_mode = "HTML"
                };

                var json = JsonConvert.SerializeObject(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                
                // Use a separate client for Telegram to avoid Supabase headers
                using (var tgClient = new HttpClient())
                {
                    await tgClient.PostAsync(url, content);
                }
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ Failed to send Telegram notification: {ex.Message}");
            }
        }
    }
}
