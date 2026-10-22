using System;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;

namespace TallySyncApp.Services
{
    /// <summary>
    /// Enforces a single running instance of TallyLink using a named mutex, and provides a
    /// way to ask an already-running instance to come to the foreground.
    ///
    /// This mirrors the reference product's <c>AppMutex=LKDataConnector,Global\LKDataConnector</c>
    /// behaviour, but at runtime: the Inno Setup AppMutex is only honoured by the installer and
    /// uninstaller, not when a second copy of the app is launched.
    ///
    /// Typical use from <c>App.OnStartup</c>:
    /// <code>
    /// var guard = new SingleInstanceGuard();
    /// if (!guard.TryAcquire())
    /// {
    ///     guard.SignalExistingInstance();
    ///     Current.Shutdown();
    ///     return;
    /// }
    /// </code>
    ///
    /// <para>
    /// <b>Foreground activation.</b> The mutex alone cannot bring the other instance to the
    /// front. The primary instance therefore creates a named <see cref="EventWaitHandle"/>
    /// (<see cref="ActivationEventName"/>) when it acquires the mutex, and pumps it on a
    /// background thread via <see cref="StartActivationPump"/>. A secondary instance opens that
    /// event and pulses it through <see cref="SignalExistingInstance"/>. This avoids the fragile
    /// "find a window handle by title" heuristic and works across user accounts on one machine.
    /// </para>
    /// </summary>
    public sealed class SingleInstanceGuard : IDisposable
    {
        /// <summary>Mutex name; shared with the Inno Setup <c>AppMutex</c> entry.</summary>
        public const string MutexName = @"Local\TallyLink";

        /// <summary>
        /// Name of the named event the primary instance exposes so a second launch can ask it
        /// to come to the foreground.
        /// </summary>
        public const string ActivationEventName = @"Local\TallyLink.Activate";

        private Mutex? _mutex;
        private EventWaitHandle? _activationEvent;
        private bool _ownsMutex;
        private bool _ownsActivationEvent;
        private bool _disposed;

        /// <summary>Gets a value indicating whether this instance acquired the mutex.</summary>
        public bool IsPrimary => _ownsMutex;

        /// <summary>
        /// Gets a value indicating whether another instance already owns the mutex.
        /// </summary>
        public bool IsOtherInstanceRunning => !_ownsMutex;

        /// <summary>
        /// Attempts to acquire the single-instance mutex.
        /// </summary>
        /// <returns>
        /// <see langword="true"/> when this instance acquired the mutex (it is the primary
        /// instance); <see langword="false"/> when another instance is already running.
        /// </returns>
        public bool TryAcquire()
        {
            ObjectDisposedException.ThrowIf(_disposed, this);

            // Fast path: try to open the mutex without creating it. If this succeeds, another
            // process already owns it, so we are the secondary instance.
            try
            {
                using var existing = Mutex.OpenExisting(MutexName);
                _ownsMutex = false;
                return false;
            }
            catch (WaitHandleCannotBeOpenedException)
            {
                // Does not exist yet — we may be the first instance. Fall through and create it.
            }
            catch (UnauthorizedAccessException)
            {
                // Exists but is locked down; fall through and retry with an ACL.
            }

            // Slow path: create the mutex ourselves, granting Everyone access so the guard
            // still works across user accounts on the same machine.
            bool createdNew = false;
            try
            {
                _mutex = new Mutex(false, MutexName, out createdNew);

                // The 4-argument Mutex ctor that takes a MutexSecurity does not exist on
                // .NET (only on .NET Framework), so apply the ACL after creation instead.
                try
                {
                    var security = new MutexSecurity();
                    security.AddAccessRule(new MutexAccessRule(
                        new SecurityIdentifier(WellKnownSidType.WorldSid, null),
                        MutexRights.FullControl,
                        AccessControlType.Allow));
                    _mutex.SetAccessControl(security);
                }
                catch (Exception)
                {
                    // ACL application is best effort; the mutex still enforces single-instance
                    // for the creating user.
                }
            }
            catch (UnauthorizedAccessException)
            {
                // Could not create it either (extremely locked-down environment). Assume a
                // single instance is running rather than blocking the user from starting.
                _ownsMutex = false;
                return false;
            }

            if (!createdNew)
            {
                // Someone beat us to it between OpenExisting and the create.
                _mutex.Dispose();
                _mutex = null;
                _ownsMutex = false;
                return false;
            }

            _ownsMutex = true;
            CreateActivationEvent();
            return true;
        }

