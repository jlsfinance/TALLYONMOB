namespace TallySyncApp.Services;

// Extractor tests must not append simulated errors to the running connector's real log.
public static class SyncLogger
{
    public static void Log(string message) { }
}
