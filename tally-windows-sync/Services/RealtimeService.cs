using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNet.SignalR.Client;
using Microsoft.AspNet.SignalR.Client.Hubs;

namespace TallySyncApp.Services
{
    /// <summary>Connection lifecycle state exposed by <see cref="RealtimeService"/>.</summary>
    public enum RealtimeConnectionState
    {
        Disconnected,
        Connecting,
        Connected,
        Reconnecting
    }

    /// <summary>Payload of <see cref="RealtimeService.StateChanged"/>.</summary>
    public sealed class RealtimeConnectionStateChangedEventArgs : EventArgs
    {
        public RealtimeConnectionState OldState { get; }
        public RealtimeConnectionState NewState { get; }

        public RealtimeConnectionStateChangedEventArgs(
            RealtimeConnectionState oldState,
            RealtimeConnectionState newState)
        {
            OldState = oldState;
            NewState = newState;
        }
    }

    /// <summary>
    /// RealtimeService — a SignalR client that keeps a duplex connection to the backend hub so
    /// the server can push commands to the desktop app (force-sync-now, refresh-config,
    /// show-message, ...).
    ///
    /// The competitor (LiveKeeping Data Connector v3.2.1) used
    /// Microsoft.AspNet.SignalR.Client for exactly this. This app uses the same library, but the
    /// hub URL is NOT hardcoded: it comes from configuration. Until the parent supplies it the
    /// service refuses to connect instead of guessing a host.
    ///
    ///   TODO (parent agent): set RealtimeSettings:HubUrl in appsettings.json to the real hub
    ///   endpoint, e.g. "https://&lt;ref&gt;.supabase.co/realtime/v1/hub" or the app's own hub.
    ///   Until then CreateFromConfig() returns null and the app stays on timer polling.
    ///
    /// The service owns connection lifecycle only. What a pushed command DOES is decided by the
    /// parent through <see cref="RegisterHandler(string, Action)"/> and its generic overloads.
    /// </summary>
    public sealed class RealtimeService : IDisposable
    {
        private const int MinReconnectDelayMs = 1000;
        private const int MaxReconnectDelayMs = 60000;

        private readonly string _hubUrl;
        private readonly string _hubName;
        private readonly Func<string?>? _tokenProvider;

        private readonly List<Action<IHubProxy>> _registrations = new();
        private readonly object _syncRoot = new();
        private readonly Timer? _reconnectTimer;

        private HubConnection? _connection;
        private IHubProxy? _proxy;
        private RealtimeConnectionState _state = RealtimeConnectionState.Disconnected;
        private int _reconnectAttempt;
        private bool _started;
        private int _disposed;

        /// <summary>Current connection state. Changes raise <see cref="StateChanged"/>.</summary>
        public RealtimeConnectionState State
        {
            get => _state;
            private set
            {
                if (_state == value) return;
                var old = _state;
                _state = value;
                RaiseStateChanged(old, value);
            }
        }

        /// <summary>True once the connection has been established at least once.</summary>
        public bool IsConnected => State == RealtimeConnectionState.Connected;

        /// <summary>SignalR connection id assigned by the server, when connected.</summary>
        public string? ConnectionId => _connection?.ConnectionId;

        /// <summary>Raised on every state transition.</summary>
        public event EventHandler<RealtimeConnectionStateChangedEventArgs>? StateChanged;

        /// <summary>Raised when the transport reports an error. Never throws.</summary>
        public event EventHandler<Exception>? ConnectionError;

        /// <summary>Raised for internal diagnostics. Never throws.</summary>
        public event EventHandler<string>? Diagnostics;

        /// <summary>
        /// Creates the realtime service.
        /// </summary>
        /// <param name="hubUrl">Full hub URL. From configuration — never hardcoded.</param>
        /// <param name="hubName">Hub name passed to <c>CreateHubProxy</c>. Defaults to "tallylink".</param>
        /// <param name="tokenProvider">
        /// Optional provider returning a Bearer/access token that is appended to the hub URL as
        /// <c>access_token</c>. Called before every connect attempt so a refreshed token is used.
        /// </param>
        /// <param name="autoStart">When true, <see cref="Start"/> is called from the constructor.</param>
        public RealtimeService(
            string hubUrl,
            string hubName = "tallylink",
            Func<string?>? tokenProvider = null,
            bool autoStart = false)
        {
            _hubUrl = (hubUrl ?? string.Empty).Trim().TrimEnd('/');
            _hubName = string.IsNullOrWhiteSpace(hubName) ? "tallylink" : hubName.Trim();
            _tokenProvider = tokenProvider;

            _reconnectTimer = new Timer(
                _ => { _ = ConnectAsync(); },
                null,
                Timeout.Infinite,
                Timeout.Infinite);

            if (autoStart)
            {
                Start();
            }
        }

        // -----------------------------------------------------------------------
        // Lifecycle
        // -----------------------------------------------------------------------

