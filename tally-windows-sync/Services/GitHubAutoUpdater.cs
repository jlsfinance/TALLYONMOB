using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace TallySyncApp.Services
{
    public enum AutoUpdateState
    {
        Idle,
        Checking,
        UpToDate,
        Downloading,
        ReadyToInstall,
        Error,
    }

    public sealed record GitHubReleaseInfo(
        string Version,
        string DownloadUrl,
        string AssetName,
        long AssetSize,
        string ReleaseNotes);

    public sealed record AutoUpdateStatus(
        AutoUpdateState State,
        string CurrentVersion,
        string? LatestVersion,
        int ProgressPercent,
        string? StagedInstallerPath,
        string? ReleaseNotes,
        string? Message);

    /// <summary>
    /// Antigravity-style background updater using GitHub Releases. Checks for newer
    /// SyncoraConnector-Setup-*.exe builds, downloads cleanly into %LOCALAPPDATA%\Syncora\updates,
    /// verifies file integrity, and applies silently on "Restart & Update" or normal app exit.
    /// </summary>
    public static class GitHubAutoUpdater
    {
        public const string LatestReleaseApiUrl = "https://api.github.com/repos/jlsfinance/TALLYONMOB/releases/latest";

        private static readonly SemaphoreSlim _syncLock = new(1, 1);
        private static int _backgroundStarted;
        private static int _applyLaunched;

        public static AutoUpdateStatus CurrentStatus { get; private set; } = new(
            AutoUpdateState.Idle,
            GetRunningVersion(),
            null,
            0,
            null,
            null,
            "Auto-update check starts in background...");

        public static event EventHandler<AutoUpdateStatus>? StatusChanged;

        public static string GetRunningVersion()
        {
            try
            {
                var ver = Assembly.GetEntryAssembly()?.GetName().Version
                    ?? Assembly.GetExecutingAssembly().GetName().Version;
                if (ver != null) return ver.ToString(3);
            }
            catch
            {
                // fallback below
            }
            return "0.0.0";
        }

        public static string GetUpdatesDirectory(string? localAppDataOverride = null)
        {
            var baseDir = !string.IsNullOrWhiteSpace(localAppDataOverride)
                ? localAppDataOverride
                : Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return Path.Combine(baseDir, "Syncora", "updates");
        }

        public static string GetPendingMarkerPath(string? localAppDataOverride = null) =>
            Path.Combine(GetUpdatesDirectory(localAppDataOverride), "pending-update.json");

        public static GitHubReleaseInfo? ParseLatestReleaseJson(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return null;
            try
            {
                var obj = JObject.Parse(json);
                var tag = obj["tag_name"]?.ToString()?.Trim() ?? string.Empty;
                var version = NormalizeVersion(tag);
                if (string.IsNullOrWhiteSpace(version)) return null;

                var body = obj["body"]?.ToString() ?? string.Empty;
                var summaryLines = body
                    .Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                    .Select(l => l.Trim())
                    .Where(l => !string.IsNullOrWhiteSpace(l))
                    .Take(2);
                var releaseNotes = string.Join(" ", summaryLines);
                if (releaseNotes.Length > 180) releaseNotes = releaseNotes.Substring(0, 177) + "...";

                string assetName = $"SyncoraConnector-Setup-{version}.exe";
                string downloadUrl = $"https://github.com/jlsfinance/TALLYONMOB/releases/download/v{version}/{assetName}";
                long assetSize = 0;

                if (obj["assets"] is JArray assets)
                {
                    foreach (var asset in assets)
                    {
                        var name = asset["name"]?.ToString()?.Trim() ?? string.Empty;
                        var url = asset["browser_download_url"]?.ToString()?.Trim() ?? string.Empty;
                        if (name.StartsWith("SyncoraConnector-Setup-", StringComparison.OrdinalIgnoreCase) &&
                            name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) &&
                            !string.IsNullOrWhiteSpace(url))
                        {
                            assetName = name;
                            downloadUrl = url;
                            assetSize = asset["size"]?.Value<long>() ?? 0;
                            break;
                        }
                    }
                }

                return new GitHubReleaseInfo(version, downloadUrl, assetName, assetSize, releaseNotes);
            }
            catch
            {
                return null;
            }
        }

        public static int CompareVersions(string? left, string? right)
        {
            var a = ParseParts(left);
            var b = ParseParts(right);
            int maxLen = Math.Max(a.Length, b.Length);
            for (int i = 0; i < maxLen; i++)
            {
                int lv = i < a.Length ? a[i] : 0;
                int rv = i < b.Length ? b[i] : 0;
                if (lv != rv) return lv < rv ? -1 : 1;
            }
            return 0;
        }

        private static string NormalizeVersion(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
            var s = raw.Trim().TrimStart('v', 'V');
            var cut = s.IndexOfAny(new[] { '-', '+' });
            if (cut >= 0) s = s.Substring(0, cut);
            return s.Trim();
        }

        private static int[] ParseParts(string? raw)
        {
            var norm = NormalizeVersion(raw);
            if (string.IsNullOrWhiteSpace(norm)) return new[] { 0, 0, 0 };
            return norm.Split('.', StringSplitOptions.RemoveEmptyEntries)
                .Select(p => int.TryParse(p, out var n) ? n : 0)
                .ToArray();
        }

        public static string BuildApplyUpdateScript(
            string installerPath,
            string appExePath,
            int currentPid,
            bool relaunchAfterInstall,
            string pendingMarkerPath)
        {
            var relaunchLine = relaunchAfterInstall && !string.IsNullOrWhiteSpace(appExePath)
                ? $"start \"\" \"{appExePath}\""
                : string.Empty;

            return string.Join("\r\n", new[]
            {
                "@echo off",
                "timeout /t 2 /nobreak >nul",
                $"taskkill /F /PID {currentPid} >nul 2>&1",
                "timeout /t 1 /nobreak >nul",
                $"\"{installerPath}\" /VERYSILENT /SUPPRESSMSGBOXES /CLOSEAPPLICATIONS /NORESTART",
                "if %ERRORLEVEL% EQU 0 (",
                $"  del /F /Q \"{pendingMarkerPath}\" >nul 2>&1",
                $"  del /F /Q \"{installerPath}\" >nul 2>&1",
                ")",
                relaunchLine,
                "del /F /Q \"%~f0\" >nul 2>&1",
            }.Where(line => line != null)) + "\r\n";
        }

        public static void StartBackgroundUpdater()
        {
            if (Interlocked.Exchange(ref _backgroundStarted, 1) == 1) return;

            _ = Task.Run(async () =>
            {
                await Task.Delay(TimeSpan.FromSeconds(8));
                while (true)
                {
                    try
                    {
                        await CheckAndDownloadAsync(isManual: false);
                    }
                    catch
                    {
                        // Background checks never crash the app
                    }
                    await Task.Delay(TimeSpan.FromHours(4));
                }
            });
        }

        public static async Task<AutoUpdateStatus> CheckAndDownloadAsync(bool isManual = false, CancellationToken ct = default)
        {
            await _syncLock.WaitAsync(ct).ConfigureAwait(false);
            var currentVer = GetRunningVersion();
            try
            {
                if (isManual)
                {
                    Publish(new AutoUpdateStatus(
                        AutoUpdateState.Checking,
                        currentVer,
                        CurrentStatus.LatestVersion,
                        0,
                        CurrentStatus.StagedInstallerPath,
                        CurrentStatus.ReleaseNotes,
                        "Checking GitHub Releases for updates..."));
                }

                using var apiClient = CreateHttpClient(currentVer, TimeSpan.FromSeconds(15));
                using var resp = await apiClient.GetAsync(LatestReleaseApiUrl, ct).ConfigureAwait(false);
                if (!resp.IsSuccessStatusCode)
                {
                    var errMsg = $"Update check failed (HTTP {(int)resp.StatusCode}).";
                    return Publish(new AutoUpdateStatus(
                        isManual ? AutoUpdateState.Error : AutoUpdateState.Idle,
                        currentVer,
                        null,
                        0,
                        null,
                        null,
                        errMsg));
                }

                var json = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
                var release = ParseLatestReleaseJson(json);
                if (release == null)
                {
                    var errMsg = "Could not parse latest release metadata.";
                    return Publish(new AutoUpdateStatus(
                        isManual ? AutoUpdateState.Error : AutoUpdateState.Idle,
                        currentVer,
                        null,
                        0,
                        null,
                        null,
                        errMsg));
                }

                if (CompareVersions(release.Version, currentVer) <= 0)
                {
                    CleanObsoletePendingUpdate(currentVer);
                    return Publish(new AutoUpdateStatus(
                        isManual ? AutoUpdateState.UpToDate : AutoUpdateState.Idle,
                        currentVer,
                        release.Version,
                        100,
                        null,
                        release.ReleaseNotes,
                        $"You are on the latest version (v{currentVer})."));
                }

                var updatesDir = GetUpdatesDirectory();
                Directory.CreateDirectory(updatesDir);
                var finalPath = Path.Combine(updatesDir, release.AssetName);
                var partPath = finalPath + ".part";
                var pendingMarker = GetPendingMarkerPath();

                if (File.Exists(finalPath))
                {
                    var existingSize = new FileInfo(finalPath).Length;
                    bool matchesExpected = release.AssetSize > 0
                        ? existingSize == release.AssetSize
                        : existingSize > 10_000_000;
                    if (matchesExpected)
                    {
                        WritePendingMarker(pendingMarker, release.Version, finalPath);
                        return Publish(new AutoUpdateStatus(
                            AutoUpdateState.ReadyToInstall,
                            currentVer,
                            release.Version,
                            100,
                            finalPath,
                            release.ReleaseNotes,
                            $"SYNCORA Connector v{release.Version} is ready — click Restart & Update."));
                    }
                }

                Publish(new AutoUpdateStatus(
                    AutoUpdateState.Downloading,
                    currentVer,
                    release.Version,
                    0,
                    null,
                    release.ReleaseNotes,
                    $"Downloading v{release.Version} (0%)..."));

                using var downloadClient = CreateHttpClient(currentVer, TimeSpan.FromMinutes(10));
                using var dlResp = await downloadClient.GetAsync(release.DownloadUrl, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
                if (!dlResp.IsSuccessStatusCode)
                {
                    return Publish(new AutoUpdateStatus(
                        AutoUpdateState.Error,
                        currentVer,
                        release.Version,
                        0,
                        null,
                        release.ReleaseNotes,
                        $"Update download failed (HTTP {(int)dlResp.StatusCode})."));
                }

                long totalBytes = dlResp.Content.Headers.ContentLength ?? release.AssetSize;
                long totalRead = 0;
                int lastPct = 0;
                var lastReportAt = DateTime.UtcNow;

                await using (var source = await dlResp.Content.ReadAsStreamAsync(ct).ConfigureAwait(false))
                await using (var target = new FileStream(partPath, FileMode.Create, FileAccess.Write, FileShare.None, 65536, true))
                {
                    var buffer = new byte[65536];
                    int read;
                    while ((read = await source.ReadAsync(buffer, 0, buffer.Length, ct).ConfigureAwait(false)) > 0)
                    {
                        await target.WriteAsync(buffer, 0, read, ct).ConfigureAwait(false);
                        totalRead += read;

                        if (totalBytes > 0)
                        {
                            int pct = (int)Math.Min(99, totalRead * 100L / totalBytes);
                            if (pct - lastPct >= 3 || (DateTime.UtcNow - lastReportAt).TotalMilliseconds >= 500)
                            {
                                lastPct = pct;
                                lastReportAt = DateTime.UtcNow;
                                Publish(new AutoUpdateStatus(
                                    AutoUpdateState.Downloading,
                                    currentVer,
                                    release.Version,
                                    pct,
                                    null,
                                    release.ReleaseNotes,
                                    $"Downloading v{release.Version} ({pct}%)..."));
                            }
                        }
                    }
                }

                var downloadedSize = new FileInfo(partPath).Length;
                if (downloadedSize < 10_000_000 || (totalBytes > 0 && downloadedSize != totalBytes))
                {
                    try { File.Delete(partPath); } catch { }
                    return Publish(new AutoUpdateStatus(
                        AutoUpdateState.Error,
                        currentVer,
                        release.Version,
                        0,
                        null,
                        release.ReleaseNotes,
                        "Downloaded installer was incomplete. Will retry later."));
                }

                File.Move(partPath, finalPath, overwrite: true);
                CleanOlderSetupFiles(updatesDir, finalPath);
                WritePendingMarker(pendingMarker, release.Version, finalPath);

                return Publish(new AutoUpdateStatus(
                    AutoUpdateState.ReadyToInstall,
                    currentVer,
                    release.Version,
                    100,
                    finalPath,
                    release.ReleaseNotes,
                    $"SYNCORA Connector v{release.Version} downloaded — click Restart & Update."));
            }
            catch (OperationCanceledException)
            {
                return Publish(new AutoUpdateStatus(
                    isManual ? AutoUpdateState.Error : AutoUpdateState.Idle,
                    currentVer,
                    null,
                    0,
                    null,
                    null,
                    "Update check timed out."));
            }
            catch (Exception ex)
            {
                return Publish(new AutoUpdateStatus(
                    isManual ? AutoUpdateState.Error : AutoUpdateState.Idle,
                    currentVer,
                    null,
                    0,
                    null,
                    null,
                    $"Update check error: {ex.Message}"));
            }
            finally
            {
                _syncLock.Release();
            }
        }

        public static bool TryGetReadyPendingUpdate(out string version, out string installerPath)
        {
            version = string.Empty;
            installerPath = string.Empty;

            var status = CurrentStatus;
            if (status.State == AutoUpdateState.ReadyToInstall &&
                !string.IsNullOrWhiteSpace(status.LatestVersion) &&
                !string.IsNullOrWhiteSpace(status.StagedInstallerPath) &&
                File.Exists(status.StagedInstallerPath) &&
                CompareVersions(status.LatestVersion, GetRunningVersion()) > 0)
            {
                version = status.LatestVersion;
                installerPath = status.StagedInstallerPath;
                return true;
            }

            try
            {
                var markerPath = GetPendingMarkerPath();
                if (!File.Exists(markerPath)) return false;
                var obj = JObject.Parse(File.ReadAllText(markerPath));
                var v = obj["version"]?.ToString()?.Trim() ?? string.Empty;
                var path = obj["installerPath"]?.ToString()?.Trim() ?? string.Empty;
                if (!string.IsNullOrWhiteSpace(v) &&
                    !string.IsNullOrWhiteSpace(path) &&
                    File.Exists(path) &&
                    CompareVersions(v, GetRunningVersion()) > 0)
                {
                    version = v;
                    installerPath = path;
                    return true;
                }
            }
            catch
            {
                // Ignore corrupt marker
            }

            return false;
        }

        public static bool LaunchPendingUpdate(bool relaunchAfterInstall)
        {
            if (Interlocked.Exchange(ref _applyLaunched, 1) == 1) return false;

            if (!TryGetReadyPendingUpdate(out _, out var installerPath))
            {
                Interlocked.Exchange(ref _applyLaunched, 0);
                return false;
            }

            try
            {
                var updatesDir = GetUpdatesDirectory();
                Directory.CreateDirectory(updatesDir);
                var scriptPath = Path.Combine(updatesDir, "apply-update.cmd");
                var appExePath = Environment.ProcessPath ?? Path.Combine(AppContext.BaseDirectory, "SyncoraConnector.exe");
                var markerPath = GetPendingMarkerPath();
                var pid = Process.GetCurrentProcess().Id;

                File.WriteAllText(
                    scriptPath,
                    BuildApplyUpdateScript(installerPath, appExePath, pid, relaunchAfterInstall, markerPath));

                Process.Start(new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = $"/c \"{scriptPath}\"",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                });
                return true;
            }
            catch
            {
                Interlocked.Exchange(ref _applyLaunched, 0);
                return false;
            }
        }

        private static HttpClient CreateHttpClient(string version, TimeSpan timeout)
        {
            var client = new HttpClient { Timeout = timeout };
            client.DefaultRequestHeaders.UserAgent.ParseAdd($"SyncoraConnector/{version}");
            client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
            return client;
        }

        private static AutoUpdateStatus Publish(AutoUpdateStatus status)
        {
            CurrentStatus = status;
            try
            {
                StatusChanged?.Invoke(null, status);
            }
            catch
            {
                // Subscriber errors must never crash updater
            }
            return status;
        }

        private static void WritePendingMarker(string markerPath, string version, string installerPath)
        {
            try
            {
                File.WriteAllText(markerPath, JsonConvert.SerializeObject(new
                {
                    version,
                    installerPath,
                    createdAt = DateTime.UtcNow.ToString("o"),
                }));
            }
            catch { }
        }

        private static void CleanOlderSetupFiles(string updatesDir, string keepPath)
        {
            try
            {
                foreach (var file in Directory.GetFiles(updatesDir, "SyncoraConnector-Setup-*.exe"))
                {
                    if (!string.Equals(file, keepPath, StringComparison.OrdinalIgnoreCase))
                    {
                        try { File.Delete(file); } catch { }
                    }
                }
            }
            catch { }
        }

        private static void CleanObsoletePendingUpdate(string currentVer)
        {
            try
            {
                var markerPath = GetPendingMarkerPath();
                if (!File.Exists(markerPath)) return;
                var obj = JObject.Parse(File.ReadAllText(markerPath));
                var v = obj["version"]?.ToString();
                var path = obj["installerPath"]?.ToString();
                if (CompareVersions(v, currentVer) <= 0)
                {
                    try { File.Delete(markerPath); } catch { }
                    if (!string.IsNullOrWhiteSpace(path) && File.Exists(path))
                    {
                        try { File.Delete(path); } catch { }
                    }
                }
            }
            catch { }
        }
    }
}
