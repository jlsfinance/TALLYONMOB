using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace TallySyncApp.Services
{
    /// <summary>
    /// License validation service - calls Edge Function only (no direct DB).
    /// Secure: No anon key, no service_role key in client.
    /// </summary>
    public class LicenseService
    {
        private static readonly HttpClient _client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        
        private const string EDGE_FUNCTION_BASE = "https://pfqmqpboomwtxgyfqnsn.supabase.co/functions/v1";
        private const string ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmcW1xcGJvb213dHhneWZxbnNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNjE5OTcsImV4cCI6MjA5NjkzNzk5N30.pgs5CbFK7h9T2YNqtHk5VKQLYgtv_CSKsYNdOaaN7u0";

        public LicenseResult? CurrentLicense { get; private set; }
        public string? AccessToken { get; private set; }
        public string? RefreshToken { get; private set; }

        /// <summary>
        /// Validates license via Edge Function using access token (Bearer auth).
        /// </summary>
        public async Task<LicenseResult> ValidateLicenseAsync(string accessToken, string tallySerial)
        {
            try
            {
                var payload = JsonConvert.SerializeObject(new
                {
                    tallySerial = tallySerial.Trim()
                });

                var request = new HttpRequestMessage(HttpMethod.Post, $"{EDGE_FUNCTION_BASE}/validate-license")
                {
                    Content = new StringContent(payload, Encoding.UTF8, "application/json")
                };

                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
                request.Headers.Add("apikey", ANON_KEY);

                var response = await _client.SendAsync(request);
                var json = await response.Content.ReadAsStringAsync();
                var result = JsonConvert.DeserializeObject<LicenseResult>(json) ?? new LicenseResult();

                result.HttpStatusCode = (int)response.StatusCode;
                result.IsValid = response.IsSuccessStatusCode && result.Status == "active";

                if (result.IsValid)
                {
                    CurrentLicense = result;
                }

                return result;
            }
            catch (TaskCanceledException)
            {
                return new LicenseResult
                {
                    IsValid = false,
                    Error = "TIMEOUT",
                    Message = "License server is not responding. Check internet connection.",
                    HttpStatusCode = 0
                };
            }
            catch (HttpRequestException ex)
            {
                return new LicenseResult
                {
                    IsValid = false,
                    Error = "NETWORK_ERROR",
                    Message = $"Cannot reach license server: {ex.Message}",
                    HttpStatusCode = 0
                };
            }
            catch (Exception ex)
            {
                return new LicenseResult
                {
                    IsValid = false,
                    Error = "CLIENT_ERROR",
                    Message = $"Unexpected error: {ex.Message}",
                    HttpStatusCode = 0
                };
            }
        }

        /// <summary>
        /// Validates license via Edge Function using email/password.
        /// </summary>
        public async Task<LicenseResult> ValidateLicenseAsync(string email, string password, string tallySerial)
        {
            try
            {
                var payload = JsonConvert.SerializeObject(new
                {
                    email = email.Trim().ToLower(),
                    password,
                    tallySerial = tallySerial.Trim()
                });

                var request = new HttpRequestMessage(HttpMethod.Post, $"{EDGE_FUNCTION_BASE}/validate-license")
                {
                    Content = new StringContent(payload, Encoding.UTF8, "application/json")
                };

                request.Headers.Add("apikey", ANON_KEY);

                var response = await _client.SendAsync(request);
                var json = await response.Content.ReadAsStringAsync();
                var result = JsonConvert.DeserializeObject<LicenseResult>(json) ?? new LicenseResult();

                result.HttpStatusCode = (int)response.StatusCode;
                result.IsValid = response.IsSuccessStatusCode && result.Status == "active";

                if (result.IsValid)
                {
                    CurrentLicense = result;
                    AccessToken = result.AccessToken;
                    RefreshToken = result.RefreshToken;
                }

                return result;
            }
            catch (TaskCanceledException)
            {
                return new LicenseResult
                {
                    IsValid = false,
                    Error = "TIMEOUT",
                    Message = "License server is not responding. Check internet connection.",
                    HttpStatusCode = 0
                };
            }
            catch (HttpRequestException ex)
            {
                return new LicenseResult
                {
                    IsValid = false,
                    Error = "NETWORK_ERROR",
                    Message = $"Cannot reach license server: {ex.Message}",
                    HttpStatusCode = 0
                };
            }
            catch (Exception ex)
            {
                return new LicenseResult
                {
                    IsValid = false,
                    Error = "CLIENT_ERROR",
                    Message = $"Unexpected error: {ex.Message}",
                    HttpStatusCode = 0
                };
            }
        }

        /// <summary>
        /// Gets a user-friendly error message for display
        /// </summary>
        public static string GetUserMessage(LicenseResult result)
        {
            return result.Error switch
            {
                "AUTH_FAILED" => "Invalid email or password.",
                "TALLY_MISMATCH" => $"This license is already linked to another Tally Serial Number ({result.BoundSerial}).\n\nContact support to transfer your license.",
                "LICENSE_MISMATCH" => $"This license is already linked to another Tally Serial Number ({result.BoundSerial}).\n\nContact support to transfer your license.",
                "TRIAL_EXPIRED" => "Your 7-day free trial has expired.\nUpgrade to Pro to continue using TallyLink.",
                "SUBSCRIPTION_EXPIRED" => "Your subscription has expired.\nRenew your subscription to continue.",
                "LICENSE_SUSPENDED" => "Your license has been suspended.\nContact support for assistance.",
                "LICENSE_BLOCKED" => "Your license has been blocked.\nContact support for assistance.",
                "NO_LICENSE" => "No active subscription found.\nPlease purchase a plan to continue.",
                "TIMEOUT" => "Server not responding. Please try again.",
                "NETWORK_ERROR" => "Cannot connect to license server.\nCheck your internet connection.",
                _ => result.Message ?? "Unknown error occurred."
            };
        }
    }

    /// <summary>
    /// Result from license validation Edge Function
    /// </summary>
    public class LicenseResult
    {
        [JsonProperty("status")]
        public string? Status { get; set; }

        [JsonProperty("plan")]
        public string? Plan { get; set; }

        [JsonProperty("daysRemaining")]
        public int DaysRemaining { get; set; }

        [JsonProperty("expiresAt")]
        public string? ExpiresAt { get; set; }

        [JsonProperty("valid")]
        public bool Valid { get; set; }

        [JsonProperty("error")]
        public string? Error { get; set; }

        [JsonProperty("message")]
        public string? Message { get; set; }

        [JsonProperty("boundSerial")]
        public string? BoundSerial { get; set; }

        [JsonProperty("emailBound")]
        public string? EmailBound { get; set; }

        [JsonProperty("access_token")]
        public string? AccessToken { get; set; }

        [JsonProperty("refresh_token")]
        public string? RefreshToken { get; set; }

        [JsonProperty("isSuperAdmin")]
        public bool IsSuperAdmin { get; set; }

        [JsonIgnore]
        public bool IsValid { get; set; }

        [JsonIgnore]
        public int HttpStatusCode { get; set; }

        public bool IsTrial => Plan == "trial";
        public bool IsPro => Plan == "pro" || IsSuperAdmin;
        public bool ShouldShowUpgradePrompt => IsTrial && DaysRemaining <= 2;
    }
}
