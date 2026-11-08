using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using TallySyncApp.Models;

namespace TallySyncApp.Services
{
    /// <summary>
    /// CompanyMappingStore - SQLite-backed local storage for company identity mappings.
    /// Maps (Tally GUID, Data Path, Source) -> Supabase company_id.
    /// Owner-scoped: same GUID + path can exist under different owners.
    /// SourceId is independent of GUID and Name — prevents collision when same GUID is copied.
    ///
    /// Safety properties:
    ///   - Atomic writes via SQLite transactions
    ///   - Corruption detection via schema verification on init
    ///   - No silent overwrite — unique constraint prevents duplicates, returns false on conflict
    ///   - User-specific mapping isolation — owner_id in all queries
    ///   - Safe recovery — try/catch returns null/false on errors, never throws to caller
    ///   - Path traversal protection — default path under LocalAppData\Syncora, custom paths validated
    /// </summary>
    public class CompanyMappingStore : IDisposable
    {
        private readonly string _connectionString;
        private readonly string _databasePath;
        private SqliteConnection? _connection;

        // Trusted directory boundary for custom database paths.
        private static readonly string TrustedBaseDirectory =
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Syncora");

        public CompanyMappingStore(string? databasePath = null)
        {
            // Default: per-user LocalApplicationData\Syncora\company_mapping.db
            string resolvedPath;
            if (string.IsNullOrWhiteSpace(databasePath))
            {
                resolvedPath = Path.Combine(TrustedBaseDirectory, "company_mapping.db");
            }
            else
            {
                resolvedPath = ValidateAndResolvePath(databasePath);
            }

            _databasePath = resolvedPath;
            _connectionString = $"Data Source={_databasePath}";
            InitializeDatabase();
        }

        /// <summary>
        /// Validates and resolves a custom database path against a trusted directory boundary.
        /// Rejects unsafe relative or absolute paths that escape the trusted boundary.
        /// </summary>
        private static string ValidateAndResolvePath(string databasePath)
        {
            string fullPath;
            try
            {
                fullPath = Path.GetFullPath(databasePath);
            }
            catch (Exception ex)
            {
                throw new ArgumentException($"Invalid database path: {databasePath}", nameof(databasePath), ex);
            }

            string trustedBase = TrustedBaseDirectory + Path.DirectorySeparatorChar;

            // Reject paths that escape the trusted directory boundary.
            if (!fullPath.StartsWith(trustedBase, StringComparison.OrdinalIgnoreCase) &&
                !fullPath.Equals(TrustedBaseDirectory, StringComparison.OrdinalIgnoreCase))
            {
                throw new ArgumentException(
                    $"Database path must be under the trusted directory '{TrustedBaseDirectory}'. " +
                    $"Resolved path '{fullPath}' is outside the boundary.",
                    nameof(databasePath));
            }

            return fullPath;
        }

        /// <summary>
        /// Checks whether an existing mapping database exists at the legacy location
        /// (application base directory) and logs it without moving or replacing it.
        /// </summary>
        private static void ReportLegacyDatabase()
        {
            string legacyPath = Path.Combine(AppContext.BaseDirectory, "company_mapping.db");
            if (File.Exists(legacyPath))
            {
                Console.WriteLine(
                    $"[CompanyMappingStore] Existing mapping database found at legacy location '{legacyPath}'. " +
                    "It was preserved and not moved. Use migration tooling to transfer data if needed.");
            }
        }

