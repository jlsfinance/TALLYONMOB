using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using TallySyncApp.Models;

namespace TallySyncApp.Services
{
    /// <summary>
    /// TelemetryService — queues <see cref="TelemetryEvent"/> objects and ships them to the
    /// app's OWN Supabase REST backend, using exactly the same request shape as
    /// <see cref="ApiClient"/> (PostgREST POST with <c>apikey</c> + Bearer header and the
    /// <c>Prefer: resolution=merge-duplicates,return=minimal</c> upsert header).
    ///
    /// The competitor (LiveKeeping Data Connector v3.2.1) shipped its activity/audit log over
    /// NLog UDP/TCP network targets to a proprietary host. This app does NOT invent a new
    /// protocol: telemetry is a normal row insert into the existing Supabase project, so the
    /// parent agent only has to create one table.
    ///
    /// HARD GUARANTEES
    ///   * Telemetry can never throw into the caller — every public entry point swallows its
    ///     own exceptions.
    ///   * Telemetry can never block syncing — all network work happens on a background timer
    ///     thread, and <see cref="Track(TelemetryEvent)"/> only touches an in-memory queue.
    ///
    /// WIRING (the parent agent must do this)
    ///   1. Construct with the backend URL + anon key from configuration:
    ///        var telemetry = new TelemetryService(supabaseUrl, apiKey, () => authService.GetAccessToken());
    ///   2. Turn it on:  telemetry.Enabled = true;   // defaults to OFF on purpose
    ///   3. telemetry.Start();  on app startup
    ///      telemetry.Stop();   on app exit
    ///   The Supabase URL / anon key MUST come from configuration — none are hardcoded here.
    /// </summary>
    public sealed class TelemetryService : IDisposable
    {
        private const int MaxSendAttempts = 3;          // first try + 2 retries
        private const int MaxOfflineReplay = 500;       // cap per replay so a huge backlog cannot stall a flush
        private const int MinBackoffMs = 1000;
        private const int MaxBackoffMs = 30000;

        private readonly HttpClient _httpClient;
        private readonly string _supabaseUrl;
        private readonly string _apiKey;
        private readonly string _table;
        private readonly int _capacity;
        private readonly string _offlineFilePath;

        private readonly ConcurrentQueue<TelemetryEvent> _queue = new();
        private readonly SemaphoreSlim _flushGate = new(1, 1);
        private readonly object _queueLock = new();

        private Func<string?>? _tokenProvider;
        private Timer? _timer;
        private int _offlineCount;
        private int _disposed;

        /// <summary>
        /// Master switch. Defaults to <c>false</c>: nothing is queued, flushed or persisted
        /// until the host sets it to <c>true</c> after supplying the backend URL/key.
        /// Setting it false stops all network activity immediately.
        /// </summary>
        public bool Enabled { get; set; }

        /// <summary>Interval between background flush attempts, in milliseconds.</summary>
        public int FlushIntervalMs { get; set; } = 30000;

        /// <summary>Absolute path of the JSONL offline fallback file.</summary>
        public string OfflineFilePath => _offlineFilePath;

        /// <summary>Total events not yet confirmed delivered (in-memory queue + offline file).</summary>
        public int PendingCount
        {
            get
            {
                int memory;
                lock (_queueLock)
                {
                    memory = _queue.Count;
                }
                return memory + _offlineCount;
            }
        }

        /// <summary>Raised for internal diagnostics only — never throws and never blocks callers.</summary>
        public event EventHandler<string>? Diagnostics;