        /// <summary>
        /// Starts connecting. Safe to call repeatedly. Does nothing when no hub URL is configured.
        /// </summary>
        public void Start()
        {
            if (_disposed != 0) return;
            if (string.IsNullOrWhiteSpace(_hubUrl))
            {
                RaiseDiagnostics("RealtimeService: no hub URL configured — realtime is disabled.");
                return;
            }

            lock (_syncRoot)
            {
                _started = true;
            }

            _ = ConnectAsync();
        }

        /// <summary>
        /// Stops the connection and cancels any pending reconnect. Safe to call repeatedly.
        /// </summary>
        public void Stop()
        {
            lock (_syncRoot)
            {
                _started = false;
            }

            try
            {
                _reconnectTimer?.Change(Timeout.Infinite, Timeout.Infinite);
            }
            catch
            {
                // ignore
            }

            var connection = _connection;
            _connection = null;
            _proxy = null;

            if (connection != null)
            {
                try
                {
                    connection.StateChanged -= OnConnectionStateChanged;
                    connection.Closed -= OnConnectionClosed;
                    connection.Error -= OnConnectionError;
                    connection.Stop(TimeSpan.FromSeconds(2));
                }
                catch
                {
                    // ignore
                }

                try
                {
                    connection.Dispose();
                }
                catch
                {
                    // ignore
                }
            }

            State = RealtimeConnectionState.Disconnected;
            _reconnectAttempt = 0;
        }

        /// <summary>
        /// Builds the connection, wires events and waits for it to come up. Re-registers all
        /// handlers on every attempt so a reconnect does not lose subscriptions.
        /// </summary>
        private async Task ConnectAsync()
        {
            if (_disposed != 0) return;

            bool shouldRun;
            lock (_syncRoot)
            {
                shouldRun = _started;
            }

            if (!shouldRun) return;

            State = _reconnectAttempt > 0
                ? RealtimeConnectionState.Reconnecting
                : RealtimeConnectionState.Connecting;

            try
            {
                var connection = BuildConnection();
                var proxy = connection.CreateHubProxy(_hubName);

                // Re-apply registrations captured through RegisterHandler.
                foreach (var register in _registrations)
                {
                    try
                    {
                        register(proxy);
                    }
                    catch (Exception ex)
                    {
                        RaiseDiagnostics($"RealtimeService: handler registration failed: {ex.Message}");
                    }
                }

                lock (_syncRoot)
                {
                    if (!_started) return;
                    _connection = connection;
                    _proxy = proxy;
                }

                await connection.Start().ConfigureAwait(false);

                if (_disposed != 0) return;

                _reconnectAttempt = 0;
                State = RealtimeConnectionState.Connected;
                RaiseDiagnostics("RealtimeService: connected to hub.");
            }
            catch (Exception ex)
            {
                RaiseConnectionError(ex);
                ScheduleReconnect();
            }
        }

        private HubConnection BuildConnection()
        {
            var url = _hubUrl;
            var token = _tokenProvider?.Invoke();
            if (!string.IsNullOrWhiteSpace(token))
            {
                var separator = url.Contains('?') ? '&' : '?';
                url = $"{url}{separator}access_token={Uri.EscapeDataString(token)}";
            }

            var connection = new HubConnection(url);
            connection.StateChanged += OnConnectionStateChanged;
            connection.Closed += OnConnectionClosed;
            connection.Error += OnConnectionError;
            return connection;
        }

        private void OnConnectionStateChanged(StateChange change)
        {
            try
            {
                switch (change.NewState)
                {
                    case Microsoft.AspNet.SignalR.Client.ConnectionState.Connecting:
                        State = RealtimeConnectionState.Connecting;
                        break;
                    case Microsoft.AspNet.SignalR.Client.ConnectionState.Connected:
                        _reconnectAttempt = 0;
                        State = RealtimeConnectionState.Connected;
                        break;
                    case Microsoft.AspNet.SignalR.Client.ConnectionState.Reconnecting:
                        State = RealtimeConnectionState.Reconnecting;
                        break;
                    case Microsoft.AspNet.SignalR.Client.ConnectionState.Disconnected:
                        State = RealtimeConnectionState.Disconnected;
                        break;
                }
            }
            catch
            {
                // state changes must never throw
            }
        }

        private void OnConnectionClosed()
        {
            try
            {
                State = RealtimeConnectionState.Disconnected;
                ScheduleReconnect();
            }
            catch
            {
                // ignore
            }
        }

        private void OnConnectionError(Exception error)
        {
            RaiseConnectionError(error);
        }

        /// <summary>Exponential backoff, 1s → 2s → 4s ... capped at 60s.</summary>
        private void ScheduleReconnect()
        {
            if (_disposed != 0) return;

            bool shouldRun;
            lock (_syncRoot)
            {
                shouldRun = _started;
            }

            if (!shouldRun) return;

            var attempt = _reconnectAttempt++;
            var delay = MinReconnectDelayMs * (int)Math.Pow(2, attempt);
            if (delay > MaxReconnectDelayMs) delay = MaxReconnectDelayMs;

            try
            {
                _reconnectTimer?.Change(delay, Timeout.Infinite);
            }
            catch
            {
                // ignore
            }
        }

        // -----------------------------------------------------------------------
        // Messaging
        // -----------------------------------------------------------------------

