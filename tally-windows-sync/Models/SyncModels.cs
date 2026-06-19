using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using Newtonsoft.Json;

namespace TallySyncApp.Models
{
    /// <summary>
    /// Tracks the current sync status for display in UI
    /// </summary>
    public class SyncStatus : INotifyPropertyChanged
    {
        private SyncState _state = SyncState.Idle;
        private string _message = "Ready";
        private string? _currentOperation;
        private int _totalRecords;
        private int _processedRecords;
        private DateTime? _lastSyncTime;
        private DateTime? _nextSyncTime;
        private string? _error;
        private bool _isTallyConnected;
        private bool _isServerConnected;
        private string? _companyName;

        public SyncState State { get => _state; set { _state = value; OnPropertyChanged(); OnPropertyChanged(nameof(StatusText)); } }
        public string Message { get => _message; set { _message = value; OnPropertyChanged(); OnPropertyChanged(nameof(StatusText)); } }
        public string? CurrentOperation { get => _currentOperation; set { _currentOperation = value; OnPropertyChanged(); OnPropertyChanged(nameof(StatusText)); } }
        public int TotalRecords { get => _totalRecords; set { _totalRecords = value; OnPropertyChanged(); OnPropertyChanged(nameof(ProgressPercentage)); } }
        public int ProcessedRecords { get => _processedRecords; set { _processedRecords = value; OnPropertyChanged(); OnPropertyChanged(nameof(ProgressPercentage)); } }
        public DateTime? LastSyncTime { get => _lastSyncTime; set { _lastSyncTime = value; OnPropertyChanged(); } }
        public DateTime? NextSyncTime { get => _nextSyncTime; set { _nextSyncTime = value; OnPropertyChanged(); } }
        public string? Error { get => _error; set { _error = value; OnPropertyChanged(); OnPropertyChanged(nameof(StatusText)); } }
        public bool IsTallyConnected { get => _isTallyConnected; set { _isTallyConnected = value; OnPropertyChanged(); } }
        public bool IsServerConnected { get => _isServerConnected; set { _isServerConnected = value; OnPropertyChanged(); } }
        public string? CompanyName { get => _companyName; set { _companyName = value; OnPropertyChanged(); } }

        public int ProgressPercentage => TotalRecords > 0 
            ? (int)((double)ProcessedRecords / TotalRecords * 100) 
            : 0;

        public string StatusText => State switch
        {
            SyncState.Idle => "Idle",
            SyncState.Connecting => "Connecting...",
            SyncState.FetchingData => $"Fetching {CurrentOperation}...",
            SyncState.Uploading => $"Uploading {CurrentOperation}...",
            SyncState.Syncing => $"Syncing ({ProgressPercentage}%)",
            SyncState.Completed => "Completed",
            SyncState.Error => string.IsNullOrEmpty(Error) ? $"Error: {Message}" : $"Error: {Error}",
            SyncState.Retrying => $"Retrying ({CurrentOperation})...",
            _ => "Unknown"
        };

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged([CallerMemberName] string? name = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        }
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
        public string ApiBaseUrl { get; set; } = "https://pfqmqpboomwtxgyfqnsn.supabase.co";
        public string ApiKey { get; set; } = string.Empty;
        public int SyncIntervalMinutes { get; set; } = 5;
        public int BatchSize { get; set; } = 100;
        public int MaxRetries { get; set; } = 3;
        public int RetryDelaySeconds { get; set; } = 30;
        public bool EnableVoucherSync { get; set; } = true;
        public bool AllowAccountingFallbackForInventoryFailure { get; set; } = false;
        public string TelegramBotToken { get; set; } = string.Empty;
        public DateTime? LastSyncTime { get; set; }
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


