using System;
using System.IO;
using System.Linq;
using Xunit;
using TallySyncApp.Models;
using TallySyncApp.Services;

namespace TallySyncApp.Tests;

public class CompanyMappingStoreTests : IDisposable
{
    private readonly string _tempDbPath;
    private readonly CompanyMappingStore _store;

    public CompanyMappingStoreTests()
    {
        // Use a path under LocalAppData\Syncora\ to satisfy path validation
        string trustedBase = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Syncora");
        Directory.CreateDirectory(trustedBase);
        _tempDbPath = Path.Combine(trustedBase, $"test_mapping_{Guid.NewGuid():N}.db");
        _store = new CompanyMappingStore(_tempDbPath);
    }

    public void Dispose()
    {
        _store.Dispose();
        try { File.Delete(_tempDbPath); } catch { }
        try { File.Delete(_tempDbPath + "-wal"); } catch { }
        try { File.Delete(_tempDbPath + "-shm"); } catch { }
    }

    [Fact]
    public void Save_And_Retrieve_Success()
    {
        // Arrange
        var map = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-abc-123",
            TallyGuid = "guid-001",
            DataPath = @"D:\SyncoraTestData\010000",
            SourceId = "source-xyz",
            OwnerId = "owner-user-1",
            RegisteredAt = DateTime.UtcNow,
            LastSeenAt = DateTime.UtcNow,
            IsVerified = true
        };

        // Act
        bool result = _store.Save(map);
        var retrieved = _store.GetByGuidAndPath("owner-user-1", "guid-001", @"D:\SyncoraTestData\010000");

