using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace TallySyncApp.Services
{
    /// <summary>
    /// Manages the bundled local WhatsApp Web QR helper (node server.js) on 127.0.0.1:3001
    /// without opening external terminal windows or triggering runtime npm installs.
    /// </summary>
    public static class WhatsAppHelperManager
    {
        public const string StatusUrl = "http://127.0.0.1:3001/status";
        public const string QrUrl = "http://127.0.0.1:3001/qr";

        private static readonly SemaphoreSlim _startLock = new(1, 1);
        private static readonly object _logLock = new();
        private static Process? _ownedProcess;

        public static string GetSyncoraDataDirectory(string? localAppDataOverride = null)
        {
            var baseDir = !string.IsNullOrWhiteSpace(localAppDataOverride)
                ? localAppDataOverride
                : Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return Path.Combine(baseDir, "Syncora");
        }

        public static string GetAuthDirectory(string? localAppDataOverride = null) =>
            Path.Combine(GetSyncoraDataDirectory(localAppDataOverride), "whatsapp-auth");

        public static string GetTempDirectory(string? localAppDataOverride = null) =>
            Path.Combine(GetSyncoraDataDirectory(localAppDataOverride), "whatsapp-tmp");

        public static string GetWebViewUserDataDirectory(string? localAppDataOverride = null) =>
            Path.Combine(GetSyncoraDataDirectory(localAppDataOverride), "WebView2Data");

        public static string? FindHelperDirectory(string? baseDir = null)
        {
            var root = string.IsNullOrWhiteSpace(baseDir) ? AppContext.BaseDirectory : baseDir;
            if (string.IsNullOrWhiteSpace(root)) return null;

            var candidates = new[]
            {
                Path.Combine(root, "whatsapp-notifier"),
                Path.GetFullPath(Path.Combine(root, "..", "..", "..", "whatsapp-notifier")),
            };

            return candidates.FirstOrDefault(dir =>
                Directory.Exists(dir) && File.Exists(Path.Combine(dir, "server.js")));
        }

        public static string FindNodeExecutable(string helperDir)
        {
            if (!string.IsNullOrWhiteSpace(helperDir))
            {
                var bundled = Path.Combine(helperDir, "node.exe");
                if (File.Exists(bundled)) return bundled;
            }
            return "node";
        }

        public static bool HasBundledDependencies(string helperDir)
        {
            if (string.IsNullOrWhiteSpace(helperDir)) return false;
            return File.Exists(Path.Combine(helperDir, "node_modules", "whatsapp-web.js", "package.json"));
        }

        public static bool HasSavedSession(string? helperDir = null, string? localAppDataOverride = null)
        {
            var appAuth = GetAuthDirectory(localAppDataOverride);
            if (DirectoryHasEntries(appAuth)) return true;

            var resolvedHelper = helperDir ?? FindHelperDirectory();
            if (!string.IsNullOrWhiteSpace(resolvedHelper))
            {
                var localFallback = Path.Combine(resolvedHelper, ".wwebjs_auth");
                if (DirectoryHasEntries(localFallback)) return true;
            }
            return false;
        }

        private static bool DirectoryHasEntries(string path)
        {
            try
            {
                return Directory.Exists(path) && Directory.EnumerateFileSystemEntries(path).Any();
            }
            catch
            {
                return false;
            }
        }

        public static async Task<bool> IsRunningAsync(CancellationToken ct = default)
        {
            try
            {
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
                using var resp = await http.GetAsync(StatusUrl, ct);
                return resp.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }

        public static async Task<(bool Started, string? Error)> EnsureStartedAsync(CancellationToken ct = default)
        {
            if (await IsRunningAsync(ct)) return (true, null);

            await _startLock.WaitAsync(ct);
            try
            {
                if (await IsRunningAsync(ct)) return (true, null);

                var helperDir = FindHelperDirectory();
                if (string.IsNullOrWhiteSpace(helperDir))
                {
                    return (false, "WhatsApp helper files not found. Please reinstall SYNCORA Connector.");
                }

                if (!HasBundledDependencies(helperDir))
                {
                    return (false, "WhatsApp helper dependencies are missing. Please reinstall SYNCORA Connector.");
                }

                var nodeExe = FindNodeExecutable(helperDir);
                var dataDir = GetSyncoraDataDirectory();
                var authDir = GetAuthDirectory();
                var tmpDir = GetTempDirectory();
                var logPath = Path.Combine(dataDir, "whatsapp-notifier.log");

                Directory.CreateDirectory(dataDir);
                Directory.CreateDirectory(authDir);
                Directory.CreateDirectory(tmpDir);

                if (_ownedProcess != null)
                {
                    try
                    {
                        if (!_ownedProcess.HasExited)
                        {
                            // Wait briefly for existing spawn before launching another
                            for (int i = 0; i < 10; i++)
                            {
                                if (await IsRunningAsync(ct)) return (true, null);
                                if (_ownedProcess.HasExited) break;
                                await Task.Delay(300, ct);
                            }
                        }
                    }
                    catch { }
                    _ownedProcess = null;
                }

                var psi = new ProcessStartInfo
                {
                    FileName = nodeExe,
                    Arguments = "server.js",
                    WorkingDirectory = helperDir,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                };
                psi.Environment["PUPPETEER_SKIP_DOWNLOAD"] = "true";
                psi.Environment["TEMP"] = tmpDir;
                psi.Environment["TMP"] = tmpDir;
                psi.Environment["WHATSAPP_TMP_DIR"] = tmpDir;
                psi.Environment["WHATSAPP_AUTH_DIR"] = authDir;

                var proc = new Process { StartInfo = psi, EnableRaisingEvents = true };
                proc.OutputDataReceived += (_, ev) => AppendLog(logPath, ev.Data);
                proc.ErrorDataReceived += (_, ev) => AppendLog(logPath, ev.Data);

                if (!proc.Start())
                {
                    return (false, "Could not start local WhatsApp helper process.");
                }

                proc.BeginOutputReadLine();
                proc.BeginErrorReadLine();
                _ownedProcess = proc;

                for (int attempt = 0; attempt < 30; attempt++)
                {
                    if (await IsRunningAsync(ct)) return (true, null);
                    if (proc.HasExited)
                    {
                        return (false, $"WhatsApp helper exited unexpectedly (code {proc.ExitCode}). Check {logPath}");
                    }
                    await Task.Delay(400, ct);
                }

                return (false, $"WhatsApp helper did not respond on port 3001 within 12s. Check {logPath}");
            }
            catch (OperationCanceledException)
            {
                return (false, "WhatsApp helper startup cancelled.");
            }
            catch (Exception ex)
            {
                return (false, $"Could not start WhatsApp helper: {ex.Message}");
            }
            finally
            {
                _startLock.Release();
            }
        }

        public static void StopOwnedHelper()
        {
            var proc = _ownedProcess;
            _ownedProcess = null;
            if (proc == null) return;

            try
            {
                if (!proc.HasExited)
                {
                    proc.Kill(entireProcessTree: true);
                }
            }
            catch
            {
                try
                {
                    if (!proc.HasExited) proc.Kill();
                }
                catch { }
            }
            finally
            {
                try { proc.Dispose(); } catch { }
            }
        }

        private static void AppendLog(string logPath, string? line)
        {
            if (string.IsNullOrWhiteSpace(line)) return;
            lock (_logLock)
            {
                try
                {
                    File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {line}{Environment.NewLine}");
                }
                catch { }
            }
        }
    }
}
