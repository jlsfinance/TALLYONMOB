using Microsoft.Data.Sqlite;
using Serilog;

namespace TallySyncApp.Data;

/// <summary>
/// SQLite-based offline queue for storing failed sync items
/// Provides persistence for sync data when API is unavailable
/// </summary>
public class SyncQueue : IDisposable
{
    private readonly string _dbPath;
    private readonly SqliteConnection _connection;

    public SyncQueue(string dbPath)
    {
        _dbPath = dbPath;
        _connection = new SqliteConnection($"Data Source={dbPath}");
        _connection.Open();
        InitializeDatabase();
    }

    private void InitializeDatabase()
    {
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS sync_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id TEXT NOT NULL,
                data_type TEXT NOT NULL,
                json_data TEXT NOT NULL,
                created_at TEXT NOT NULL,
                retry_count INTEGER DEFAULT 0,
                last_error TEXT
            );

            CREATE TABLE IF NOT EXISTS sync_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id TEXT NOT NULL,
                data_type TEXT NOT NULL,
                item_count INTEGER,
                status TEXT NOT NULL,
                synced_at TEXT NOT NULL,
                error_message TEXT
            );

            CREATE TABLE IF NOT EXISTS sync_timestamps (
                company_id TEXT NOT NULL,
                data_type TEXT NOT NULL,
                last_sync TEXT NOT NULL,
                PRIMARY KEY (company_id, data_type)
            );

            CREATE INDEX IF NOT EXISTS idx_queue_company ON sync_queue(company_id);
            CREATE INDEX IF NOT EXISTS idx_queue_created ON sync_queue(created_at);
        ";
        cmd.ExecuteNonQuery();
        
        Log.Information("Sync queue database initialized at {Path}", _dbPath);
    }

    /// <summary>
    /// Add an item to the sync queue
    /// </summary>
    public void Enqueue(QueuedSyncItem item)
    {
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO sync_queue (company_id, data_type, json_data, created_at, retry_count)
            VALUES (@companyId, @dataType, @jsonData, @createdAt, @retryCount)
        ";
        cmd.Parameters.AddWithValue("@companyId", item.CompanyId);
        cmd.Parameters.AddWithValue("@dataType", item.DataType);
        cmd.Parameters.AddWithValue("@jsonData", item.JsonData);
        cmd.Parameters.AddWithValue("@createdAt", item.CreatedAt.ToString("O"));
        cmd.Parameters.AddWithValue("@retryCount", item.RetryCount);
        cmd.ExecuteNonQuery();
        
        Log.Debug("Enqueued sync item for {DataType}, company {CompanyId}", item.DataType, item.CompanyId);
    }

    /// <summary>
    /// Get all pending items in the queue
    /// </summary>
    public List<QueuedSyncItem> GetPendingItems(int limit = 100)
    {
        var items = new List<QueuedSyncItem>();
        
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = @"
            SELECT id, company_id, data_type, json_data, created_at, retry_count, last_error
            FROM sync_queue
            ORDER BY created_at ASC
            LIMIT @limit
        ";
        cmd.Parameters.AddWithValue("@limit", limit);
        
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            items.Add(new QueuedSyncItem
            {
                Id = reader.GetInt64(0),
                CompanyId = reader.GetString(1),
                DataType = reader.GetString(2),
                JsonData = reader.GetString(3),
                CreatedAt = DateTime.Parse(reader.GetString(4)),
                RetryCount = reader.GetInt32(5),
                LastError = reader.IsDBNull(6) ? null : reader.GetString(6)
            });
        }
        
        return items;
    }

    /// <summary>
    /// Remove an item from the queue (after successful sync)
    /// </summary>
    public void Remove(long id)
    {
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = "DELETE FROM sync_queue WHERE id = @id";
        cmd.Parameters.AddWithValue("@id", id);
        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Increment retry count for a failed item
    /// </summary>
    public void IncrementRetry(long id, string? error = null)
    {
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = @"
            UPDATE sync_queue 
            SET retry_count = retry_count + 1, last_error = @error
            WHERE id = @id
        ";
        cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@error", error ?? (object)DBNull.Value);
        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Log a sync operation
    /// </summary>
    public void LogSync(string companyId, string dataType, int itemCount, bool success, string? errorMessage = null)
    {
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO sync_log (company_id, data_type, item_count, status, synced_at, error_message)
            VALUES (@companyId, @dataType, @itemCount, @status, @syncedAt, @error)
        ";
        cmd.Parameters.AddWithValue("@companyId", companyId);
        cmd.Parameters.AddWithValue("@dataType", dataType);
        cmd.Parameters.AddWithValue("@itemCount", itemCount);
        cmd.Parameters.AddWithValue("@status", success ? "success" : "failed");
        cmd.Parameters.AddWithValue("@syncedAt", DateTime.UtcNow.ToString("O"));
        cmd.Parameters.AddWithValue("@error", errorMessage ?? (object)DBNull.Value);
        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Update last sync timestamp for a data type
    /// </summary>
    public void UpdateSyncTimestamp(string companyId, string dataType)
    {
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = @"
            INSERT OR REPLACE INTO sync_timestamps (company_id, data_type, last_sync)
            VALUES (@companyId, @dataType, @lastSync)
        ";
        cmd.Parameters.AddWithValue("@companyId", companyId);
        cmd.Parameters.AddWithValue("@dataType", dataType);
        cmd.Parameters.AddWithValue("@lastSync", DateTime.UtcNow.ToString("O"));
        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Get last sync timestamp for a data type
    /// </summary>
    public DateTime? GetLastSyncTimestamp(string companyId, string dataType)
    {
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = @"
            SELECT last_sync FROM sync_timestamps
            WHERE company_id = @companyId AND data_type = @dataType
        ";
        cmd.Parameters.AddWithValue("@companyId", companyId);
        cmd.Parameters.AddWithValue("@dataType", dataType);
        
        var result = cmd.ExecuteScalar();
        if (result != null && result != DBNull.Value)
        {
            return DateTime.Parse((string)result);
        }
        return null;
    }

    /// <summary>
    /// Get queue statistics
    /// </summary>
    public QueueStats GetStats()
    {
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = @"
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN retry_count = 0 THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN retry_count > 0 THEN 1 ELSE 0 END) as retrying
            FROM sync_queue
        ";
        
        using var reader = cmd.ExecuteReader();
        if (reader.Read())
        {
            return new QueueStats
            {
                TotalItems = reader.GetInt32(0),
                PendingItems = reader.GetInt32(1),
                RetryingItems = reader.GetInt32(2)
            };
        }
        
        return new QueueStats();
    }

    /// <summary>
    /// Get recent sync logs
    /// </summary>
    public List<SyncLogEntry> GetRecentLogs(int limit = 50)
    {
        var logs = new List<SyncLogEntry>();
        
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = @"
            SELECT company_id, data_type, item_count, status, synced_at, error_message
            FROM sync_log
            ORDER BY synced_at DESC
            LIMIT @limit
        ";
        cmd.Parameters.AddWithValue("@limit", limit);
        
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            logs.Add(new SyncLogEntry
            {
                CompanyId = reader.GetString(0),
                DataType = reader.GetString(1),
                ItemCount = reader.GetInt32(2),
                Status = reader.GetString(3),
                SyncedAt = DateTime.Parse(reader.GetString(4)),
                ErrorMessage = reader.IsDBNull(5) ? null : reader.GetString(5)
            });
        }
        
        return logs;
    }

    /// <summary>
    /// Clear old items from the queue (older than specified days)
    /// </summary>
    public int ClearOldItems(int daysOld = 7)
    {
        var cutoff = DateTime.UtcNow.AddDays(-daysOld).ToString("O");
        
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = "DELETE FROM sync_queue WHERE created_at < @cutoff";
        cmd.Parameters.AddWithValue("@cutoff", cutoff);
        
        var deleted = cmd.ExecuteNonQuery();
        if (deleted > 0)
        {
            Log.Information("Cleared {Count} old items from sync queue", deleted);
        }
        return deleted;
    }

    public void Dispose()
    {
        _connection?.Close();
        _connection?.Dispose();
    }
}

#region Queue Models

public class QueuedSyncItem
{
    public long Id { get; set; }
    public string CompanyId { get; set; } = "";
    public string DataType { get; set; } = "";
    public string JsonData { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public int RetryCount { get; set; }
    public string? LastError { get; set; }
}

public class QueueStats
{
    public int TotalItems { get; set; }
    public int PendingItems { get; set; }
    public int RetryingItems { get; set; }
}

public class SyncLogEntry
{
    public string CompanyId { get; set; } = "";
    public string DataType { get; set; } = "";
    public int ItemCount { get; set; }
    public string Status { get; set; } = "";
    public DateTime SyncedAt { get; set; }
    public string? ErrorMessage { get; set; }
}

#endregion