        /// <summary>
        /// Creates the telemetry service.
        /// </summary>
        /// <param name="supabaseUrl">Supabase project URL, e.g. "https://&lt;ref&gt;.supabase.co". From configuration.</param>
        /// <param name="apiKey">Supabase anon key. From configuration.</param>
        /// <param name="bearerToken">
        /// Optional static Bearer token. Prefer <see cref="SetTokenProvider(Func{string})"/> so the
        /// token can be refreshed; a static token is used as-is.
        /// </param>
        /// <param name="table">PostgREST table that receives the events. Defaults to "telemetry_events".</param>
        /// <param name="capacity">Bound on the in-memory queue; oldest events are dropped when full.</param>
        /// <param name="timeoutSeconds">Per-request HTTP timeout. Short by design so an offline host cannot stall a flush.</param>
        /// <param name="logDirectory">Directory for the offline JSONL file. Defaults to "&lt;appdir&gt;/logs".</param>
        public TelemetryService(
            string supabaseUrl,
            string apiKey,
            string? bearerToken = null,
            string table = "telemetry_events",
            int capacity = 1000,
            int timeoutSeconds = 10,
            string? logDirectory = null)
        {
            _supabaseUrl = (supabaseUrl ?? string.Empty).Trim().TrimEnd('/');
            _apiKey = apiKey ?? string.Empty;
            _table = string.IsNullOrWhiteSpace(table) ? "telemetry_events" : table.Trim();
            _capacity = capacity > 0 ? capacity : 1000;

            if (!string.IsNullOrEmpty(bearerToken))
            {
                var captured = bearerToken;
                _tokenProvider = () => captured;
            }

            var dir = logDirectory ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs");
            try
            {
                Directory.CreateDirectory(dir);
            }
            catch
            {
                // A read-only install directory must not break the app; the offline fallback
                // simply becomes unavailable and events stay in memory.
            }
            _offlineFilePath = Path.Combine(dir, "telemetry_offline.jsonl");

            var handler = new HttpClientHandler { UseProxy = false };
            _httpClient = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(timeoutSeconds > 0 ? timeoutSeconds : 10)
            };
            _httpClient.DefaultRequestHeaders.Add("apikey", _apiKey);
            _httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            _offlineCount = CountOffline();
        }

        /// <summary>
        /// Supplies a live Bearer-token provider (e.g. <c>() =&gt; authService.GetAccessToken()</c>).
        /// Called once per send attempt, so a refreshed token is picked up automatically.
        /// </summary>
        public void SetTokenProvider(Func<string?>? tokenProvider)
        {
            _tokenProvider = tokenProvider;
        }

        /// <summary>
        /// Starts the background flush timer. Safe to call more than once.
        /// Does nothing while <see cref="Enabled"/> is false — flushes are then no-ops.
        /// </summary>
        public void Start()
        {
            if (_disposed != 0) return;
            if (_timer != null) return;

            var interval = FlushIntervalMs > 0 ? FlushIntervalMs : 30000;
            _timer = new Timer(
                _ => { _ = FlushAsync(CancellationToken.None); },
                null,
                interval,
                interval);
        }

        /// <summary>
        /// Stops the timer and makes one best-effort, bounded final flush.
        /// Never throws; never blocks longer than a few seconds.
        /// </summary>
        public void Stop()
        {
            try
            {
                _timer?.Change(Timeout.Infinite, Timeout.Infinite);
            }
            catch
            {
                // ignore
            }

            try
            {
                Task.Run(() => FlushAsync(CancellationToken.None)).Wait(TimeSpan.FromSeconds(5));
            }
            catch
            {
                // ignore — shutdown must never fail because of telemetry
            }
        }

        // -----------------------------------------------------------------------
        // Tracking API
        // -----------------------------------------------------------------------

        /// <summary>
        /// Enqueues an event. Never throws and never performs I/O. When the queue is full the
        /// oldest event is dropped so telemetry can never exhaust memory.
        /// </summary>
        public void Track(TelemetryEvent? evt)
        {
            try
            {
                if (evt == null || !Enabled || _disposed != 0) return;
                if (evt.createdAt == default) evt.createdAt = DateTime.UtcNow;
                Enqueue(evt);
            }
            catch
            {
                // telemetry must never affect the caller
            }
        }

