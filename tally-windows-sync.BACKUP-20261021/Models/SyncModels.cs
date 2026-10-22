using System;
using Newtonsoft.Json;

namespace TallySyncApp.Models
{
    /// <summary>
    /// Tracks the current sync status for display in UI
    /// </summary>
    public class SyncStatus
    {
        public SyncState State { get; set; } = SyncState.Idle;
        public string Message { get; set; } = "Ready";
        public string? CurrentOperation { get; set; }
        public int TotalRecords { get; set; }
        public int ProcessedRecords { get; set; }
        public DateTime? LastSyncTime { get; set; }
        public DateTime? NextSyncTime { get; set; }
        public string? Error { get; set; }
        public bool IsTallyConnected { get; set; }
        public bool IsServerConnected { get; set; }
        public string? CompanyName { get; set; }

        public int ProgressPercentage => TotalRecords > 0 
            ? (int)((double)ProcessedRecords / TotalRecords * 100) 
            : 0;

        public string StatusText => State switch
        {
            SyncState.Idle => "⏸️ Idle",
            SyncState.Connecting => "🔄 Connecting...",
            SyncState.FetchingData => $"📥 Fetching {CurrentOperation}...",
            SyncState.Uploading => $"📤 Uploading {CurrentOperation}...",
            SyncState.Syncing => $"🔄 Syncing ({ProgressPercentage}%)",
            SyncState.Completed => "✅ Completed",
            SyncState.Error => $"❌ Error: {Error}",
            SyncState.Retrying => $"🔁 Retrying ({CurrentOperation})...",
            _ => "Unknown"
        };
    }

    /// <summary>
    /// Individual item sync status for UI feedback
    /// </summary>
    public class SyncItemStatus
    {
        public string Name { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public string Status { get; set; } = "Pending";
        public string? Error { get; set; }
        public DateTime Timestamp { get; set; } = DateTime.Now;
        public bool IsSuccess => Status == "Success";
        public string StatusIcon => Status switch
        {
            "Success" => "✅",
            "Error" => "❌",
            "Processing" => "⏳",
            _ => "⚪"
        };
    }

    /// <summary>
    /// Sync state enum
    /// </summary>
    public enum SyncState
    {
        Idle,
        Connecting,
        FetchingData,
        Uploading,
        Syncing,
        Completed,
        Error,
        Retrying
    }

    /// <summary>
    /// Sync queue item for offline storage
    /// </summary>
    public class SyncQueueItem
    {
        public int Id { get; set; }
        public string CompanyId { get; set; } = string.Empty;
        public string DataType { get; set; } = string.Empty;
        public string JsonData { get; set; } = string.Empty;
        public int RetryCount { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? LastAttemptAt { get; set; }
        public string? LastError { get; set; }
        public SyncQueueStatus Status { get; set; }
    }

    /// <summary>
    /// Queue item status
    /// </summary>
    public enum SyncQueueStatus
    {
        Pending,
        Processing,
        Completed,
        Failed
    }

    /// <summary>
    /// Sync log entry for history
    /// </summary>
    public class SyncLogEntry
    {
        public int Id { get; set; }
        public DateTime Timestamp { get; set; }
        public string DataType { get; set; } = string.Empty;
        public int RecordCount { get; set; }
        public bool Success { get; set; }
        public string? Error { get; set; }
        public int DurationMs { get; set; }
    }

    /// <summary>
    /// Application settings model
    /// </summary>
    public class AppSettings
    {
        public TallySettings TallySettings { get; set; } = new();
        public SyncSettings SyncSettings { get; set; } = new();
        public AuthSettings AuthSettings { get; set; } = new();
        public DatabaseSettings Database { get; set; } = new();
        public LoggingSettings Logging { get; set; } = new();
    }

    /// <summary>
    /// Authentication settings for Supabase
    /// </summary>
    public class AuthSettings
    {
        public string SupabaseUrl { get; set; } = string.Empty;
        public string SupabaseAnonKey { get; set; } = string.Empty;
    }

    /// <summary>
    /// User session data
    /// </summary>
    public class UserSession
    {
        public string UserId { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string AccessToken { get; set; } = string.Empty;
        public string RefreshToken { get; set; } = string.Empty;
        public DateTime ExpiresAt { get; set; }
        public bool IsLoggedIn => !string.IsNullOrEmpty(AccessToken) && DateTime.UtcNow < ExpiresAt;
    }

    public class TallySettings
    {
        public string Host { get; set; } = "localhost";
        public int Port { get; set; } = 9000;
        public int TimeoutSeconds { get; set; } = 30;
        public string? SerialNumber { get; set; } // Stored serial number
    }

    public class SyncSettings
    {
        public string ApiBaseUrl { get; set; } = string.Empty;
        public string ApiKey { get; set; } = string.Empty;
        public int SyncIntervalMinutes { get; set; } = 5;
        public int BatchSize { get; set; } = 100;
        public int MaxRetries { get; set; } = 3;
        public int RetryDelaySeconds { get; set; } = 30;
        public bool EnableVoucherSync { get; set; } = true;
        public string TelegramBotToken { get; set; } = string.Empty;
    }

    public class DatabaseSettings
    {
        public string Path { get; set; } = "sync_queue.db";
    }

    public class LoggingSettings
    {
        public string LogLevel { get; set; } = "Information";
        public string LogPath { get; set; } = "logs";
    }

    /// <summary>
    /// API Response wrapper
    /// </summary>
    public class ApiResponse<T>
    {
        [JsonProperty("success")]
        public bool Success { get; set; }

        [JsonProperty("message")]
        public string? Message { get; set; }

        [JsonProperty("data")]
        public T? Data { get; set; }

        [JsonProperty("error")]
        public string? Error { get; set; }

        [JsonProperty("details")]
        public SyncResultDetails? Details { get; set; }
    }

    /// <summary>
    /// Sync result details from API
    /// </summary>
    public class SyncResultDetails
    {
        [JsonProperty("count")]
        public int Count { get; set; }

        [JsonProperty("failed")]
        public int Failed { get; set; }

        [JsonProperty("total")]
        public int Total { get; set; }

        [JsonProperty("duration")]
        public int Duration { get; set; }

        [JsonProperty("success")]
        public bool Success { get; set; }
    }

    /// <summary>
    /// Sync state from API (for incremental sync)
    /// </summary>
    public class SyncStateInfo
    {
        [JsonProperty("isInitialSyncComplete")]
        public bool IsInitialSyncComplete { get; set; }

        [JsonProperty("lastSyncAt")]
        public DateTime? LastSyncAt { get; set; }

        [JsonProperty("lastAlterId")]
        public string? LastAlterId { get; set; }
    }
}
