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

            _httpClient = new HttpClient
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
            else if (tableName.Contains("stock")) tableName = "stock";
            
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

        public void Dispose()
        {
            _httpClient?.Dispose();
        }
    }
}
