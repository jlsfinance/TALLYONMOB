using System;
using System.IO;
using Microsoft.Win32;

namespace TallySyncApp.Services
{
    public static class AutoStartService
    {
        private const string AppName = "TallyLink";
        private const string RunKeyPath = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";

        public static bool IsAutoStartEnabled()
        {
            try
            {
                using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, false);
                return key?.GetValue(AppName) != null;
            }
            catch
            {
                return false;
            }
        }

        public static void EnableAutoStart()
        {
            try
            {
                var exePath = Environment.ProcessPath ?? "";
                if (string.IsNullOrEmpty(exePath)) return;

                using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, true);
                key?.SetValue(AppName, $"\"{exePath}\" --minimized");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Failed to enable auto-start: {ex.Message}");
            }
        }

        public static void DisableAutoStart()
        {
            try
            {
                using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, true);
                key?.DeleteValue(AppName, false);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Failed to disable auto-start: {ex.Message}");
            }
        }

        public static void ToggleAutoStart()
        {
            if (IsAutoStartEnabled())
                DisableAutoStart();
            else
                EnableAutoStart();
        }

        public static bool ShouldStartMinimized()
        {
            return Environment.GetCommandLineArgs().Any(a => a.Equals("--minimized", StringComparison.OrdinalIgnoreCase));
        }
    }
}
