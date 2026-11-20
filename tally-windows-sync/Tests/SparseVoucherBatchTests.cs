using TallySyncApp.Services;

namespace TallySyncApp.Tests;

public class SparseVoucherBatchTests
{
    [Fact]
    public void SparseAlterIdsDoNotExpandIntoOneLargeTallyRange()
    {
        long[] ids = [99670, 99671, 99700, 101500, 101501, 105342];
        var batches = TallyFastExtractor.PlanAlterBatches(ids, 100).ToArray();
        Assert.Equal(3, batches.Length);
        Assert.Equal(ids, batches.SelectMany(batch => batch));
        Assert.All(batches, batch => Assert.InRange(batch.Last() - batch.First(), 0, 160));
    }
}
