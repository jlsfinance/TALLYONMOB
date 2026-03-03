using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using TallySyncApp.Models;

namespace TallySyncApp.Services
{
    /// <summary>
    /// Handles authentication with InsForge auth API.
    /// </summary>
    public class AuthService
    {
        private readonly HttpClient _httpClient;
        private readonly string _baseUrl;
        private readonly string _anonKey;
        private readonly string _sessionFilePath;

        public UserSession? CurrentSession { get; private set; }
        public event EventHandler<UserSession?>? SessionChanged;

        public AuthService(string baseUrl, string anonKey)
        {
            _baseUrl = baseUrl.TrimEnd('/');
            _anonKey = anonKey;
            _sessionFilePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "TallySync",
                "session.json"
            );

            var handler = new HttpClientHandler
            {
                UseCookies = true,
                AllowAutoRedirect = true
            };

            _httpClient = new HttpClient(handler);
            _httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            if (!string.IsNullOrWhiteSpace(_anonKey))
            {
                _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _anonKey);
            }

            LoadSession();
        }

        public async Task<(bool Success, string? Error)> SignInAsync(string email, string password)
        {
            try
            {
                var requestBody = new
                {
                    email,
                    password
                };

                var content = new StringContent(
                    JsonSerializer.Serialize(requestBody),
                    Encoding.UTF8,
                    "application/json"
                );

                var response = await _httpClient.PostAsync(
                    $"{_baseUrl}/api/auth/sessions",
                    content
                );

                var responseBody = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    var authResponse = JsonSerializer.Deserialize<AuthApiResponse>(responseBody, JsonOptions);
                    if (authResponse != null)
                    {
                        var accessToken = authResponse.accessToken ?? authResponse.access_token ?? string.Empty;
                        var refreshToken = authResponse.refreshToken ?? authResponse.refresh_token ?? string.Empty;
                        var user = authResponse.user;

                        if (string.IsNullOrWhiteSpace(accessToken))
                        {
                            return (false, "Login response did not include access token.");
                        }

                        CurrentSession = new UserSession
                        {
                            UserId = user?.id ?? string.Empty,
                            Email = user?.email ?? email,
                            AccessToken = accessToken,
                            RefreshToken = refreshToken,
                            ExpiresAt = ResolveExpiry(authResponse, accessToken)
                        };

                        SaveSession();
                        SessionChanged?.Invoke(this, CurrentSession);
                        return (true, null);
                    }
                }

                var errorResponse = JsonSerializer.Deserialize<AuthErrorResponse>(responseBody, JsonOptions);
                return (false, errorResponse?.message ?? errorResponse?.error_description ?? errorResponse?.error ?? "Login failed");
            }
            catch (Exception ex)
            {
                return (false, $"Connection error: {ex.Message}");
            }
        }

        public async Task<(bool Success, string? Error)> SignUpAsync(string email, string password, string fullName)
        {
            try
            {
                var requestBody = new
                {
                    email,
                    password,
                    name = fullName
                };

                var content = new StringContent(
                    JsonSerializer.Serialize(requestBody),
                    Encoding.UTF8,
                    "application/json"
                );

                var response = await _httpClient.PostAsync(
                    $"{_baseUrl}/api/auth/users",
                    content
                );

                var responseBody = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    return (true, null);
                }

                var errorResponse = JsonSerializer.Deserialize<AuthErrorResponse>(responseBody, JsonOptions);
                return (false, errorResponse?.message ?? errorResponse?.error_description ?? errorResponse?.error ?? "Signup failed");
            }
            catch (Exception ex)
            {
                return (false, $"Connection error: {ex.Message}");
            }
        }

        /// <summary>
        /// Desktop app currently uses email/password auth only.
        /// </summary>
        public Task<(bool Success, string? Error)> SignInWithGoogleAsync()
        {
            return Task.FromResult<(bool Success, string? Error)>((false, "Google sign-in is not enabled in the desktop app."));
        }

        public void SignOut()
        {
            CurrentSession = null;

            if (File.Exists(_sessionFilePath))
            {
                File.Delete(_sessionFilePath);
            }

            SessionChanged?.Invoke(this, null);
        }

        public bool IsLoggedIn
        {
            get
            {
                if (CurrentSession == null)
                {
                    return false;
                }

                if (!string.IsNullOrWhiteSpace(GetAccessToken()))
                {
                    return true;
                }

                return !string.IsNullOrWhiteSpace(CurrentSession.RefreshToken);
            }
        }

        public string? GetAccessToken()
        {
            if (CurrentSession == null || string.IsNullOrWhiteSpace(CurrentSession.AccessToken))
            {
                return null;
            }

            var effectiveExpiry = GetEffectiveExpiry(CurrentSession);
            if (CurrentSession.ExpiresAt != effectiveExpiry)
            {
                CurrentSession.ExpiresAt = effectiveExpiry;
                SaveSession();
            }

            if (effectiveExpiry <= DateTime.UtcNow)
            {
                return null;
            }

            return CurrentSession.AccessToken;
        }

        public async Task<bool> RefreshTokenAsync()
        {
            if (CurrentSession == null)
            {
                return false;
            }

            try
            {
                HttpContent? content = null;

                if (!string.IsNullOrWhiteSpace(CurrentSession.RefreshToken))
                {
                    var requestBody = new
                    {
                        refreshToken = CurrentSession.RefreshToken,
                        refresh_token = CurrentSession.RefreshToken
                    };

                    content = new StringContent(
                        JsonSerializer.Serialize(requestBody),
                        Encoding.UTF8,
                        "application/json"
                    );
                }

                var response = await _httpClient.PostAsync(
                    $"{_baseUrl}/api/auth/refresh",
                    content
                );

                var responseBody = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    var authResponse = JsonSerializer.Deserialize<AuthApiResponse>(responseBody, JsonOptions);
                    if (authResponse != null)
                    {
                        CurrentSession.AccessToken = authResponse.accessToken ?? authResponse.access_token ?? CurrentSession.AccessToken;
                        CurrentSession.RefreshToken = authResponse.refreshToken ?? authResponse.refresh_token ?? CurrentSession.RefreshToken;

                        if (authResponse.user != null)
                        {
                            CurrentSession.UserId = authResponse.user.id ?? CurrentSession.UserId;
                            CurrentSession.Email = authResponse.user.email ?? CurrentSession.Email;
                        }

                        CurrentSession.ExpiresAt = ResolveExpiry(authResponse, CurrentSession.AccessToken);

                        SaveSession();
                        SessionChanged?.Invoke(this, CurrentSession);
                        return true;
                    }
                }

                // Only sign out on auth failures, not on transient network exceptions.
                SignOut();
                return false;
            }
            catch
            {
                return false;
            }
        }

        public async Task<string?> RefreshTokenIfNeededAsync()
        {
            if (CurrentSession == null || string.IsNullOrWhiteSpace(CurrentSession.AccessToken))
            {
                return null;
            }

            var effectiveExpiry = GetEffectiveExpiry(CurrentSession);
            if (CurrentSession.ExpiresAt != effectiveExpiry)
            {
                CurrentSession.ExpiresAt = effectiveExpiry;
                SaveSession();
            }

            if (effectiveExpiry <= DateTime.UtcNow.AddMinutes(5))
            {
                var success = await RefreshTokenAsync();
                if (success)
                {
                    return CurrentSession?.AccessToken;
                }

                if (effectiveExpiry <= DateTime.UtcNow)
                {
                    SignOut();
                }

                return null;
            }

            return CurrentSession.AccessToken;
        }

        private static DateTime ResolveExpiry(AuthApiResponse authResponse, string? accessToken)
        {
            if (authResponse.expires_in.HasValue && authResponse.expires_in.Value > 0)
            {
                return DateTime.UtcNow.AddSeconds(authResponse.expires_in.Value);
            }

            if (DateTime.TryParse(authResponse.expiresAt, out var parsed))
            {
                return parsed.Kind == DateTimeKind.Utc ? parsed : parsed.ToUniversalTime();
            }

            if (TryGetJwtExpiryUtc(accessToken, out var jwtExpiry))
            {
                return jwtExpiry;
            }

            // Safer fallback for tokens with unknown TTL.
            return DateTime.UtcNow.AddMinutes(15);
        }

        private static DateTime GetEffectiveExpiry(UserSession session)
        {
            var expiry = session.ExpiresAt;

            if (TryGetJwtExpiryUtc(session.AccessToken, out var jwtExpiry))
            {
                if (expiry == default || jwtExpiry < expiry)
                {
                    expiry = jwtExpiry;
                }
            }

            if (expiry == default)
            {
                expiry = DateTime.UtcNow.AddMinutes(15);
            }

            return expiry;
        }

        private static bool TryGetJwtExpiryUtc(string? accessToken, out DateTime expiryUtc)
        {
            expiryUtc = default;

            if (string.IsNullOrWhiteSpace(accessToken))
            {
                return false;
            }

            try
            {
                var parts = accessToken.Split('.');
                if (parts.Length < 2)
                {
                    return false;
                }

                var payload = parts[1]
                    .Replace('-', '+')
                    .Replace('_', '/');

                switch (payload.Length % 4)
                {
                    case 2:
                        payload += "==";
                        break;
                    case 3:
                        payload += "=";
                        break;
                    case 1:
                        return false;
                }

                var bytes = Convert.FromBase64String(payload);
                using var doc = JsonDocument.Parse(bytes);

                if (!doc.RootElement.TryGetProperty("exp", out var expElement))
                {
                    return false;
                }

                if (!expElement.TryGetInt64(out var expSeconds))
                {
                    return false;
                }

                expiryUtc = DateTimeOffset.FromUnixTimeSeconds(expSeconds).UtcDateTime;
                return true;
            }
            catch
            {
                return false;
            }
        }

        private void SaveSession()
        {
            try
            {
                var directory = Path.GetDirectoryName(_sessionFilePath);
                if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                var json = JsonSerializer.Serialize(CurrentSession, JsonOptions);
                File.WriteAllText(_sessionFilePath, json);
            }
            catch
            {
                // Ignore save errors
            }
        }

        private void LoadSession()
        {
            try
            {
                if (File.Exists(_sessionFilePath))
                {
                    var json = File.ReadAllText(_sessionFilePath);
                    CurrentSession = JsonSerializer.Deserialize<UserSession>(json, JsonOptions);

                    if (CurrentSession != null)
                    {
                        CurrentSession.ExpiresAt = GetEffectiveExpiry(CurrentSession);

                        var hasAccess = !string.IsNullOrWhiteSpace(CurrentSession.AccessToken);
                        var hasRefresh = !string.IsNullOrWhiteSpace(CurrentSession.RefreshToken);
                        if (!hasAccess && !hasRefresh)
                        {
                            CurrentSession = null;
                        }
                        else
                        {
                            SaveSession();
                        }
                    }
                }
            }
            catch
            {
                CurrentSession = null;
            }
        }

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNameCaseInsensitive = true
        };
    }

    public class AuthApiResponse
    {
        public string? accessToken { get; set; }
        public string? access_token { get; set; }
        public string? refreshToken { get; set; }
        public string? refresh_token { get; set; }
        public int? expires_in { get; set; }
        public string? expiresAt { get; set; }
        public AuthUser? user { get; set; }
    }

    public class AuthUser
    {
        public string? id { get; set; }
        public string? email { get; set; }
    }

    public class AuthErrorResponse
    {
        public string? error { get; set; }
        public string? message { get; set; }
        public string? error_description { get; set; }
    }
}
