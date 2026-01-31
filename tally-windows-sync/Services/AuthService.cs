using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.IO;
using TallySyncApp.Models;

namespace TallySyncApp.Services
{
    /// <summary>
    /// Handles authentication with Supabase
    /// </summary>
    public class AuthService
    {
        private readonly HttpClient _httpClient;
        private readonly string _supabaseUrl;
        private readonly string _supabaseAnonKey;
        private readonly string _sessionFilePath;
        
        public UserSession? CurrentSession { get; private set; }
        public event EventHandler<UserSession?>? SessionChanged;

        public AuthService(string supabaseUrl, string supabaseAnonKey)
        {
            _supabaseUrl = supabaseUrl.TrimEnd('/');
            _supabaseAnonKey = supabaseAnonKey;
            _sessionFilePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "LiveKeepingSync",
                "session.json"
            );
            
            _httpClient = new HttpClient();
            _httpClient.DefaultRequestHeaders.Add("apikey", _supabaseAnonKey);
            
            // Try to load existing session
            LoadSession();
        }

        /// <summary>
        /// Sign in with email and password
        /// </summary>
        public async Task<(bool Success, string? Error)> SignInAsync(string email, string password)
        {
            try
            {
                var requestBody = new
                {
                    email = email,
                    password = password
                };

                var content = new StringContent(
                    JsonSerializer.Serialize(requestBody),
                    Encoding.UTF8,
                    "application/json"
                );

                var response = await _httpClient.PostAsync(
                    $"{_supabaseUrl}/auth/v1/token?grant_type=password",
                    content
                );

                var responseBody = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    var authResponse = JsonSerializer.Deserialize<SupabaseAuthResponse>(responseBody);
                    
                    if (authResponse != null)
                    {
                        CurrentSession = new UserSession
                        {
                            UserId = authResponse.user?.id ?? "",
                            Email = authResponse.user?.email ?? email,
                            AccessToken = authResponse.access_token ?? "",
                            RefreshToken = authResponse.refresh_token ?? "",
                            ExpiresAt = DateTime.UtcNow.AddSeconds(authResponse.expires_in)
                        };

                        SaveSession();
                        SessionChanged?.Invoke(this, CurrentSession);
                        return (true, null);
                    }
                }

                // Parse error
                var errorResponse = JsonSerializer.Deserialize<SupabaseErrorResponse>(responseBody);
                return (false, errorResponse?.error_description ?? errorResponse?.msg ?? "Login failed");
            }
            catch (Exception ex)
            {
                return (false, $"Connection error: {ex.Message}");
            }
        }

        /// <summary>
        /// Sign up new user
        /// </summary>
        public async Task<(bool Success, string? Error)> SignUpAsync(string email, string password, string fullName)
        {
            try
            {
                var requestBody = new
                {
                    email = email,
                    password = password,
                    data = new { full_name = fullName }
                };

                var content = new StringContent(
                    JsonSerializer.Serialize(requestBody),
                    Encoding.UTF8,
                    "application/json"
                );

                var response = await _httpClient.PostAsync(
                    $"{_supabaseUrl}/auth/v1/signup",
                    content
                );

                var responseBody = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    return (true, null);
                }

                var errorResponse = JsonSerializer.Deserialize<SupabaseErrorResponse>(responseBody);
                return (false, errorResponse?.error_description ?? errorResponse?.msg ?? "Signup failed");
            }
            catch (Exception ex)
            {
                return (false, $"Connection error: {ex.Message}");
            }
        }

        /// <summary>
        /// Sign out current user
        /// </summary>
        public void SignOut()
        {
            CurrentSession = null;
            
            // Delete session file
            if (File.Exists(_sessionFilePath))
            {
                File.Delete(_sessionFilePath);
            }

            SessionChanged?.Invoke(this, null);
        }

        /// <summary>
        /// Check if user is logged in
        /// </summary>
        public bool IsLoggedIn => CurrentSession?.IsLoggedIn == true;

        /// <summary>
        /// Get access token for API calls
        /// </summary>
        public string? GetAccessToken()
        {
            if (CurrentSession?.IsLoggedIn == true)
            {
                return CurrentSession.AccessToken;
            }
            return null;
        }

        /// <summary>
        /// Refresh the access token if expired
        /// </summary>
        public async Task<bool> RefreshTokenAsync()
        {
            if (CurrentSession == null || string.IsNullOrEmpty(CurrentSession.RefreshToken))
                return false;

            try
            {
                var requestBody = new
                {
                    refresh_token = CurrentSession.RefreshToken
                };

                var content = new StringContent(
                    JsonSerializer.Serialize(requestBody),
                    Encoding.UTF8,
                    "application/json"
                );

                var response = await _httpClient.PostAsync(
                    $"{_supabaseUrl}/auth/v1/token?grant_type=refresh_token",
                    content
                );

                if (response.IsSuccessStatusCode)
                {
                    var responseBody = await response.Content.ReadAsStringAsync();
                    var authResponse = JsonSerializer.Deserialize<SupabaseAuthResponse>(responseBody);
                    
                    if (authResponse != null)
                    {
                        CurrentSession.AccessToken = authResponse.access_token ?? "";
                        CurrentSession.RefreshToken = authResponse.refresh_token ?? CurrentSession.RefreshToken;
                        CurrentSession.ExpiresAt = DateTime.UtcNow.AddSeconds(authResponse.expires_in);
                        
                        SaveSession();
                        return true;
                    }
                }

                // Refresh failed, clear session
                SignOut();
                return false;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Save session to file
        /// </summary>
        private void SaveSession()
        {
            try
            {
                var directory = Path.GetDirectoryName(_sessionFilePath);
                if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                var json = JsonSerializer.Serialize(CurrentSession);
                File.WriteAllText(_sessionFilePath, json);
            }
            catch
            {
                // Ignore save errors
            }
        }

        /// <summary>
        /// Load session from file
        /// </summary>
        private void LoadSession()
        {
            try
            {
                if (File.Exists(_sessionFilePath))
                {
                    var json = File.ReadAllText(_sessionFilePath);
                    CurrentSession = JsonSerializer.Deserialize<UserSession>(json);
                    
                    // Check if session is still valid
                    if (CurrentSession != null && !CurrentSession.IsLoggedIn)
                    {
                        CurrentSession = null;
                    }
                }
            }
            catch
            {
                CurrentSession = null;
            }
        }
    }

    // Supabase Auth Response Models
    public class SupabaseAuthResponse
    {
        public string? access_token { get; set; }
        public string? token_type { get; set; }
        public int expires_in { get; set; }
        public string? refresh_token { get; set; }
        public SupabaseUser? user { get; set; }
    }

    public class SupabaseUser
    {
        public string? id { get; set; }
        public string? email { get; set; }
        public string? role { get; set; }
    }

    public class SupabaseErrorResponse
    {
        public string? error { get; set; }
        public string? error_description { get; set; }
        public string? msg { get; set; }
    }
}
