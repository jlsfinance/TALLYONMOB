using TallySyncApp.Services;
using TallySyncApp.Models;
using Newtonsoft.Json;

namespace TallySyncApp.Tests;

public class VoucherBatchJournalTests
{
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task CloudHistoryCallbackRunsOnlyAfterDurableBatchCommit(bool uploadSucceeds)
    {
        var path = NewDatabase();
        using var journal = new VoucherBatchJournal(path);
        journal.EnsureCheckpoint("owner", "company", 10);
        journal.Enqueue("owner", "company", [Batch("batch", 20)]);
        var callbacks = 0;
        var replay = journal.ReplayAsync("owner", "company", (_, _) => uploadSucceeds
            ? Task.CompletedTask : Task.FromException(new IOException("upload failed")), default, _ =>
        {
            using var reopened = new VoucherBatchJournal(path);
            Assert.Equal(20, reopened.GetCheckpoint("owner", "company"));
            Assert.Null(reopened.GetNext("owner", "company"));
            callbacks++;
            return Task.CompletedTask;
        });
        if (uploadSucceeds) await replay;
        else await Assert.ThrowsAsync<IOException>(() => replay);
        Assert.Equal(uploadSucceeds ? 1 : 0, callbacks);
    }

    private static string NewDatabase() => Path.Combine(AppContext.BaseDirectory, "journal-test-data", Guid.NewGuid().ToString("N"), "resume.db");
    private static VoucherBatchPayload Batch(string key, long alter) => new($"{{\"voucher\":\"{key}\",\"items\":[1,2],\"ledger\":[3,4]}}", alter);

    [Theory]
    [InlineData("vouchers")]
    [InlineData("ledger_entries")]
    [InlineData("stock_entries")]
    [InlineData("sales")]
    [InlineData("sales_items")]
    [InlineData("purchases")]
    [InlineData("purchase_items")]
    [InlineData("allocations")]
    public async Task FailedStageSurvivesRestartAndIsRetriedBeforeLaterBatches(string failedStage)
    {
        var path = NewDatabase();
        var first = Batch("first", 200);
        var second = Batch("second", 300);
        string[] stages = ["vouchers", "ledger_entries", "stock_entries", "sales", "sales_items", "purchases", "purchase_items", "allocations"];
        var cloud = new Dictionary<string, string>();
        using (var journal = new VoucherBatchJournal(path))
        {
            journal.EnsureCheckpoint("owner", "company", 100);
            journal.Enqueue("owner", "company", [first, second]);
            await Assert.ThrowsAsync<IOException>(() => journal.ReplayAsync("owner", "company", (json, _) =>
            {
                Assert.Equal(first.Json, json);
                foreach (var stage in stages)
                {
                    if (stage == failedStage) throw new IOException("Network interrupted");
                    cloud[$"first/{stage}"] = json;
                }
                return Task.CompletedTask;
            }, default));
            Assert.Equal(100, journal.GetCheckpoint("owner", "company"));
        }

        using var restarted = new VoucherBatchJournal(path);
        // A higher cloud parent ALTERID must not overwrite the local completed checkpoint.
        restarted.EnsureCheckpoint("owner", "company", 9999);
        Assert.Equal(100, restarted.GetCheckpoint("owner", "company"));
        var replayed = new List<string>();
        await restarted.ReplayAsync("owner", "company", (json, _) =>
        {
            replayed.Add(json);
            var key = json == first.Json ? "first" : "second";
            foreach (var stage in stages) cloud[$"{key}/{stage}"] = json; // Idempotent upserts.
            return Task.CompletedTask;
        }, default);
        Assert.Equal(new[] { first.Json, second.Json }, replayed);
        Assert.Equal(stages.Length * 2, cloud.Count);
        Assert.Equal(300, restarted.GetCheckpoint("owner", "company"));
        Assert.Null(restarted.GetNext("owner", "company"));
        var extraCalls = 0;
        await restarted.ReplayAsync("owner", "company", (_, _) => { extraCalls++; return Task.CompletedTask; }, default);
        Assert.Equal(0, extraCalls);
    }

