using System;
using System.IO;
using System.Text;
using System.Text.Json;

namespace TallySyncApp.Services
{
    /// <summary>
    /// Safe production logger. It records operational metadata, never raw sync payloads.
    /// </summary>
    public static class SyncLogger
    {
        private static readonly string LogDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Logs");

        static SyncLogger()
        {
            try
            {
                if (!Directory.Exists(LogDir))
                {
                    Directory.CreateDirectory(LogDir);
                }
            }
            catch
            {
                // Ignore logging directory creation errors.
            }
        }

        public static void Log(string message)
        {
            try
            {
                var cleanMessage = TextSanitizer.Normalize(message);
                File.AppendAllText(
                    Path.Combine(LogDir, "sync.log"),
                    $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {cleanMessage}{Environment.NewLine}",
                    Encoding.UTF8
                );
            }
            catch
            {
                // Logging should never crash the app.
            }
        }

        public static void LogEvent(string eventName, string level, object? data = null)
        {
            try
            {
                var entry = new
                {
                    timestamp = DateTime.UtcNow,
                    eventName,
                    level,
                    processId = Environment.ProcessId,
                    data = Sanitize(data)
                };
                File.AppendAllText(
                    Path.Combine(LogDir, "sync-events.jsonl"),
                    JsonSerializer.Serialize(entry) + Environment.NewLine,
                    Encoding.UTF8);
            }
            catch { }
        }

        public static void SaveFile(string fileName, string content)
        {
            try
            {
                if (IsSensitiveArtifact(fileName)) return;
                content = TextSanitizer.Normalize(content);
                File.WriteAllText(Path.Combine(LogDir, fileName), content);
            }
            catch
            {
                // Ignore file write failures in logger.
            }
        }

        public static void SaveJson(string fileName, object data)
        {
            try
            {
                if (IsSensitiveArtifact(fileName)) return;
                var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true });
                SaveFile(fileName, json);
            }
            catch
            {
                // Ignore serialization failures in logger.
            }
        }

        public static void LogError(string message, Exception ex)
        {
            Log($"ERROR: {message} | exceptionType={ex.GetType().Name} | message={TextSanitizer.Normalize(ex.Message)}");
        }

        private static bool IsSensitiveArtifact(string fileName)
        {
            var name = Path.GetFileName(fileName).ToLowerInvariant();
            return name.Contains("request") || name.Contains("response") || name.Contains("payload")
                || name.Contains("voucher") || name.Contains("body") || name.EndsWith(".xml", StringComparison.Ordinal)
                || name.EndsWith(".json", StringComparison.Ordinal);
        }

        private static object? Sanitize(object? data)
        {
            if (data == null) return null;
            var json = JsonSerializer.Serialize(data);
            json = System.Text.RegularExpressions.Regex.Replace(json, "(?i)(token|password|secret|api[_-]?key|serial)[^,}]*", "$1=[REDACTED]");
            return json.Length > 2000 ? json[..2000] + "...[TRUNCATED]" : json;
        }
    }
}
