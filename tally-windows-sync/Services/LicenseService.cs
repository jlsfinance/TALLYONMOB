using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace TallySyncApp.Services
{
    /// <summary>
    /// License validation service - uses Bearer token auth with Edge Function.
    /// Caches license to disk so it survives restarts.
    /// </summary>
    public class LicenseService
    {
        private static readonly HttpClient _client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };

        private const string EDGE_FUNCTION_BASE = "https://lcsehcwocqvxrrgbmhcz.supabase.co/functions/v1";

        private static readonly string CacheDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "TallySync");

        private static readonly string CacheFile = Path.Combine(CacheDir, "license.json");

        public LicenseInfo? CurrentLicense { get; private set; }

        /// <summary>
        /// Validates license via Edge Function using Bearer token.
        /// </summary>
        public async Task<LicenseInfo> ValidateLicenseAsync(string accessToken)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(accessToken))
                {
                    return new LicenseInfo
                    {
                        IsValid = false,
                        Error = "NO_TOKEN",
                        Message = "Not logged in."
                    };
                }

                var request = new HttpRequestMessage(HttpMethod.Get, $"{EDGE_FUNCTION_BASE}/validate-license");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
                // Use anon key from app settings
                var anonKey = App.Settings?.AuthSettings?.SupabaseAnonKey ?? "";
                if (!string.IsNullOrWhiteSpace(anonKey))
                    request.Headers.Add("apikey", anonKey);

                var response = await _client.SendAsync(request);
                var json = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    var errorResult = JsonConvert.DeserializeObject<LicenseInfo>(json) ?? new LicenseInfo();
                    errorResult.IsValid = false;
                    errorResult.HttpStatusCode = (int)response.StatusCode;
                    if (string.IsNullOrEmpty(errorResult.Error))
                        errorResult.Error = $"HTTP_{response.StatusCode}";
                    if (string.IsNullOrEmpty(errorResult.Message))
                        errorResult.Message = $"Server returned {(int)response.StatusCode}";

                    return errorResult;
                }

                var result = JsonConvert.DeserializeObject<LicenseInfo>(json) ?? new LicenseInfo();
                result.HttpStatusCode = (int)response.StatusCode;
                result.IsValid = true;
                result.ValidatedAt = DateTime.UtcNow;

                CurrentLicense = result;
                SaveCache(result);

                return result;
            }
            catch (TaskCanceledException)
            {
                return new LicenseInfo
                {
                    IsValid = false,
                    Error = "TIMEOUT",
                    Message = "License server not responding. Check internet."
                };
            }
            catch (HttpRequestException ex)
            {
                return new LicenseInfo
                {
                    IsValid = false,
                    Error = "NETWORK_ERROR",
                    Message = $"Cannot reach license server: {ex.Message}"
                };
            }
            catch (Exception ex)
            {
                return new LicenseInfo
                {
                    IsValid = false,
                    Error = "CLIENT_ERROR",
                    Message = $"Error: {ex.Message}"
                };
            }
        }

        /// <summary>
        /// Loads cached license from disk.
        /// </summary>
        public LicenseInfo? LoadCachedLicense()
        {
            try
            {
                if (File.Exists(CacheFile))
                {
                    var json = File.ReadAllText(CacheFile);
                    var cached = JsonConvert.DeserializeObject<LicenseInfo>(json);
                    if (cached != null && !string.IsNullOrEmpty(cached.ExpiresAt) && DateTime.TryParse(cached.ExpiresAt, out var exp) && exp > DateTime.UtcNow)
                    {
                        CurrentLicense = cached;
                        return cached;
                    }
                }
            }
            catch { /* ignore cache errors */ }
            return null;
        }

        /// <summary>
        /// Saves license to disk cache.
        /// </summary>
        private void SaveCache(LicenseInfo license)
        {
            try
            {
                Directory.CreateDirectory(CacheDir);
                var json = JsonConvert.SerializeObject(license, Formatting.None);
                File.WriteAllText(CacheFile, json);
            }
            catch { /* ignore cache write errors */ }
        }

        /// <summary>
        /// Clears the license cache.
        /// </summary>
        public void ClearCache()
        {
            try
            {
                if (File.Exists(CacheFile))
                    File.Delete(CacheFile);
                CurrentLicense = null;
            }
            catch { }
        }

        /// <summary>
        /// Gets user-friendly error message.
        /// </summary>
        public static string GetUserMessage(LicenseInfo license)
        {
            return license.Error switch
            {
                "AUTH_FAILED" or "Unauthorized" => "Invalid email or password.",
                "LICENSE_MISMATCH" => "This license is registered to a different Tally installation.\nContact support to reset your serial.",
                "TRIAL_EXPIRED" or "expired" => "Your 7-day free trial has expired.\nUpgrade to Pro to continue.",
                "SUBSCRIPTION_EXPIRED" => "Your subscription has expired.\nRenew to continue.",
                "LICENSE_BLOCKED" => "Your license has been blocked.\nContact support.",
                "TIMEOUT" => "Server not responding. Try again.",
                "NETWORK_ERROR" => "Cannot connect to license server.\nCheck your internet.",
                "NO_TOKEN" => "Please login first.",
                "none" or "No active subscription" => "No active subscription.\nStart a free trial or purchase a plan.",
                _ => license.Message ?? "Unknown error."
            };
        }
    }

    /// <summary>
    /// License information from Edge Function.
    /// </summary>
    public class LicenseInfo
    {
        [JsonProperty("valid")]
        public bool Valid { get; set; }

        [JsonProperty("status")]
        public string? Status { get; set; }

        [JsonProperty("plan")]
        public string? Plan { get; set; }

        [JsonProperty("planName")]
        public string? PlanName { get; set; }

        [JsonProperty("isSuperAdmin")]
        public bool IsSuperAdmin { get; set; }

        [JsonProperty("daysLeft")]
        public int DaysLeft { get; set; }

        [JsonProperty("activatedAt")]
        public string? ActivatedAt { get; set; }

        [JsonProperty("expiresAt")]
        public string? ExpiresAt { get; set; }

        [JsonProperty("features")]
        public object? Features { get; set; }

        [JsonProperty("serialNumber")]
        public string? SerialNumber { get; set; }

        [JsonProperty("licenseKey")]
        public string? LicenseKey { get; set; }

        [JsonProperty("error")]
        public string? Error { get; set; }

        [JsonProperty("message")]
        public string? Message { get; set; }

        // Client-side fields
        [JsonIgnore]
        public bool IsValid { get; set; }

        [JsonIgnore]
        public int HttpStatusCode { get; set; }

        [JsonIgnore]
        public DateTime ValidatedAt { get; set; }

        // Computed properties
        public bool IsTrial => Status == "trial";
        public bool IsPro => Plan?.Contains("Pro", StringComparison.OrdinalIgnoreCase) == true;
        public bool IsExpired => Status == "expired" || DaysLeft <= 0;
        public bool ShouldShowUpgradePrompt => IsTrial && DaysLeft <= 2;

        public string PlanDisplayName
        {
            get
            {
                if (IsSuperAdmin) return "Super Admin";
                if (IsTrial) return "Free Trial";
                if (IsPro) return "Pro";
                return PlanName ?? Plan ?? "Unknown";
            }
        }

        public string StatusDisplay
        {
            get
            {
                if (!IsValid) return "Inactive";
                if (IsExpired) return "Expired";
                return "Active";
            }
        }

        public string? ActivatedAtDisplay
        {
            get
            {
                if (string.IsNullOrEmpty(ActivatedAt)) return null;
                if (DateTime.TryParse(ActivatedAt, out var dt))
                    return dt.ToLocalTime().ToString("dd MMM yyyy, hh:mm tt");
                return ActivatedAt;
            }
        }

        public string? ExpiresAtDisplay
        {
            get
            {
                if (string.IsNullOrEmpty(ExpiresAt)) return null;
                if (DateTime.TryParse(ExpiresAt, out var dt))
                    return dt.ToLocalTime().ToString("dd MMM yyyy, hh:mm tt");
                return ExpiresAt;
            }
        }

        public string FeaturesDisplay
        {
            get
            {
                if (Features is JArray arr)
                {
                    var items = new System.Collections.Generic.List<string>();
                    foreach (var item in arr)
                    {
                        var s = item.ToString();
                        if (!string.IsNullOrEmpty(s))
                            items.Add(System.Globalization.CultureInfo.CurrentCulture.TextInfo.ToTitleCase(s.ToLower()));
                    }
                    return items.Count > 0 ? string.Join(", ", items) : "Basic";
                }
                if (Features is string[] strArr)
                    return string.Join(", ", strArr);
                return "Basic";
            }
        }
    }
}
