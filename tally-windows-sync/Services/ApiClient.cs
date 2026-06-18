using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using TallySyncApp.Models;

namespace TallySyncApp.Services
{
    /// <summary>
    /// ApiClient - Handles communication directly with InsForge database REST API.
    /// Uploads data to the cloud database
    /// </summary>
    public class ApiClient : IDisposable
    {
        private readonly HttpClient _httpClient;
        private readonly string _supabaseUrl;
        private readonly string _apiKey; // Anon Key
        private string? _userToken; // Bearer Token for Auth
        private readonly string _telegramBotToken;
        private const int MaxPendingTransactionRetries = 3;
        private static readonly TimeSpan ProcessingRecoveryAge = TimeSpan.FromMinutes(5);
        private static readonly Regex RetryTagRegex = new(@"\[retry\s*(\d+)\/\d+\]", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex SafeSqlIdentifierRegex = new(@"^[A-Za-z_][A-Za-z0-9_]*$", RegexOptions.Compiled);
        private readonly ConcurrentDictionary<string, bool> _tableExistsCache = new(StringComparer.OrdinalIgnoreCase);
        private readonly ConcurrentDictionary<string, bool> _columnExistsCache = new(StringComparer.OrdinalIgnoreCase);

        private static readonly HashSet<string> OptionalSyncTables = new(StringComparer.OrdinalIgnoreCase)
        {
            "ledger_groups", "cost_centres", "godowns", "stock_groups", "stock_categories",
            "currencies", "voucher_types", "units", "budgets", "budget_allocations",
            "bank_allocations", "bill_allocations", "gst_details", "price_lists",
            "debit_credit_notes", "voucher_ledger_entries", "voucher_stock_entries"
        };

        public ApiClient(string supabaseUrl, string apiKey, int timeoutSeconds = 60, string telegramBotToken = "")
        {
            _supabaseUrl = supabaseUrl.TrimEnd('/');
            _apiKey = apiKey;
            _telegramBotToken = telegramBotToken;

            // FIX: Removed UseProxy = false. We must use system proxy to avoid VPN/Firewall black holes.
            var handler = new HttpClientHandler
            {
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

        public void SetUserToken(string? token)
        {
            _userToken = string.IsNullOrWhiteSpace(token) ? null : token;
        }

        public void ResetSchemaCapabilityCache()
        {
            _tableExistsCache.Clear();
            _columnExistsCache.Clear();
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
        /// Test connection to InsForge database API.
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
                    return (true, "Connected to InsForge successfully");
                }
                return (false, $"InsForge error: {response.StatusCode} ({url})");
            }
            catch (Exception ex)
            {
                return (false, $"Connection error to {url}: {ex.Message}");
            }
        }

        /// <summary>
        /// Convert company ID to UUID format for consistent cloud queries.
        /// Tally may pass raw string IDs, but cloud storage uses deterministic UUIDs.
        /// </summary>
        private string ResolveCompanyUuid(string companyId)
        {
            if (Guid.TryParse(companyId, out var existingGuid))
            {
                return existingGuid.ToString();
            }
            return GenerateDeterministicGuid(companyId).ToString();
        }

        /// <summary>
        /// Sync company information
        /// </summary>
        public async Task<ApiResponse<object>> SyncCompanyAsync(Company company)
        {
            try
            {
                AddAuthHeader();
                
                string companyUuid = "";
                
                // FIX: Foreign Key Constraint Error (HTTP 409)
                // If a company exists in Supabase by name but has a DIFFERENT UUID than what we'd generate,
                // an UPSERT on "name" will try to UPDATE the UUID. Postgres blocks this because child tables
                // (ledgers, vouchers) reference the old UUID.
                // SOLUTION: Always fetch the existing company by name first to preserve its database UUID.
                
                string encodedName = Uri.EscapeDataString(company.Name);
                var url = $"{_supabaseUrl}/rest/v1/companies?name=eq.{encodedName}&select=id";
                var responseStr = await _httpClient.GetStringAsync(url);
                var existingCompanies = JsonConvert.DeserializeObject<List<Dictionary<string, object>>>(responseStr);
                
                if (existingCompanies != null && existingCompanies.Count > 0 && existingCompanies[0].ContainsKey("id"))
                {
                    // Use existing UUID from database to prevent foreign key errors
                    companyUuid = existingCompanies[0]["id"].ToString() ?? "";
                    SyncLogger.Log($"[DEBUG] Found existing company '{company.Name}' with UUID {companyUuid}");
                }
                else
                {
                    // Determine new UUID
                    if (Guid.TryParse(company.Id, out var existingGuid))
                    {
                        companyUuid = existingGuid.ToString();
                    }
                    else
                    {
                        companyUuid = GenerateDeterministicGuid(company.Id ?? company.Name).ToString();
                    }
                    SyncLogger.Log($"[DEBUG] Company '{company.Name}' not in DB. Generated new UUID {companyUuid}");
                }

                var companyData = new Dictionary<string, object?>
                {
                    ["id"] = companyUuid,
                    ["name"] = company.Name
                };

                var optionalCompanyColumns = new Dictionary<string, object?>
                {
                    ["gstin"] = company.Gstin,
                    ["address"] = company.Address,
                    ["state"] = company.State,
                    ["phone"] = company.Phone,
                    ["email"] = company.Email,
                    ["owner_id"] = company.OwnerId,
                    ["last_sync_at"] = DateTime.UtcNow.ToString("o"),
                    ["is_active"] = true,
                    ["financial_year_start"] = company.FinancialYearStart?.ToString("yyyy-MM-dd"),
                    ["financial_year_end"] = company.FinancialYearEnd?.ToString("yyyy-MM-dd"),
                    ["currency_symbol"] = company.CurrencySymbol
                };

                var companyColumnChecks = optionalCompanyColumns.Keys.ToDictionary(
                    column => column,
                    column => ColumnExistsAsync("companies", column),
                    StringComparer.OrdinalIgnoreCase);

                await Task.WhenAll(companyColumnChecks.Values);

                var skippedColumns = new List<string>();
                foreach (var entry in optionalCompanyColumns)
                {
                    if (companyColumnChecks[entry.Key].Result)
                    {
                        companyData[entry.Key] = entry.Value;
                    }
                    else
                    {
                        skippedColumns.Add(entry.Key);
                    }
                }

                if (skippedColumns.Count > 0)
                {
                    SyncLogger.Log($"[WARN] Skipping unsupported companies columns: {string.Join(", ", skippedColumns)}");
                }

                // Store the UUID back for other operations
                company.Id = companyUuid;

                // Upsert on 'id' instead of 'name' since the UUID is now guaranteed stable
                return await UpsertAsync<object>("companies", new List<Dictionary<string, object?>> { companyData }, "id");
            }
            catch (Exception ex)
            {
                return new ApiResponse<object> { Success = false, Error = ex.Message };
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
            string onConflict = "id",
            string? ownerId = null)
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

            bool tableExists = await TableExistsAsync(tableName);
            if (!tableExists)
            {
                var missingTableMessage = $"Skipped '{tableName}' sync because table is missing in backend schema.";
                if (OptionalSyncTables.Contains(tableName))
                {
                    SyncLogger.Log($"[WARN] {missingTableMessage}");
                    return BuildSkippedSyncResult(data.Count, missingTableMessage);
                }

                return new ApiResponse<SyncResultDetails>
                {
                    Success = false,
                    Error = $"Required table '{tableName}' is missing (42P01/404). Apply additive InsForge migration and retry.",
                    Details = new SyncResultDetails
                    {
                        Total = data.Count,
                        Success = false,
                        Count = 0,
                        Failed = data.Count
                    }
                };
            }

            bool ownerColumnSupported = false;
            if (!string.IsNullOrWhiteSpace(ownerId))
            {
                ownerColumnSupported = await ColumnExistsAsync(tableName, "owner_id");
                if (!ownerColumnSupported)
                {
                    SyncLogger.Log($"[WARN] Table '{tableName}' has no owner_id column. Upload will continue without owner_id.");
                }
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
            SyncLogger.Log($"API CALL ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ table={tableName}, on_conflict={onConflict}, items={data.Count}");

            // Assign company_id and convert to dictionary for Supabase
            var itemsWithCompanyId = new List<Dictionary<string, object>>();
            foreach (var item in data)
            {
                var json = JsonConvert.SerializeObject(item);
                var dict = JsonConvert.DeserializeObject<Dictionary<string, object>>(json);
                if (dict != null)
                {
                    dict["company_id"] = companyUuid;
                    if (!string.IsNullOrEmpty(ownerId) && ownerColumnSupported)
                    {
                        dict["owner_id"] = ownerId;
                    }
                    else if (!ownerColumnSupported)
                    {
                        dict.Remove("owner_id");
                    }
                    
                    if (tableName == "vouchers" || tableName == "ledgers" || tableName == "stock_items")
            {
                // Explicitly preserve alter_id to prevent mapping loss
                if (dict.ContainsKey("AlterId") && !dict.ContainsKey("alter_id"))
                {
                    dict["alter_id"] = dict["AlterId"];
                }
                
                // CRITICAL FIX: Sanitize alter_id - empty strings break TEXT column sorting
                // Convert empty/whitespace to null, and ensure it's a clean numeric string
                if (dict.ContainsKey("alter_id"))
                {
                    var aidVal = dict["alter_id"]?.ToString()?.Trim();
                    if (string.IsNullOrWhiteSpace(aidVal))
                    {
                        dict["alter_id"] = null!; // Store as NULL, not empty string
                    }
                    else if (long.TryParse(aidVal, out long numericAid))
                    {
                        dict["alter_id"] = numericAid.ToString(); // Clean numeric string
                    }
                    // else: keep as-is (some non-numeric value from Tally)
                }
                
                // Ensure master_id is also mapped correctly
                if (dict.ContainsKey("MasterId") && !dict.ContainsKey("master_id"))
                {
                    dict["master_id"] = dict["MasterId"];
                }
            }
            
            if (tableName == "vouchers")
                    {
                        if ((!dict.ContainsKey("raw_data") || dict["raw_data"] == null)
                            && (dict.ContainsKey("ledger_entries") || dict.ContainsKey("inventory_entries")))
                        {
                            var rawSnapshot = new Dictionary<string, object?>();
                            if (dict.ContainsKey("ledger_entries")) rawSnapshot["ledger_entries"] = dict["ledger_entries"];
                            if (dict.ContainsKey("inventory_entries")) rawSnapshot["inventory_entries"] = dict["inventory_entries"];
                            if (dict.ContainsKey("voucher_type")) rawSnapshot["voucher_type"] = dict["voucher_type"];
                            if (dict.ContainsKey("voucher_number")) rawSnapshot["voucher_number"] = dict["voucher_number"];
                            if (dict.ContainsKey("voucher_date")) rawSnapshot["voucher_date"] = dict["voucher_date"];
                            if (dict.ContainsKey("party_name")) rawSnapshot["party_name"] = dict["party_name"];
                            if (rawSnapshot.Count > 0) dict["raw_data"] = rawSnapshot;
                        }

                        if ((!dict.ContainsKey("is_invoice") || dict["is_invoice"] == null) && dict.ContainsKey("inventory_entries"))
                        {
                            var inventoryText = dict["inventory_entries"]?.ToString() ?? string.Empty;
                            if (!string.IsNullOrWhiteSpace(inventoryText) && inventoryText != "[]")
                            {
                                dict["is_invoice"] = true;
                                dict["is_accounting_voucher"] = false;
                            }
                        }

                        // Remove nested data - synced separately to voucher_ledger_entries/voucher_stock_entries
                        dict.Remove("ledger_entries");
                        dict.Remove("inventory_entries");

                        // Canonicalize known key variants before any voucher mapping.
                        if (dict.ContainsKey("Id") && !dict.ContainsKey("id")) dict["id"] = dict["Id"];
                        if (dict.ContainsKey("VoucherId") && !dict.ContainsKey("voucher_id")) dict["voucher_id"] = dict["VoucherId"];
                        if (dict.ContainsKey("VoucherDate") && !dict.ContainsKey("voucher_date")) dict["voucher_date"] = dict["VoucherDate"];
                        if (dict.ContainsKey("VchDate") && !dict.ContainsKey("vch_date")) dict["vch_date"] = dict["VchDate"];

                        // Keep legacy + new date fields in sync.
                        DateTime resolvedVoucherDate = DateTime.Today;
                        if (dict.ContainsKey("voucher_date")
                            && DateTime.TryParse(dict["voucher_date"]?.ToString(), out var parsedVoucherDate))
                        {
                            resolvedVoucherDate = parsedVoucherDate.Date;
                        }
                        else if (dict.ContainsKey("vch_date")
                            && DateTime.TryParse(dict["vch_date"]?.ToString(), out var parsedLegacyVoucherDate))
                        {
                            resolvedVoucherDate = parsedLegacyVoucherDate.Date;
                        }

                        dict["voucher_date"] = resolvedVoucherDate.ToString("yyyy-MM-dd");
                        dict["vch_date"] = resolvedVoucherDate.ToString("yyyy-MM-dd");

                        // Legacy compatibility aliases used by older schema/queries.
                        if (!dict.ContainsKey("party_ledger_name") || string.IsNullOrWhiteSpace(dict["party_ledger_name"]?.ToString()))
                        {
                            dict["party_ledger_name"] = dict.ContainsKey("party_name") ? dict["party_name"] : "";
                        }
                        if ((!dict.ContainsKey("party_name") || string.IsNullOrWhiteSpace(dict["party_name"]?.ToString()))
                            && dict.ContainsKey("party_ledger_name"))
                        {
                            dict["party_name"] = dict["party_ledger_name"] ?? "";
                        }

                        if ((!dict.ContainsKey("party_gstin") || string.IsNullOrWhiteSpace(dict["party_gstin"]?.ToString()))
                            && dict.ContainsKey("party_gst_number"))
                        {
                            dict["party_gstin"] = dict["party_gst_number"] ?? "";
                        }

                        if (!dict.ContainsKey("amount") || dict["amount"] == null)
                        {
                            if (dict.ContainsKey("total_amount") && dict["total_amount"] != null)
                            {
                                dict["amount"] = dict["total_amount"];
                            }
                            else if (dict.ContainsKey("grand_total") && dict["grand_total"] != null)
                            {
                                dict["amount"] = dict["grand_total"];
                            }
                            else
                            {
                                dict["amount"] = 0m;
                            }
                        }

                        // Keep rows visible in UI filters that use is_deleted=false.
                        if (!dict.ContainsKey("is_deleted") || dict["is_deleted"] == null)
                        {
                            dict["is_deleted"] = false;
                        }

                        // Guarantee vouchers.id is always populated before schema-field pruning.
                        // This avoids inserting NULL id when voucher_id is removed by filtering.
                        string? voucherIdentitySeed = null;
                        if (dict.ContainsKey("voucher_id"))
                        {
                            voucherIdentitySeed = dict["voucher_id"]?.ToString();
                        }

                        if (string.IsNullOrWhiteSpace(voucherIdentitySeed) && dict.ContainsKey("id"))
                        {
                            voucherIdentitySeed = dict["id"]?.ToString();
                        }

                        if (string.IsNullOrWhiteSpace(voucherIdentitySeed))
                        {
                            // Last-resort deterministic seed from stable voucher fields.
                            var typeSeed = dict.ContainsKey("voucher_type") ? dict["voucher_type"]?.ToString() : "";
                            var numberSeed = dict.ContainsKey("voucher_number") ? dict["voucher_number"]?.ToString() : "";
                            var dateSeed = dict.ContainsKey("voucher_date")
                                ? dict["voucher_date"]?.ToString()
                                : (dict.ContainsKey("vch_date") ? dict["vch_date"]?.ToString() : "");
                            var companySeed = dict.ContainsKey("company_id") ? dict["company_id"]?.ToString() : "";
                            voucherIdentitySeed = $"{companySeed}|{typeSeed}|{numberSeed}|{dateSeed}";
                        }

                        if (Guid.TryParse(voucherIdentitySeed, out _))
                        {
                            dict["id"] = voucherIdentitySeed!;
                        }
                        else
                        {
                            dict["id"] = GenerateDeterministicGuid(voucherIdentitySeed!).ToString();
                        }

                        // Drop any fields not present in vouchers schema to avoid PGRST204 errors.
                        var voucherAllowedColumns = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                        {
                            "id", "company_id", "voucher_number", "voucher_type", "vch_date", "reference_number", "reference_date",
                            "party_ledger_id", "party_ledger_name", "amount", "is_invoice", "is_accounting_voucher", "is_cancelled",
                            "narration", "guid", "master_id", "alter_id", "synced_at", "raw_data", "created_at", "updated_at",
                            "voucher_date", "party_name", "total_amount", "grand_total", "is_deleted", "owner_id", "deleted_at",
                            "party_state", "party_address", "place_of_supply", "party_gstin"
                        };

                        foreach (var key in dict.Keys.ToList())
                        {
                            if (!voucherAllowedColumns.Contains(key))
                            {
                                dict.Remove(key);
                            }
                        }

                        // Final guard: critical NOT NULL voucher columns must always be present.
                        if (!dict.ContainsKey("id") || string.IsNullOrWhiteSpace(dict["id"]?.ToString()))
                        {
                            var safeType = dict.ContainsKey("voucher_type") ? dict["voucher_type"]?.ToString() : "";
                            var safeNo = dict.ContainsKey("voucher_number") ? dict["voucher_number"]?.ToString() : "";
                            var safeDate = dict.ContainsKey("vch_date") ? dict["vch_date"]?.ToString() : dict["voucher_date"]?.ToString();
                            dict["id"] = GenerateDeterministicGuid($"{companyUuid}|{safeType}|{safeNo}|{safeDate}").ToString();
                        }

                        if (!dict.ContainsKey("vch_date") || string.IsNullOrWhiteSpace(dict["vch_date"]?.ToString()))
                        {
                            var safeDate = dict.ContainsKey("voucher_date")
                                ? (dict["voucher_date"]?.ToString() ?? DateTime.Today.ToString("yyyy-MM-dd"))
                                : DateTime.Today.ToString("yyyy-MM-dd");
                            dict["vch_date"] = safeDate;
                        }

                        // Keep both date aliases aligned for mixed legacy/new schemas.
                        dict["voucher_date"] = dict["vch_date"];
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

                        // For child tables, convert parent FK IDs to UUID as well.
                        if (dict.ContainsKey("sale_id"))
                        {
                            string saleId = dict["sale_id"]?.ToString() ?? "";
                            if (!string.IsNullOrEmpty(saleId) && !Guid.TryParse(saleId, out _))
                            {
                                dict["sale_id"] = GenerateDeterministicGuid(saleId).ToString();
                            }
                        }

                        if (dict.ContainsKey("purchase_id"))
                        {
                            string purchaseId = dict["purchase_id"]?.ToString() ?? "";
                            if (!string.IsNullOrEmpty(purchaseId) && !Guid.TryParse(purchaseId, out _))
                            {
                                dict["purchase_id"] = GenerateDeterministicGuid(purchaseId).ToString();
                            }
                        }
                        // Mapping logic for each record
                        if (dict.ContainsKey("id") && dict["id"] != null)
                        {
                            // Ensure no duplicates in the same batch list
                            string id = dict["id"].ToString()!;
                            if (itemsWithCompanyId.Any(x => x.ContainsKey("id") && x["id"].ToString() == id))
                            {
                                continue; // Skip duplicate ID within the same batch
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
            List<Voucher> vouchers,
            string? ownerId = null)
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

                bool ledgerTableExists = await TableExistsAsync("voucher_ledger_entries");
                bool stockTableExists = await TableExistsAsync("voucher_stock_entries");
                bool ledgerOwnerSupported = !string.IsNullOrWhiteSpace(ownerId) && await ColumnExistsAsync("voucher_ledger_entries", "owner_id");
                bool stockOwnerSupported = !string.IsNullOrWhiteSpace(ownerId) && await ColumnExistsAsync("voucher_stock_entries", "owner_id");

                if (!ledgerTableExists)
                {
                    SyncLogger.Log("[WARN] Skipping voucher_ledger_entries sync: table missing in backend schema.");
                }
                if (!stockTableExists)
                {
                    SyncLogger.Log("[WARN] Skipping voucher_stock_entries sync: table missing in backend schema.");
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
                            var dict = new Dictionary<string, object>
                            {
                                ["id"] = GenerateDeterministicGuid(entryKey).ToString(),
                                ["company_id"] = companyUuid,
                                ["voucher_id"] = Guid.TryParse(voucher.VoucherId, out var ledgerVoucherGuid)
                                    ? ledgerVoucherGuid.ToString()
                                    : GenerateDeterministicGuid(voucher.VoucherId).ToString(),
                                ["ledger_name"] = entry.LedgerName ?? "",
                                ["amount"] = entry.Amount,
                                ["is_debit"] = entry.IsDebit
                            };
                            
                            if (!string.IsNullOrEmpty(ownerId) && ledgerOwnerSupported)
                                dict["owner_id"] = ownerId;
                                
                            allLedgerEntries.Add(dict);
                            ledgerIdx++;
                        }
                    }
                }
                
                if (allLedgerEntries.Count > 0 && ledgerTableExists)
                {
                    if (!ledgerOwnerSupported)
                    {
                        foreach (var row in allLedgerEntries) row.Remove("owner_id");
                    }

                    SyncLogger.Log($"[INFO] Syncing {allLedgerEntries.Count} voucher ledger entries...");
                    var ledgerResult = await UpsertAsync<object>("voucher_ledger_entries", allLedgerEntries, "id");
                    if (ledgerResult.Success) ledgerEntriesSynced = allLedgerEntries.Count;
                    else SyncLogger.Log($"[WARN] Ledger entries sync failed: {ledgerResult.Error}");
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
                            var dict = new Dictionary<string, object>
                            {
                                ["id"] = GenerateDeterministicGuid(entryKey).ToString(),
                                ["company_id"] = companyUuid,
                                ["voucher_id"] = Guid.TryParse(voucher.VoucherId, out var stockVoucherGuid)
                                    ? stockVoucherGuid.ToString()
                                    : GenerateDeterministicGuid(voucher.VoucherId).ToString(),
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
                            
                            if (!string.IsNullOrEmpty(ownerId) && stockOwnerSupported)
                                dict["owner_id"] = ownerId;
                                
                            allStockEntries.Add(dict);
                            stockIdx++;
                        }
                    }
                }
                
                if (allStockEntries.Count > 0 && stockTableExists)
                {
                    if (!stockOwnerSupported)
                    {
                        foreach (var row in allStockEntries) row.Remove("owner_id");
                    }

                    SyncLogger.Log($"[INFO] Syncing {allStockEntries.Count} voucher stock entries...");
                    var stockResult = await UpsertAsync<object>("voucher_stock_entries", allStockEntries, "id");
                    if (stockResult.Success) stockEntriesSynced = allStockEntries.Count;
                    else SyncLogger.Log($"[WARN] Stock entries sync failed: {stockResult.Error}");
                }
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"[ERROR] SyncVoucherEntriesAsync error: {ex.Message}");
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
                SyncLogger.Log($"ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â GetAppSettingsAsync error: {ex.Message}");
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
                string companyUuid = ResolveCompanyUuid(companyId);
                var url = $"{_supabaseUrl}/rest/v1/sync_metadata?company_id=eq.{companyUuid}&sync_key=eq.{key}&select=sync_value";
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
                string companyUuid = ResolveCompanyUuid(companyId);
                var payload = new { company_id = companyUuid, sync_key = key, sync_value = value };
                await UpsertAsync<object>("sync_metadata", payload, "company_id,sync_key");
            }
            catch { }
        }

        /// <summary>
        /// Check if a company already has at least one record in a table.
        /// Used to decide whether a full backfill is needed for legacy/incomplete syncs.
        /// </summary>
        public async Task<bool> HasCompanyDataAsync(string companyId, string tableName)
        {
            try
            {
                AddAuthHeader();
                string companyUuid = ResolveCompanyUuid(companyId);
                var url = $"{_supabaseUrl}/rest/v1/{tableName}?company_id=eq.{companyUuid}&select=id&limit=1";
                var response = await _httpClient.GetStringAsync(url);
                var rows = JsonConvert.DeserializeObject<List<Dictionary<string, object>>>(response);
                return rows != null && rows.Count > 0;
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â HasCompanyDataAsync({tableName}) error: {ex.Message}");
                return false;
            }
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
                string companyUuid = ResolveCompanyUuid(companyId);
                
                // FIX: alter_id is TEXT in Supabase ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ lexicographic sort is wrong ("9999" > "89542").
                // FIX 2: Paginate with offset so companies with >50000 records get the correct max.
                //        Without pagination, the real max AlterID was missed, causing repeated full resyncs.
                const int PAGE_SIZE = 50000;
                int offset = 0;
                long maxAlterId = 0;
                int totalValidCount = 0;
                
                while (true)
                {
                    // Server-side null filter reduces payload; fetch only non-null alter_ids
                    var url = $"{_supabaseUrl}/rest/v1/{tableName}?company_id=eq.{companyUuid}&select=alter_id&alter_id=not.is.null&limit={PAGE_SIZE}&offset={offset}";
                    var response = await _httpClient.GetStringAsync(url);
                    
                    var items = JsonConvert.DeserializeObject<List<Dictionary<string, object>>>(response);
                    if (items == null || items.Count == 0) break;
                    
                    foreach (var item in items)
                    {
                        if (item.ContainsKey("alter_id") && item["alter_id"] != null)
                        {
                            string alterIdStr = item["alter_id"].ToString()?.Trim() ?? "";
                            if (string.IsNullOrWhiteSpace(alterIdStr)) continue;
                            
                            if (decimal.TryParse(alterIdStr, out decimal alterIdDec))
                            {
                                long alterId = (long)alterIdDec;
                                if (alterId > maxAlterId) maxAlterId = alterId;
                                totalValidCount++;
                            }
                        }
                    }
                    
                    // If fewer rows than PAGE_SIZE returned, we've reached the last page
                    if (items.Count < PAGE_SIZE) break;
                    offset += PAGE_SIZE;
                }
                
                SyncLogger.Log($"[DEBUG] {tableName} max alter_id = {maxAlterId} (from {totalValidCount} valid records, offset reached {offset})");
                return maxAlterId;
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â GetMaxAlterIdAsync error: {ex.Message}");
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
                string companyUuid = ResolveCompanyUuid(companyId);
                
                // Fetch from sync_state table
                var request = new HttpRequestMessage(HttpMethod.Get, $"{_supabaseUrl}/rest/v1/sync_state?company_id=eq.{companyUuid}&data_type=eq.{dataType}&select=last_sync_at,last_alter_id,is_initial_sync_complete");
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
        /// Generic upsert to InsForge database API.
        /// </summary>
        private async Task<ApiResponse<T>> UpsertAsync<T>(string table, object payload, string onConflict = "id")
        {
            try
            {
                AddAuthHeader();

                var normalizedPayload = NormalizePayloadForUpsert(payload);
                if (string.Equals(table, "vouchers", StringComparison.OrdinalIgnoreCase)
                    && normalizedPayload is JArray voucherRows)
                {
                    EnsureVoucherCriticalFields(voucherRows);
                }
                var serializerSettings = new JsonSerializerSettings
                {
                    NullValueHandling = NullValueHandling.Ignore,
                    DateFormatString = "yyyy-MM-dd"
                };

                var json = normalizedPayload is JToken token
                    ? token.ToString(Formatting.None)
                    : JsonConvert.SerializeObject(normalizedPayload, serializerSettings);

                if (table == "vouchers")
                {
                    SyncLogger.Log($"DEBUG UPLOAD VOUCHERS: {json.Substring(0, Math.Min(json.Length, 500))}...");
                }

                if (table == "companies")
                {
                    SyncLogger.Log($"DEBUG UPLOAD COMPANY: {json}");
                }

                return await UpsertViaRawSqlAsync<T>(table, normalizedPayload, onConflict);
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

        private const int UPSERT_CHUNK_SIZE = 250;

        private async Task<ApiResponse<T>> UpsertViaRawSqlAsync<T>(string table, object normalizedPayload, string onConflict)
        {
            if (!IsSafeSqlIdentifier(table))
            {
                return new ApiResponse<T> { Success = false, Error = $"Unsafe table name '{table}'." };
            }

            var rows = ToObjectRows(normalizedPayload);
            if (rows.Count == 0)
            {
                return new ApiResponse<T> { Success = true, Message = "No rows to sync" };
            }

            var conflictColumns = onConflict
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Where(IsSafeSqlIdentifier)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (conflictColumns.Count == 0)
            {
                return new ApiResponse<T> { Success = false, Error = $"Unsafe conflict key '{onConflict}' for '{table}'." };
            }

            var allColumns = rows
                .SelectMany(row => row.Properties().Select(prop => prop.Name))
                .Where(IsSafeSqlIdentifier)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var supportedColumns = new List<string>();
            foreach (var column in allColumns)
            {
                if (await ColumnExistsAsync(table, column))
                {
                    supportedColumns.Add(column);
                }
            }

            foreach (var row in rows)
            {
                foreach (var prop in row.Properties().ToList())
                {
                    if (!supportedColumns.Contains(prop.Name, StringComparer.OrdinalIgnoreCase))
                    {
                        prop.Remove();
                    }
                }
            }

            var missingConflict = conflictColumns.Where(c => !supportedColumns.Contains(c, StringComparer.OrdinalIgnoreCase)).ToList();
            if (missingConflict.Count > 0)
            {
                return new ApiResponse<T>
                {
                    Success = false,
                    Error = $"Cannot upsert '{table}': conflict column(s) missing from schema/payload: {string.Join(", ", missingConflict)}"
                };
            }

            // --- Chunked upload: split rows into batches ---
            int totalRows = rows.Count;
            int chunkSize = UPSERT_CHUNK_SIZE;
            int totalChunks = (int)Math.Ceiling((double)totalRows / chunkSize);
            int syncedRows = 0;

            if (totalChunks > 1)
            {
                SyncLogger.Log($"[CHUNK] {table}: {totalRows} rows → {totalChunks} chunks of {chunkSize}");
            }

            for (int chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++)
            {
                var chunk = rows.Skip(chunkIndex * chunkSize).Take(chunkSize).ToList();
                var chunkResult = await SendUpsertChunkAsync<T>(table, chunk, onConflict);

                if (!chunkResult.Success)
                {
                    SyncLogger.Log($"[CHUNK] {table}: chunk {chunkIndex + 1}/{totalChunks} FAILED after {syncedRows}/{totalRows} rows — {chunkResult.Error}");
                    return new ApiResponse<T>
                    {
                        Success = false,
                        Error = $"Chunk {chunkIndex + 1}/{totalChunks} failed ({syncedRows}/{totalRows} synced): {chunkResult.Error}"
                    };
                }

                syncedRows += chunk.Count;

                if (totalChunks > 1)
                {
                    SyncLogger.Log($"[CHUNK] {table}: chunk {chunkIndex + 1}/{totalChunks} OK ({syncedRows}/{totalRows} rows synced)");
                }
            }

            return new ApiResponse<T> { Success = true, Message = $"Synced {syncedRows} rows in {totalChunks} chunk(s)" };
        }

        /// <summary>
        /// Send a single chunk of rows to PostgREST with retry logic.
        /// </summary>
        private async Task<ApiResponse<T>> SendUpsertChunkAsync<T>(string table, List<JObject> chunk, string onConflict, int maxRetries = 2)
        {
            for (int attempt = 0; attempt <= maxRetries; attempt++)
            {
                try
                {
                    AddAuthHeader();
                    var jsonArray = new JArray(chunk);
                    var content = new StringContent(jsonArray.ToString(Formatting.None), Encoding.UTF8, "application/json");
                    var request = new HttpRequestMessage(HttpMethod.Post, $"{_supabaseUrl}/rest/v1/{table}?on_conflict={onConflict}");
                    request.Headers.Add("Prefer", "resolution=merge-duplicates");
                    request.Content = content;

                    var response = await _httpClient.SendAsync(request);
                    var responseContent = await response.Content.ReadAsStringAsync();

                    if (response.IsSuccessStatusCode)
                    {
                        return new ApiResponse<T> { Success = true, Message = "Chunk sync successful" };
                    }

                    // Retry on 5xx server errors
                    if ((int)response.StatusCode >= 500 && attempt < maxRetries)
                    {
                        SyncLogger.Log($"[CHUNK] {table}: server error {(int)response.StatusCode}, retry {attempt + 1}/{maxRetries}...");
                        await Task.Delay(1000 * (attempt + 1));
                        continue;
                    }

                    var parsed = ParseDatabaseError(responseContent);
                    SyncLogger.Log($"UPSERT FAILED [{table}] POSTGREST HTTP {(int)response.StatusCode}: {responseContent.Substring(0, Math.Min(responseContent.Length, 300))}");
                    return new ApiResponse<T>
                    {
                        Success = false,
                        Error = BuildDatabaseErrorMessage(table, (int)response.StatusCode, parsed, responseContent)
                    };
                }
                catch (TaskCanceledException) when (attempt < maxRetries)
                {
                    SyncLogger.Log($"[CHUNK] {table}: timeout, retry {attempt + 1}/{maxRetries}...");
                    await Task.Delay(1000 * (attempt + 1));
                }
                catch (HttpRequestException ex) when (attempt < maxRetries)
                {
                    SyncLogger.Log($"[CHUNK] {table}: network error '{ex.Message}', retry {attempt + 1}/{maxRetries}...");
                    await Task.Delay(1000 * (attempt + 1));
                }
                catch (Exception ex)
                {
                    return new ApiResponse<T> { Success = false, Error = $"Chunk request failed: {ex.Message}" };
                }
            }

            return new ApiResponse<T> { Success = false, Error = $"Chunk failed after {maxRetries} retries" };
        }

        private static bool IsSafeSqlIdentifier(string value)
        {
            return !string.IsNullOrWhiteSpace(value) && SafeSqlIdentifierRegex.IsMatch(value);
        }

        private static List<JObject> ToObjectRows(object payload)
        {
            var token = payload as JToken ?? JToken.FromObject(payload);
            if (token is JObject singleObject)
            {
                return new List<JObject> { singleObject };
            }

            if (token is JArray array)
            {
                return array.OfType<JObject>().ToList();
            }

            return new List<JObject>();
        }

        private static string BuildUpsertSql(string table, List<string> columns, List<string> conflictColumns, List<JObject> rows, out List<object?> parameters)
        {
            parameters = new List<object?>();
            var quotedColumns = columns.Select(QuoteIdentifier).ToList();
            var valuesSql = new List<string>();

            foreach (var row in rows)
            {
                var placeholders = new List<string>();
                foreach (var column in columns)
                {
                    parameters.Add(ConvertSqlParameterValue(row[column]));
                    placeholders.Add($"${parameters.Count}");
                }
                valuesSql.Add($"({string.Join(", ", placeholders)})");
            }

            var conflictSql = string.Join(", ", conflictColumns.Select(QuoteIdentifier));
            var updateColumns = columns
                .Where(column => !conflictColumns.Contains(column, StringComparer.OrdinalIgnoreCase))
                .ToList();
            var updateSql = updateColumns.Count == 0
                ? "DO NOTHING"
                : "DO UPDATE SET " + string.Join(", ", updateColumns.Select(column => $"{QuoteIdentifier(column)} = EXCLUDED.{QuoteIdentifier(column)}"));

            return $"INSERT INTO public.{QuoteIdentifier(table)} ({string.Join(", ", quotedColumns)}) VALUES {string.Join(", ", valuesSql)} ON CONFLICT ({conflictSql}) {updateSql};";
        }

        private static string QuoteIdentifier(string value)
        {
            return "\"" + value.Replace("\"", "\"\"") + "\"";
        }

        private static object? ConvertSqlParameterValue(JToken? token)
        {
            if (token == null || token.Type == JTokenType.Null || token.Type == JTokenType.Undefined)
            {
                return null;
            }

            if (token is JValue value)
            {
                return value.Value;
            }

            return token.ToString(Formatting.None);
        }

        /// <summary>
        /// Final safety net before POST: ensure required voucher fields are always present.
        /// This protects against case/shape drift that can drop critical keys (id, vch_date).
        /// </summary>
        private void EnsureVoucherCriticalFields(JArray rows)
        {
            var idInjected = 0;
            var dateNormalized = 0;
            foreach (var token in rows)
            {
                if (token is not JObject row) continue;

                var companyId = row["company_id"]?.ToString()?.Trim() ?? "";

                // Guarantee id even if upstream mapping dropped it.
                var existingId = row["id"]?.ToString()?.Trim();
                if (string.IsNullOrWhiteSpace(existingId))
                {
                    existingId = row["Id"]?.ToString()?.Trim();
                }

                if (string.IsNullOrWhiteSpace(existingId))
                {
                    var seed = row["voucher_id"]?.ToString()?.Trim();
                    if (string.IsNullOrWhiteSpace(seed)) seed = row["VoucherId"]?.ToString()?.Trim();
                    if (string.IsNullOrWhiteSpace(seed)) seed = row["guid"]?.ToString()?.Trim();
                    if (string.IsNullOrWhiteSpace(seed)) seed = row["master_id"]?.ToString()?.Trim();

                    if (string.IsNullOrWhiteSpace(seed))
                    {
                        var typeSeed = row["voucher_type"]?.ToString()?.Trim() ?? "";
                        var numberSeed = row["voucher_number"]?.ToString()?.Trim() ?? "";
                        var dateSeed = row["vch_date"]?.ToString()?.Trim();
                        if (string.IsNullOrWhiteSpace(dateSeed))
                        {
                            dateSeed = row["voucher_date"]?.ToString()?.Trim() ?? "";
                        }
                        var alterSeed = row["alter_id"]?.ToString()?.Trim() ?? "";
                        seed = $"{companyId}|{typeSeed}|{numberSeed}|{dateSeed}|{alterSeed}";
                    }

                    existingId = Guid.TryParse(seed, out _)
                        ? seed
                        : GenerateDeterministicGuid(seed).ToString();
                    idInjected++;
                }

                row["id"] = existingId;
                if (row["Id"] != null) row.Remove("Id");

                // Keep both date aliases populated for legacy + strict schemas.
                var dateText = row["vch_date"]?.ToString()?.Trim();
                if (string.IsNullOrWhiteSpace(dateText))
                {
                    dateText = row["VchDate"]?.ToString()?.Trim();
                }
                if (string.IsNullOrWhiteSpace(dateText))
                {
                    dateText = row["voucher_date"]?.ToString()?.Trim();
                }

                var hasValidDate = DateTime.TryParse(dateText, out var parsedDate);
                if (!hasValidDate)
                {
                    parsedDate = DateTime.Today;
                    dateNormalized++;
                }

                var safeDate = parsedDate.ToString("yyyy-MM-dd");
                row["vch_date"] = safeDate;
                row["voucher_date"] = safeDate;
                if (row["VchDate"] != null) row.Remove("VchDate");

                // Keep UI/data compatibility defaults stable.
                if (row["is_deleted"] == null || row["is_deleted"]?.Type == JTokenType.Null)
                {
                    row["is_deleted"] = false;
                }

                if (row["amount"] == null || row["amount"]?.Type == JTokenType.Null)
                {
                    var totalAmount = row["total_amount"];
                    var grandTotal = row["grand_total"];
                    row["amount"] = totalAmount != null && totalAmount.Type != JTokenType.Null
                        ? totalAmount
                        : (grandTotal != null && grandTotal.Type != JTokenType.Null ? grandTotal : 0m);
                }
            }
            if (idInjected > 0 || dateNormalized > 0)
            {
                SyncLogger.Log($"[INFO] Voucher safety patch applied: ids={idInjected}, dates={dateNormalized}");
            }
        }

        private async Task<ApiResponse<object>> UpsertRowsIndividuallyAsync(string table, JArray rows, string onConflict)
        {
            var failedRows = new List<string>();
            var successCount = 0;

            for (int i = 0; i < rows.Count; i++)
            {
                if (rows[i] is not JObject row)
                {
                    failedRows.Add($"row#{i + 1}: invalid JSON object");
                    continue;
                }

                var singlePayload = new JArray(row);
                var content = new StringContent(singlePayload.ToString(Formatting.None), Encoding.UTF8, "application/json");
                var request = new HttpRequestMessage(HttpMethod.Post, $"{_supabaseUrl}/rest/v1/{table}?on_conflict={onConflict}")
                {
                    Content = content
                };
                request.Headers.Add("Prefer", "resolution=merge-duplicates,return=minimal");

                var response = await _httpClient.SendAsync(request);
                if (response.IsSuccessStatusCode)
                {
                    successCount++;
                    continue;
                }

                var responseContent = await response.Content.ReadAsStringAsync();
                var parsed = ParseDatabaseError(responseContent);
                var error = BuildDatabaseErrorMessage(table, (int)response.StatusCode, parsed, responseContent);
                failedRows.Add($"row#{i + 1}: {error}");
            }

            if (failedRows.Count == 0)
            {
                SyncLogger.Log($"[INFO] Bulk fallback succeeded for '{table}' via row-by-row upsert ({successCount}/{rows.Count}).");
                return new ApiResponse<object>
                {
                    Success = true,
                    Message = $"Bulk fallback applied for '{table}' ({successCount} rows)."
                };
            }

            var preview = string.Join(" | ", failedRows.Take(3));
            SyncLogger.Log($"[WARN] Bulk fallback partial failure for '{table}'. Success={successCount}, Failed={failedRows.Count}. {preview}");
            return new ApiResponse<object>
            {
                Success = false,
                Error = $"Bulk upsert fallback failed for '{table}': {failedRows.Count}/{rows.Count} rows failed. {preview}"
            };
        }
        private static ApiResponse<SyncResultDetails> BuildSkippedSyncResult(int attemptedCount, string message)
        {
            return new ApiResponse<SyncResultDetails>
            {
                Success = true,
                Message = message,
                Details = new SyncResultDetails
                {
                    Total = attemptedCount,
                    Success = true,
                    Count = 0,
                    Failed = 0
                }
            };
        }

        private static object NormalizePayloadForUpsert(object payload)
        {
            JToken payloadToken;
            try
            {
                payloadToken = JToken.FromObject(payload);
            }
            catch
            {
                return payload;
            }

            if (payloadToken is not JArray jsonArray || jsonArray.Count <= 1)
            {
                return payload;
            }

            var rowObjects = jsonArray.Children<JObject>().ToList();
            if (rowObjects.Count != jsonArray.Count)
            {
                return payload;
            }

            var allKeys = new HashSet<string>(StringComparer.Ordinal);
            foreach (var row in rowObjects)
            {
                foreach (var prop in row.Properties())
                {
                    allKeys.Add(prop.Name);
                }
            }

            var orderedKeys = allKeys.OrderBy(k => k, StringComparer.Ordinal).ToList();
            for (int i = 0; i < rowObjects.Count; i++)
            {
                var source = rowObjects[i];
                var normalized = new JObject();
                foreach (var key in orderedKeys)
                {
                    var hasValue = source.TryGetValue(key, StringComparison.Ordinal, out var value);
                    normalized.Add(key, hasValue ? value : JValue.CreateNull());
                }

                jsonArray[i] = normalized;
            }

            return jsonArray;
        }
        private async Task<bool> TableExistsAsync(string table)
        {
            if (_tableExistsCache.TryGetValue(table, out var cachedValue))
            {
                return cachedValue;
            }

            try
            {
                AddAuthHeader();
                var response = await _httpClient.GetAsync($"{_supabaseUrl}/rest/v1/{table}?select=count&limit=0");
                if (response.IsSuccessStatusCode)
                {
                    _tableExistsCache[table] = true;
                    return true;
                }

                var body = await response.Content.ReadAsStringAsync();
                var parsed = ParseDatabaseError(body);
                bool exists = response.StatusCode != HttpStatusCode.NotFound && !IsMissingTableError(parsed, body);
                _tableExistsCache[table] = exists;
                return exists;
            }
            catch
            {
                // Conservative fallback: do not treat transient capability-check failures as missing table.
                return true;
            }
        }

        private async Task<bool> ColumnExistsAsync(string table, string column)
        {
            string cacheKey = $"{table}.{column}";
            if (_columnExistsCache.TryGetValue(cacheKey, out var cachedValue))
            {
                return cachedValue;
            }

            try
            {
                AddAuthHeader();
                var response = await _httpClient.GetAsync($"{_supabaseUrl}/rest/v1/{table}?select={Uri.EscapeDataString(column)}&limit=1");
                if (response.IsSuccessStatusCode)
                {
                    _columnExistsCache[cacheKey] = true;
                    return true;
                }

                var body = await response.Content.ReadAsStringAsync();
                var parsed = ParseDatabaseError(body);
                bool exists = response.StatusCode != HttpStatusCode.NotFound
                    && !IsMissingTableError(parsed, body)
                    && !IsMissingColumnError(parsed, body, column);

                _columnExistsCache[cacheKey] = exists;
                return exists;
            }
            catch
            {
                // Conservative fallback: keep owner_id injection enabled if probe fails unexpectedly.
                return true;
            }
        }

        private static bool IsMissingTableError(DatabaseErrorPayload? parsed, string rawResponse)
        {
            if (string.Equals(parsed?.code, "42P01", StringComparison.Ordinal))
            {
                return true;
            }

            if (string.Equals(parsed?.code, "PGRST205", StringComparison.Ordinal))
            {
                return true;
            }

            var message = parsed?.message ?? string.Empty;
            if (message.Contains("Could not find the table", StringComparison.OrdinalIgnoreCase)
                || (message.Contains("relation", StringComparison.OrdinalIgnoreCase) && message.Contains("does not exist", StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }

            return rawResponse.Contains("relation", StringComparison.OrdinalIgnoreCase)
                && rawResponse.Contains("does not exist", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsMissingColumnError(DatabaseErrorPayload? parsed, string rawResponse, string column)
        {
            if (string.Equals(parsed?.code, "42703", StringComparison.Ordinal))
            {
                return true;
            }

            if (string.Equals(parsed?.code, "PGRST204", StringComparison.Ordinal)
                && (parsed?.message?.Contains(column, StringComparison.OrdinalIgnoreCase) ?? false))
            {
                return true;
            }

            var message = parsed?.message ?? string.Empty;
            if (message.Contains("column", StringComparison.OrdinalIgnoreCase)
                && message.Contains("does not exist", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            return rawResponse.Contains(column, StringComparison.OrdinalIgnoreCase)
                && rawResponse.Contains("schema cache", StringComparison.OrdinalIgnoreCase);
        }
        private static DatabaseErrorPayload? ParseDatabaseError(string responseContent)
        {
            if (string.IsNullOrWhiteSpace(responseContent))
            {
                return null;
            }

            try
            {
                return JsonConvert.DeserializeObject<DatabaseErrorPayload>(responseContent);
            }
            catch
            {
                return null;
            }
        }

        private static string BuildDatabaseErrorMessage(string table, int statusCode, DatabaseErrorPayload? parsed, string rawResponse)
        {
            if (statusCode == 401 && string.Equals(parsed?.code, "PGRST301", StringComparison.Ordinal))
            {
                return $"InsForge auth token expired while writing '{table}' (PGRST301). Re-login and retry sync.";
            }

            if (statusCode == 403 && string.Equals(parsed?.code, "42501", StringComparison.Ordinal))
            {
                if (string.Equals(table, "companies", StringComparison.OrdinalIgnoreCase))
                {
                    return "InsForge RLS blocked companies write (42501). Apply INSERT/UPDATE policy using owner_id = auth.uid().";
                }

                return $"InsForge RLS blocked write on '{table}' (42501). Ensure table policy allows owner_id/authenticated user.";
            }

            if (statusCode == 400 && string.Equals(parsed?.code, "PGRST204", StringComparison.Ordinal))
            {
                return $"InsForge schema cache issue while writing '{table}' (PGRST204): {parsed?.message ?? rawResponse}";
            }

            if (statusCode == 400 && string.Equals(parsed?.code, "PGRST102", StringComparison.Ordinal))
            {
                return $"InsForge payload mismatch on '{table}' (PGRST102: All object keys must match). Normalize row keys before bulk upsert.";
            }

            if (statusCode == 404 || IsMissingTableError(parsed, rawResponse))
            {
                return $"InsForge relation missing for '{table}' (42P01/404). Apply additive schema migration and refresh schema cache.";
            }

            return $"InsForge HTTP {statusCode}: {rawResponse}";
        }

        private sealed class DatabaseErrorPayload
        {
            [JsonProperty("code")]
            public string? code { get; set; }

            [JsonProperty("message")]
            public string? message { get; set; }
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
                string companyUuid = ResolveCompanyUuid(companyId);

                var pending = await FetchPendingTransactionsByStatusAsync(companyUuid, "pending");
                var failed = await FetchPendingTransactionsByStatusAsync(companyUuid, "failed");
                var processing = await FetchPendingTransactionsByStatusAsync(companyUuid, "processing");

                var retryableFailed = failed
                    .Where(txn => GetRetryAttempt(txn) < MaxPendingTransactionRetries);

                var retryableStaleProcessing = processing
                    .Where(txn => GetRetryAttempt(txn) < MaxPendingTransactionRetries)
                    .Where(IsProcessingStale);

                return pending
                    .Concat(retryableFailed)
                    .Concat(retryableStaleProcessing)
                    .GroupBy(txn => txn.Id)
                    .Select(group => group.First())
                    .OrderBy(txn => txn.CreatedAt == default ? DateTime.MinValue : txn.CreatedAt)
                    .ToList();
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"GetPendingTransactionsAsync error: {ex.Message}");
                return new List<PendingTransaction>();
            }
        }

        private async Task<List<PendingTransaction>> FetchPendingTransactionsByStatusAsync(string companyUuid, string status)
        {
            var url = $"{_supabaseUrl}/rest/v1/pending_transactions?company_id=eq.{companyUuid}&status=eq.{Uri.EscapeDataString(status)}&order=created_at.asc";
            var response = await _httpClient.GetStringAsync(url);
            return JsonConvert.DeserializeObject<List<PendingTransaction>>(response) ?? new List<PendingTransaction>();
        }

        private static int GetRetryAttempt(PendingTransaction transaction)
        {
            if (transaction.RetryCount > 0)
            {
                return transaction.RetryCount;
            }

            if (string.IsNullOrWhiteSpace(transaction.ErrorMessage))
            {
                return 0;
            }

            var match = RetryTagRegex.Match(transaction.ErrorMessage);
            return match.Success && int.TryParse(match.Groups[1].Value, out var parsedAttempt)
                ? parsedAttempt
                : 0;
        }

        private static bool IsProcessingStale(PendingTransaction transaction)
        {
            var marker = transaction.UpdatedAt ?? transaction.CreatedAt;
            if (marker == default)
            {
                return true;
            }

            var markerUtc = marker.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(marker, DateTimeKind.Utc)
                : marker.ToUniversalTime();

            return markerUtc <= DateTime.UtcNow.Subtract(ProcessingRecoveryAge);
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
                
                if (!string.IsNullOrEmpty(tallyVoucherNumber))
                {
                    updates["tally_voucher_number"] = tallyVoucherNumber;
                    updates["synced_at"] = DateTime.UtcNow.ToString("o");
                    updates["error_message"] = null;
                }
                else if (!string.IsNullOrEmpty(errorMessage))
                {
                    updates["error_message"] = errorMessage;
                }

                if (retryCount.HasValue && await ColumnExistsAsync("pending_transactions", "retry_count"))
                {
                    updates["retry_count"] = retryCount.Value;
                }

                if (await ColumnExistsAsync("pending_transactions", "updated_at"))
                {
                    updates["updated_at"] = DateTime.UtcNow.ToString("o");
                }
                
                var json = JsonConvert.SerializeObject(updates);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                
                var url = $"{_supabaseUrl}/rest/v1/pending_transactions?id=eq.{transactionId}";
                
                var request = new HttpRequestMessage(HttpMethod.Patch, url)
                {
                    Content = content
                };
                
                var response = await _httpClient.SendAsync(request);
                if (!response.IsSuccessStatusCode)
                {
                    var body = await response.Content.ReadAsStringAsync();
                    SyncLogger.Log($"UpdatePendingTransactionStatusAsync failed ({response.StatusCode}): {body}");
                }
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â UpdatePendingTransactionStatusAsync error: {ex.Message}");
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
                string companyUuid = ResolveCompanyUuid(companyId);
                
                var url = $"{_supabaseUrl}/rest/v1/vouchers?company_id=eq.{companyUuid}&select=voucher_id";
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
                SyncLogger.Log($"ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â GetCloudVoucherIdsAsync error: {ex.Message}");
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
                string companyUuid = ResolveCompanyUuid(companyId);
                
                int deleted = 0;
                
                // Process in batches of 100
                foreach (var batch in voucherIds.Chunk(100))
                {
                    var idsParam = string.Join(",", batch.Select(id => $"\"{id}\""));
                    var url = $"{_supabaseUrl}/rest/v1/vouchers?company_id=eq.{companyUuid}&voucher_id=in.({idsParam})";
                    
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
                SyncLogger.Log($"ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â MarkVouchersAsDeletedAsync error: {ex.Message}");
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
                string companyUuid = ResolveCompanyUuid(companyId);

                int deleted = 0;
                
                // Process in batches of 100
                foreach (var batch in voucherIds.Chunk(100))
                {
                    var idsParam = string.Join(",", batch.Select(id => $"\"{id}\""));
                    var url = $"{_supabaseUrl}/rest/v1/vouchers?company_id=eq.{companyUuid}&voucher_id=in.({idsParam})";
                    
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
                SyncLogger.Log($"ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â DeleteVouchersAsync error: {ex.Message}");
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
                string companyUuid = ResolveCompanyUuid(companyId);
                
                // Get current user ID for RLS
                string? ownerId = null;
                try { ownerId = TallySyncApp.App.AuthService?.CurrentSession?.UserId; } catch { }

                var record = new Dictionary<string, object>
                {
                    ["company_id"] = companyUuid,
                    ["sync_type"] = syncType,
                    ["started_at"] = DateTime.UtcNow.ToString("o"),
                    ["status"] = "running"
                };
                if (!string.IsNullOrEmpty(ownerId))
                    record["owner_id"] = ownerId;
                
                var json = JsonConvert.SerializeObject(record);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                
                var request = new HttpRequestMessage(HttpMethod.Post, $"{_supabaseUrl}/rest/v1/sync_history")
                {
                    Content = content
                };
                request.Headers.Add("Prefer", "return=representation");
                
                var response = await _httpClient.SendAsync(request);
                if (!response.IsSuccessStatusCode)
                {
                    var errBody = await response.Content.ReadAsStringAsync();
                    SyncLogger.Log($"ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ sync_history INSERT failed: HTTP {(int)response.StatusCode}: {errBody}");
                }
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
                SyncLogger.Log($"ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â StartSyncHistoryAsync error: {ex.Message}");
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
                if (!response.IsSuccessStatusCode)
                {
                    var body = await response.Content.ReadAsStringAsync();
                    SyncLogger.Log($"UpdatePendingTransactionStatusAsync failed ({response.StatusCode}): {body}");
                }
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â UpdateSyncHistoryAsync error: {ex.Message}");
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
                string companyUuid = ResolveCompanyUuid(companyId);

                var updates = new 
                { 
                    status = "failed", 
                    error_message = "App restarted/crashed during sync",
                    completed_at = DateTime.UtcNow.ToString("o")
                };
                
                var json = JsonConvert.SerializeObject(updates);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                
                var url = $"{_supabaseUrl}/rest/v1/sync_history?company_id=eq.{companyUuid}&status=eq.running";
                
                var request = new HttpRequestMessage(HttpMethod.Patch, url)
                {
                    Content = content
                };
                
                await _httpClient.SendAsync(request);
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â FailRunningSyncsAsync error: {ex.Message}");
            }
        }

        /// <summary>
        /// Generate a deterministic GUID from a string using MD5 hash
        /// This ensures the same input always produces the same UUID
        /// </summary>
        public static Guid GenerateDeterministicGuid(string input)
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
                SyncLogger.Log($"ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Failed to fetch Telegram Chat ID: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Update user's Tally serial number in the licenses table
        /// </summary>
        public async Task<bool> UpdateUserTallySerialAsync(string userId, string serial)
        {
            if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(serial)) return false;

            try
            {
                AddAuthHeader();
                var payload = new Dictionary<string, object>
                {
                    ["tally_serial"] = serial,
                    ["updated_at"] = DateTime.UtcNow.ToString("o")
                };

                var json = JsonConvert.SerializeObject(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                // Update the licenses table where user_id matches
                var url = $"{_supabaseUrl}/rest/v1/licenses?user_id=eq.{userId}";
                
                // FIX: Use per-request Prefer header instead of polluting DefaultRequestHeaders
                var request = new HttpRequestMessage(HttpMethod.Patch, url)
                {
                    Content = content
                };
                request.Headers.Add("Prefer", "return=representation");

                var response = await _httpClient.SendAsync(request);
                if (!response.IsSuccessStatusCode)
                {
                    var body = await response.Content.ReadAsStringAsync();
                    SyncLogger.Log($"UpdatePendingTransactionStatusAsync failed ({response.StatusCode}): {body}");
                }
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                SyncLogger.Log($"ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Failed to update Tally Serial: {ex.Message}");
                return false;
            }
        }

        public async Task SendTelegramNotificationAsync(string chatId, string message)
        {
            try
            {
                var botToken = _telegramBotToken;
                if (string.IsNullOrEmpty(botToken))
                {
                    SyncLogger.Log("ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Telegram Bot Token not configured in appsettings.json");
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
                SyncLogger.Log($"ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Failed to send Telegram notification: {ex.Message}");
            }
        }
    }
}





