    [Fact]
    public async Task CheckpointDoesNotAdvanceWhileChildrenAreStillUploading()
    {
        using var journal = new VoucherBatchJournal(NewDatabase());
        journal.EnsureCheckpoint("owner", "company", 10);
        journal.Enqueue("owner", "company", [Batch("batch", 20)]);
        var uploadingChildren = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var completeChildren = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var task = journal.ReplayAsync("owner", "company", async (_, _) =>
        {
            uploadingChildren.SetResult();
            await completeChildren.Task;
        }, default);
        await uploadingChildren.Task;
        Assert.Equal(10, journal.GetCheckpoint("owner", "company"));
        Assert.NotNull(journal.GetNext("owner", "company"));
        completeChildren.SetResult();
        await task;
        Assert.Equal(20, journal.GetCheckpoint("owner", "company"));
        Assert.Null(journal.GetNext("owner", "company"));
    }

    [Fact]
    public async Task CancellationAfterCloudWriteBeforeCommitKeepsBatchForReplay()
    {
        var path = NewDatabase();
        using var cancellation = new CancellationTokenSource();
        using (var journal = new VoucherBatchJournal(path))
        {
            journal.EnsureCheckpoint("owner", "company", 10);
            journal.Enqueue("owner", "company", [Batch("batch", 20)]);
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => journal.ReplayAsync("owner", "company", (_, _) =>
            { cancellation.Cancel(); return Task.CompletedTask; }, cancellation.Token));
        }
        using var restarted = new VoucherBatchJournal(path);
        Assert.Equal(10, restarted.GetCheckpoint("owner", "company"));
        Assert.NotNull(restarted.GetNext("owner", "company"));
        await restarted.ReplayAsync("owner", "company", (_, _) => Task.CompletedTask, default);
        Assert.Equal(20, restarted.GetCheckpoint("owner", "company"));
    }

    [Fact]
    public async Task PendingPayloadBeforeFirstNetworkWriteSurvivesProcessRestart()
    {
        var path = NewDatabase();
        var payload = Batch("never-uploaded", 100);
        using (var journal = new VoucherBatchJournal(path))
        {
            journal.EnsureCheckpoint("owner", "company", 0);
            journal.Enqueue("owner", "company", [payload]);
        }
        using var restarted = new VoucherBatchJournal(path);
        Assert.Equal(payload.Json, restarted.GetNext("owner", "company")!.Json);
        await restarted.ReplayAsync("owner", "company", (_, _) => Task.CompletedTask, default);
        Assert.Equal(100, restarted.GetCheckpoint("owner", "company"));
    }

    [Fact]
    public async Task OwnerAndCompanyScopesCannotReplayEachOthersBatches()
    {
        using var journal = new VoucherBatchJournal(NewDatabase());
        foreach (var scope in new[] { ("a", "x"), ("a", "y"), ("b", "x") })
        {
            journal.EnsureCheckpoint(scope.Item1, scope.Item2, 0);
            journal.Enqueue(scope.Item1, scope.Item2, [Batch(scope.Item1 + scope.Item2, 50)]);
        }
        await journal.ReplayAsync("a", "x", (json, _) => { Assert.Contains("ax", json); return Task.CompletedTask; }, default);
        Assert.Equal(50, journal.GetCheckpoint("a", "x"));
        Assert.Equal(0, journal.GetCheckpoint("a", "y"));
        Assert.Equal(0, journal.GetCheckpoint("b", "x"));
        Assert.NotNull(journal.GetNext("a", "y"));
        Assert.NotNull(journal.GetNext("b", "x"));
    }

    [Fact]
    public void InvalidMultiBatchScheduleIsRolledBackBeforeAnyCloudWrite()
    {
        using var journal = new VoucherBatchJournal(NewDatabase());
        journal.EnsureCheckpoint("owner", "company", 10);
        Assert.Throws<ArgumentException>(() => journal.Enqueue("owner", "company", [Batch("good", 20), Batch("bad", 0)]));
        Assert.Null(journal.GetNext("owner", "company"));
        Assert.Equal(10, journal.GetCheckpoint("owner", "company"));
    }

    [Fact]
    public async Task RetryingMoreThanFiveTimesDoesNotDiscardPendingBatch()
    {
        using var journal = new VoucherBatchJournal(NewDatabase());
        journal.EnsureCheckpoint("owner", "company", 0);
        journal.Enqueue("owner", "company", [Batch("first", 100)]);
        for (var attempt = 0; attempt < 7; attempt++)
            await Assert.ThrowsAsync<IOException>(() => journal.ReplayAsync("owner", "company", (_, _) => throw new IOException("offline"), default));
        Assert.NotNull(journal.GetNext("owner", "company"));
        Assert.Equal(0, journal.GetCheckpoint("owner", "company"));
    }

    [Fact]
    public async Task BackfillOfOlderBatchDoesNotMoveCheckpointBackwards()
    {
        using var journal = new VoucherBatchJournal(NewDatabase());
        journal.EnsureCheckpoint("owner", "company", 500);
        journal.Enqueue("owner", "company", [Batch("repair", 100)]);
        await journal.ReplayAsync("owner", "company", (_, _) => Task.CompletedTask, default);
        Assert.Equal(500, journal.GetCheckpoint("owner", "company"));
    }

    [Fact]
    public async Task RealVoucherSnapshotPreservesItemsLedgersAndIgnoredAllocationsAcrossRestart()
    {
        var voucher = new Voucher
        {
            VoucherId = "stable-guid", AlterId = "250", VoucherType = "Sales", VoucherNumber = "INV-1",
            LedgerEntries = [new VoucherLedgerEntry
            {
                LedgerName = "Customer", Amount = 159.75m,
                BillAllocations = [new BillAllocation { Name = "INV-1", Amount = 159.75m, BillType = "New Ref" }],
                BankAllocations = [new BankAllocation { BankName = "Bank", InstrumentNumber = "UTR-1", Amount = 159.75m }],
            }],
            InventoryEntries = [new VoucherInventoryEntry { StockItemName = "Item", Quantity = 2, Rate = 79.875m, Amount = 159.75m }],
        };
        // Normal cloud serialization must continue to exclude separately uploaded allocations.
        Assert.DoesNotContain("UTR-1", JsonConvert.SerializeObject(voucher));
        var path = NewDatabase();
        using (var journal = new VoucherBatchJournal(path))
        {
            journal.EnsureCheckpoint("owner", "company", 0);
            journal.Enqueue("owner", "company", [new VoucherBatchPayload(VoucherBatchPayloadCodec.Serialize([voucher]), 250)]);
        }
        using var restarted = new VoucherBatchJournal(path);
        await restarted.ReplayAsync("owner", "company", (json, _) =>
        {
            var restored = Assert.Single(VoucherBatchPayloadCodec.Deserialize(json));
            Assert.Equal("stable-guid", restored.VoucherId);
            Assert.Equal("250", restored.AlterId);
            Assert.Equal(159.75m, Assert.Single(restored.InventoryEntries).Amount);
            var ledger = Assert.Single(restored.LedgerEntries);
            Assert.Equal("INV-1", Assert.Single(ledger.BillAllocations).Name);
            Assert.Equal("UTR-1", Assert.Single(ledger.BankAllocations).InstrumentNumber);
            Assert.Equal(159.75m, ledger.Amount);
            return Task.CompletedTask;
        }, default);
        Assert.Equal(250, restarted.GetCheckpoint("owner", "company"));
    }
}