        /// <summary>
        /// Convenience overload: build and enqueue an event in one call. All parameters except
        /// <paramref name="msg"/> are optional, so <c>Track("sync_started")</c> and
        /// <c>Track("sync_failed", description: ex.Message, level: TelemetryLevel.Error)</c> both work.
        /// </summary>
        public void Track(
            string msg,
            string? userId = null,
            string? description = null,
            TelemetryLevel level = TelemetryLevel.Info,
            string? companyId = null,
            string? eventType = null,
            string? requestFrom = null)
        {
            Track(new TelemetryEvent
            {
                msg = msg,
                userId = userId,
                description = description,
                level = level,
                companyId = companyId,
                eventType = eventType,
                requestFrom = requestFrom
            });
        }

        /// <summary>
        /// Convenience overload for a plain message + description. Named differently from
        /// <see cref="Track"/> on purpose so <c>Track("msg", "desc")</c> stays unambiguous.
        /// </summary>
        public void TrackInfo(string msg, string? description = null, TelemetryLevel level = TelemetryLevel.Info)
        {
            Track(new TelemetryEvent { msg = msg, description = description, level = level });
        }

        /// <summary>Convenience overload that captures an exception's type and message.</summary>
        public void TrackError(string msg, Exception? ex, string? companyId = null, string? requestFrom = null)
        {
            Track(new TelemetryEvent
            {
                msg = msg,
                description = ex?.Message,
                level = TelemetryLevel.Error,
                companyId = companyId,
                requestFrom = requestFrom,
                eventType = "error",
                data = ex == null ? null : new Dictionary<string, object?>
                {
                    ["exceptionType"] = ex.GetType().FullName,
                    ["stackTrace"] = ex.StackTrace
                }
            });
        }

        // -----------------------------------------------------------------------
        // Flushing
        // -----------------------------------------------------------------------

