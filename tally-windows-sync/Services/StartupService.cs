using System;
using System.Reflection;
using Microsoft.Win32;

namespace TallySyncApp.Services
{
    /// <summary>
    /// Manages the "run TallyLink at Windows login" autostart entry.
    ///
    /// The entry lives in the per-user <c>HKCU\Software\Microsoft\Windows\CurrentVersion\Run</c>
    /// key with value name <c>TallyLink</c>, pointing at the current executable with the
    /// <c>/auto</c> argument — exactly mirroring the reference product's
    /// <c>HKCU\...\Run\LKDataConnector</c> entry.
    ///
    /// <para>
    /// <b>Never requires administrator rights.</b> The key is under <c>HKEY_CURRENT_USER</c>,
    /// which every interactive user can write, unlike <c>HKLM</c>.
    /// </para>
    ///
    /// Public API: <see cref="IsEnabled"/>, <see cref="Enable"/>, <see cref="Disable"/>,
    /// <see cref="Sync"/>.
    /// </summary>
    public sealed class StartupService : IDisposable
    {
        /// <summary>Registry value name used for the autostart entry.</summary>
        public const string ValueName = "TallyLink";

        /// <summary>Registry key under HKCU that holds per-user autostart entries.</summary>
        public const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";

        private bool _disposed;

        /// <summary>
        /// Gets the path of the currently running executable, e.g.
        /// <c>C:\Users\me\AppData\Local\TallySync\TallyLink\TallyLink.exe</c>.
        /// </summary>
        /// <remarks>
        /// For a single-file .NET publish, <see cref="Environment.ProcessPath"/> is the most
        /// reliable source; we fall back to the entry assembly location when it is unavailable.
        /// </remarks>
        public static string CurrentExecutablePath
        {
            get
            {
                try
                {
                    var processPath = Environment.ProcessPath;
                    if (!string.IsNullOrWhiteSpace(processPath))
                        return processPath;
                }
                catch (InvalidOperationException)
                {
                    // ProcessPath throws in some hosting environments; fall through.
                }

                var entryAssembly = Assembly.GetEntryAssembly()?.Location;
                return string.IsNullOrWhiteSpace(entryAssembly)
                    ? string.Empty
                    : entryAssembly;
            }
        }

        /// <summary>
        /// Gets a value indicating whether the login autostart entry exists and points at this
        /// executable.
        /// </summary>
        public bool IsEnabled()
        {
            ObjectDisposedException.ThrowIf(_disposed, this);

            try
            {
                using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: false);
                if (key is null)
                    return false;

                var value = key.GetValue(ValueName);
                return value is string text && text.Length > 0;
            }
            catch (UnauthorizedAccessException)
            {
                // Should never happen for HKCU, but never let it take the app down.
                return false;
            }
        }

        /// <summary>
        /// Creates or updates the login autostart entry so it points at the current executable
        /// with the <c>/auto</c> argument.
        /// </summary>
        /// <returns><see langword="true"/> when the entry was written; otherwise <see langword="false"/>.</returns>
        public bool Enable()
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            return WriteEntry();
        }

        /// <summary>
        /// Removes the login autostart entry if it exists.
        /// </summary>
        /// <returns><see langword="true"/> when an entry was removed; otherwise <see langword="false"/>.</returns>
        public bool Disable()
        {
            ObjectDisposedException.ThrowIf(_disposed, this);

            try
            {
                using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true);
                if (key is null)
                    return false;

                var value = key.GetValue(ValueName);
                if (value is null)
                    return false;

                key.DeleteValue(ValueName, throwOnMissingValue: false);
                return true;
            }
            catch (UnauthorizedAccessException)
            {
                return false;
            }
        }

        /// <summary>
        /// Makes the registry entry match the desired state.
        /// </summary>
        /// <param name="enabled">
        /// <see langword="true"/> to create/update the entry; <see langword="false"/> to remove it.
        /// </param>
        /// <returns>
        /// <see langword="true"/> when the registry now matches the requested state;
        /// <see langword="false"/> when the write failed.
        /// </returns>
        /// <remarks>
        /// Unlike <see cref="Enable"/>/<see cref="Disable"/> this is idempotent and is the
        /// method to call when the user toggles the "run at login" preference in the app.
        /// </remarks>
        public bool Sync(bool enabled)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            return enabled ? WriteEntry() : Disable();
        }

        /// <summary>
        /// Returns the command line currently stored in the autostart entry, or
        /// <see langword="null"/> when the entry does not exist.
        /// </summary>
        /// <remarks>Exposed for diagnostics/logging.</remarks>
        public string? GetRegisteredCommandLine()
        {
            ObjectDisposedException.ThrowIf(_disposed, this);

            try
            {
                using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: false);
                return key?.GetValue(ValueName) as string;
            }
            catch (UnauthorizedAccessException)
            {
                return null;
            }
        }

        /// <summary>
        /// Returns a human-readable description of the current autostart state for logging.
        /// </summary>
        public string DescribeState()
        {
            var registered = GetRegisteredCommandLine();
            var executable = CurrentExecutablePath;

            if (string.IsNullOrEmpty(registered))
                return "Autostart: disabled (no registry entry)";

            bool pointsAtCurrent = string.Equals(
                registered,
                BuildCommandLine(executable),
                StringComparison.OrdinalIgnoreCase);

            return pointsAtCurrent
                ? $"Autostart: enabled -> {registered}"
                : $"Autostart: entry exists but stale -> {registered} (current: {executable})";
        }

        /// <inheritdoc />
        public void Dispose()
        {
            _disposed = true;
            GC.SuppressFinalize(this);
        }

        // -----------------------------------------------------------------------
        // Internals
        // -----------------------------------------------------------------------

        /// <summary>
        /// Builds the command line written to the registry: the executable path quoted, followed
        /// by the <c>/auto</c> switch.
        /// </summary>
        /// <param name="executable">Absolute path of the executable.</param>
        public static string BuildCommandLine(string executable)
        {
            if (string.IsNullOrWhiteSpace(executable))
                return CommandLineSwitches.AutoStart;

            // Registry Run entries must have the path quoted so spaces in %LOCALAPPDATA% paths
            // are not split into separate arguments.
            var quoted = executable.IndexOf(' ') >= 0 ? $"\"{executable}\"" : executable;
            return $"{quoted} {CommandLineSwitches.AutoStart}";
        }

        /// <summary>
        /// Writes the autostart entry, replacing any existing value (including a stale path
        /// left behind by an older install location).
        /// </summary>
        private static bool WriteEntry()
        {
            try
            {
                var executable = CurrentExecutablePath;
                if (string.IsNullOrWhiteSpace(executable))
                    return false;

                var commandLine = BuildCommandLine(executable);

                using var key = Registry.CurrentUser.CreateSubKey(RunKeyPath, writable: true);
                if (key is null)
                    return false;

                key.SetValue(ValueName, commandLine, RegistryValueKind.String);
                return true;
            }
            catch (UnauthorizedAccessException)
            {
                return false;
            }
            catch (ObjectDisposedException)
            {
                return false;
            }
        }
    }
}
