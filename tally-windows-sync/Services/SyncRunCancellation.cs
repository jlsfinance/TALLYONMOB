using System.Threading;

namespace TallySyncApp.Services;

public static class SyncRunCancellation
{
    // Called under SyncManager's run lock, after verifying no earlier run is active.
    // Manual retry starts a fresh session; a stopped timer callback must stay stopped.
    public static CancellationTokenSource? Prepare(CancellationTokenSource? previous, bool isManual)
    {
        if (previous == null) return new CancellationTokenSource();
        if (!previous.IsCancellationRequested) return previous;
        if (!isManual) return null;
        previous.Dispose();
        return new CancellationTokenSource();
    }
}