        /// <summary>
        /// Initialize SQLite database and create the company_identity_map table.
        /// Detects corruption by verifying the table is readable after creation.
        /// </summary>
        private void InitializeDatabase()
        {
            try
            {
                // Report legacy database if present (preserve, do not move)
                ReportLegacyDatabase();

                // Ensure the trusted directory exists
                string? directory = Path.GetDirectoryName(_databasePath);
                if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                _connection = new SqliteConnection(_connectionString);
                _connection.Open();

                var command = _connection.CreateCommand();
                command.CommandText = @"
                    CREATE TABLE IF NOT EXISTS company_identity_map (
                        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                        supabase_company_id TEXT NOT NULL,
                        tally_guid TEXT NOT NULL,
                        data_path TEXT NOT NULL,
                        source_id TEXT NOT NULL,
                        owner_id TEXT NOT NULL,
                        registered_at TEXT NOT NULL,
                        last_seen_at TEXT,
                        is_verified INTEGER DEFAULT 0,
                        is_active INTEGER DEFAULT 1,
                        confirmation_state TEXT DEFAULT 'pending',
                        schema_version INTEGER DEFAULT 1
                    );
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_company_map_unique
                        ON company_identity_map(owner_id, tally_guid, data_path, source_id);
                    CREATE INDEX IF NOT EXISTS idx_company_map_guid
                        ON company_identity_map(owner_id, tally_guid);
                    CREATE INDEX IF NOT EXISTS idx_company_map_path
                        ON company_identity_map(owner_id, data_path);
                    CREATE INDEX IF NOT EXISTS idx_company_map_company_id
                        ON company_identity_map(supabase_company_id);
                ";
                command.ExecuteNonQuery();

                // Migration: add is_active column to existing databases that lack it
                var migrateCmd = _connection.CreateCommand();
                migrateCmd.CommandText = @"
                    ALTER TABLE company_identity_map ADD COLUMN is_active INTEGER DEFAULT 1;
                ";
                try
                {
                    migrateCmd.ExecuteNonQuery();
                }
                catch
                {
                    // Column already exists (SQLite ALTER TABLE ADD COLUMN fails if column exists) - safe to ignore.
                }

                // Migration: add confirmation_state column to existing databases that lack it
                var migrateCmd2 = _connection.CreateCommand();
                migrateCmd2.CommandText = @"
                    ALTER TABLE company_identity_map ADD COLUMN confirmation_state TEXT DEFAULT 'pending';
                ";
                try
                {
                    migrateCmd2.ExecuteNonQuery();
                }
                catch
                {
                    // Column already exists - safe to ignore.
                }

                // Corruption detection: verify the table is readable
                VerifySchema();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to initialize company mapping database: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Corruption detection: verifies the company_identity_map table is readable.
        /// Throws if the table is missing or unreadable.
        /// </summary>
        private void VerifySchema()
        {
            var command = _connection!.CreateCommand();
            command.CommandText = "SELECT COUNT(*) FROM company_identity_map LIMIT 1";
            command.ExecuteNonQuery();
        }

        /// <summary>
        /// Look up a mapping by owner, Tally GUID, and Data Path.
        /// Returns null if not found or on error.
        /// </summary>
        public CompanyIdentityMap? GetByGuidAndPath(string ownerId, string tallyGuid, string dataPath)
        {
            try
            {
                var command = _connection!.CreateCommand();
                command.CommandText = @"
                    SELECT supabase_company_id, tally_guid, data_path, source_id, owner_id,
                           registered_at, last_seen_at, is_verified, is_active, confirmation_state
                    FROM company_identity_map
                    WHERE owner_id = @ownerId AND tally_guid = @tallyGuid AND data_path = @dataPath
                    LIMIT 1";
                command.Parameters.AddWithValue("@ownerId", ownerId);
                command.Parameters.AddWithValue("@tallyGuid", tallyGuid);
                command.Parameters.AddWithValue("@dataPath", dataPath);

                using var reader = command.ExecuteReader();
                if (reader.Read())
                {
                    return ReadCompanyIdentityMap(reader);
                }
                return null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Company mapping lookup failed: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Look up all mappings for a given owner and Tally GUID (across all paths/sources).
        /// Used to detect same-GUID-different-path scenarios.
        /// </summary>
        public List<CompanyIdentityMap> GetByGuid(string ownerId, string tallyGuid)
        {
            var results = new List<CompanyIdentityMap>();
            try
            {
                var command = _connection!.CreateCommand();
                command.CommandText = @"
                    SELECT supabase_company_id, tally_guid, data_path, source_id, owner_id,
                           registered_at, last_seen_at, is_verified, is_active, confirmation_state
                    FROM company_identity_map
                    WHERE owner_id = @ownerId AND tally_guid = @tallyGuid";
                command.Parameters.AddWithValue("@ownerId", ownerId);
                command.Parameters.AddWithValue("@tallyGuid", tallyGuid);

                using var reader = command.ExecuteReader();
                while (reader.Read())
                {
                    results.Add(ReadCompanyIdentityMap(reader));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Company mapping lookup by GUID failed: {ex.Message}");
            }
            return results;
        }

        /// <summary>
        /// Look up the ACTIVE mapping for a given owner and Tally GUID.
        /// Returns the first active mapping (is_active = 1), or null if none.
        /// Used to find the active Main Path for a company.
        /// </summary>
        public CompanyIdentityMap? GetActiveMappingByGuid(string ownerId, string tallyGuid)
        {
            try
            {
                var command = _connection!.CreateCommand();
                command.CommandText = @"
                    SELECT supabase_company_id, tally_guid, data_path, source_id, owner_id,
                           registered_at, last_seen_at, is_verified, is_active, confirmation_state
                    FROM company_identity_map
                    WHERE owner_id = @ownerId AND tally_guid = @tallyGuid AND is_active = 1
                    ORDER BY registered_at ASC
                    LIMIT 1";
                command.Parameters.AddWithValue("@ownerId", ownerId);
                command.Parameters.AddWithValue("@tallyGuid", tallyGuid);

                using var reader = command.ExecuteReader();
                if (reader.Read())
                {
                    return ReadCompanyIdentityMap(reader);
                }
                return null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Company mapping active lookup failed: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Set a specific mapping as inactive (is_active = 0).
        /// Used when switching the Main Path: the old path becomes inactive.
        /// Requires all identifying fields to target exactly one mapping.
        /// Never affects mappings belonging to another owner.
        /// </summary>
        public bool SetPathInactive(
            string ownerId,
            string supabaseCompanyId,
            string tallyGuid,
            string dataPath,
            string sourceId)
        {
            try
            {
                var command = _connection!.CreateCommand();
                command.CommandText = @"
                    UPDATE company_identity_map
                    SET is_active = 0
                    WHERE owner_id = @ownerId
                      AND supabase_company_id = @supabaseCompanyId
                      AND tally_guid = @tallyGuid
                      AND data_path = @dataPath
                      AND source_id = @sourceId";
                command.Parameters.AddWithValue("@ownerId", ownerId);
                command.Parameters.AddWithValue("@supabaseCompanyId", supabaseCompanyId);
                command.Parameters.AddWithValue("@tallyGuid", tallyGuid);
                command.Parameters.AddWithValue("@dataPath", dataPath);
                command.Parameters.AddWithValue("@sourceId", sourceId);

                var rows = command.ExecuteNonQuery();
                return rows > 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Company mapping set inactive failed: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Save a new mapping with confirmation_state='pending' (cloud not yet confirmed).
        /// Returns false if a duplicate already exists.
        /// Uses a transaction for atomicity.
        /// </summary>
        public bool SaveWithPendingState(CompanyIdentityMap map)
        {
            map.ConfirmationState = "pending";
            return Save(map);
        }

        /// <summary>
        /// Confirm cloud activation for a mapping — sets confirmation_state='confirmed'
        /// and is_active=1. Called only after the Edge Function confirms the cloud write.
        /// </summary>
        public bool ConfirmCloudActivation(
            string ownerId,
            string supabaseCompanyId,
            string tallyGuid,
            string dataPath,
            string sourceId)
        {
            try
            {
                var command = _connection!.CreateCommand();
                command.CommandText = @"
                    UPDATE company_identity_map
                    SET confirmation_state = 'confirmed', is_active = 1
                    WHERE owner_id = @ownerId
                      AND supabase_company_id = @supabaseCompanyId
                      AND tally_guid = @tallyGuid
                      AND data_path = @dataPath
                      AND source_id = @sourceId";
                command.Parameters.AddWithValue("@ownerId", ownerId);
                command.Parameters.AddWithValue("@supabaseCompanyId", supabaseCompanyId);
                command.Parameters.AddWithValue("@tallyGuid", tallyGuid);
                command.Parameters.AddWithValue("@dataPath", dataPath);
                command.Parameters.AddWithValue("@sourceId", sourceId);

                var rows = command.ExecuteNonQuery();
                return rows > 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Company mapping confirm activation failed: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Get all pending mappings for a given owner (cloud activation not yet confirmed).
        /// Used for retry after network interruption.
        /// </summary>
        public List<CompanyIdentityMap> GetPendingMappings(string ownerId)
        {
            var results = new List<CompanyIdentityMap>();
            try
            {
                var command = _connection!.CreateCommand();
                command.CommandText = @"
                    SELECT supabase_company_id, tally_guid, data_path, source_id, owner_id,
                           registered_at, last_seen_at, is_verified, is_active, confirmation_state
                    FROM company_identity_map
                    WHERE owner_id = @ownerId AND confirmation_state = 'pending'";
                command.Parameters.AddWithValue("@ownerId", ownerId);

                using var reader = command.ExecuteReader();
                while (reader.Read())
                {
                    results.Add(ReadCompanyIdentityMap(reader));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Company mapping pending lookup failed: {ex.Message}");
            }
            return results;
        }

        /// <summary>
        /// Look up all mappings for a given owner (all companies).
        /// </summary>
        public List<CompanyIdentityMap> GetAll(string ownerId)
        {
            var results = new List<CompanyIdentityMap>();
            try
            {
                var command = _connection!.CreateCommand();
                command.CommandText = @"
                    SELECT supabase_company_id, tally_guid, data_path, source_id, owner_id,
                           registered_at, last_seen_at, is_verified, is_active, confirmation_state
                    FROM company_identity_map
                    WHERE owner_id = @ownerId";
                command.Parameters.AddWithValue("@ownerId", ownerId);

                using var reader = command.ExecuteReader();
                while (reader.Read())
                {
                    results.Add(ReadCompanyIdentityMap(reader));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Company mapping get all failed: {ex.Message}");
            }
            return results;
        }

        /// <summary>
        /// Save a new mapping. Returns false if a duplicate already exists
        /// (same owner + tally_guid + data_path + source_id).
        /// Uses a transaction for atomicity — no silent overwrite.
        /// </summary>
        public bool Save(CompanyIdentityMap map)
        {
            try
            {
                using var transaction = _connection!.BeginTransaction();
                try
                {
                    var command = _connection.CreateCommand();
                    command.Transaction = transaction;
                    command.CommandText = @"
                        INSERT INTO company_identity_map
                        (supabase_company_id, tally_guid, data_path, source_id, owner_id,
                         registered_at, last_seen_at, is_verified, is_active, confirmation_state)
                        VALUES (@supabaseCompanyId, @tallyGuid, @dataPath, @sourceId, @ownerId,
                                @registeredAt, @lastSeenAt, @isVerified, @isActive, @confirmationState)";
                    command.Parameters.AddWithValue("@supabaseCompanyId", map.SupabaseCompanyId);
                    command.Parameters.AddWithValue("@tallyGuid", map.TallyGuid);
                    command.Parameters.AddWithValue("@dataPath", map.DataPath);
                    command.Parameters.AddWithValue("@sourceId", map.SourceId);
                    command.Parameters.AddWithValue("@ownerId", map.OwnerId);
                    command.Parameters.AddWithValue("@registeredAt", map.RegisteredAt.ToString("o"));
                    command.Parameters.AddWithValue("@lastSeenAt",
                        (object?)map.LastSeenAt?.ToString("o") ?? DBNull.Value);
                    command.Parameters.AddWithValue("@isVerified", map.IsVerified ? 1 : 0);
                    command.Parameters.AddWithValue("@isActive", map.IsActive ? 1 : 0);
                    command.Parameters.AddWithValue("@confirmationState", map.ConfirmationState ?? "pending");

                    command.ExecuteNonQuery();
                    transaction.Commit();
                    return true;
                }
                catch
                {
                    transaction.Rollback();
                    throw;
                }
            }
            catch (SqliteException ex) when (IsUniqueConstraintViolation(ex))
            {
                Console.WriteLine(
                    $"Duplicate company mapping rejected: owner={map.OwnerId}, guid={map.TallyGuid}, " +
                    $"path={map.DataPath}, source={map.SourceId}");
                return false;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Company mapping save failed: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Update the last_seen_at timestamp for an existing mapping.
        /// Requires owner_id + supabase_company_id + tally_guid + data_path + source_id
        /// to uniquely identify one mapping. Never updates mappings belonging to another owner.
        /// </summary>
        public bool UpdateLastSeen(
            string ownerId,
            string supabaseCompanyId,
            string tallyGuid,
            string dataPath,
            string sourceId,
            DateTime lastSeenAt)
        {
            try
            {
                var command = _connection!.CreateCommand();
                command.CommandText = @"
                    UPDATE company_identity_map
                    SET last_seen_at = @lastSeenAt
                    WHERE owner_id = @ownerId
                      AND supabase_company_id = @supabaseCompanyId
                      AND tally_guid = @tallyGuid
                      AND data_path = @dataPath
                      AND source_id = @sourceId";
                command.Parameters.AddWithValue("@ownerId", ownerId);
                command.Parameters.AddWithValue("@supabaseCompanyId", supabaseCompanyId);
                command.Parameters.AddWithValue("@tallyGuid", tallyGuid);
                command.Parameters.AddWithValue("@dataPath", dataPath);
                command.Parameters.AddWithValue("@sourceId", sourceId);
                command.Parameters.AddWithValue("@lastSeenAt", lastSeenAt.ToString("o"));

                var rows = command.ExecuteNonQuery();
                return rows > 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Company mapping last_seen update failed: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Delete a mapping by owner_id + supabase_company_id + tally_guid + data_path + source_id.
        /// Requires all identifying fields to ensure exactly one mapping is deleted.
        /// Never deletes mappings belonging to another owner or source.
        /// </summary>
        public bool Delete(
            string ownerId,
            string supabaseCompanyId,
            string tallyGuid,
            string dataPath,
            string sourceId)
        {
            try
            {
                var command = _connection!.CreateCommand();
                command.CommandText = @"
                    DELETE FROM company_identity_map
                    WHERE owner_id = @ownerId
                      AND supabase_company_id = @supabaseCompanyId
                      AND tally_guid = @tallyGuid
                      AND data_path = @dataPath
                      AND source_id = @sourceId";
                command.Parameters.AddWithValue("@ownerId", ownerId);
                command.Parameters.AddWithValue("@supabaseCompanyId", supabaseCompanyId);
                command.Parameters.AddWithValue("@tallyGuid", tallyGuid);
                command.Parameters.AddWithValue("@dataPath", dataPath);
                command.Parameters.AddWithValue("@sourceId", sourceId);

                var rows = command.ExecuteNonQuery();
                return rows > 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Company mapping delete failed: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Check if a mapping already exists for the given combination.
        /// </summary>
        public bool Exists(string ownerId, string tallyGuid, string dataPath, string sourceId)
        {
            try
            {
                var command = _connection!.CreateCommand();
                command.CommandText = @"
                    SELECT COUNT(*) FROM company_identity_map
                    WHERE owner_id = @ownerId AND tally_guid = @tallyGuid
                      AND data_path = @dataPath AND source_id = @sourceId";
                command.Parameters.AddWithValue("@ownerId", ownerId);
                command.Parameters.AddWithValue("@tallyGuid", tallyGuid);
                command.Parameters.AddWithValue("@dataPath", dataPath);
                command.Parameters.AddWithValue("@sourceId", sourceId);

                var result = command.ExecuteScalar();
                return Convert.ToInt32(result) > 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Company mapping exists check failed: {ex.Message}");
                return false;
            }
        }

        private static bool IsUniqueConstraintViolation(SqliteException ex)
        {
            return ex.Message.Contains("UNIQUE constraint failed", StringComparison.OrdinalIgnoreCase);
        }

        private static CompanyIdentityMap ReadCompanyIdentityMap(SqliteDataReader reader)
        {
            return new CompanyIdentityMap
            {
                SupabaseCompanyId = reader.GetString(0),
                TallyGuid = reader.GetString(1),
                DataPath = reader.GetString(2),
                SourceId = reader.GetString(3),
                OwnerId = reader.GetString(4),
                RegisteredAt = DateTime.Parse(reader.GetString(5), null, System.Globalization.DateTimeStyles.RoundtripKind),
                LastSeenAt = reader.IsDBNull(6) ? null : DateTime.Parse(reader.GetString(6), null, System.Globalization.DateTimeStyles.RoundtripKind),
                IsVerified = reader.GetInt32(7) == 1,
                IsActive = reader.FieldCount > 8 && !reader.IsDBNull(8) ? reader.GetInt32(8) == 1 : true,
                ConfirmationState = reader.FieldCount > 9 && !reader.IsDBNull(9) ? reader.GetString(9) : "pending",
            };
        }

        public void Dispose()
        {
            _connection?.Close();
            _connection?.Dispose();
        }
    }
}