        /// <summary>
        /// Invokes a server-side hub method. Returns false when not connected — never throws.
        /// </summary>
        public async Task<bool> SendAsync(string method, params object?[]? args)
        {
            try
            {
                var proxy = _proxy;
                if (proxy == null || State != RealtimeConnectionState.Connected)
                {
                    return false;
                }

                await proxy.Invoke(method, args ?? Array.Empty<object?>()).ConfigureAwait(false);
                return true;
            }
            catch (Exception ex)
            {
                RaiseConnectionError(ex);
                return false;
            }
        }

        /// <summary>Registers a handler for a server-pushed command with no arguments.</summary>
        public void RegisterHandler(string methodName, Action handler)
        {
            if (string.IsNullOrWhiteSpace(methodName) || handler == null) return;

            lock (_registrations)
            {
                _registrations.Add(proxy => proxy.On(methodName, handler));
            }

            // Apply immediately when already connected.
            try
            {
                _proxy?.On(methodName, handler);
            }
            catch (Exception ex)
            {
                RaiseDiagnostics($"RealtimeService: RegisterHandler('{methodName}') failed: {ex.Message}");
            }
        }

        /// <summary>Registers a handler for a server-pushed command with one argument.</summary>
        public void RegisterHandler<T>(string methodName, Action<T> handler)
        {
            if (string.IsNullOrWhiteSpace(methodName) || handler == null) return;

            lock (_registrations)
            {
                _registrations.Add(proxy => proxy.On(methodName, handler));
            }

            try
            {
                _proxy?.On(methodName, handler);
            }
            catch (Exception ex)
            {
                RaiseDiagnostics($"RealtimeService: RegisterHandler('{methodName}') failed: {ex.Message}");
            }
        }

        /// <summary>Registers a handler for a server-pushed command with two arguments.</summary>
        public void RegisterHandler<T1, T2>(string methodName, Action<T1, T2> handler)
        {
            if (string.IsNullOrWhiteSpace(methodName) || handler == null) return;

            lock (_registrations)
            {
                _registrations.Add(proxy => proxy.On(methodName, handler));
            }

            try
            {
                _proxy?.On(methodName, handler);
            }
            catch (Exception ex)
            {
                RaiseDiagnostics($"RealtimeService: RegisterHandler('{methodName}') failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Registers a catch-all handler for a command that arrives as a raw argument array
        /// (SignalR's non-generic <c>On</c>).
        /// </summary>
        public void RegisterHandler(string methodName, Action<object?[]> handler)
        {
            if (string.IsNullOrWhiteSpace(methodName) || handler == null) return;

            // Wrap in a lambda so the non-generic SignalR overload (Action<object[]>) is used
            // without a nullable-annotation mismatch.
            Action<object[]> bridge = args => handler(args);

            lock (_registrations)
            {
                _registrations.Add(proxy => proxy.On(methodName, bridge));
            }

            try
            {
                _proxy?.On(methodName, bridge);
            }
            catch (Exception ex)
            {
                RaiseDiagnostics($"RealtimeService: RegisterHandler('{methodName}') failed: {ex.Message}");
            }
        }

        // -----------------------------------------------------------------------
        // Events
        // -----------------------------------------------------------------------

        private void RaiseStateChanged(RealtimeConnectionState oldState, RealtimeConnectionState newState)
        {
            try
            {
                StateChanged?.Invoke(this, new RealtimeConnectionStateChangedEventArgs(oldState, newState));
            }
            catch
            {
                // a faulty subscriber must not break the connection loop
            }
        }

        private void RaiseConnectionError(Exception? error)
        {
            try
            {
                ConnectionError?.Invoke(this, error ?? new InvalidOperationException("Unknown realtime error."));
            }
            catch
            {
                // ignore
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
                // ignore
            }
        }

        // -----------------------------------------------------------------------
        // Configuration helper
        // -----------------------------------------------------------------------

        /// <summary>
        /// Builds the service from <c>appsettings.json</c> under a <c>RealtimeSettings</c> section:
        /// <code>
        /// "RealtimeSettings": {
        ///   "HubUrl": "https://....",
        ///   "HubName": "tallylink",
        ///   "AutoStart": true
        /// }
        /// </code>
        /// Returns <c>null</c> when no hub URL is configured — the app then simply keeps polling.
        /// </summary>
        public static RealtimeService? CreateFromConfig(
            Func<string?>? tokenProvider = null,
            string? settingsPath = null)
        {
            try
            {
                var path = settingsPath ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "appsettings.json");
                if (!File.Exists(path)) return null;

                using var doc = JsonDocument.Parse(File.ReadAllText(path));
                if (!doc.RootElement.TryGetProperty("RealtimeSettings", out var s)) return null;

                var url = ReadString(s, "HubUrl");
                if (string.IsNullOrWhiteSpace(url)) return null;

                var hubName = ReadString(s, "HubName") ?? "tallylink";
                var autoStart = ReadBool(s, "AutoStart", false);

                return new RealtimeService(url, hubName, tokenProvider, autoStart);
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

            Stop();

            try
            {
                _reconnectTimer?.Dispose();
            }
            catch
            {
                // ignore
            }
        }
    }
}