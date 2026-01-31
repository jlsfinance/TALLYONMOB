using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using Newtonsoft.Json;
using TallySyncApp.Models;

namespace TallySyncApp.Services
{
    /// <summary>
    /// OfflineQueueService - SQLite-backed queue for failed sync operations
    /// Ensures no data is lost if upload fails
    /// </summary>
    public class OfflineQueueService : IDisposable
    {
        private readonly string _connectionString;
        private SqliteConnection? _connection;

        public OfflineQueueService(string databasePath = "sync_queue.db")
        {
            _connectionString = $"Data Source={databasePath}";
            InitializeDatabase();
        }

        /// <summary>
        /// Initialize SQLite database and create tables
        /// </summary>
        private void InitializeDatabase()
        {
            try
            {
                _connection = new SqliteConnection(_connectionString);
                _connection.Open();

                var command = _connection.CreateCommand();
                command.CommandText = @"
                    CREATE TABLE IF NOT EXISTS sync_queue (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        company_id TEXT NOT NULL,
                        data_type TEXT NOT NULL,
                        json_data TEXT NOT NULL,
                        retry_count INTEGER DEFAULT 0,
                        created_at TEXT NOT NULL,
                        last_attempt_at TEXT,
                        last_error TEXT,
                        status TEXT DEFAULT 'pending'
                    );

                    CREATE TABLE IF NOT EXISTS sync_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        data_type TEXT NOT NULL,
                        record_count INTEGER DEFAULT 0,
                        success INTEGER DEFAULT 0,
                        error TEXT,
                        duration_ms INTEGER DEFAULT 0
                    );

                    CREATE INDEX IF NOT EXISTS idx_queue_status ON sync_queue(status);
                    CREATE INDEX IF NOT EXISTS idx_queue_company ON sync_queue(company_id);
                ";
                command.ExecuteNonQuery();

                Console.WriteLine("SQLite database initialized");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to initialize database: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Add item to sync queue
        /// </summary>
        public async Task<int> EnqueueAsync<T>(string companyId, string dataType, List<T> data)
        {
            try
            {
                var json = JsonConvert.SerializeObject(data);

                using var command = _connection!.CreateCommand();
                command.CommandText = @"
                    INSERT INTO sync_queue (company_id, data_type, json_data, created_at, status)
                    VALUES (@companyId, @dataType, @jsonData, @createdAt, 'pending');
                    SELECT last_insert_rowid();
                ";

                command.Parameters.AddWithValue("@companyId", companyId);
                command.Parameters.AddWithValue("@dataType", dataType);
                command.Parameters.AddWithValue("@jsonData", json);
                command.Parameters.AddWithValue("@createdAt", DateTime.UtcNow.ToString("o"));

                var result = await Task.Run(() => command.ExecuteScalar());
                return Convert.ToInt32(result);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to enqueue: {ex.Message}");
                return -1;
            }
        }

        /// <summary>
        /// Get pending items from queue
        /// </summary>
        public async Task<List<SyncQueueItem>> GetPendingItemsAsync(int maxItems = 10)
        {
            var items = new List<SyncQueueItem>();

            try
            {
                using var command = _connection!.CreateCommand();
                command.CommandText = @"
                    SELECT id, company_id, data_type, json_data, retry_count, 
                           created_at, last_attempt_at, last_error, status
                    FROM sync_queue
                    WHERE status = 'pending' OR (status = 'failed' AND retry_count < 5)
                    ORDER BY created_at ASC
                    LIMIT @maxItems
                ";

                command.Parameters.AddWithValue("@maxItems", maxItems);

                using var reader = await Task.Run(() => command.ExecuteReader());
                while (reader.Read())
                {
                    items.Add(new SyncQueueItem
                    {
                        Id = reader.GetInt32(0),
                        CompanyId = reader.GetString(1),
                        DataType = reader.GetString(2),
                        JsonData = reader.GetString(3),
                        RetryCount = reader.GetInt32(4),
                        CreatedAt = DateTime.Parse(reader.GetString(5)),
                        LastAttemptAt = reader.IsDBNull(6) ? null : DateTime.Parse(reader.GetString(6)),
                        LastError = reader.IsDBNull(7) ? null : reader.GetString(7),
                        Status = Enum.Parse<SyncQueueStatus>(reader.GetString(8), true)
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to get pending items: {ex.Message}");
            }

            return items;
        }

        /// <summary>
        /// Mark item as completed
        /// </summary>
        public async Task MarkCompletedAsync(int queueId)
        {
            try
            {
                using var command = _connection!.CreateCommand();
                command.CommandText = @"
                    UPDATE sync_queue
                    SET status = 'completed', last_attempt_at = @now
                    WHERE id = @id
                ";

                command.Parameters.AddWithValue("@id", queueId);
                command.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));

                await Task.Run(() => command.ExecuteNonQuery());
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to mark completed: {ex.Message}");
            }
        }

        /// <summary>
        /// Mark item as failed and increment retry count
        /// </summary>
        public async Task MarkFailedAsync(int queueId, string error)
        {
            try
            {
                using var command = _connection!.CreateCommand();
                command.CommandText = @"
                    UPDATE sync_queue
                    SET status = CASE WHEN retry_count >= 4 THEN 'failed' ELSE 'pending' END,
                        retry_count = retry_count + 1,
                        last_attempt_at = @now,
                        last_error = @error
                    WHERE id = @id
                ";

                command.Parameters.AddWithValue("@id", queueId);
                command.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
                command.Parameters.AddWithValue("@error", error);

                await Task.Run(() => command.ExecuteNonQuery());
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to mark failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Delete completed items older than specified days
        /// </summary>
        public async Task CleanupAsync(int olderThanDays = 7)
        {
            try
            {
                using var command = _connection!.CreateCommand();
                command.CommandText = @"
                    DELETE FROM sync_queue
                    WHERE status = 'completed' 
                      AND datetime(created_at) < datetime('now', @days)
                ";

                command.Parameters.AddWithValue("@days", $"-{olderThanDays} days");

                var deleted = await Task.Run(() => command.ExecuteNonQuery());
                Console.WriteLine($"Cleaned up {deleted} old queue items");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to cleanup: {ex.Message}");
            }
        }

        /// <summary>
        /// Force clear all pending items
        /// </summary>
        public async Task ClearQueueAsync()
        {
            try
            {
                using var command = _connection!.CreateCommand();
                command.CommandText = "DELETE FROM sync_queue WHERE status != 'completed'";
                await Task.Run(() => command.ExecuteNonQuery());
                Console.WriteLine("Cleared sync queue");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to clear queue: {ex.Message}");
            }
        }

        /// <summary>
        /// Get queue statistics
        /// </summary>
        public async Task<(int Pending, int Failed, int Completed)> GetQueueStatsAsync()
        {
            try
            {
                using var command = _connection!.CreateCommand();
                command.CommandText = @"
                    SELECT 
                        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
                    FROM sync_queue
                ";

                using var reader = await Task.Run(() => command.ExecuteReader());
                if (reader.Read())
                {
                    return (
                        reader.IsDBNull(0) ? 0 : reader.GetInt32(0),
                        reader.IsDBNull(1) ? 0 : reader.GetInt32(1),
                        reader.IsDBNull(2) ? 0 : reader.GetInt32(2)
                    );
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to get stats: {ex.Message}");
            }

            return (0, 0, 0);
        }

        /// <summary>
        /// Add sync log entry
        /// </summary>
        public async Task LogSyncAsync(string dataType, int recordCount, bool success, string? error, int durationMs)
        {
            try
            {
                using var command = _connection!.CreateCommand();
                command.CommandText = @"
                    INSERT INTO sync_logs (timestamp, data_type, record_count, success, error, duration_ms)
                    VALUES (@timestamp, @dataType, @recordCount, @success, @error, @durationMs)
                ";

                command.Parameters.AddWithValue("@timestamp", DateTime.UtcNow.ToString("o"));
                command.Parameters.AddWithValue("@dataType", dataType);
                command.Parameters.AddWithValue("@recordCount", recordCount);
                command.Parameters.AddWithValue("@success", success ? 1 : 0);
                command.Parameters.AddWithValue("@error", error ?? (object)DBNull.Value);
                command.Parameters.AddWithValue("@durationMs", durationMs);

                await Task.Run(() => command.ExecuteNonQuery());
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to log sync: {ex.Message}");
            }
        }

        /// <summary>
        /// Get recent sync logs
        /// </summary>
        public async Task<List<SyncLogEntry>> GetRecentLogsAsync(int limit = 50)
        {
            var logs = new List<SyncLogEntry>();

            try
            {
                using var command = _connection!.CreateCommand();
                command.CommandText = @"
                    SELECT id, timestamp, data_type, record_count, success, error, duration_ms
                    FROM sync_logs
                    ORDER BY timestamp DESC
                    LIMIT @limit
                ";

                command.Parameters.AddWithValue("@limit", limit);

                using var reader = await Task.Run(() => command.ExecuteReader());
                while (reader.Read())
                {
                    logs.Add(new SyncLogEntry
                    {
                        Id = reader.GetInt32(0),
                        Timestamp = DateTime.Parse(reader.GetString(1)),
                        DataType = reader.GetString(2),
                        RecordCount = reader.GetInt32(3),
                        Success = reader.GetInt32(4) == 1,
                        Error = reader.IsDBNull(5) ? null : reader.GetString(5),
                        DurationMs = reader.GetInt32(6)
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to get logs: {ex.Message}");
            }

            return logs;
        }

        public void Dispose()
        {
            _connection?.Close();
            _connection?.Dispose();
        }
    }
}
