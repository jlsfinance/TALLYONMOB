using System;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace TallySyncApp.Services
{
    /// <summary>
    /// UpdateService — checks a version manifest, reports whether a newer release exists, and can
    /// download + verify the new installer into a staging folder.
    ///
    /// It NEVER executes the downloaded file: staging only. The parent agent decides how to
    /// hand the staged installer to the user (dialog, tray notification, or a separate updater
    /// process — the competitor shipped a separate <c>Updater.exe</c>).
    ///
    /// Everything here is safe to call while offline: a short HTTP timeout and a catch-all mean
    /// a missing host simply yields <see cref="UpdateCheckResult.Success"/> = false with an
    /// <see cref="UpdateCheckResult.Error"/> message.
    ///
    /// The manifest URL comes from configuration — nothing is hardcoded.
    /// </summary>
    public sealed class UpdateService : IDisposable
    {
        /// <summary>Expected JSON shape of the version manifest.</summary>
        public sealed class UpdateManifest
        {
            /// <summary>Advertised version, e.g. "2.1.0".</summary>
            public string? version { get; set; }

            /// <summary>Absolute URL of the installer to download.</summary>
            public string? downloadUrl { get; set; }

            /// <summary>Release notes shown to the user.</summary>
            public string? releaseNotes { get; set; }

            /// <summary>Optional lowercase/uppercase hex SHA-256 of the installer. When present the
            /// download is verified and rejected on mismatch.</summary>
            public string? sha256 { get; set; }

            /// <summary>Optional minimum version that must be installed.</summary>
            public string? minVersion { get; set; }

            /// <summary>True when the release blocks further use until applied.</summary>
            public bool mandatory { get; set; }
        }

        /// <summary>Outcome of <see cref="CheckAsync"/>.</summary>
        public sealed class UpdateCheckResult
        {
            /// <summary>True when the manifest was fetched and parsed (an offline result is false).</summary>
            public bool Success { get; set; }

            /// <summary>True when the advertised version is newer than the running version.</summary>
            public bool UpdateAvailable { get; set; }

            public string CurrentVersion { get; set; } = string.Empty;
            public string? LatestVersion { get; set; }
            public string? DownloadUrl { get; set; }
            public string? ReleaseNotes { get; set; }
            public bool Mandatory { get; set; }
            public string? Error { get; set; }
            public DateTime CheckedAt { get; set; } = DateTime.UtcNow;
        }

        /// <summary>Outcome of <see cref="DownloadAndStageAsync"/>.</summary>
        public sealed class UpdateStagingResult
        {
            public bool Success { get; set; }
            public string? StagedFilePath { get; set; }
            public string? Version { get; set; }
            /// <summary>True when a SHA-256 was supplied and matched (or none was supplied).</summary>
            public bool HashVerified { get; set; }
            public string? Error { get; set; }
        }

        private readonly HttpClient _httpClient;
        private readonly string _manifestUrl;
        private readonly string _currentVersion;
        private readonly string _stagingDirectory;
        private readonly int _timeoutSeconds;
        private int _disposed;

        /// <summary>Raised only when a strictly newer version was found.</summary>
        public event EventHandler<UpdateCheckResult>? UpdateAvailable;

        /// <summary>Awaitable counterpart of <see cref="UpdateAvailable"/> (e.g. to show a dialog).</summary>
        public Func<UpdateCheckResult, Task>? UpdateAvailableCallback { get; set; }

        /// <summary>Raised for internal diagnostics; never throws.</summary>
        public event EventHandler<string>? Diagnostics;

        /// <summary>
        /// Creates the update service.
        /// </summary>
        /// <param name="manifestUrl">URL of the version manifest JSON. From configuration.</param>
        /// <param name="currentVersion">
        /// Running version; defaults to the executing assembly's informational version
        /// (falling back to its file version).
        /// </param>
        /// <param name="timeoutSeconds">Short timeout so an offline host cannot stall the UI.</param>
        /// <param name="stagingDirectory">Where installers are staged. Defaults to %TEMP%\TallyLink\updates.</param>
        public UpdateService(
            string manifestUrl,
            string? currentVersion = null,
            int timeoutSeconds = 10,
            string? stagingDirectory = null)
        {
            _manifestUrl = (manifestUrl ?? string.Empty).Trim();
            _currentVersion = (currentVersion ?? GetCurrentVersion()).Trim();
            _timeoutSeconds = timeoutSeconds > 0 ? timeoutSeconds : 10;
            _stagingDirectory = stagingDirectory
                ?? Path.Combine(Path.GetTempPath(), "TallyLink", "updates");

            var handler = new HttpClientHandler { UseProxy = false };
            _httpClient = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(_timeoutSeconds)
            };
        }

        /// <summary>Version of the currently executing assembly.</summary>
        public static string GetCurrentVersion()
        {
            try
            {
                var asm = System.Reflection.Assembly.GetExecutingAssembly();

                foreach (var attr in asm.GetCustomAttributes(
                             typeof(System.Reflection.AssemblyInformationalVersionAttribute), false))
                {
                    if (attr is System.Reflection.AssemblyInformationalVersionAttribute info &&
                        !string.IsNullOrWhiteSpace(info.InformationalVersion))
                    {
                        return info.InformationalVersion;
                    }
                }

                foreach (var attr in asm.GetCustomAttributes(
                             typeof(System.Reflection.AssemblyFileVersionAttribute), false))
                {
                    if (attr is System.Reflection.AssemblyFileVersionAttribute file &&
                        !string.IsNullOrWhiteSpace(file.Version))
                    {
                        return file.Version;
                    }
                }

                try
                {
                    var fileVersion = System.Diagnostics.FileVersionInfo
                        .GetVersionInfo(asm.Location).FileVersion;
                    if (!string.IsNullOrWhiteSpace(fileVersion))
                    {
                        return fileVersion;
                    }
                }
                catch
                {
                    // single-file / no location — fall through
                }

                var nameVersion = asm.GetName().Version;
                if (nameVersion is { Major: > 0 } || nameVersion is { Minor: > 0 } || nameVersion is { Build: > 0 })
                {
                    return nameVersion.ToString();
                }

                return "0.0.0";
            }
            catch
            {
                return "0.0.0";
            }
        }

        /// <summary>
        /// Fetches the manifest and compares it with the running version. Safe offline.
        /// </summary>
        public async Task<UpdateCheckResult> CheckAsync(CancellationToken ct = default)
        {
            var result = new UpdateCheckResult { CurrentVersion = _currentVersion };

            try
            {
                if (string.IsNullOrWhiteSpace(_manifestUrl))
                {
                    result.Error = "Update manifest URL is not configured.";
                    RaiseDiagnostics(result.Error);
                    return result;
                }

                using var request = new HttpRequestMessage(HttpMethod.Get, _manifestUrl);
                using var response = await _httpClient.SendAsync(request, ct).ConfigureAwait(false);

                if (!response.IsSuccessStatusCode)
                {
                    result.Error = $"Manifest HTTP {(int)response.StatusCode}";
                    RaiseDiagnostics(result.Error);
                    return result;
                }

                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                var manifest = JsonConvert.DeserializeObject<UpdateManifest>(body);
                if (manifest == null)
                {
                    result.Error = "Manifest could not be parsed.";
                    RaiseDiagnostics(result.Error);
                    return result;
                }

                result.Success = true;
                result.LatestVersion = manifest.version;
                result.DownloadUrl = manifest.downloadUrl;
                result.ReleaseNotes = manifest.releaseNotes;
                result.Mandatory = manifest.mandatory;

                // Guard: this project is built with GenerateAssemblyInfo=false, so the executing
                // assembly can report 0.0.0.0. Reporting "update available" for that would pop a
                // false update prompt on every check — refuse to conclude instead.
                if (IsZeroVersion(_currentVersion))
                {
                    result.Error = "Current version could not be determined from the assembly "
                        + "(reported 0.0.0.0). Pass UpdateSettings:CurrentVersion or set "
                        + "currentVersion in the UpdateService constructor.";
                    return result;
                }

                if (CompareVersions(manifest.version, _currentVersion) > 0)
                {
                    result.UpdateAvailable = true;
                    RaiseUpdateAvailable(result);
                }

                return result;
            }
            catch (OperationCanceledException)
            {
                result.Error = "Update check timed out.";
                RaiseDiagnostics(result.Error);
                return result;
            }
            catch (Exception ex)
            {
                result.Error = $"Update check failed: {ex.Message}";
                RaiseDiagnostics(result.Error);
                return result;
            }
        }

        /// <summary>
        /// Downloads the installer for the advertised version into the staging directory and, when
        /// the manifest supplies a SHA-256, verifies it. The file is NEVER executed.
        /// </summary>
        /// <param name="check">
        /// The result of a previous <see cref="CheckAsync"/> call. When null, <see cref="CheckAsync"/>
        /// is invoked first.
        /// </param>
        /// <param name="expectedSha256">Overrides the manifest's hash (hex, case-insensitive).</param>
        public async Task<UpdateStagingResult> DownloadAndStageAsync(
            UpdateCheckResult? check = null,
            string? expectedSha256 = null,
            CancellationToken ct = default)
        {
            var staged = new UpdateStagingResult();

            try
            {
                if (string.IsNullOrWhiteSpace(_manifestUrl))
                {
                    staged.Error = "Update manifest URL is not configured.";
                    return staged;
                }

                var info = check ?? await CheckAsync(ct).ConfigureAwait(false);
                if (!info.Success || string.IsNullOrWhiteSpace(info.DownloadUrl))
                {
                    staged.Error = info.Error ?? "No download URL available.";
                    return staged;
                }

                staged.Version = info.LatestVersion;

                Directory.CreateDirectory(_stagingDirectory);
                var fileName = SanitizeFileName(
                    Path.GetFileName(new Uri(info.DownloadUrl).LocalPath));
                if (string.IsNullOrWhiteSpace(fileName))
                {
                    fileName = $"TallyLink_{info.LatestVersion ?? "update"}.exe";
                }

                var destination = Path.Combine(_stagingDirectory, fileName);

                using (var request = new HttpRequestMessage(HttpMethod.Get, info.DownloadUrl))
                using (var response = await _httpClient.SendAsync(request, ct).ConfigureAwait(false))
                {
                    if (!response.IsSuccessStatusCode)
                    {
                        staged.Error = $"Download HTTP {(int)response.StatusCode}";
                        return staged;
                    }

                    await using var source = await response.Content.ReadAsStreamAsync().ConfigureAwait(false);
                    await using var target = new FileStream(
                        destination, FileMode.Create, FileAccess.Write, FileShare.None);
                    await source.CopyToAsync(target, ct).ConfigureAwait(false);
                }

                var manifestHash = expectedSha256;
                if (string.IsNullOrWhiteSpace(manifestHash))
                {
                    manifestHash = await GetManifestSha256Async(ct).ConfigureAwait(false);
                }

                if (!string.IsNullOrWhiteSpace(manifestHash))
                {
                    var actual = await ComputeSha256Async(destination, ct).ConfigureAwait(false);
                    if (!string.Equals(actual, manifestHash.Trim(), StringComparison.OrdinalIgnoreCase))
                    {
                        TryDelete(destination);
                        staged.Error = "Downloaded installer failed the SHA-256 check.";
                        return staged;
                    }
                    staged.HashVerified = true;
                }

                staged.Success = true;
                staged.StagedFilePath = destination;
                return staged;
            }
            catch (OperationCanceledException)
            {
                staged.Error = "Download timed out.";
                return staged;
            }
            catch (Exception ex)
            {
                staged.Error = $"Download failed: {ex.Message}";
                return staged;
            }
        }

        private async Task<string?> GetManifestSha256Async(CancellationToken ct)
        {
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, _manifestUrl);
                using var response = await _httpClient.SendAsync(request, ct).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode) return null;
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                return JsonConvert.DeserializeObject<UpdateManifest>(body)?.sha256;
            }
            catch
            {
                return null;
            }
        }

        private static async Task<string> ComputeSha256Async(string path, CancellationToken ct)
        {
            await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
            var hash = await SHA256.HashDataAsync(stream, ct).ConfigureAwait(false);
            return Convert.ToHexString(hash).ToLowerInvariant();
        }

        private static void TryDelete(string path)
        {
            try
            {
                if (File.Exists(path)) File.Delete(path);
            }
            catch
            {
                // best effort
            }
        }

        private static string SanitizeFileName(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return string.Empty;
            foreach (var c in Path.GetInvalidFileNameChars())
            {
                name = name.Replace(c, '_');
            }
            return name.Trim();
        }

        private void RaiseDiagnostics(string message)
        {
            try
            {
                Diagnostics?.Invoke(this, message);
            }
            catch
            {
                // a faulty subscriber must not break the update check
            }
        }

        private void RaiseUpdateAvailable(UpdateCheckResult result)
        {
            try
            {
                UpdateAvailable?.Invoke(this, result);
            }
            catch
            {
                // a faulty subscriber must not break the check
            }

            var callback = UpdateAvailableCallback;
            if (callback != null)
            {
                try
                {
                    _ = callback(result);
                }
                catch
                {
                    // fire-and-forget; never let it surface
                }
            }
        }

        // -----------------------------------------------------------------------
        // Version comparison
        // -----------------------------------------------------------------------

        /// <summary>
        /// Semantic-ish comparison of two dotted versions ("2.1", "2.1.0", "2.1.0-beta").
        /// Returns -1 when <paramref name="left"/> is older, 0 when equal, +1 when newer.
        /// Missing components count as 0; a pre-release suffix makes a version older than the
        /// same numeric version (2.1.0-beta &lt; 2.1.0).
        /// </summary>
        public static int CompareVersions(string? left, string? right)
        {
            var a = Parse(left);
            var b = Parse(right);

            for (int i = 0; i < a.Numbers.Length; i++)
            {
                if (a.Numbers[i] != b.Numbers[i])
                {
                    return a.Numbers[i] < b.Numbers[i] ? -1 : 1;
                }
            }

            if (a.IsPreRelease != b.IsPreRelease)
            {
                return a.IsPreRelease ? -1 : 1;
            }

            return string.CompareOrdinal(a.Suffix ?? string.Empty, b.Suffix ?? string.Empty);
        }

        /// <summary>True when every numeric component is zero (e.g. "0.0.0.0").</summary>
        private static bool IsZeroVersion(string? version)
        {
            var parsed = Parse(version);
            foreach (var n in parsed.Numbers)
            {
                if (n != 0) return false;
            }
            return true;
        }

        private static (int[] Numbers, bool IsPreRelease, string? Suffix) Parse(string? version)
        {
            var numbers = new int[4];
            var isPreRelease = false;
            string? suffix = null;

            if (!string.IsNullOrWhiteSpace(version))
            {
                var text = version.Trim();

                var dash = text.IndexOf('-');
                var plus = text.IndexOf('+');
                var cut = dash >= 0 ? dash : plus;
                if (cut >= 0)
                {
                    isPreRelease = dash >= 0;
                    suffix = text.Substring(cut + 1);
                    text = text.Substring(0, cut);
                }

                var parts = text.Split('.');
                for (int i = 0; i < parts.Length && i < numbers.Length; i++)
                {
                    int value;
                    var numeric = new string(parts[i].TakeWhile(char.IsDigit).ToArray());
                    int.TryParse(numeric, out value);
                    numbers[i] = value;
                }
            }

            return (numbers, isPreRelease, suffix);
        }

        // -----------------------------------------------------------------------
        // Configuration helper
        // -----------------------------------------------------------------------

        /// <summary>
        /// Builds a service from <c>appsettings.json</c> under an <c>UpdateSettings</c> section:
        /// <code>
        /// "UpdateSettings": {
        ///   "ManifestUrl": "https://example.com/tallylink/version.json",
        ///   "TimeoutSeconds": 10
        /// }
        /// </code>
        /// Returns <c>null</c> when no manifest URL is configured.
        /// </summary>
        public static UpdateService? CreateFromConfig(string? settingsPath = null)
        {
            try
            {
                var path = settingsPath ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "appsettings.json");
                if (!File.Exists(path)) return null;

                using var doc = JsonDocument.Parse(File.ReadAllText(path));
                if (!doc.RootElement.TryGetProperty("UpdateSettings", out var s)) return null;

                var url = ReadString(s, "ManifestUrl");
                if (string.IsNullOrWhiteSpace(url)) return null;

                return new UpdateService(
                    url,
                    currentVersion: ReadString(s, "CurrentVersion"),
                    timeoutSeconds: ReadInt(s, "TimeoutSeconds", 10),
                    stagingDirectory: ReadString(s, "StagingDirectory"));
            }
            catch
            {
                return null;
            }
        }

        private static string? ReadString(JsonElement el, string name)
        {
            if (el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String)
            {
                return v.GetString();
            }
            return null;
        }

        private static int ReadInt(JsonElement el, string name, int fallback)
        {
            if (el.TryGetProperty(name, out var v) &&
                v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n))
            {
                return n;
            }
            return fallback;
        }

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
            try
            {
                _httpClient.Dispose();
            }
            catch
            {
                // ignore
            }
        }
    }
}