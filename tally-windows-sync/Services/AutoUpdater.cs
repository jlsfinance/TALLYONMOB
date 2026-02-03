using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using System.Collections.Generic;

namespace TallySyncApp.Services
{
    public class AutoUpdater
    {
        private readonly ApiClient _apiClient;
        private readonly ILogger<AutoUpdater>? _logger;
        private const string CurrentVersion = "2.0.5";

        public AutoUpdater(ApiClient apiClient, ILogger<AutoUpdater>? logger = null)
        {
            _apiClient = apiClient;
            _logger = logger;
        }

        public async Task CheckAndApplyUpdateAsync()
        {
            try
            {
                // 1. Check for update from Supabase 'app_releases' table
                _logger?.LogInformation("Checking for updates...");
                
                // We use a raw HTTP call via ApiClient's generic fetch or just construct it here using _apiClient base URL concepts 
                // But _apiClient functionality is encapsulated. Let's add a helper or use a raw HttpClient if easier, 
                // but checking connection strings is better via ApiClient.
                // Assuming we can assume the table 'app_releases' exists.
                
                // Schema: id, version (text like "2.0.6"), download_url (text), mandatory (bool)
                
                // Using a direct method or piggybacking off existing infrastructure
                // For now, let's just log implementation as we don't know the exact endpoint access.
                // But to make it "Boom kaam ho gya", we need it to work.
                
                // Strategy: We will try to fetch from 'app_releases'
                // Since ApiClient doesn't have a generic GetTable, we will extend it or use a raw request logic here if possible
                // but we can't access private members.
                // I will add a method to ApiClient to GetLatestRelease.
                
                var release = await _apiClient.GetLatestReleaseAsync();
                
                if (release != null && IsNewer(release.Version))
                {
                    _logger?.LogInformation($"New version found: {release.Version}");
                    
                    if (System.Windows.MessageBox.Show($"A new version ({release.Version}) is available.\n\nChanges:\n{release.ReleaseNotes}\n\nUpdate now?", 
                        "Update Available", System.Windows.MessageBoxButton.YesNo, System.Windows.MessageBoxImage.Information) == System.Windows.MessageBoxResult.Yes)
                    {
                        await DownloadAndInstallAsync(release.DownloadUrl);
                    }
                }
                else
                {
                    _logger?.LogInformation("App is up to date.");
                }
            }
            catch (Exception ex)
            {
                _logger?.LogError($"Update check failed: {ex.Message}");
            }
        }

        private bool IsNewer(string remoteVersion)
        {
            try
            {
                var v1 = new Version(remoteVersion);
                var v2 = new Version(CurrentVersion);
                return v1 > v2;
            }
            catch 
            {
                return false; 
            }
        }

        private async Task DownloadAndInstallAsync(string url)
        {
            try
            {
                string tempFile = Path.Combine(Path.GetTempPath(), "TallyLink_Update.exe");
                string batchFile = Path.Combine(Path.GetTempPath(), "update.bat");
                string currentExe = Process.GetCurrentProcess().MainModule?.FileName ?? "";
                
                if (string.IsNullOrEmpty(currentExe)) return;

                _logger?.LogInformation("Downloading update...");
                
                using (var client = new HttpClient())
                {
                    using (var s = await client.GetStreamAsync(url))
                    {
                        using (var fs = new FileStream(tempFile, FileMode.Create))
                        {
                            await s.CopyToAsync(fs);
                        }
                    }
                }

                _logger?.LogInformation("Download complete. Preparing to restart...");

                // Create update script
                // 1. Wait 2 seconds
                // 2. Kill current process (handled by self-exit, but script ensures)
                // 3. Move temp file to current location (Overwrite)
                // 4. Start new exe
                string script = $@"
@echo off
timeout /t 2 /nobreak
taskkill /F /IM ""{Path.GetFileName(currentExe)}"" >nul 2>&1
move /y ""{tempFile}"" ""{currentExe}""
start """" ""{currentExe}""
del ""%~f0""
";
                File.WriteAllText(batchFile, script);

                // Execute script and Exit
                var psi = new ProcessStartInfo
                {
                    FileName = batchFile,
                    UseShellExecute = true,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                
                Process.Start(psi);
                System.Windows.Application.Current.Shutdown();
            }
            catch (Exception ex)
            {
                System.Windows.MessageBox.Show($"Update failed: {ex.Message}");
            }
        }
    }

    public class AppRelease
    {
        [JsonProperty("version")]
        public string Version { get; set; } = "";
        
        [JsonProperty("download_url")]
        public string DownloadUrl { get; set; } = "";
        
        [JsonProperty("release_notes")]
        public string ReleaseNotes { get; set; } = "";
    }
}