        /// <summary>
        /// Asks the already-running instance to come to the foreground by pulsing the named
        /// activation event.
        /// Best-effort only: never throws, so a failure cannot crash the second launch.
        /// </summary>
        /// <remarks>
        /// Only meaningful when <see cref="TryAcquire"/> returned <see langword="false"/>.
        /// </remarks>
        public void SignalExistingInstance()
        {
            if (_ownsMutex)
                return; // we are the primary; nothing to signal

            try
            {
                using var evt = EventWaitHandle.OpenExisting(ActivationEventName);
                evt.Set();
            }
            catch (WaitHandleCannotBeOpenedException)
            {
                // The primary instance has not created the event yet (or already exited).
            }
            catch (UnauthorizedAccessException)
            {
                // Exists but we may not open it; nothing more we can do.
            }
            catch (Exception)
            {
                // Best effort only — ignore.
            }
        }

        /// <summary>
        /// Starts pumping the activation event on a background thread. Each pulse raises
        /// <see cref="ActivationRequested"/>, which the application should handle by restoring
        /// and focusing its main window on the UI thread.
        /// </summary>
        /// <remarks>
        /// Call only from the primary instance, after <see cref="TryAcquire"/> returned
        /// <see langword="true"/>.
        /// </remarks>
        public void StartActivationPump()
        {
            if (!_ownsMutex || _activationEvent is null)
                return;

            var thread = new Thread(PumpActivation)
            {
                IsBackground = true,
                Name = "TallyLink.ActivationPump"
            };
            thread.Start();
        }

        /// <summary>
        /// Raised when a second instance asks this one to come to the foreground.
        /// Handlers must marshal to the UI thread themselves.
        /// </summary>
        public event EventHandler? ActivationRequested;

        /// <summary>
        /// Releases the mutex and the activation event so another instance may become primary.
        /// Call from <c>Application.Exit</c>.
        /// </summary>
        public void Release()
        {
            if (!_ownsMutex || _mutex is null)
                return;

            try
            {
                _mutex.ReleaseMutex();
            }
            catch (ApplicationException)
            {
                // Not actually owned (e.g. released twice). Safe to ignore.
            }

            _ownsMutex = false;
        }

        /// <inheritdoc />
        public void Dispose()
        {
            if (_disposed)
                return;

            Release();

            if (_activationEvent is not null)
            {
                if (_ownsActivationEvent)
                {
                    try { _activationEvent.Set(); } catch { /* wake the pump so it can exit */ }
                }

                _activationEvent.Dispose();
                _activationEvent = null;
            }

            _mutex?.Dispose();
            _mutex = null;

            _disposed = true;
            GC.SuppressFinalize(this);
        }

        // -----------------------------------------------------------------------
        // Internals
        // -----------------------------------------------------------------------

        /// <summary>
        /// Creates the named activation event with an ACL that grants Everyone access.
        /// </summary>
        private void CreateActivationEvent()
        {
            try
            {
                _activationEvent = new EventWaitHandle(
                    false, EventResetMode.AutoReset, ActivationEventName, out _ownsActivationEvent);

                // The 5-argument EventWaitHandle ctor that takes an EventWaitHandleSecurity does
                // not exist on .NET, so apply the ACL after creation instead.
                try
                {
                    var security = new EventWaitHandleSecurity();
                    security.AddAccessRule(new EventWaitHandleAccessRule(
                        new SecurityIdentifier(WellKnownSidType.WorldSid, null),
                        EventWaitHandleRights.Modify | EventWaitHandleRights.Synchronize,
                        AccessControlType.Allow));
                    _activationEvent.SetAccessControl(security);
                }
                catch (Exception)
                {
                    // ACL application is best effort; activation still works for the creating user.
                }
            }
            catch (UnauthorizedAccessException)
            {
                // Fall back to the default (creator-owned) security.
                TryCreateActivationEventDefault();
            }
        }

        private void TryCreateActivationEventDefault()
        {
            try
            {
                _activationEvent = new EventWaitHandle(
                    false, EventResetMode.AutoReset, ActivationEventName, out _ownsActivationEvent);
            }
            catch (Exception)
            {
                // If this also fails, activation simply will not work; the mutex guard still
                // protects single-instance behaviour.
                _activationEvent = null;
            }
        }

        /// <summary>Background loop that turns event pulses into <see cref="ActivationRequested"/>.</summary>
        private void PumpActivation()
        {
            if (_activationEvent is null)
                return;

            try
            {
                while (!_disposed && _ownsMutex)
                {
                    // Wait with a timeout so a disposed event cannot spin the thread forever.
                    if (!_activationEvent.WaitOne(TimeSpan.FromSeconds(30)))
                        continue;

                    if (_disposed || !_ownsMutex)
                        break;

                    try
                    {
                        ActivationRequested?.Invoke(this, EventArgs.Empty);
                    }
                    catch
                    {
                        // A throwing handler must not kill the pump.
                    }
                }
            }
            catch (ObjectDisposedException)
            {
                // Event was disposed during shutdown.
            }
            catch (AbandonedMutexException)
            {
                // Mutex was abandoned; stop pumping.
            }
            catch (Exception)
            {
                // Unexpected failure; stop the pump. Single-instance behaviour is unaffected.
            }
        }
    }
}