        /// <summary>
        /// Attempts to deliver everything pending: the persisted offline backlog first, then the
        /// in-memory queue. Retries with exponential backoff. On failure the entire unsent set is
        /// written to the offline JSONL file so it survives a crash/restart.
        /// </summary>
        /// <returns><c>true</c> when the whole batch was accepted by the backend.</returns>
        public async Task<bool> FlushAsync(CancellationToken ct = default)
        {
            try
            {
                if (_disposed != 0) return false;

                // WaitAsync(0) => if another flush is in flight we simply skip this tick.
                if (!await _flushGate.WaitAsync(0, ct).ConfigureAwait(false))
                {
                    return false;
                }

                try
                {
                    var offline = ReadOfflineEvents();
                    var fresh = DrainQueue();

                    var batch = new List<TelemetryEvent>(offline.Count + fresh.Count);
                    batch.AddRange(offline);
                    batch.AddRange(fresh);

                    if (batch.Count == 0) return true;

                    if (await SendBatchAsync(batch, ct).ConfigureAwait(false))
                    {
                        ClearOfflineFile();
                        return true;
                    }

                    // Persist the whole unsent set (overwrites the previous file contents, so
                    // there is exactly one copy of each event).
                    WriteOffline(batch);
                    return false;
                }
                finally
                {
                    _flushGate.Release();
                }
            }
            catch (Exception ex)
            {
                // Hard guarantee: telemetry never throws into the caller, including when the
                // supplied token is already cancelled.
                RaiseDiagnostics($"telemetry flush error: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// POSTs the batch to PostgREST with the same headers <see cref="ApiClient"/> uses.
        /// Retries up to <see cref="MaxSendAttempts"/> times with exponential backoff.
        /// </summary>
        private async Task<bool> SendBatchAsync(IReadOnlyList<TelemetryEvent> batch, CancellationToken ct)
        {
            for (int attempt = 0; attempt < MaxSendAttempts; attempt++)
            {
                if (ct.IsCancellationRequested) return false;

                try
                {
                    var json = JsonConvert.SerializeObject(batch, new JsonSerializerSettings
                    {
                        NullValueHandling = NullValueHandling.Ignore,
                        DateFormatString = "yyyy-MM-ddTHH:mm:ssZ"
                    });

                    using var content = new StringContent(json, Encoding.UTF8, "application/json");
                    content.Headers.Add("Prefer", "resolution=merge-duplicates,return=minimal");

                    using var request = new HttpRequestMessage(
                        HttpMethod.Post,
                        $"{_supabaseUrl}/rest/v1/{Uri.EscapeDataString(_table)}")
                    {
                        Content = content
                    };

                    var token = _tokenProvider?.Invoke();
                    request.Headers.Authorization = new AuthenticationHeaderValue(
                        "Bearer",
                        !string.IsNullOrWhiteSpace(token) ? token! : _apiKey);

                    using var response = await _httpClient.SendAsync(request, ct).ConfigureAwait(false);
                    if (response.IsSuccessStatusCode) return true;

                    RaiseDiagnostics($"telemetry HTTP {(int)response.StatusCode} ({_table}) attempt {attempt + 1}/{MaxSendAttempts}");
                }
                catch (Exception ex)
                {
                    // HttpClient's timeout surfaces as TaskCanceledException, which derives from
                    // OperationCanceledException but is NOT a caller cancellation — treat it as a
                    // normal send failure so an offline host is retried and then persisted.
                    if (ct.IsCancellationRequested) return false;
                    RaiseDiagnostics($"telemetry send failed attempt {attempt + 1}/{MaxSendAttempts}: {ex.Message}");
                }

                if (attempt < MaxSendAttempts - 1)
                {
                    try
                    {
                        await Task.Delay(BackoffMs(attempt), ct).ConfigureAwait(false);
                    }
                    catch (Exception ex) when (ex is OperationCanceledException)
                    {
                        return false;
                    }
                }
            }

            return false;
        }

        private static int BackoffMs(int attempt)
        {
            var ms = MinBackoffMs * (int)Math.Pow(2, attempt);
            return Math.Min(ms, MaxBackoffMs);
        }

        // -----------------------------------------------------------------------
        // Queue helpers
        // -----------------------------------------------------------------------

        private void Enqueue(TelemetryEvent evt)
        {
            lock (_queueLock)
            {
                // Bounded queue: drop the oldest events rather than growing without limit.
                while (_queue.Count >= _capacity && _queue.TryDequeue(out _))
                {
                    // discard oldest
                }
                _queue.Enqueue(evt);
            }
        }

        private List<TelemetryEvent> DrainQueue()
        {
            var list = new List<TelemetryEvent>();
            while (_queue.TryDequeue(out var evt))
            {
                list.Add(evt);
            }
            return list;
        }

        // -----------------------------------------------------------------------
        // Offline JSONL fallback
        // -----------------------------------------------------------------------

        private List<TelemetryEvent> ReadOfflineEvents()
        {
            var result = new List<TelemetryEvent>();
            try
            {
                if (!File.Exists(_offlineFilePath)) return result;

                foreach (var line in File.ReadLines(_offlineFilePath))
                {
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    try
                    {
                        var evt = JsonConvert.DeserializeObject<TelemetryEvent>(line);
                        if (evt != null) result.Add(evt);
                    }
                    catch
                    {
                        // skip a corrupt line rather than poisoning the whole replay
                    }
                    if (result.Count >= MaxOfflineReplay) break;
                }
            }
            catch
            {
                // unreadable file => nothing to replay
            }

            _offlineCount = result.Count;
            return result;
        }

        private void WriteOffline(IReadOnlyList<TelemetryEvent> batch)
        {
            try
            {
                var dir = Path.GetDirectoryName(_offlineFilePath);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

                var temp = _offlineFilePath + ".tmp";
                var lines = batch
                    .Where(e => e != null)
                    .Select(e => JsonConvert.SerializeObject(e, new JsonSerializerSettings
                    {
                        NullValueHandling = NullValueHandling.Ignore,
                        DateFormatString = "yyyy-MM-ddTHH:mm:ssZ"
                    }))
                    .ToArray();

                File.WriteAllLines(temp, lines);
                File.Move(temp, _offlineFilePath, overwrite: true);

                _offlineCount = batch.Count;
            }
            catch
            {
                // If the file cannot be written the events stay in memory only; nothing throws.
            }
        }

        private void ClearOfflineFile()
        {
            try
            {
                if (File.Exists(_offlineFilePath)) File.Delete(_offlineFilePath);
            }
            catch
            {
                // ignore
            }
            _offlineCount = 0;
        }

        private int CountOffline()
        {
            try
            {
                if (!File.Exists(_offlineFilePath)) return 0;
                return File.ReadLines(_offlineFilePath).Count(l => !string.IsNullOrWhiteSpace(l));
            }
            catch
            {
                return 0;
            }
        }

        private void RaiseDiagnostics(string message)
        {
            try
            {
                Diagnostics?.Invoke(this, message);
            }
            catch
            {
                // a faulty subscriber must not break the flush loop
            }
        }

        // -----------------------------------------------------------------------
        // Configuration helper
        // -----------------------------------------------------------------------

        /// <summary>
        /// Builds a service from <c>appsettings.json</c> under a <c>TelemetrySettings</c> section:
        /// <code>
        /// "TelemetrySettings": {
        ///   "Enabled": true,
        ///   "SupabaseUrl": "https://....supabase.co",
        ///   "ApiKey": "anon-key",
        ///   "Table": "telemetry_events",
        ///   "Capacity": 1000,
        ///   "FlushIntervalSeconds": 30,
        ///   "TimeoutSeconds": 10
        /// }
        /// </code>
        /// Returns <c>null</c> when the URL or key is missing (telemetry stays disabled).
        /// The parent must still pass a live token provider via <see cref="SetTokenProvider(Func{string})"/>.
        /// </summary>
        public static TelemetryService? CreateFromConfig(
            Func<string?>? tokenProvider = null,
            string? settingsPath = null)
        {
            try
            {
                var path = settingsPath ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "appsettings.json");
                if (!File.Exists(path)) return null;

                using var doc = JsonDocument.Parse(File.ReadAllText(path));
                if (!doc.RootElement.TryGetProperty("TelemetrySettings", out var s)) return null;

                var url = ReadString(s, "SupabaseUrl");
                var key = ReadString(s, "ApiKey");
                if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(key)) return null;

                var capacity = ReadInt(s, "Capacity", 1000);
                var flushSeconds = ReadInt(s, "FlushIntervalSeconds", 30);
                var timeoutSeconds = ReadInt(s, "TimeoutSeconds", 10);

                var service = new TelemetryService(
                    url,
                    key,
                    table: ReadString(s, "Table") ?? "telemetry_events",
                    capacity: capacity,
                    timeoutSeconds: timeoutSeconds);

                service.Enabled = ReadBool(s, "Enabled", false);
                service.FlushIntervalMs = flushSeconds * 1000;
                service.SetTokenProvider(tokenProvider);
                return service;
            }
            catch
            {
                return null;
            }
        }

        private static string? ReadString(JsonElement el, string name)
        {
            if (el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String)
            {
                return v.GetString();
            }
            return null;
        }

        private static int ReadInt(JsonElement el, string name, int fallback)
        {
            if (el.TryGetProperty(name, out var v) &&
                (v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n)))
            {
                return n;
            }
            return fallback;
        }

        private static bool ReadBool(JsonElement el, string name, bool fallback)
        {
            if (el.TryGetProperty(name, out var v))
            {
                if (v.ValueKind == JsonValueKind.True) return true;
                if (v.ValueKind == JsonValueKind.False) return false;
            }
            return fallback;
        }

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0) return;

            try
            {
                _timer?.Dispose();
            }
            catch
            {
                // ignore
            }
            _timer = null;

            try
            {
                _flushGate.Dispose();
            }
            catch
            {
                // ignore
            }

            try
            {
                _httpClient.Dispose();
            }
            catch
            {
                // ignore
            }
        }
    }
}