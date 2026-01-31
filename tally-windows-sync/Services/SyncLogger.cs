using System;
using System.IO;
using System.Text.Json;
using System.Text;

namespace TallySyncApp.Services
{
    /// <summary>
    /// Production-Tested Sync Debug Logger
    /// Saves XML requests/responses and JSON payloads for troubleshooting.
    /// </summary>
    public static class SyncLogger
    {
        private static readonly string LogDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Logs");

        static SyncLogger()
        {
            try
            {
                if (!Directory.Exists(LogDir))
                    Directory.CreateDirectory(LogDir);
            }
            catch { /* Ignore logging directory creation errors */ }
        }

        public static void Log(string message)
        {
            try
            {
                File.AppendAllText(
                    Path.Combine(LogDir, "sync.log"),
                    $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}\n"
                );
            }
            catch { }
        }

        public static void SaveFile(string fileName, string content)
        {
            try
            {
                File.WriteAllText(Path.Combine(LogDir, fileName), content);
            }
            catch { }
        }

        public static void SaveJson(string fileName, object data)
        {
            try
            {
                var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true });
                SaveFile(fileName, json);
            }
            catch { }
        }
    }
}
