using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
#if WINDOWS
using Microsoft.Win32;
#endif

namespace TallySyncApp.Services
{
    /// <summary>
    /// Resolves Tally executable paths, local company data folders, and web dashboard URLs
    /// for quick actions on company cards and the 1-click Open Tally CTA.
    /// </summary>
    public static class TallyProcessLauncher
    {
        private static readonly string[] StandardTallyExeCandidates =
        {
            @"C:\Program Files\TallyPrime\tally.exe",
            @"C:\Program Files\Tally.ERP9\tally.exe",
            @"C:\Program Files (x86)\TallyPrime\tally.exe",
            @"C:\Program Files (x86)\Tally.ERP9\tally.exe",
            @"C:\TallyPrime\tally.exe",
            @"C:\Tally.ERP9\tally.exe",
            @"D:\TallyPrime\tally.exe",
            @"D:\Tally.ERP9\tally.exe",
        };

        private static readonly string[] StandardDataDirCandidates =
        {
            @"C:\Users\Public\TallyPrime\Data",
            @"C:\TallyPrime\Data",
            @"C:\Tally.ERP9\Data",
        };

        public static string? FindTallyExecutable(string? configuredPath)
        {
            if (!string.IsNullOrWhiteSpace(configuredPath) && File.Exists(configuredPath))
                return configuredPath;

            // 1. Check running Tally process (zero-config when already launched)
            foreach (var procName in new[] { "tally", "TallyPrime" })
            {
                try
                {
                    foreach (var proc in Process.GetProcessesByName(procName))
                    {
                        try
                        {
                            var fileName = proc.MainModule?.FileName;
                            if (!string.IsNullOrWhiteSpace(fileName) && File.Exists(fileName))
                                return fileName;
                        }
                        catch { /* Access denied or exited */ }
                        finally { proc.Dispose(); }
                    }
                }
                catch { }
            }

            // 2. Check standard Windows installation directories
            foreach (var candidate in StandardTallyExeCandidates)
            {
                if (File.Exists(candidate))
                    return candidate;
            }

            // 3. Scan Windows Uninstall registry keys
            var regHit = FindFromUninstallRegistry();
            if (!string.IsNullOrWhiteSpace(regHit))
                return regHit;

            return null;
        }

        private static string? FindFromUninstallRegistry()
        {
#if WINDOWS
            const string UninstallSubKey = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
            var roots = new[]
            {
                (RegistryHive.LocalMachine, RegistryView.Registry64),
                (RegistryHive.LocalMachine, RegistryView.Registry32),
                (RegistryHive.CurrentUser, RegistryView.Registry64),
                (RegistryHive.CurrentUser, RegistryView.Registry32),
            };

            foreach (var (hive, view) in roots)
            {
                try
                {
                    using var baseKey = RegistryKey.OpenBaseKey(hive, view);
                    using var uninstall = baseKey.OpenSubKey(UninstallSubKey);
                    if (uninstall == null) continue;

                    foreach (var subName in uninstall.GetSubKeyNames())
                    {
                        using var sub = uninstall.OpenSubKey(subName);
                        var displayName = sub?.GetValue("DisplayName")?.ToString();
                        if (string.IsNullOrWhiteSpace(displayName) ||
                            displayName.IndexOf("Tally", StringComparison.OrdinalIgnoreCase) < 0)
                            continue;

                        var installLoc = sub?.GetValue("InstallLocation")?.ToString()?.Trim().Trim('"');
                        if (!string.IsNullOrWhiteSpace(installLoc))
                        {
                            var exe = Path.Combine(installLoc, "tally.exe");
                            if (File.Exists(exe)) return exe;
                        }

                        var displayIcon = sub?.GetValue("DisplayIcon")?.ToString()?.Trim().Trim('"');
                        if (!string.IsNullOrWhiteSpace(displayIcon))
                        {
                            var comma = displayIcon.IndexOf(',');
                            if (comma > 0) displayIcon = displayIcon[..comma].Trim().Trim('"');
                            if (displayIcon.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) && File.Exists(displayIcon))
                                return displayIcon;
                        }
                    }
                }
                catch { }
            }
#endif
            return null;
        }

        public static string? ResolveDataFolderPath(string? companyDataPath, string? tallyExePath)
        {
            if (!string.IsNullOrWhiteSpace(companyDataPath))
            {
                var cleaned = companyDataPath.Trim().Trim('"');
                if (Directory.Exists(cleaned))
                    return cleaned;

                var parent = Path.GetDirectoryName(cleaned);
                if (!string.IsNullOrWhiteSpace(parent) && Directory.Exists(parent))
                    return parent;
            }

            if (!string.IsNullOrWhiteSpace(tallyExePath))
            {
                var installDir = Path.GetDirectoryName(tallyExePath);
                if (!string.IsNullOrWhiteSpace(installDir))
                {
                    var iniPath = Path.Combine(installDir, "tally.ini");
                    if (File.Exists(iniPath))
                    {
                        try
                        {
                            foreach (var rawLine in File.ReadAllLines(iniPath))
                            {
                                var line = rawLine.Trim();
                                if (!line.StartsWith("Data", StringComparison.OrdinalIgnoreCase)) continue;
                                var eq = line.IndexOf('=');
                                if (eq <= 0) continue;
                                var key = line[..eq].Trim();
                                if (!key.Equals("Data", StringComparison.OrdinalIgnoreCase)) continue;
                                var val = line[(eq + 1)..].Trim().Trim('"');
                                if (!string.IsNullOrWhiteSpace(val) && Directory.Exists(val))
                                    return val;
                            }
                        }
                        catch { }
                    }
                }
            }

            foreach (var dir in StandardDataDirCandidates)
            {
                if (Directory.Exists(dir))
                    return dir;
            }

            return null;
        }

        public static string BuildWebDashboardUrl(string? licencePurchaseUrl, string? companyId, bool isDebug)
        {
            var resolved = LicencePurchaseLink.Resolve(licencePurchaseUrl, isDebug);
            var origin = Uri.TryCreate(resolved, UriKind.Absolute, out var uri)
                ? uri.GetLeftPart(UriPartial.Authority)
                : (isDebug ? "http://127.0.0.1:3011" : "https://tallyonmob.vercel.app");

            if (string.IsNullOrWhiteSpace(companyId))
                return origin + "/";

            return $"{origin}/?companyId={Uri.EscapeDataString(companyId)}";
        }

        public static bool LaunchTally(string exePath)
        {
            if (string.IsNullOrWhiteSpace(exePath) || !File.Exists(exePath))
                return false;

            Process.Start(new ProcessStartInfo
            {
                FileName = exePath,
                WorkingDirectory = Path.GetDirectoryName(exePath) ?? string.Empty,
                UseShellExecute = true,
            });
            return true;
        }

        public static bool OpenFolderInExplorer(string folderPath)
        {
            if (string.IsNullOrWhiteSpace(folderPath) || !Directory.Exists(folderPath))
                return false;

            Process.Start(new ProcessStartInfo
            {
                FileName = folderPath,
                UseShellExecute = true,
            });
            return true;
        }
    }
}
