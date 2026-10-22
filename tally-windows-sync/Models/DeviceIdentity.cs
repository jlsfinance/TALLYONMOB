using System;

namespace TallySyncApp.Models
{
    /// <summary>
    /// Immutable identity of the machine + this desktop session.
    /// Mirrors the device attributes the LiveKeeping connector ships with every
    /// telemetry/activity payload (macAddress, sessionId, desktopVersion).
    /// </summary>
    public sealed record DeviceIdentity
    {
        /// <summary>Stable machine identifier, derived from the primary network adapter MAC.</summary>
        public string MachineId { get; init; } = string.Empty;

        /// <summary>MAC address of the primary (physical) network adapter, as reported by WMI.</summary>
        public string MacAddress { get; init; } = string.Empty;

        /// <summary>Unique per application start (GUID without braces).</summary>
        public string SessionId { get; init; } = string.Empty;

        /// <summary>Version of this desktop assembly.</summary>
        public string DesktopVersion { get; init; } = string.Empty;

        /// <summary>Environment.MachineName.</summary>
        public string MachineName { get; init; } = string.Empty;

        /// <summary>Environment.UserName (user running the desktop app).</summary>
        public string UserName { get; init; } = string.Empty;

        /// <summary>UTC time the identity was built.</summary>
        public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;

        /// <summary>
        /// Device identity fields exactly as the activity/telemetry payload expects them.
        /// </summary>
        public Dictionary<string, object> ToLogProperties()
        {
            return new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
            {
                ["macAddress"] = MacAddress,
                ["sessionId"] = SessionId,
                ["desktopVersion"] = DesktopVersion,
            };
        }
    }
}
