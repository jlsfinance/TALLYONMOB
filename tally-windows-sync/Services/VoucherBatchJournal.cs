using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;

namespace TallySyncApp.Services;

public sealed record VoucherBatchPayload(string Json, long MaxAlterId);
public sealed record PendingVoucherBatch(long Id, string Json, long MaxAlterId);

/// <summary>
/// Write-ahead journal: persist the complete voucher payload before the first cloud write.
/// The callback must acknowledge ALL dependent uploads before the checkpoint can advance.
/// Replays use the same deterministic upsert IDs after a crash (at-least-once delivery).
/// </summary>
public sealed class VoucherBatchJournal : IDisposable
{
    private readonly SqliteConnection _connection;

    public VoucherBatchJournal(string? path = null)
    {
        path ??= Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Syncora", "voucher-sync.db");
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        _connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = path }.ToString());
        _connection.Open();
        using var command = _connection.CreateCommand();
        command.CommandText = @"
            PRAGMA journal_mode=WAL;
            PRAGMA synchronous=FULL;
            CREATE TABLE IF NOT EXISTS voucher_checkpoints (
                owner_id TEXT NOT NULL, company_id TEXT NOT NULL,
                last_alter_id INTEGER NOT NULL, updated_at TEXT NOT NULL,
                PRIMARY KEY(owner_id, company_id));
            CREATE TABLE IF NOT EXISTS voucher_batches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_id TEXT NOT NULL, company_id TEXT NOT NULL,
                batch_key TEXT NOT NULL, payload TEXT NOT NULL, max_alter_id INTEGER NOT NULL,
                created_at TEXT NOT NULL, last_error TEXT,
                UNIQUE(owner_id, company_id, batch_key));";
        command.ExecuteNonQuery();
    }

    private static void ValidateScope(string ownerId, string companyId)
    {
        if (string.IsNullOrWhiteSpace(ownerId) || string.IsNullOrWhiteSpace(companyId))
            throw new ArgumentException("Voucher checkpoint requires an authenticated owner and company.");
    }

    public long? GetCheckpoint(string ownerId, string companyId)
    {
        ValidateScope(ownerId, companyId);
        using var command = _connection.CreateCommand();
        command.CommandText = "SELECT last_alter_id FROM voucher_checkpoints WHERE owner_id=@owner AND company_id=@company";
        command.Parameters.AddWithValue("@owner", ownerId);
        command.Parameters.AddWithValue("@company", companyId);
        var value = command.ExecuteScalar();
        return value == null || value == DBNull.Value ? null : Convert.ToInt64(value);
    }

    // Existing installs bootstrap once from the cloud marker. Later runs use ONLY this
    // marker, so a parent voucher saved before its children cannot skip an unfinished batch.
    public void EnsureCheckpoint(string ownerId, string companyId, long initialAlterId)
    {
        ValidateScope(ownerId, companyId);
        if (initialAlterId < 0) throw new ArgumentOutOfRangeException(nameof(initialAlterId));
        using var command = _connection.CreateCommand();
        command.CommandText = @"INSERT INTO voucher_checkpoints(owner_id,company_id,last_alter_id,updated_at)
            VALUES(@owner,@company,@alter,@now) ON CONFLICT(owner_id,company_id) DO NOTHING";
        command.Parameters.AddWithValue("@owner", ownerId);
        command.Parameters.AddWithValue("@company", companyId);
        command.Parameters.AddWithValue("@alter", initialAlterId);
        command.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
        command.ExecuteNonQuery();
    }

    // Persist every batch from an incremental fetch together, before any is uploaded.
    public void Enqueue(string ownerId, string companyId, IReadOnlyList<VoucherBatchPayload> batches)
    {
        ValidateScope(ownerId, companyId);
        if (GetCheckpoint(ownerId, companyId) == null) throw new InvalidOperationException("Checkpoint was not initialized.");
        using var transaction = _connection.BeginTransaction();
        foreach (var batch in batches)
        {
            if (batch.MaxAlterId <= 0 || string.IsNullOrWhiteSpace(batch.Json)) throw new ArgumentException("Invalid voucher batch.");
            using var command = _connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = @"INSERT INTO voucher_batches(owner_id,company_id,batch_key,payload,max_alter_id,created_at)
                VALUES(@owner,@company,@key,@payload,@alter,@now) ON CONFLICT(owner_id,company_id,batch_key) DO NOTHING";
            command.Parameters.AddWithValue("@owner", ownerId);
            command.Parameters.AddWithValue("@company", companyId);
            command.Parameters.AddWithValue("@key", Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(batch.Json))));
            command.Parameters.AddWithValue("@payload", batch.Json);
            command.Parameters.AddWithValue("@alter", batch.MaxAlterId);
            command.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
            command.ExecuteNonQuery();
        }
        transaction.Commit();
    }

    public PendingVoucherBatch? GetNext(string ownerId, string companyId)
    {
        ValidateScope(ownerId, companyId);
        using var command = _connection.CreateCommand();
        command.CommandText = "SELECT id,payload,max_alter_id FROM voucher_batches WHERE owner_id=@owner AND company_id=@company ORDER BY id LIMIT 1";
        command.Parameters.AddWithValue("@owner", ownerId);
        command.Parameters.AddWithValue("@company", companyId);
        using var reader = command.ExecuteReader();
        return reader.Read() ? new PendingVoucherBatch(reader.GetInt64(0), reader.GetString(1), reader.GetInt64(2)) : null;
    }

    public async Task ReplayAsync(string ownerId, string companyId, Func<string, CancellationToken, Task> uploadAll, CancellationToken ct,
        Func<PendingVoucherBatch, Task>? afterCommit = null)
    {
        while (GetNext(ownerId, companyId) is { } batch)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                await uploadAll(batch.Json, ct);
                ct.ThrowIfCancellationRequested();
                Complete(ownerId, companyId, batch);
            }
            catch (Exception error)
            {
                using var command = _connection.CreateCommand();
                command.CommandText = "UPDATE voucher_batches SET last_error=@error WHERE id=@id AND owner_id=@owner AND company_id=@company";
                command.Parameters.AddWithValue("@error", error.Message);
                command.Parameters.AddWithValue("@id", batch.Id);
                command.Parameters.AddWithValue("@owner", ownerId);
                command.Parameters.AddWithValue("@company", companyId);
                command.ExecuteNonQuery();
                throw; // Never let a later batch overtake this failed batch.
            }
            if (afterCommit != null) await afterCommit(batch);
        }
    }

    private void Complete(string ownerId, string companyId, PendingVoucherBatch batch)
    {
        using var transaction = _connection.BeginTransaction();
        using var command = _connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = @"UPDATE voucher_checkpoints SET last_alter_id=MAX(last_alter_id,@alter),updated_at=@now
            WHERE owner_id=@owner AND company_id=@company;
            DELETE FROM voucher_batches WHERE id=@id AND owner_id=@owner AND company_id=@company";
        command.Parameters.AddWithValue("@owner", ownerId);
        command.Parameters.AddWithValue("@company", companyId);
        command.Parameters.AddWithValue("@alter", batch.MaxAlterId);
        command.Parameters.AddWithValue("@now", DateTime.UtcNow.ToString("o"));
        command.Parameters.AddWithValue("@id", batch.Id);
        command.ExecuteNonQuery();
        transaction.Commit();
    }

    public void Dispose() => _connection.Dispose();
}