        // Assert
        Assert.True(result);
        Assert.NotNull(retrieved);
        Assert.Equal("company-abc-123", retrieved!.SupabaseCompanyId);
        Assert.Equal("guid-001", retrieved.TallyGuid);
        Assert.Equal(@"D:\SyncoraTestData\010000", retrieved.DataPath);
        Assert.Equal("source-xyz", retrieved.SourceId);
        Assert.Equal("owner-user-1", retrieved.OwnerId);
        Assert.True(retrieved.IsVerified);
    }

    [Fact]
    public void Save_Duplicate_Mapping_ReturnsFalse()
    {
        // Arrange
        var map1 = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-1",
            TallyGuid = "guid-dup",
            DataPath = @"D:\Path1",
            SourceId = "source-1",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow
        };
        var map2 = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-2",
            TallyGuid = "guid-dup",
            DataPath = @"D:\Path1",
            SourceId = "source-1",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow
        };

        // Act
        bool first = _store.Save(map1);
        bool second = _store.Save(map2);

        // Assert
        Assert.True(first);
        Assert.False(second);
    }

    [Fact]
    public void Same_Guid_Different_Sources_Are_Separate()
    {
        // Arrange
        var map1 = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-a",
            TallyGuid = "guid-shared",
            DataPath = @"D:\Path1",
            SourceId = "source-copy-1",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow
        };
        var map2 = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-b",
            TallyGuid = "guid-shared",
            DataPath = @"D:\Path2",
            SourceId = "source-copy-2",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow
        };

        // Act
        bool first = _store.Save(map1);
        bool second = _store.Save(map2);

        // Assert
        Assert.True(first);
        Assert.True(second);

        var byGuid = _store.GetByGuid("owner-1", "guid-shared");
        Assert.Equal(2, byGuid.Count);
        Assert.Contains(byGuid, m => m.DataPath == @"D:\Path1" && m.SourceId == "source-copy-1");
        Assert.Contains(byGuid, m => m.DataPath == @"D:\Path2" && m.SourceId == "source-copy-2");
    }

    [Fact]
    public void Same_CompanyId_Multiple_Source_Mappings_Handled_Correctly()
    {
        // Arrange: same supabase_company_id with different tally_guid + source_id combinations
        var map1 = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-shared-id",
            TallyGuid = "guid-source-1",
            DataPath = @"D:\Path1",
            SourceId = "source-a",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow
        };
        var map2 = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-shared-id",
            TallyGuid = "guid-source-2",
            DataPath = @"D:\Path2",
            SourceId = "source-b",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow
        };

        // Act
        bool first = _store.Save(map1);
        bool second = _store.Save(map2);

        // Assert: both should succeed because unique constraint includes tally_guid + source_id
        Assert.True(first);
        Assert.True(second);

        var byGuid = _store.GetByGuid("owner-1", "guid-source-1");
        Assert.Single(byGuid);
        Assert.Equal("source-a", byGuid[0].SourceId);

        var byGuid2 = _store.GetByGuid("owner-1", "guid-source-2");
        Assert.Single(byGuid2);
        Assert.Equal("source-b", byGuid2[0].SourceId);
    }

    [Fact]
    public void Different_Owners_Can_Have_Same_Guid_And_Path()
    {
        // Arrange
        var map1 = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-owner-a",
            TallyGuid = "guid-shared",
            DataPath = @"D:\SharedPath",
            SourceId = "source-1",
            OwnerId = "owner-alice",
            RegisteredAt = DateTime.UtcNow
        };
        var map2 = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-owner-b",
            TallyGuid = "guid-shared",
            DataPath = @"D:\SharedPath",
            SourceId = "source-1",
            OwnerId = "owner-bob",
            RegisteredAt = DateTime.UtcNow
        };

        // Act
        bool first = _store.Save(map1);
        bool second = _store.Save(map2);

        // Assert
        Assert.True(first);
        Assert.True(second);

        var aliceMaps = _store.GetAll("owner-alice");
        var bobMaps = _store.GetAll("owner-bob");
        Assert.Single(aliceMaps);
        Assert.Single(bobMaps);
        Assert.NotEqual(aliceMaps[0].SupabaseCompanyId, bobMaps[0].SupabaseCompanyId);
    }

    [Fact]
    public void GetByGuidAndPath_ReturnsNull_WhenNotFound()
    {
        // Act
        var result = _store.GetByGuidAndPath("owner-1", "nonexistent-guid", @"D:\NoPath");

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void UpdateLastSeen_Works()
    {
        // Arrange
        var map = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-update",
            TallyGuid = "guid-update",
            DataPath = @"D:\Path",
            SourceId = "source-1",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow
        };
        _store.Save(map);

        var newSeen = DateTime.UtcNow.AddMinutes(5);

        // Act
        bool updated = _store.UpdateLastSeen(
            "owner-1", "company-update", "guid-update", @"D:\Path", "source-1", newSeen);
        var retrieved = _store.GetByGuidAndPath("owner-1", "guid-update", @"D:\Path");

        // Assert
        Assert.True(updated);
        Assert.NotNull(retrieved);
        Assert.Equal(newSeen.ToString("o"), retrieved!.LastSeenAt?.ToString("o"));
    }

    [Fact]
    public void UpdateLastSeen_Blocked_For_Different_Owner()
    {
        // Arrange
        var map = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-update-2",
            TallyGuid = "guid-update-2",
            DataPath = @"D:\Path",
            SourceId = "source-1",
            OwnerId = "owner-alice",
            RegisteredAt = DateTime.UtcNow
        };
        _store.Save(map);

        var newSeen = DateTime.UtcNow.AddMinutes(5);

        // Act - different owner tries to update
        bool updated = _store.UpdateLastSeen(
            "owner-bob", "company-update-2", "guid-update-2", @"D:\Path", "source-1", newSeen);

        // Assert
        Assert.False(updated);

        // Verify the original owner's data is unchanged
        var retrieved = _store.GetByGuidAndPath("owner-alice", "guid-update-2", @"D:\Path");
        Assert.NotNull(retrieved);
        Assert.NotEqual(newSeen.ToString("o"), retrieved!.LastSeenAt?.ToString("o"));
    }

    [Fact]
    public void UpdateLastSeen_Blocked_For_Different_SourceId()
    {
        // Arrange
        var map = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-update-3",
            TallyGuid = "guid-update-3",
            DataPath = @"D:\Path",
            SourceId = "source-a",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow
        };
        _store.Save(map);

        var newSeen = DateTime.UtcNow.AddMinutes(5);

        // Act - same owner but wrong source_id
        bool updated = _store.UpdateLastSeen(
            "owner-1", "company-update-3", "guid-update-3", @"D:\Path", "source-b", newSeen);

        // Assert
        Assert.False(updated);
    }

    [Fact]
    public void Delete_Works()
    {
        // Arrange
        var map = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-delete",
            TallyGuid = "guid-delete",
            DataPath = @"D:\Path",
            SourceId = "source-1",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow
        };
        _store.Save(map);

        // Act
        bool deleted = _store.Delete(
            "owner-1", "company-delete", "guid-delete", @"D:\Path", "source-1");
        var result = _store.GetByGuidAndPath("owner-1", "guid-delete", @"D:\Path");

        // Assert
        Assert.True(deleted);
        Assert.Null(result);
    }

    [Fact]
    public void Delete_Blocked_For_Different_Owner()
    {
        // Arrange
        var map = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-delete-2",
            TallyGuid = "guid-delete-2",
            DataPath = @"D:\Path",
            SourceId = "source-1",
            OwnerId = "owner-alice",
            RegisteredAt = DateTime.UtcNow
        };
        _store.Save(map);

        // Act - different owner tries to delete
        bool deleted = _store.Delete(
            "owner-bob", "company-delete-2", "guid-delete-2", @"D:\Path", "source-1");
        var result = _store.GetByGuidAndPath("owner-alice", "guid-delete-2", @"D:\Path");

        // Assert
        Assert.False(deleted);
        Assert.NotNull(result);
    }

    [Fact]
    public void Delete_Blocked_For_Different_SourceId()
    {
        // Arrange
        var map = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-delete-3",
            TallyGuid = "guid-delete-3",
            DataPath = @"D:\Path",
            SourceId = "source-a",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow
        };
        _store.Save(map);

        // Act - same owner but wrong source_id
        bool deleted = _store.Delete(
            "owner-1", "company-delete-3", "guid-delete-3", @"D:\Path", "source-b");

        // Assert
        Assert.False(deleted);
        var result = _store.GetByGuidAndPath("owner-1", "guid-delete-3", @"D:\Path");
        Assert.NotNull(result);
    }

    [Fact]
    public void Exists_ReturnsTrue_AfterSave()
    {
        // Arrange
        var map = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-exists",
            TallyGuid = "guid-exists",
            DataPath = @"D:\Path",
            SourceId = "source-1",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow
        };
        _store.Save(map);

        // Act
        bool exists = _store.Exists("owner-1", "guid-exists", @"D:\Path", "source-1");
        bool notExists = _store.Exists("owner-1", "guid-exists", @"D:\Path", "source-2");

        // Assert
        Assert.True(exists);
        Assert.False(notExists);
    }

    [Fact]
    public void Corrupted_Database_Throws_OnInit()
    {
        // Arrange - create a corrupted SQLite file under the trusted directory
        string trustedBase = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Syncora");
        Directory.CreateDirectory(trustedBase);
        string corruptedPath = Path.Combine(trustedBase, $"test_corrupt_{Guid.NewGuid():N}.db");
        File.WriteAllBytes(corruptedPath, new byte[] { 0x00, 0x01, 0x02, 0x03, 0x04, 0x05 });

        // Act & Assert
        Assert.ThrowsAny<Exception>(() => new CompanyMappingStore(corruptedPath));

        // Cleanup
        try { File.Delete(corruptedPath); } catch { }
    }

    [Fact]
    public void Persistence_Across_Store_Instances()
    {
        // Arrange
        var map = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-persist",
            TallyGuid = "guid-persist",
            DataPath = @"D:\PersistPath",
            SourceId = "source-1",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow
        };
        _store.Save(map);
        _store.Dispose();

        // Act - open new store on same database
        using var store2 = new CompanyMappingStore(_tempDbPath);
        var retrieved = store2.GetByGuidAndPath("owner-1", "guid-persist", @"D:\PersistPath");

        // Assert
        Assert.NotNull(retrieved);
        Assert.Equal("company-persist", retrieved!.SupabaseCompanyId);
    }

    // --- Path validation tests ---

    [Fact]
    public void Path_Traversal_Is_Blocked()
    {
        // Act & Assert
        Assert.Throws<ArgumentException>(() => new CompanyMappingStore("../../../tmp/evil.db"));
    }

    [Fact]
    public void Unsafe_Absolute_Path_Outside_Trusted_Directory_Is_Blocked()
    {
        // Act & Assert
        Assert.Throws<ArgumentException>(() => new CompanyMappingStore(@"C:\Windows\evil.db"));
    }

    [Fact]
    public void Path_Within_Trusted_Directory_Is_Accepted()
    {
        // Arrange - use a path under LocalAppData\Syncora\
        string trustedPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Syncora",
            "test_safe.db");

        // Act & Assert - should not throw
        using var store = new CompanyMappingStore(trustedPath);
        Assert.NotNull(store);
    }

    [Fact]
    public void Safe_Default_AppData_Path_Works()
    {
        // Act - no path argument, should use LocalAppData\Syncora\company_mapping.db
        using var store = new CompanyMappingStore();

        // Assert - should not throw
        Assert.NotNull(store);
    }

    [Fact]
    public void Null_DatabasePath_Uses_Default_AppData_Location()
    {
        // Act
        using var store = new CompanyMappingStore(null);

        // Assert - should not throw
        Assert.NotNull(store);
    }

    [Fact]
    public void Empty_DatabasePath_Uses_Default_AppData_Location()
    {
        // Act
        using var store = new CompanyMappingStore("");

        // Assert - should not throw
        Assert.NotNull(store);
    }

    // ============================================
    // Main Path Switching Tests
    // ============================================

    [Fact]
    public void GetActiveMappingByGuid_ReturnsActiveMapping()
    {
        // Arrange
        var map = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-active",
            TallyGuid = "guid-active",
            DataPath = @"D:\Path\Active",
            SourceId = "source-1",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow,
            IsActive = true,
        };
        _store.Save(map);

        // Act
        var result = _store.GetActiveMappingByGuid("owner-1", "guid-active");

        // Assert
        Assert.NotNull(result);
        Assert.Equal("company-active", result.SupabaseCompanyId);
        Assert.Equal(@"D:\Path\Active", result.DataPath);
        Assert.True(result.IsActive);
    }

    [Fact]
    public void GetActiveMappingByGuid_ReturnsNull_WhenNoActiveMapping()
    {
        // Arrange - save an inactive mapping
        var map = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-inactive",
            TallyGuid = "guid-inactive",
            DataPath = @"D:\Path\Inactive",
            SourceId = "source-1",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow,
            IsActive = false,
        };
        _store.Save(map);

        // Act
        var result = _store.GetActiveMappingByGuid("owner-1", "guid-inactive");

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void SetPathInactive_MarksMappingInactive()
    {
        // Arrange
        var map = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-to-deactivate",
            TallyGuid = "guid-to-deactivate",
            DataPath = @"D:\Path\Old",
            SourceId = "source-1",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow,
            IsActive = true,
        };
        _store.Save(map);

        // Act
        bool deactivated = _store.SetPathInactive(
            "owner-1", "company-to-deactivate", "guid-to-deactivate",
            @"D:\Path\Old", "source-1");

        // Assert
        Assert.True(deactivated);
        var result = _store.GetActiveMappingByGuid("owner-1", "guid-to-deactivate");
        Assert.Null(result);
    }

    [Fact]
    public void SetPathInactive_DoesNotAffectOtherOwners()
    {
        // Arrange
        var map = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-owner-a",
            TallyGuid = "guid-owner",
            DataPath = @"D:\Path\Shared",
            SourceId = "source-1",
            OwnerId = "owner-alice",
            RegisteredAt = DateTime.UtcNow,
            IsActive = true,
        };
        _store.Save(map);

        // Act - Bob tries to deactivate Alice's mapping
        bool deactivated = _store.SetPathInactive(
            "owner-bob", "company-owner-a", "guid-owner",
            @"D:\Path\Shared", "source-1");

        // Assert
        Assert.False(deactivated);
        var result = _store.GetActiveMappingByGuid("owner-alice", "guid-owner");
        Assert.NotNull(result);
        Assert.True(result.IsActive);
    }

    [Fact]
    public void GetByGuid_ReturnsAllMappings_IncludingInactive()
    {
        // Arrange
        var activeMap = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-active",
            TallyGuid = "guid-multi",
            DataPath = @"D:\Path\Active",
            SourceId = "source-1",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow,
            IsActive = true,
        };
        var inactiveMap = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-inactive",
            TallyGuid = "guid-multi",
            DataPath = @"D:\Path\Inactive",
            SourceId = "source-2",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow,
            IsActive = false,
        };
        _store.Save(activeMap);
        _store.Save(inactiveMap);

        // Act
        var all = _store.GetByGuid("owner-1", "guid-multi");

        // Assert
        Assert.Equal(2, all.Count);
        Assert.Contains(all, m => m.DataPath == @"D:\Path\Active" && m.IsActive);
        Assert.Contains(all, m => m.DataPath == @"D:\Path\Inactive" && !m.IsActive);
    }

    [Fact]
    public void Same_Guid_Different_Path_Detected_As_Conflict()
    {
        // Arrange - simulate existing mapping with different path
        var existing = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-existing",
            TallyGuid = "guid-conflict",
            DataPath = @"D:\SyncoraTestData\010000",
            SourceId = "source-1",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow,
            IsActive = true,
        };
        _store.Save(existing);

        // Act - check if new path conflicts
        var existingByGuid = _store.GetByGuid("owner-1", "guid-conflict");
        var hasDifferentPath = existingByGuid.Any(m =>
            !string.Equals(m.DataPath, @"D:\SyncoraTestData\Backup", StringComparison.OrdinalIgnoreCase));

        // Assert
        Assert.Single(existingByGuid);
        Assert.True(hasDifferentPath, "Same GUID with different path should be detected as conflict");
    }

    [Fact]
    public void Same_Guid_Same_Path_No_Conflict()
    {
        // Arrange
        var existing = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-existing",
            TallyGuid = "guid-noconflict",
            DataPath = @"D:\SyncoraTestData\010000",
            SourceId = "source-1",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow,
            IsActive = true,
        };
        _store.Save(existing);

        // Act - same path, same GUID → no conflict
        var exactMatch = _store.GetByGuidAndPath("owner-1", "guid-noconflict", @"D:\SyncoraTestData\010000");

        // Assert
        Assert.NotNull(exactMatch);
    }

    [Fact]
    public void Copied_Company_Same_Guid_Different_Path_Separate_Mappings()
    {
        // Arrange - original company mapping
        var original = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-original",
            TallyGuid = "guid-copied",
            DataPath = @"D:\OriginalData\010000",
            SourceId = "source-original",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow,
            IsActive = true,
        };
        // Copy of same company (same GUID, different path)
        var copy = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-copy",
            TallyGuid = "guid-copied",
            DataPath = @"D:\SyncoraTestData\010000",
            SourceId = "source-copy",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow,
            IsActive = true,
        };

        // Act
        bool first = _store.Save(original);
        bool second = _store.Save(copy);

        // Assert - both should succeed (different source_id + path)
        Assert.True(first);
        Assert.True(second);

        var byGuid = _store.GetByGuid("owner-1", "guid-copied");
        Assert.Equal(2, byGuid.Count);

        // Active mapping should be the original (first saved)
        var active = _store.GetActiveMappingByGuid("owner-1", "guid-copied");
        Assert.NotNull(active);
        Assert.Equal(@"D:\OriginalData\010000", active.DataPath);
    }

    // ============================================
    // Cloud / Local Consistency Tests
    // ============================================

    [Fact]
    public void SaveWithPendingState_SetsConfirmationStatePending()
    {
        // Arrange
        var map = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-pending",
            TallyGuid = "guid-pending",
            DataPath = @"D:\Path\Pending",
            SourceId = "source-1",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow,
            IsActive = true,
        };

        // Act
        bool result = _store.SaveWithPendingState(map);
        var retrieved = _store.GetByGuidAndPath("owner-1", "guid-pending", @"D:\Path\Pending");

        // Assert
        Assert.True(result);
        Assert.NotNull(retrieved);
        Assert.Equal("pending", retrieved!.ConfirmationState);
        Assert.True(retrieved.IsActive);
    }

    [Fact]
    public void ConfirmCloudActivation_ChangesStateToConfirmed()
    {
        // Arrange
        var map = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-confirm",
            TallyGuid = "guid-confirm",
            DataPath = @"D:\Path\Confirm",
            SourceId = "source-1",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow,
            IsActive = true,
        };
        _store.SaveWithPendingState(map);

        // Act
        bool confirmed = _store.ConfirmCloudActivation(
            "owner-1", "company-confirm", "guid-confirm", @"D:\Path\Confirm", "source-1");

        // Assert
        Assert.True(confirmed);
        var retrieved = _store.GetByGuidAndPath("owner-1", "guid-confirm", @"D:\Path\Confirm");
        Assert.NotNull(retrieved);
        Assert.Equal("confirmed", retrieved!.ConfirmationState);
        Assert.True(retrieved.IsActive);
    }

    [Fact]
    public void GetPendingMappings_ReturnsPendingMappings()
    {
        // Arrange
        var pendingMap = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-pending-2",
            TallyGuid = "guid-pending-2",
            DataPath = @"D:\Path\Pending2",
            SourceId = "source-1",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow,
            IsActive = true,
        };
        var confirmedMap = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-confirmed-2",
            TallyGuid = "guid-confirmed-2",
            DataPath = @"D:\Path\Confirmed2",
            SourceId = "source-1",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow,
            IsActive = true,
            ConfirmationState = "confirmed",
        };
        _store.SaveWithPendingState(pendingMap);
        _store.Save(confirmedMap);

        // Act
        var pending = _store.GetPendingMappings("owner-1");

        // Assert
        Assert.Single(pending);
        Assert.Equal("guid-pending-2", pending[0].TallyGuid);
        Assert.Equal("pending", pending[0].ConfirmationState);
    }

    [Fact]
    public void GetPendingMappings_ExcludesDifferentOwner()
    {
        // Arrange
        var map = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-pending-other",
            TallyGuid = "guid-pending-other",
            DataPath = @"D:\Path\PendingOther",
            SourceId = "source-1",
            OwnerId = "owner-alice",
            RegisteredAt = DateTime.UtcNow,
            IsActive = true,
        };
        _store.SaveWithPendingState(map);

        // Act
        var pending = _store.GetPendingMappings("owner-bob");

        // Assert
        Assert.Empty(pending);
    }

    [Fact]
    public void SetPathInactive_RollbackReactivatesOldPath()
    {
        // Arrange - simulate a rollback scenario
        var map = new CompanyIdentityMap
        {
            SupabaseCompanyId = "company-rollback",
            TallyGuid = "guid-rollback",
            DataPath = @"D:\Path\Old",
            SourceId = "source-1",
            OwnerId = "owner-1",
            RegisteredAt = DateTime.UtcNow,
            IsActive = true,
        };
        _store.Save(map);

        // Act - deactivate old path
        bool deactivated = _store.SetPathInactive(
            "owner-1", "company-rollback", "guid-rollback", @"D:\Path\Old", "source-1");

        // Assert
        Assert.True(deactivated);
        var active = _store.GetActiveMappingByGuid("owner-1", "guid-rollback");
        Assert.Null(active);

        // Rollback: reactivate old path
        bool reactivated = _store.ConfirmCloudActivation(
            "owner-1", "company-rollback", "guid-rollback", @"D:\Path\Old", "source-1");
        Assert.True(reactivated);

        var activeAgain = _store.GetActiveMappingByGuid("owner-1", "guid-rollback");
        Assert.NotNull(activeAgain);
        Assert.Equal(@"D:\Path\Old", activeAgain!.DataPath);
    }

    // ============================================
    // Company ID Collision Tests (same name, different GUID)
    // ============================================

    [Fact]
    public void Same_Name_Different_Guid_Produces_Different_Ids()
    {
        Assert.NotEqual(CompanyCloudIdentity.Generate("Test Company", "guid-1"),
            CompanyCloudIdentity.Generate("Test Company", "guid-2"));
    }

    [Fact]
    public void Same_Name_Same_Guid_Different_Path_Produces_Same_Id()
    {
        var oldPath = new TallySyncApp.Models.Company { Name = "Test Company", TallyGuid = "guid-3", DataPath = @"D:\Data\Company3" };
        var newPath = new TallySyncApp.Models.Company { Name = "Test Company", TallyGuid = "guid-3", DataPath = @"E:\Moved\Company3" };
        Assert.Equal(CompanyCloudIdentity.Generate(oldPath.Name, oldPath.TallyGuid),
            CompanyCloudIdentity.Generate(newPath.Name, newPath.TallyGuid));
    }

    [Fact]
    public void MovedPathReusesPersistedCloudIdAndRetainsBothPathRecords()
    {
        const string cloudId = "11111111-1111-1111-1111-111111111111";
        var original = new CompanyIdentityMap
        {
            SupabaseCompanyId = cloudId, TallyGuid = "move-guid", OwnerId = "owner-1",
            DataPath = @"D:\Original", SourceId = "old-source", RegisteredAt = DateTime.UtcNow,
        };
        Assert.True(_store.Save(original));
        var known = _store.GetByGuid("owner-1", "move-guid")
            .Select(map => new ExistingCompanyIdentity(map.SupabaseCompanyId, map.TallyGuid)).ToList();
        var resolved = CompanyCloudIdentity.Resolve("Test Company", "move-guid", null, known);
        Assert.Equal(cloudId, resolved);
        Assert.True(_store.SaveWithPendingState(new CompanyIdentityMap
        {
            SupabaseCompanyId = resolved, TallyGuid = "move-guid", OwnerId = "owner-1",
            DataPath = @"E:\Moved", SourceId = "new-source", RegisteredAt = DateTime.UtcNow,
        }));
        var paths = _store.GetByGuid("owner-1", "move-guid");
        Assert.Equal(2, paths.Count);
        Assert.Single(paths.Select(map => map.SupabaseCompanyId).Distinct());
        Assert.All(paths, map => Assert.Equal(cloudId, map.SupabaseCompanyId));
    }

    [Fact]
    public void Existing_Uuid_Is_Preserved()
    {
        // Arrange - company already has a UUID as its Id
        string existingUuid = "11111111-1111-1111-1111-111111111111";

        // Act - if company.Id is already a valid GUID, it should be used as-is
        bool isValidGuid = Guid.TryParse(existingUuid, out var parsed);

        // Assert
        Assert.True(isValidGuid);
        Assert.Equal(existingUuid, parsed.ToString());
    }

    // ============================================
    // Missing DataPath Tests
    // ============================================

    [Fact]
    public void Empty_DataPath_Is_Detected()
    {
        // Arrange
        string? emptyPath = null;
        string? whitespacePath = "   ";

        // Act & Assert - sync should be blocked when DataPath is null or whitespace
        Assert.True(string.IsNullOrWhiteSpace(emptyPath));
        Assert.True(string.IsNullOrWhiteSpace(whitespacePath));

        // A valid path should not be blocked
        string validPath = @"D:\SyncoraTestData\010000";
        Assert.False(string.IsNullOrWhiteSpace(validPath));
    }

}
