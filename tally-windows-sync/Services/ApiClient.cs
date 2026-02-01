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

        public ApiClient(string supabaseUrl, string apiKey, int timeoutSeconds = 60)
        {
            _supabaseUrl = supabaseUrl.TrimEnd('/');
            _apiKey = apiKey;

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
            try
            {
                AddAuthHeader();
                // Simple health check: Try to fetch count of companies (limit 0)
                // This validates URL and Key
                var request = new HttpRequestMessage(HttpMethod.Get, $"{_supabaseUrl}/rest/v1/companies?select=count&limit=0");
                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    return (true, "Connected to Supabase successfully");
                }
                return (false, $"Supabase error: {response.StatusCode}");
            }
            catch (Exception ex)
            {
                return (false, $"Connection error: {ex.Message}");
            }
        }

        /// <summary>
        /// Sync company information
        /// </summary>
        public async Task<ApiResponse<object>> SyncCompanyAsync(Company company)
        {
            // Add required metadata
            // Note: company.Id must be set
            if (string.IsNullOrEmpty(company.Id)) company.Id = Guid.NewGuid().ToString();

            return await UpsertAsync<object>("companies", new List<Company> { company }, "id");
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
            if (tableName.Contains("vouchers")) tableName = "vouchers";
            else if (tableName.Contains("ledgers")) tableName = "ledgers";
            else if (tableName.Contains("stock")) tableName = "stock_items";
            
            // Safety Check regarding Vouchers PK
            if ((tableName == "vouchers" || dataType.ToLower().Contains("voucher")) && onConflict != "voucher_id")
            {
                SyncLogger.Log($"🚨 FATAL: Attempted to sync Vouchers with wrong PK: {onConflict}");
                throw new Exception("FATAL: Voucher sync called with wrong PK ('id'). Must be 'voucher_id'.");
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
                    dict["company_id"] = companyId;
                    
                    // Handle Vouchers, Sales, and Purchases specifically to match Supabase schema
                    if (tableName == "vouchers" || tableName == "sales" || tableName == "purchases")
                    {
                        // Map C# properties to SQL columns if they differ
                        if (dict.ContainsKey("voucher_date")) 
                        {
                            dict["vch_date"] = dict["voucher_date"];
                            if (tableName == "sales" || tableName == "purchases") dict["invoice_date"] = dict["voucher_date"];
                        }
                        
                        if (dict.ContainsKey("total_amount")) 
                        {
                            dict["amount"] = dict["total_amount"];
                            if (tableName == "sales" || tableName == "purchases") dict["net_amount"] = dict["total_amount"];
                        }
                        
                        if (dict.ContainsKey("party_name")) 
                        {
                            dict["party_ledger_name"] = dict["party_name"];
                        }
                        
                        if (dict.ContainsKey("voucher_number"))
                        {
                            if (tableName == "sales" || tableName == "purchases") dict["invoice_number"] = dict["voucher_number"];
                        }
                        
                        // Move extra fields to raw_data to avoid PostgREST errors
                        var rawData = new Dictionary<string, object>();
                        if (dict.ContainsKey("ledger_entries")) rawData["ledger_entries"] = dict["ledger_entries"];
                        if (dict.ContainsKey("inventory_entries")) rawData["inventory_entries"] = dict["inventory_entries"];
                        
                        dict["raw_data"] = rawData;
                        
                        // Remove fields that are not in the SQL schema
                        dict.Remove("ledger_entries");
                        dict.Remove("inventory_entries");
                        dict.Remove("voucher_date");
                        dict.Remove("total_amount");
                        dict.Remove("party_name");
                        
                        // Ensure ID is set correctly for on_conflict
                        if (dict.ContainsKey("voucher_id")) dict["id"] = dict["voucher_id"];
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

        public void Dispose()
        {
            _httpClient?.Dispose();
        }
    }
}
