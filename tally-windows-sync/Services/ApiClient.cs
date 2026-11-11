using System;
using System.Collections.Generic;
using System.IO;
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
        private string? _ownerId;   // auth.uid() - RLS on every sync table is `owner_id = auth.uid()`
        private readonly string _telegramBotToken;
        public ApiClient(string supabaseUrl, string apiKey, int timeoutSeconds = 60, string telegramBotToken = "")
        {
            _supabaseUrl = supabaseUrl.TrimEnd('/');
            _apiKey = apiKey;
            _telegramBotToken = telegramBotToken ?? string.Empty;

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

        public void SetUserToken(string token, string? ownerId = null)
        {
            _userToken = token;
            if (!string.IsNullOrEmpty(ownerId))
                _ownerId = ownerId;
        }

        /// <summary>
        /// Set by SyncManager: force-refresh the Supabase session, return the new access token or null.
        /// The JWT lives 60 minutes and a historical backfill runs longer, so the one refresh at the
        /// start of a cycle is not enough - without this every batch after the expiry died on PGRST303.
        /// </summary>
        public Func<Task<string?>>? TokenRefresher { get; set; }

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
                try
                {
                    companyUuid = await ResolveCompanyCloudIdAsync(company);
                }
                catch (Exception error)
                {
                    return new ApiResponse<object> { Success = false, Error = error.Message };
                }
            }

            var companyData = new Dictionary<string, object?>
            {
                ["id"] = companyUuid,
                ["name"] = company.Name
            };

            // Tally me jo field khaali hai wo bhejna hi nahi, warna web app se daali hui
            // GSTIN/address next sync pe null ho jati hai (Tally me GST number set hi nahi hota).
            if (!string.IsNullOrWhiteSpace(company.Gstin)) companyData["gstin"] = company.Gstin.Trim();
            if (!string.IsNullOrWhiteSpace(company.Address)) companyData["address"] = company.Address.Trim();
            if (!string.IsNullOrWhiteSpace(company.State)) companyData["state"] = company.State.Trim();
            if (!string.IsNullOrWhiteSpace(company.Phone)) companyData["phone"] = company.Phone.Trim();
            if (!string.IsNullOrWhiteSpace(company.Email)) companyData["email"] = company.Email.Trim();

            // RLS on companies is `owner_id = auth.uid()`; without it the insert is rejected (42501)
            var owner = !string.IsNullOrEmpty(company.OwnerId) ? company.OwnerId : _ownerId;
            if (!string.IsNullOrEmpty(owner))
            {
                companyData["owner_id"] = owner;
            }

            // Store the UUID back for other operations
            company.Id = companyUuid;

            var result = await UpsertAsync<object>("companies", new List<Dictionary<string, object?>> { companyData }, "id");
            if (!result.Success && result.Error != null && result.Error.Contains("42501"))
            {
                // 42501 = another account already owns this company name on cloud.
                // Show the owner's email instead of the raw PostgREST JSON.
                var ownerEmail = await GetCompanyOwnerEmailAsync(companyUuid);
                result.Error = ownerEmail == null
                    ? "⛔ This company is already synced by ANOTHER account on cloud. Rename the company in Tally, or delete it from that account's dashboard."
                    : $"⛔ This company is already synced by another account ({ownerEmail}). Rename it in Tally, or delete it from that account's dashboard.";
            }
            return result;
        }

        // Keep old cloud rows addressable when upgrading from the path-based ID scheme.
        // Lookup failures are errors, never interpreted as permission to create another row.
        private async Task<string> ResolveCompanyCloudIdAsync(Company company)
        {
            var generated = CompanyCloudIdentity.Generate(company.Name, company.TallyGuid ?? "");
            var owner = string.IsNullOrWhiteSpace(company.OwnerId) ? _ownerId : company.OwnerId;
            if (!Guid.TryParse(owner, out _)) throw new InvalidOperationException("Sign in before registering a company.");
            AddAuthHeader();
            var ownerFilter = Uri.EscapeDataString(owner);
            var rows = await ReadCompanyIdentityRowsAsync($"companies?owner_id=eq.{ownerFilter}&name=eq.{Uri.EscapeDataString(company.Name)}&select=id&limit=1001");
            if (rows.Count == 0) return generated;
            if (rows.Count >= 1000) throw new InvalidOperationException("Too many same-name cloud companies; resolve the company mapping before syncing.");

            // Recognition only: never use this old hash to create a new cloud row.
            var legacyId = GenerateDeterministicGuid($"{company.Name}|{company.TallyGuid ?? ""}|{company.DataPath ?? ""}").ToString();
            var candidates = rows.Select(row => new ExistingCompanyIdentity(row["id"]?.ToString() ?? "", null)).ToList();
            if (candidates.Any(row => row.Id == generated || row.Id == legacyId))
                return CompanyCloudIdentity.Resolve(company.Name, company.TallyGuid!, legacyId, candidates);

            var ids = string.Join(",", candidates.Select(row => Guid.Parse(row.Id).ToString()));
            var mappings = await ReadCompanyIdentityRowsAsync($"company_identities?owner_id=eq.{ownerFilter}&supabase_company_id=in.({ids})&select=supabase_company_id,tally_guid&limit=1001");
            if (mappings.Count >= 1000) throw new InvalidOperationException("Company identity mapping is incomplete; no new company was created.");
            var mappedCandidates = candidates.SelectMany(candidate =>
            {
                var matching = mappings.Where(row => string.Equals(row["supabase_company_id"]?.ToString(), candidate.Id, StringComparison.OrdinalIgnoreCase)).ToList();
                return matching.Count == 0 ? new[] { candidate }.AsEnumerable()
                    : matching.Select(row => new ExistingCompanyIdentity(candidate.Id, row["tally_guid"]?.ToString()));
            }).ToList();
            return CompanyCloudIdentity.Resolve(company.Name, company.TallyGuid!, legacyId, mappedCandidates);
        }

        private async Task<List<Newtonsoft.Json.Linq.JObject>> ReadCompanyIdentityRowsAsync(string query)
        {
            using var response = await _httpClient.GetAsync($"{_supabaseUrl}/rest/v1/{query}");
            if (!response.IsSuccessStatusCode)
                throw new InvalidOperationException($"Could not verify the existing cloud company ({(int)response.StatusCode}); registration stopped to prevent duplicates.");
            return JsonConvert.DeserializeObject<List<Newtonsoft.Json.Linq.JObject>>(await response.Content.ReadAsStringAsync())
                ?? throw new InvalidOperationException("Cloud company identity response is invalid; registration stopped.");
        }

        /// <summary>
        /// Register company identity (Tally GUID + Data Path + Source ID) via Edge Function.
        /// Requires authenticated user JWT and company ownership verification server-side.
        /// </summary>
        public async Task<ApiResponse<object>> RegisterCompanyIdentityAsync(
            string companyId,
            string tallyGuid,
            string dataPath,
            string sourceId,
            bool switchMainPath = false
        )
        {
            try
            {
                var requestBody = new Dictionary<string, object?>
                {
                    ["company_id"] = companyId,
                    ["tally_guid"] = tallyGuid,
                    ["data_path"] = dataPath,
                    ["source_id"] = sourceId,
                    ["switch_main_path"] = switchMainPath
                };

                var content = new StringContent(
                    JsonConvert.SerializeObject(requestBody),
                    Encoding.UTF8,
                    "application/json"
                );

                var response = await _httpClient.PostAsync(
                    $"{_supabaseUrl}/functions/v1/sync_company_identity",
                    content
                );

                var responseBody = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    return new ApiResponse<object>
                    {
                        Success = false,
                        Error = response.StatusCode == System.Net.HttpStatusCode.Unauthorized ? "unauthorized" : response.StatusCode.ToString(),
                        Message = responseBody
                    };
                }

                var result = JsonConvert.DeserializeObject<ApiResponse<object>>(responseBody);
                return result;
            }
            catch (Exception ex)
            {
                return new ApiResponse<object>
                {
                    Success = false,
                    Error = "network_error",
                    Message = ex.Message
                };
            }
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

            // Vouchers and voucher-derived tables share one id scheme (see CompanyScopedVoucherIdsAsync).
            bool companyScopedVoucherIds = tableName == "vouchers" || exactTableNames.Contains(tableName)
                ? await CompanyScopedVoucherIdsAsync(companyUuid)
                : false;

            // Assign company_id and convert to dictionary for Supabase
            var itemsWithCompanyId = new List<Dictionary<string, object>>();
            foreach (var item in data)
            {
                var json = JsonConvert.SerializeObject(item);
                var dict = JsonConvert.DeserializeObject<Dictionary<string, object>>(json);
                if (dict != null)
                {
                    dict["company_id"] = companyUuid;
                    if (!string.IsNullOrEmpty(_ownerId)) dict["owner_id"] = _ownerId;
                    
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

                        // Supabase `vouchers.vch_date` is NOT NULL, the model sends it as voucher_date
                        if (dict.ContainsKey("voucher_date") && !dict.ContainsKey("vch_date"))
                        {
                            dict["vch_date"] = dict["voucher_date"];
                        }
                        
                        // Remove nested data - will be synced separately to voucher_ledger_entries/voucher_stock_entries
                        dict.Remove("ledger_entries");
                        dict.Remove("inventory_entries");
                        
                        // Generate deterministic UUID from voucher_id string
                        // This allows upsert to work correctly while maintaining UUID type in Supabase
                        if (dict.ContainsKey("voucher_id"))
                        {
                            string voucherId = dict["voucher_id"]?.ToString() ?? Guid.NewGuid().ToString();
                            dict["id"] = VoucherRowId(companyUuid, voucherId, companyScopedVoucherIds);
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
                                dict["id"] = OwnerScopedGuid(ledgerId).ToString();
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
                                dict["id"] = OwnerScopedGuid(stockId).ToString();
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
                                dict["id"] = VoucherRowId(companyUuid, itemId, companyScopedVoucherIds);
                            }
                        }
                        
                        // For voucher-linked tables, convert voucher_id to UUID
                        if (dict.ContainsKey("voucher_id"))
                        {
                            string vId = dict["voucher_id"]?.ToString() ?? "";
                            if (!string.IsNullOrEmpty(vId) && !Guid.TryParse(vId, out _))
                            {
                                dict["voucher_id"] = VoucherRowId(companyUuid, vId, companyScopedVoucherIds);
                            }
                        }

                        // sales_items.sale_id / purchase_items.purchase_id are FK to
                        // sales.id / purchases.id, which the block above rewrites to a UUID.
                        foreach (var childKey in new[] { "sale_id", "purchase_id" })
                        {
                            if (!dict.ContainsKey(childKey)) continue;
                            string cId = dict[childKey]?.ToString() ?? "";
                            if (!string.IsNullOrEmpty(cId) && !Guid.TryParse(cId, out _))
                            {
                                dict[childKey] = VoucherRowId(companyUuid, cId, companyScopedVoucherIds);
                            }
                        }
                    }
                    
                    itemsWithCompanyId.Add(dict);
                }
            }

            // Perform Upsert
            var result = await UpsertAsync<object>(tableName, itemsWithCompanyId, onConflict);
            if (!result.Success && result.Error != null && result.Error.Contains("42501"))
            {
                // friendly rewrite: raw PostgREST JSON confuses users
                result.Error = $"⛔ {tableName}: upload blocked (RLS) - company is owned by another account on cloud, or registration failed.";
            }
            
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
            List<Voucher> vouchers,
            bool requireComplete = false,
            Action<string, int, int>? progress = null)
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

                // Vouchers and voucher-derived tables share one id scheme (see CompanyScopedVoucherIdsAsync).
                bool companyScopedVoucherIds = await CompanyScopedVoucherIdsAsync(companyUuid);

                // 1. Extract and sync Ledger Entries to voucher_ledger_entries
                var allLedgerEntries = new List<Dictionary<string, object>>();
                foreach (var voucher in vouchers)
                {
                    if (voucher.LedgerEntries != null && voucher.LedgerEntries.Count > 0)
                    {
                        int ledgerIdx = 0;
                        // Tally XML kabhi ek hi ledger line do baar deta hai (voucher phir bhi balance hota hai
                        // aur duplicate hataane pe hee debit=credit milta hai) -> identical lines ek hi baar bhejo.
                        var seenEntries = new HashSet<string>();
                        foreach (var entry in voucher.LedgerEntries)
                        {
                            if (!seenEntries.Add($"{entry.LedgerName}|{entry.Amount}|{entry.IsDebit}")) continue;
                            // Generate deterministic ID from voucher+ledger+index for uniqueness
                            string entryKey = $"{voucher.VoucherId}|ledger|{entry.LedgerName}|{ledgerIdx}";
                            var ledgerRow = new Dictionary<string, object>
                            {
                                ["id"] = VoucherRowId(companyUuid, entryKey, companyScopedVoucherIds),
                                ["company_id"] = companyUuid,
                                ["voucher_id"] = VoucherRowId(companyUuid, voucher.VoucherId, companyScopedVoucherIds),
                                ["ledger_name"] = entry.LedgerName ?? "",
                                ["amount"] = entry.Amount,
                                ["is_debit"] = entry.IsDebit
                            };
                            AddOwnerId(ledgerRow);
                            allLedgerEntries.Add(ledgerRow);
                            ledgerIdx++;
                        }
                    }
                }
                
                if (allLedgerEntries.Count > 0)
                {
                    progress?.Invoke("voucher ledger entries", 0, allLedgerEntries.Count);
                    SyncLogger.Log($"📝 Syncing {allLedgerEntries.Count} voucher ledger entries...");
                    // ~9k rows in one request blows Supabase's 8s statement timeout (57014), so send 100 at a time.
                    foreach (var batch in allLedgerEntries.Chunk(100))
                    {
                        var ledgerResult = await UpsertAsync<object>("voucher_ledger_entries", batch.ToList(), "id");
                        if (ledgerResult.Success) { ledgerEntriesSynced += batch.Length; progress?.Invoke("voucher ledger entries", ledgerEntriesSynced, allLedgerEntries.Count); }
                        else if (requireComplete) throw new InvalidOperationException($"Ledger entries upload failed: {ledgerResult.Error}");
                        else SyncLogger.Log($"⚠️ Ledger entries sync failed: {ledgerResult.Error}");
                    }
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
                            var stockRow = new Dictionary<string, object>
                            {
                                ["id"] = VoucherRowId(companyUuid, entryKey, companyScopedVoucherIds),
                                ["company_id"] = companyUuid,
                                ["voucher_id"] = VoucherRowId(companyUuid, voucher.VoucherId, companyScopedVoucherIds),
                                ["stock_item_name"] = entry.StockItemName ?? "",
                                ["quantity"] = entry.Quantity,
                                ["rate"] = entry.Rate,
                                ["amount"] = entry.Amount,
                                ["unit"] = entry.Unit ?? "",
                                ["hsn_code"] = entry.HsnCode ?? "",
                                ["is_inward"] = isInward,
                                ["discount_percent"] = entry.DiscountPercent,
                                ["tax_rate"] = entry.TaxRate ?? 0m
                            };
                            AddOwnerId(stockRow);
                            allStockEntries.Add(stockRow);
                            stockIdx++;
                        }
                    }
                }
                
                if (allStockEntries.Count > 0)
                {
                    progress?.Invoke("voucher stock entries", 0, allStockEntries.Count);
                    SyncLogger.Log($"📦 Syncing {allStockEntries.Count} voucher stock entries...");
                    foreach (var batch in allStockEntries.Chunk(100))
                    {
                        var stockResult = await UpsertAsync<object>("voucher_stock_entries", batch.ToList(), "id");
                        if (stockResult.Success) { stockEntriesSynced += batch.Length; progress?.Invoke("voucher stock entries", stockEntriesSynced, allStockEntries.Count); }
                        else if (requireComplete) throw new InvalidOperationException($"Stock entries upload failed: {stockResult.Error}");
                        else SyncLogger.Log($"⚠️ Stock entries sync failed: {stockResult.Error}");
                    }
                }
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"❌ SyncVoucherEntriesAsync error: {ex.Message}");
                if (requireComplete) throw;
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
                // alter_id is TEXT in the schema, so a plain desc sort ranks "99999" above "105426"
                // and every sync re-fetches the same vouchers. Inside one digit count text order
                // equals numeric order, and more digits always means a bigger number, so the
                // longest length that still has rows holds the true max.
                for (int digits = 10; digits >= 1; digits--)
                {
                    var url = $"{_supabaseUrl}/rest/v1/{tableName}?company_id=eq.{companyId}" +
                              $"&alter_id=match.%5E%20%2A%5B0-9%5D%7B{digits}%7D%24&select=alter_id&order=alter_id.desc&limit=1";
                    var page = await _httpClient.GetStringAsync(url);
                    var found = JsonConvert.DeserializeObject<List<Dictionary<string, object>>>(page);
                    if (found == null || found.Count == 0) continue;
                    if (found[0].TryGetValue("alter_id", out var raw) && raw != null &&
                        long.TryParse(raw.ToString()!.Trim(), out long maxId))
                    {
                        SyncLogger.Log($"[DEBUG] {tableName} max alter_id = {maxId}");
                        return maxId;
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
        /// Email of the account that owns this company on cloud (friendly 42501 errors).
        /// Null if company not found or owned by nobody.
        /// </summary>
        public async Task<string?> GetCompanyOwnerEmailAsync(string companyId)
        {
            try
            {
                AddAuthHeader();
                var payload = JsonConvert.SerializeObject(new { p_company_id = companyId });
                var content = new StringContent(payload, Encoding.UTF8, "application/json");
                using var request = new HttpRequestMessage(HttpMethod.Post, $"{_supabaseUrl}/rest/v1/rpc/get_company_owner_email")
                {
                    Content = content
                };
                var response = await _httpClient.SendAsync(request);
                var body = await response.Content.ReadAsStringAsync();
                if (!response.IsSuccessStatusCode) return null;
                return JsonConvert.DeserializeObject<string>(body);
            }
            catch
            {
                return null;
            }
        }

        /// <summary>License plan/status for the logged-in user (null when not logged in or unreachable).</summary>
        public async Task<LicenseInfo?> GetLicenseInfoAsync()
        {
            if (string.IsNullOrEmpty(_ownerId)) return null;
            try
            {
                AddAuthHeader();
                var payload = JsonConvert.SerializeObject(new { p_user_id = _ownerId });
                var content = new StringContent(payload, Encoding.UTF8, "application/json");
                using var request = new HttpRequestMessage(HttpMethod.Post, $"{_supabaseUrl}/rest/v1/rpc/validate_user_license")
                {
                    Content = content
                };
                var response = await _httpClient.SendAsync(request);
                if (!response.IsSuccessStatusCode) return null;
                var rows = JsonConvert.DeserializeObject<List<LicenseInfo>>(await response.Content.ReadAsStringAsync());
                return rows != null && rows.Count > 0 ? rows[0] : null;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Authoritative license validation for the PC Connector.
        /// Calls the server-side validate_user_license RPC (server clock, never the local PC clock).
        /// Distinguishes a real licence outcome from a network failure so the UI can show
        /// "Network Verification Failed" separately from "Licence Expired".
        /// </summary>
        public async Task<LicenseResult> GetLicenseValidationAsync()
        {
            var notAvailable = new LicenseResult
            {
                Allowed = false,
                Status = LicenseStatus.NetworkError,
                IsNetworkError = true,
                Message = "License server unreachable",
                DisplayTitle = "Licence Verification Temporarily Unavailable",
                DisplayMessage = "Verification could not complete after retries. Sync is paused; your licence has not been marked expired. Please retry.",
                DisplayAction = "Refresh License Status"
            };

            if (string.IsNullOrEmpty(_ownerId))
            {
                return new LicenseResult
                {
                    Allowed = false,
                    Status = LicenseStatus.NoLicense,
                    Message = "No user session",
                    DisplayTitle = "No Active Licence Found",
                    DisplayMessage = "No valid licence is associated with your account. Please contact the administrator or activate a licence.",
                    DisplayAction = "Refresh License Status"
                };
            }

            HttpResponseMessage? response = null;
            try
            {
                response = await LicenseRequestRetry.SendAsync(PostValidateLicenseAsync);

                // A stored session token is only valid for 60 minutes, so an app left
                // idle for a day hits 401 on the very first licence check and would
                // block sync forever. Refresh once and retry.
                if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized && TokenRefresher != null)
                {
                    var fresh = await TokenRefresher();
                    if (!string.IsNullOrEmpty(fresh))
                    {
                        SetUserToken(fresh);
                        response.Dispose();
                        response = await LicenseRequestRetry.SendAsync(PostValidateLicenseAsync);
                    }
                }

                // Network / transport failure -> distinct from licence expiry
                if (!response.IsSuccessStatusCode)
                {
                    SyncLogger.Log($"[License] validate_user_license HTTP {(int)response.StatusCode}");
                    notAvailable.Message = $"Server returned {(int)response.StatusCode}";
                    return notAvailable;
                }

                var json = await response.Content.ReadAsStringAsync();
                var rows = JsonConvert.DeserializeObject<List<LicenseInfo>>(json) ?? new List<LicenseInfo>();
                var lic = rows.Count > 0 ? rows[0] : null;

                if (lic == null)
                {
                    return new LicenseResult
                    {
                        Allowed = false,
                        Status = LicenseStatus.NoLicense,
                        Message = "No licence row",
                        DisplayTitle = "No Active Licence Found",
                        DisplayMessage = "No valid licence is associated with your account. Please contact the administrator or activate a licence.",
                        DisplayAction = "Refresh License Status"
                    };
                }

                return MapLicenseResult(lic);
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"[License] validate_user_license exception: {ex.GetType().Name}: {ex.GetBaseException().Message}");
                notAvailable.Message = ex.Message;
                return notAvailable;
            }
            finally { response?.Dispose(); }
        }

        private async Task<HttpResponseMessage> PostValidateLicenseAsync(System.Threading.CancellationToken ct)
        {
            AddAuthHeader();
            var payload = JsonConvert.SerializeObject(new { p_user_id = _ownerId });
            using var request = new HttpRequestMessage(HttpMethod.Post, $"{_supabaseUrl}/rest/v1/rpc/validate_user_license")
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json")
            };
            return await _httpClient.SendAsync(request, ct);
        }

        private static LicenseResult MapLicenseResult(LicenseInfo lic)
        {
            var result = new LicenseResult
            {
                PlanName = lic.PlanName,
                ExpiryDate = lic.ExpiryDate,
                DaysLeft = lic.DaysLeft,
                Message = lic.Status ?? "unknown"
            };

            bool isTrial = !string.IsNullOrWhiteSpace(lic.PlanName)
                && lic.PlanName.IndexOf("trial", StringComparison.OrdinalIgnoreCase) >= 0;

            switch ((lic.Status ?? "").ToLowerInvariant())
            {
                case "trial":
                case "active":
                    result.Allowed = true;
                    result.Status = isTrial ? LicenseStatus.TrialActive : LicenseStatus.Active;
                    result.Message = $"Active · {lic.DaysLeft} days left";
                    result.DisplayTitle = isTrial ? "Free Trial Active" : "Licence Active";
                    result.DisplayMessage = isTrial
                        ? $"Your free trial is active. {lic.DaysLeft} day(s) remaining."
                        : $"Your licence is active. {lic.DaysLeft} day(s) remaining.";
                    result.DisplayAction = "Refresh License Status";
                    break;

                case "expired":
                    result.Allowed = false;
                    result.Status = LicenseStatus.Expired;
                    result.Message = $"Expired · {lic.ExpiryDate:dd MMM yyyy}";
                    result.DisplayTitle = isTrial ? "Your Free Trial Has Expired" : "Licence Expired";
                    result.DisplayMessage = isTrial
                        ? "Your 30-day free trial has ended. Upgrade or contact the administrator to continue syncing your Tally data."
                        : "Your licence has expired. Please renew or contact the administrator to restore synchronisation.";
                    result.DisplayAction = "Refresh License Status";
                    break;

                case "blocked":
                case "revoked":
                case "cancelled":
                    result.Allowed = false;
                    result.Status = LicenseStatus.Revoked;
                    result.Message = "Access revoked";
                    result.DisplayTitle = "Licence Access Restricted";
                    result.DisplayMessage = "Access was revoked by the administrator. Contact support to restore it.";
                    break;

                case "suspended":
                    result.Allowed = false;
                    result.Status = LicenseStatus.Suspended;
                    result.Message = "Suspended";
                    result.DisplayTitle = "Licence Access Restricted";
                    result.DisplayMessage = "Your licence has been suspended. Please contact the administrator for assistance.";
                    result.DisplayAction = "Refresh License Status";
                    break;

                case "no_license":
                    result.Allowed = false;
                    result.Status = LicenseStatus.NoLicense;
                    result.Message = "No licence";
                    result.DisplayTitle = "No Active Licence Found";
                    result.DisplayMessage = "No valid licence is associated with your account. Please contact the administrator or activate a licence.";
                    result.DisplayAction = "Refresh License Status";
                    break;

                case "tally_mismatch":
                    result.Allowed = false;
                    result.Status = LicenseStatus.TallyMismatch;
                    result.Message = "Tally serial mismatch";
                    result.DisplayTitle = "Licence Access Restricted";
                    result.DisplayMessage = "Your licence is bound to a different Tally serial or account. Please contact support.";
                    result.DisplayAction = "Refresh License Status";
                    break;

                default:
                    result.Allowed = false;
                    result.Status = LicenseStatus.Unknown;
                    result.Message = $"Unknown status: {lic.Status}";
                    result.DisplayTitle = "Licence Verification Failed";
                    result.DisplayMessage = "Unable to determine your licence status. Please contact support.";
                    result.DisplayAction = "Refresh License Status";
                    break;
            }

            if (result.Allowed && !lic.Valid)
            {
                result.Allowed = false;
                result.Status = LicenseStatus.Unknown;
                result.DisplayTitle = "Licence Verification Failed";
                result.DisplayMessage = "The server did not authorize subscription access. Please retry.";
            }
            return result;
        }

        /// <summary>
        /// Merged licence history for the logged-in user: trial activations, licence creations,
        /// extensions and payments. Read via the existing user_read_own_* RLS policies — no
        /// schema change required. Returned newest-first.
        /// </summary>
        public async Task<List<LicenseHistoryEntry>> GetLicenseHistoryAsync(string userId)
        {
            var history = new List<LicenseHistoryEntry>();
            try
            {
                AddAuthHeader();

                // 1. Licence rows from user_licenses (user_read_own)
                var licRows = await GetJsonRowsAsync(
                    $"user_licenses?user_id=eq.{userId}&order=created_at.asc" +
                    $"&select=id,plan_id,status,activation_date,expiry_date,license_key,created_at," +
                    $"plan:subscription_plans(name)");
                foreach (var r in licRows)
                {
                    var status = r["status"]?.ToString() ?? "";
                    var planName = ExtractPlanName(r);
                    history.Add(new LicenseHistoryEntry
                    {
                        EventType = status == "active" ? "license_activated" : $"license_{status}",
                        Title = status == "active" ? "Licence Activated" : $"Licence {status.Replace('_', ' ')}",
                        Description = $"Plan: {planName}",
                        CreatedAt = ParseDate(r, "created_at") ?? DateTime.MinValue,
                        PlanName = planName,
                        Status = status,
                        ExpiryDate = ParseDate(r, "expiry_date"),
                        Icon = "🪪",
                        Color = status == "active" ? "#0B8968" : "#DC2626"
                    });
                }

                // 2. Trial activations from trial_history (user_read_own_trials)
                var trialRows = await GetJsonRowsAsync(
                    $"trial_history?user_id=eq.{userId}&order=created_at.asc" +
                    $"&select=id,trial_start,trial_end,status,license_id,created_at");
                foreach (var r in trialRows)
                {
                    history.Add(new LicenseHistoryEntry
                    {
                        EventType = "trial_activated",
                        Title = "Free Trial Activated",
                        Description = "30-day free trial started",
                        CreatedAt = ParseDate(r, "trial_start") ?? ParseDate(r, "created_at") ?? DateTime.MinValue,
                        PlanName = "Trial",
                        Status = r["status"]?.ToString() ?? "trial",
                        ExpiryDate = ParseDate(r, "trial_end"),
                        Icon = "🎁",
                        Color = "#2563EB"
                    });
                }

                // 3. Paid purchases from payments (user_read_own_payments)
                var payRows = await GetJsonRowsAsync(
                    $"payments?user_id=eq.{userId}&order=created_at.asc" +
                    $"&select=id,plan_id,status,total_amount,created_at,paid_at,expires_at");
                foreach (var r in payRows)
                {
                    var status = r["status"]?.ToString() ?? "";
                    if (!status.Equals("paid", StringComparison.OrdinalIgnoreCase)) continue;
                    history.Add(new LicenseHistoryEntry
                    {
                        EventType = "license_purchased",
                        Title = "Licence Purchased",
                        Description = "Payment received",
                        CreatedAt = ParseDate(r, "paid_at") ?? ParseDate(r, "created_at") ?? DateTime.MinValue,
                        PlanName = "",
                        Status = "paid",
                        Amount = ParseDecimal(r, "total_amount"),
                        Icon = "💳",
                        Color = "#059669"
                    });
                }

                // 4. Licence lifecycle events from activity_logs (trial_activated, extended,
                // suspended, reactivated, etc.) — each event is its own row.
                var logRows = await GetJsonRowsAsync(
                    $"activity_logs?user_id=eq.{userId}&order=created_at.asc" +
                    $"&action=in.(trial_activated,license_created,license_extended," +
                    $"trial_extended,user_suspended,user_reactivated,license_reactivated," +
                    $"license_revoked)" +
                    $"&select=id,action,entity_type,entity_id,metadata,created_at");
                foreach (var r in logRows)
                {
                    var action = r["action"]?.ToString() ?? "";
                    var meta = r["metadata"] as Newtonsoft.Json.Linq.JObject;
                    var planName = meta?["plan"]?.ToString() ?? meta?["plan_name"]?.ToString() ?? "";
                    var days = meta?["days_added"]?.ToString() ?? meta?["duration"]?.ToString() ?? "";
                    var reason = meta?["reason"]?.ToString() ?? "";

                    var entry = new LicenseHistoryEntry
                    {
                        EventType = action,
                        CreatedAt = ParseDate(r, "created_at") ?? DateTime.MinValue,
                        PlanName = planName,
                        Status = action,
                        Icon = "📝",
                        Color = "#6B7280"
                    };

                    switch (action.ToLowerInvariant())
                    {
                        case "trial_activated":
                            entry.Title = "Free Trial Activated";
                            entry.Description = string.IsNullOrWhiteSpace(days)
                                ? "30-day free trial started"
                                : $"Free trial activated for {days} day(s)";
                            entry.Color = "#2563EB";
                            break;
                        case "license_created":
                        case "license_activated":
                            entry.Title = "Licence Created";
                            entry.Description = string.IsNullOrWhiteSpace(planName)
                                ? "New licence assigned"
                                : $"Licence assigned — Plan: {planName}";
                            entry.Color = "#0B8968";
                            break;
                        case "license_extended":
                        case "trial_extended":
                            entry.Title = "Licence Extended";
                            entry.Description = string.IsNullOrWhiteSpace(reason)
                                ? $"Extended by {days} day(s)"
                                : $"Extended by {days} day(s) — {reason}";
                            entry.Color = "#059669";
                            break;
                        case "user_suspended":
                            entry.Title = "Licence Suspended";
                            entry.Description = string.IsNullOrWhiteSpace(reason)
                                ? "Licence suspended by admin"
                                : $"Licence suspended — {reason}";
                            entry.Color = "#DC2626";
                            break;
                        case "user_reactivated":
                        case "license_reactivated":
                            entry.Title = "Licence Reactivated";
                            entry.Description = "Licence reactivated by admin";
                            entry.Color = "#0B8968";
                            break;
                        case "license_revoked":
                            entry.Title = "Licence Revoked";
                            entry.Description = "Licence revoked by admin";
                            entry.Color = "#DC2626";
                            break;
                        default:
                            entry.Title = action.Replace('_', ' ');
                            entry.Description = "Licence event recorded";
                            break;
                    }
                    history.Add(entry);
                }

                history.Sort((a, b) => b.CreatedAt.CompareTo(a.CreatedAt));
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"[LicenseHistory] {ex.Message}");
            }
            return history;
        }

        private async Task<List<Dictionary<string, object>>> GetJsonRowsAsync(string path)
        {
            AddAuthHeader();
            var url = $"{_supabaseUrl}/rest/v1/{path}";
            var response = await _httpClient.GetAsync(url);
            if (!response.IsSuccessStatusCode) return new List<Dictionary<string, object>>();
            var body = await response.Content.ReadAsStringAsync();
            return JsonConvert.DeserializeObject<List<Dictionary<string, object>>>(body)
                ?? new List<Dictionary<string, object>>();
        }

        private static DateTime? ParseDate(Dictionary<string, object> r, string key)
        {
            if (!r.TryGetValue(key, out var v) || v == null) return null;
            var s = v.ToString();
            if (string.IsNullOrWhiteSpace(s)) return null;
            return DateTime.TryParse(s, out var d) ? d : (DateTime?)null;
        }

        private static decimal? ParseDecimal(Dictionary<string, object> r, string key)
        {
            if (!r.TryGetValue(key, out var v) || v == null) return null;
            return decimal.TryParse(v.ToString(), out var d) ? d : (decimal?)null;
        }

        private static string ExtractPlanName(Dictionary<string, object> r)
        {
            if (r.TryGetValue("plan", out var p) && p != null)
            {
                var plan = p as Newtonsoft.Json.Linq.JObject;
                if (plan != null)
                {
                    var name = plan["name"]?.ToString();
                    if (!string.IsNullOrWhiteSpace(name)) return name;
                }
            }
            if (r.TryGetValue("plan_id", out var pid) && pid != null)
                return $"Plan {pid}";
            return "Unknown";
        }

        /// <summary>Fetch pending server pushes (web -> TallyLink channel).</summary>
        public async Task<List<PushQueueItem>> FetchPendingPushesAsync(string companyId)
        {
            var list = new List<PushQueueItem>();
            try
            {
                AddAuthHeader();
                var url = $"{_supabaseUrl}/rest/v1/tally_push_queue" +
                          $"?company_id=eq.{companyId}&status=eq.pending&order=created_at.asc&limit=20";
                var response = await _httpClient.GetAsync(url);
                if (!response.IsSuccessStatusCode) return list;
                var body = await response.Content.ReadAsStringAsync();
                var items = JsonConvert.DeserializeObject<List<PushQueueItem>>(body);
                if (items != null) list.AddRange(items);
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ Push queue fetch failed: {ex.Message}");
            }
            return list;
        }

        /// <summary>Ack a processed push (done/failed) so the web side sees the outcome.</summary>
        public async Task AckPushAsync(string pushId, string status, string? error)
        {
            try
            {
                AddAuthHeader();
                var patch = new Dictionary<string, object?>
                {
                    ["status"] = status,
                    ["error"] = error,
                    ["processed_at"] = DateTime.UtcNow.ToString("o"),
                    ["retry_count"] = status == "failed" ? 1 : 0
                };
                var json = JsonConvert.SerializeObject(patch);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                using var request = new HttpRequestMessage(HttpMethod.Patch,
                    $"{_supabaseUrl}/rest/v1/tally_push_queue?id=eq.{pushId}")
                {
                    Content = content
                };
                await _httpClient.SendAsync(request);
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ Push ack failed ({pushId}): {ex.Message}");
            }
        }

        /// <summary>
        /// P1 (LK parity): post Tally's voucher index as identity keys [{g,t,v,a}] -
        /// guid + type/number + alterId. Server backfills NULL-guid rows, then deletes every
        /// cloud voucher absent from the index by any identity. Returns purged count, -1 = safety skip.
        /// </summary>
        /// <summary>
        /// Voucher row count for a company. One request; PostgREST returns the total in Content-Range.
        /// </summary>
        public async Task<int> GetVoucherCountAsync(string companyId)
        {
            try
            {
                AddAuthHeader();
                using var request = new HttpRequestMessage(HttpMethod.Get,
                    $"{_supabaseUrl}/rest/v1/vouchers?company_id=eq.{companyId}&select=id&limit=1");
                request.Headers.Add("Prefer", "count=exact");
                var response = await _httpClient.SendAsync(request);
                if (!response.IsSuccessStatusCode)
                {
                    SyncLogger.Log($"⚠️ GetVoucherCount: HTTP {(int)response.StatusCode}");
                    return -1;
                }
                // PostgREST sends "Content-Range: 0-0/3998"; .NET sometimes keeps it on the
                // response instead of the content, so read both.
                string? rawRange = response.Content.Headers.TryGetValues("Content-Range", out var cv)
                    ? cv.FirstOrDefault()
                    : response.Headers.TryGetValues("Content-Range", out var rv) ? rv.FirstOrDefault() : null;
                if (rawRange != null && rawRange.Contains('/') &&
                    int.TryParse(rawRange.Split('/').Last(), out var total))
                {
                    return total;
                }
                SyncLogger.Log($"⚠️ GetVoucherCount: no usable Content-Range ({rawRange ?? "null"})");
                return -1;
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ GetVoucherCount error: {ex.Message}");
                return -1;
            }
        }

        /// <summary>Read a complete company-scoped identity snapshot; null means unsafe/incomplete.</summary>
        public async Task<List<CloudVoucherIdentity>?> GetVoucherIdentitySnapshotAsync(string companyId)
        {
            try
            {
                var before = await GetVoucherCountAsync(companyId);
                if (before < 0) return null;
                const int pageSize = 1000;
                var rows = new List<CloudVoucherIdentity>();
                var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                for (int offset = 0; ; offset += pageSize)
                {
                    AddAuthHeader();
                    var url = $"{_supabaseUrl}/rest/v1/vouchers?company_id=eq.{Uri.EscapeDataString(companyId)}&select=id,guid,alter_id,is_deleted,party_name,voucher_number,voucher_type&order=id.asc&limit={pageSize}&offset={offset}";
                    using var response = await _httpClient.GetAsync(url);
                    if (!response.IsSuccessStatusCode) { SyncLogger.Log($"[Reconcile] Identity page failed: HTTP {(int)response.StatusCode}"); return null; }
                    var text = await response.Content.ReadAsStringAsync();
                    var page = Newtonsoft.Json.Linq.JArray.Parse(text);
                    foreach (var item in page)
                    {
                        var id = item["id"]?.ToString() ?? "";
                        if (string.IsNullOrWhiteSpace(id) || !seen.Add(id)) return null;
                        rows.Add(new CloudVoucherIdentity { Id = id, Guid = item["guid"]?.ToString(), AlterId = item["alter_id"]?.ToString(), IsDeleted = item["is_deleted"]?.Type == Newtonsoft.Json.Linq.JTokenType.Boolean ? item["is_deleted"]!.ToObject<bool>() : null, PartyName = item["party_name"]?.ToString(), VoucherNumber = item["voucher_number"]?.ToString(), VoucherType = item["voucher_type"]?.ToString() });
                    }
                    if (page.Count < pageSize) break;
                    if (rows.Count > 1000000) return null;
                }
                var after = await GetVoucherCountAsync(companyId);
                if (before != after || after != rows.Count) { SyncLogger.Log($"[Reconcile] Snapshot changed or incomplete: before={before}, rows={rows.Count}, after={after}"); return null; }
                return rows;
            }
            catch (Exception ex) { SyncLogger.Log($"[Reconcile] Identity snapshot failed: {ex.Message}"); return null; }
        }

        /// <summary>Soft-delete one unchanged, company-scoped voucher and verify the returned row.</summary>
        public async Task<bool> SoftDeleteReconciledVoucherAsync(string companyId, CloudVoucherIdentity voucher)
        {
            if (!Guid.TryParse(voucher.Id, out _) || string.IsNullOrWhiteSpace(voucher.Guid) || string.IsNullOrWhiteSpace(voucher.AlterId) || voucher.IsDeleted != false) return false;
            try
            {
                for (var attempt = 0; attempt < 2; attempt++)
                {
                    AddAuthHeader();
                    var url = $"{_supabaseUrl}/rest/v1/vouchers?company_id=eq.{Uri.EscapeDataString(companyId)}&id=eq.{Uri.EscapeDataString(voucher.Id)}&guid=eq.{Uri.EscapeDataString(voucher.Guid)}&alter_id=eq.{Uri.EscapeDataString(voucher.AlterId)}&is_deleted=eq.false&select=id,is_deleted";
                    using var request = new HttpRequestMessage(HttpMethod.Patch, url);
                    request.Headers.Add("Prefer", "return=representation");
                    request.Content = new StringContent("{\"is_deleted\":true}", Encoding.UTF8, "application/json");
                    using var response = await _httpClient.SendAsync(request);
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized && attempt == 0 && TokenRefresher != null)
                    {
                        var token = await TokenRefresher();
                        if (!string.IsNullOrEmpty(token)) { SetUserToken(token); continue; }
                    }
                    if (!response.IsSuccessStatusCode) { SyncLogger.Log($"[Reconcile] Soft-delete failed for {voucher.Id}: HTTP {(int)response.StatusCode}"); return false; }
                    var rows = Newtonsoft.Json.Linq.JArray.Parse(await response.Content.ReadAsStringAsync());
                    return rows.Count == 1 && string.Equals(rows[0]?["id"]?.ToString(), voucher.Id, StringComparison.OrdinalIgnoreCase) && rows[0]?["is_deleted"]?.ToObject<bool>() == true;
                }
            }
            catch (Exception ex) { SyncLogger.Log($"[Reconcile] Soft-delete failed for {voucher.Id}: {ex.Message}"); }
            return false;
        }

        public async Task<int> PurgeDeletedVouchersAsync(string companyId, List<VoucherIndexEntry> tallyIndex)
        {
            try
            {
                AddAuthHeader();
                var keys = tallyIndex
                    .Select(e => new
                    {
                        g = string.IsNullOrWhiteSpace(e.Guid) ? null : e.Guid.Trim(),
                        t = e.VoucherType,
                        v = e.VoucherNumber,
                        a = string.IsNullOrWhiteSpace(e.AlterId) ? null : e.AlterId.Trim()
                    })
                    .ToList();
                var payload = JsonConvert.SerializeObject(new { p_company_id = companyId, p_keys = keys });
                var content = new StringContent(payload, Encoding.UTF8, "application/json");
                using var request = new HttpRequestMessage(HttpMethod.Post, $"{_supabaseUrl}/rest/v1/rpc/purge_deleted_vouchers")
                {
                    Content = content
                };
                var response = await _httpClient.SendAsync(request);
                var body = await response.Content.ReadAsStringAsync();
                if (!response.IsSuccessStatusCode)
                {
                    SyncLogger.Log($"⚠️ PurgeDeletedVouchers failed ({(int)response.StatusCode}): {body}");
                    return 0;
                }
                return JsonConvert.DeserializeObject<int>(body);
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ PurgeDeletedVouchers error: {ex.Message}");
                return 0;
            }
        }

        /// <summary>
        /// LK parity (outstanding): full snapshot replace of party-wise outstanding for a
        /// company. Delete-then-upsert, so cleared/zero balances do not linger as stale rows.
        /// </summary>
        public async Task<ApiResponse<object>> ReplaceOutstandingsAsync(
            string companyId, List<(string LedgerName, decimal Amount, bool Receivable)> summaries)
        {
            var empty = new ApiResponse<object> { Success = true };
            if (summaries.Count == 0) return empty;

            try
            {
                AddAuthHeader();
                await _httpClient.DeleteAsync($"{_supabaseUrl}/rest/v1/outstanding_bills?company_id=eq.{companyId}");
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ Outstanding delete-then-insert delete failed: {ex.Message}");
            }

            var rows = summaries.Select(s =>
            {
                var r = new Dictionary<string, object?>
                {
                    ["id"] = GenerateDeterministicGuid(companyId + "|" + s.LedgerName).ToString(),
                    ["company_id"] = companyId,
                    ["ledger_name"] = s.LedgerName,
                    ["direction"] = s.Receivable ? "receivable" : "payable",
                    ["amount"] = s.Amount
                };
                if (!string.IsNullOrEmpty(_ownerId)) r["owner_id"] = _ownerId;
                return r;
            }).ToList();

            var result = await UpsertAsync<object>("outstanding_bills", rows, "id");
            if (!result.Success && result.Error != null)
                SyncLogger.Log($"⚠️ Outstanding upload failed: {result.Error}");
            else
                SyncLogger.Log($"Outstanding snapshot uploaded: {rows.Count} rows");
            return result;
        }

        /// <summary>
        /// P3: ask the server which (voucher_type, voucher_number) pairs from Tally's index are
        /// missing in cloud, so the client can re-fetch just those.
        /// </summary>
        public async Task<List<(string VoucherType, string VoucherNumber)>> FindMissingVouchersAsync(string companyId, List<VoucherIndexEntry> tallyIndex)
        {
            var missing = new List<(string VoucherType, string VoucherNumber)>();
            try
            {
                AddAuthHeader();
                var keys = tallyIndex
                    .Where(e => !string.IsNullOrWhiteSpace(e.VoucherType) && !string.IsNullOrWhiteSpace(e.VoucherNumber))
                    .Select(e => new { t = e.VoucherType, v = e.VoucherNumber })
                    .ToList();
                if (keys.Count == 0) return missing;

                var payload = JsonConvert.SerializeObject(new { p_company_id = companyId, p_keys = keys });
                var content = new StringContent(payload, Encoding.UTF8, "application/json");
                using var request = new HttpRequestMessage(HttpMethod.Post, $"{_supabaseUrl}/rest/v1/rpc/find_missing_vouchers")
                {
                    Content = content
                };
                var response = await _httpClient.SendAsync(request);
                var body = await response.Content.ReadAsStringAsync();
                if (!response.IsSuccessStatusCode)
                {
                    SyncLogger.Log($"⚠️ FindMissingVouchers failed ({(int)response.StatusCode}): {body}");
                    return missing;
                }

                var items = JsonConvert.DeserializeObject<List<Dictionary<string, string>>>(body) ?? new List<Dictionary<string, string>>();
                foreach (var it in items)
                {
                    if (it.TryGetValue("voucher_type", out var t) && it.TryGetValue("voucher_number", out var n) &&
                        !string.IsNullOrWhiteSpace(t) && !string.IsNullOrWhiteSpace(n))
                    {
                        missing.Add((t, n));
                    }
                }
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ FindMissingVouchers error: {ex.Message}");
            }
            return missing;
        }

        /// <summary>
        /// P2: register/verify this Tally serial against the logged-in user (server-side license
        /// guard). claim_result: owned | in_use | no_serial | no_auth | error.
        /// 'in_use' = another user account already holds this serial - caller must block sync.
        /// </summary>
        public async Task<(string Result, string? BoundUser)> TryClaimTallySerialAsync(string? tallySerial, string deviceId, string? deviceName)
        {
            try
            {
                AddAuthHeader();
                var payload = JsonConvert.SerializeObject(new { p_tally_serial = tallySerial ?? "", p_device_id = deviceId ?? "", p_device_name = deviceName ?? "" });
                var content = new StringContent(payload, Encoding.UTF8, "application/json");
                using var request = new HttpRequestMessage(HttpMethod.Post, $"{_supabaseUrl}/rest/v1/rpc/try_claim_tally_serial")
                {
                    Content = content
                };
                var response = await _httpClient.SendAsync(request);
                var body = await response.Content.ReadAsStringAsync();
                if (!response.IsSuccessStatusCode)
                {
                    SyncLogger.Log($"⚠️ TryClaimTallySerial failed ({(int)response.StatusCode}): {body}");
                    return ("error", null);
                }

                var obj = JsonConvert.DeserializeObject<Dictionary<string, object>>(body);
                if (obj != null && obj.TryGetValue("claim_result", out var r))
                {
                    obj.TryGetValue("bound_user", out var u);
                    return (r?.ToString() ?? "error", u?.ToString());
                }
                return ("error", null);
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ TryClaimTallySerial error: {ex.Message}");
                return ("error", null);
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

                // JWT expired mid-run: refresh once and resend the same payload.
                if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized && TokenRefresher != null)
                {
                    var fresh = await TokenRefresher();
                    if (!string.IsNullOrEmpty(fresh))
                    {
                        SetUserToken(fresh);
                        AddAuthHeader();
                        content = new StringContent(json, Encoding.UTF8, "application/json");
                        content.Headers.Add("Prefer", "resolution=merge-duplicates,return=minimal");
                        response = await _httpClient.PostAsync(url, content);
                        SyncLogger.Log($"[AUTH] token refreshed on 401, retried table={table}");
                    }
                }

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
                    Error = $"Request failed: {ex.GetBaseException().Message}"
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

        /// <summary>Atomically claim a pending row; only the connector that receives the row may import it.</summary>
        public async Task<bool> TryClaimPendingTransactionAsync(string companyId, string transactionId)
        {
            try
            {
                AddAuthHeader();
                var url = $"{_supabaseUrl}/rest/v1/pending_transactions?id=eq.{Uri.EscapeDataString(transactionId)}&company_id=eq.{Uri.EscapeDataString(companyId)}&status=eq.pending&select=id";
                using var request = new HttpRequestMessage(HttpMethod.Patch, url);
                request.Headers.Add("Prefer", "return=representation");
                request.Content = new StringContent("{\"status\":\"processing\"}", Encoding.UTF8, "application/json");
                using var response = await _httpClient.SendAsync(request);
                if (!response.IsSuccessStatusCode) return false;
                var rows = Newtonsoft.Json.Linq.JArray.Parse(await response.Content.ReadAsStringAsync());
                return rows.Count == 1 && string.Equals(rows[0]?["id"]?.ToString(), transactionId, StringComparison.Ordinal);
            }
            catch (Exception ex) { SyncLogger.Log($"⚠️ Pending transaction claim failed: {ex.Message}"); return false; }
        }

        /// <summary>
        /// Update pending transaction status after Tally sync attempt
        /// </summary>
        public async Task<bool> UpdatePendingTransactionStatusAsync(string transactionId, string status, string? tallyVoucherNumber = null, string? errorMessage = null, int? retryCount = null)
        {
            try
            {
                AddAuthHeader();
                
                var updates = new Dictionary<string, object?>
                {
                    { "status", status }
                };
                if (retryCount.HasValue) updates["retry_count"] = retryCount.Value;
                
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

        public async Task<CloudSyncOverview> GetCloudSyncOverviewAsync(System.Threading.CancellationToken ct = default)
        {
            using var timeout = System.Threading.CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(25));
            AddAuthHeader();
            try
            {
                return await new CloudSyncReader(_httpClient, _supabaseUrl, _ownerId ?? "").ReadAsync(timeout.Token);
            }
            catch (HttpRequestException error) when (error.StatusCode == System.Net.HttpStatusCode.Unauthorized && TokenRefresher != null)
            {
                var token = await TokenRefresher();
                if (string.IsNullOrWhiteSpace(token)) throw;
                SetUserToken(token);
                AddAuthHeader();
                return await new CloudSyncReader(_httpClient, _supabaseUrl, _ownerId ?? "").ReadAsync(timeout.Token);
            }
        }

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
                AddOwnerId(record);
                
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
            int? ledgersSynced = null,
            int? vouchersSynced = null,
            int? salesSynced = null,
            int? purchasesSynced = null,
            int? stockSynced = null,
            int? totalRecords = null,
            List<string>? voucherIds = null,
            string? errorMessage = null)
        {
            try
            {
                AddAuthHeader();
                
                var updates = new Dictionary<string, object>
                {
                    ["status"] = status
                };
                if (ledgersSynced.HasValue) updates["ledgers_synced"] = ledgersSynced.Value;
                if (vouchersSynced.HasValue) updates["vouchers_synced"] = vouchersSynced.Value;
                if (salesSynced.HasValue) updates["sales_synced"] = salesSynced.Value;
                if (purchasesSynced.HasValue) updates["purchases_synced"] = purchasesSynced.Value;
                if (stockSynced.HasValue) updates["stock_synced"] = stockSynced.Value;
                if (totalRecords.HasValue) updates["total_records"] = totalRecords.Value;
                
                if (status == "completed" || status == "failed" || status == "partial")
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
        /// Every sync table has RLS `owner_id = auth.uid()`. Tally data has no owner, so the
        /// logged-in user is stamped on each row here - omitting it gets the insert rejected (42501).
        /// </summary>
        private void AddOwnerId(Dictionary<string, object> row)
        {
            if (!string.IsNullOrEmpty(_ownerId))
                row["owner_id"] = _ownerId;
        }

        /// <summary>
        /// Generate a deterministic GUID from a string using MD5 hash
        /// This ensures the same input always produces the same UUID
        /// </summary>
        /// <summary>
        /// Master rows are keyed per owner. Tally GUIDs repeat across accounts (demo companies),
        /// so a global deterministic id hits another owner's row and the upsert dies with RLS 403.
        /// </summary>
        private Guid OwnerScopedGuid(string raw) =>
            GenerateDeterministicGuid(string.IsNullOrEmpty(_ownerId) ? raw : $"{_ownerId}|{raw}");

        /// <summary>
        /// Voucher rows (and everything derived from a voucher: sales, entries) are keyed by
        /// md5(Tally GUID). That is global, so a company copied from another Tally company
        /// reuses the GUIDs, the upsert lands on the other owner's row and RLS kills the whole
        /// batch with 42501. New companies therefore key by company too. A company that already
        /// has rows keeps the old scheme - re-keying it would duplicate every voucher.
        /// </summary>
        private readonly Dictionary<string, bool> _voucherIdScheme = new();

        private async Task<bool> CompanyScopedVoucherIdsAsync(string companyUuid)
        {
            if (_voucherIdScheme.TryGetValue(companyUuid, out var cached)) return cached;

            bool scoped = true;
            try
            {
                AddAuthHeader();
                var url = $"{_supabaseUrl}/rest/v1/vouchers?company_id=eq.{companyUuid}&select=id,guid&limit=5";
                var response = await _httpClient.GetAsync(url);
                if (response.IsSuccessStatusCode)
                {
                    var rows = JsonConvert.DeserializeObject<List<CloudVoucherIdentity>>(
                        await response.Content.ReadAsStringAsync()) ?? new List<CloudVoucherIdentity>();
                    scoped = rows.Count == 0 ||
                             rows.All(r => r.Guid != null && r.Id == VoucherRowId(companyUuid, r.Guid, true));
                }
            }
            catch
            {
                // Network hiccup: assume the scheme the company already uses is unknown; the
                // upsert itself will report the real error.
            }

            _voucherIdScheme[companyUuid] = scoped;
            return scoped;
        }

        private static string VoucherRowId(string companyUuid, string raw, bool companyScoped) =>
            GenerateDeterministicGuid(companyScoped ? $"{companyUuid}|{raw}" : raw).ToString();

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
        /// Send Telegram notification through the authenticated Supabase Edge Function.
        /// The bot token stays server-side and the function only sends to this user's linked chat.
        /// </summary>
        public async Task<bool> SendTelegramNotificationAsync(string chatId, string message)
        {
            if (string.IsNullOrWhiteSpace(chatId) || string.IsNullOrWhiteSpace(message))
                return false;

            // Direct bot call first: the edge function returned HTTP 500 in the field.
            // shortcut: bot token ships in appsettings; remove the direct path once the edge function is stable.
            if (await SendTelegramDirectAsync(chatId, message)) return true;

            if (string.IsNullOrWhiteSpace(_userToken))
                return false;

            try
            {
                for (var attempt = 0; attempt < 2; attempt++)
                {
                    AddAuthHeader();
                    var payload = JsonConvert.SerializeObject(new { chat_id = chatId, message });
                    using var content = new StringContent(payload, Encoding.UTF8, "application/json");
                    using var response = await _httpClient.PostAsync(
                        $"{_supabaseUrl}/functions/v1/desktop-telegram-notify", content);

                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized && attempt == 0 && TokenRefresher != null)
                    {
                        var freshToken = await TokenRefresher();
                        if (!string.IsNullOrWhiteSpace(freshToken))
                        {
                            SetUserToken(freshToken);
                            continue;
                        }
                    }

                    if (!response.IsSuccessStatusCode)
                    {
                        SyncLogger.Log($"⚠️ Telegram notification service returned HTTP {(int)response.StatusCode}");
                        return false;
                    }

                    var body = await response.Content.ReadAsStringAsync();
                    var result = JsonConvert.DeserializeObject<Dictionary<string, bool>>(body);
                    return result != null && result.TryGetValue("sent", out var sent) && sent;
                }
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ Failed to send Telegram notification: {ex.Message}");
            }
            return false;
        }

        /// <summary>
        /// Send a generated PDF to the user's linked Telegram chat through the edge function.
        /// The file is uploaded as multipart by the function; the caller deletes the local copy.
        /// </summary>
        public async Task<bool> SendTelegramDocumentAsync(string chatId, string filePath, string caption)
        {
            if (string.IsNullOrWhiteSpace(chatId) || string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
                return false;
            if (string.IsNullOrWhiteSpace(_userToken))
                return false;

            try
            {
                var bytes = await File.ReadAllBytesAsync(filePath);
                var payload = JsonConvert.SerializeObject(new
                {
                    chat_id = chatId,
                    document_base64 = Convert.ToBase64String(bytes),
                    filename = Path.GetFileName(filePath),
                    caption
                });

                AddAuthHeader();
                using var content = new StringContent(payload, Encoding.UTF8, "application/json");
                using var response = await _httpClient.PostAsync(
                    $"{_supabaseUrl}/functions/v1/desktop-telegram-notify", content);

                if (!response.IsSuccessStatusCode)
                {
                    SyncLogger.Log($"⚠️ Telegram document service returned HTTP {(int)response.StatusCode}");
                    return false;
                }

                var body = await response.Content.ReadAsStringAsync();
                var result = JsonConvert.DeserializeObject<Dictionary<string, bool>>(body);
                return result != null && result.TryGetValue("sent", out var sent) && sent;
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"⚠️ Failed to send Telegram document: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Send straight to the Telegram Bot API when a bot token is configured locally.
        /// </summary>
        private async Task<bool> SendTelegramDirectAsync(string chatId, string message)
        {
            if (string.IsNullOrWhiteSpace(_telegramBotToken)) return false;

            try
            {
                var payload = JsonConvert.SerializeObject(new
                {
                    chat_id = chatId,
                    text = message,
                    parse_mode = "HTML",
                    disable_web_page_preview = true,
                });

                using var tgClient = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
                using var content = new StringContent(payload, Encoding.UTF8, "application/json");
                using var response = await tgClient.PostAsync(
                    $"https://api.telegram.org/bot{_telegramBotToken}/sendMessage", content);

                if (response.IsSuccessStatusCode) return true;

                var error = await response.Content.ReadAsStringAsync();
                SyncLogger.Log($"Telegram direct send returned HTTP {(int)response.StatusCode}: {error}");
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"Telegram direct send failed: {ex.Message}");
            }
            return false;
        }
    }
}
