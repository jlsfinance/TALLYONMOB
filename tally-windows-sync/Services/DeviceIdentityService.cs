using System;
using System.Collections.Generic;
using System.Linq;
using System.Management;
using System.Net.NetworkInformation;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using TallySyncApp.Models;

// WMI (System.Management) is only available on Windows.
#pragma warning disable CA1416

namespace TallySyncApp.Services
{
    /// <summary>
    /// Builds and caches a <see cref="DeviceIdentity"/> for this machine/session.
    ///
    /// MachineId is stable across restarts: it is derived from the MAC address of the
    /// primary physical network adapter (WMI Win32_NetworkAdapterConfiguration first, then
    /// a plain NetworkInterface fallback). If neither is available we degrade to a hash of
    /// the machine name so we still emit a usable, stable identifier.
    /// SessionId is a fresh GUID on every app start.
    /// DesktopVersion comes from the executing assembly's informational version.
    /// </summary>
    public static class DeviceIdentityService
    {
        private static readonly object Gate = new object();
        private static DeviceIdentity? _current;
        private static bool _triedWmi;
        private static string _wmiMac = string.Empty;

        /// <summary>Cached identity for the current session (built on first access).</summary>
        public static DeviceIdentity Current
        {
            get
            {
                lock (Gate)
                {
                    _current ??= Build();
                    return _current;
                }
            }
        }

        /// <summary>Gets the cached identity if it has already been built, otherwise null.</summary>
        public static DeviceIdentity? Cached => _current;

        /// <summary>
        /// Re-reads the MAC address and rebuilds the identity.
        /// SessionId is regenerated so a refresh acts like a new session.
        /// </summary>
        public static DeviceIdentity Refresh()
        {
            lock (Gate)
            {
                _triedWmi = false;
                _wmiMac = string.Empty;
                _current = Build();
                return _current;
            }
        }

        /// <summary>
        /// Device identity properties in the shape the telemetry payload expects
        /// (macAddress / sessionId / desktopVersion).
        /// </summary>
        public static Dictionary<string, object> ToLogProperties() => Current.ToLogProperties();

        private static DeviceIdentity Build()
        {
            string mac = ResolveMacAddress();

            return new DeviceIdentity
            {
                MachineId = DeriveMachineId(mac),
                MacAddress = mac,
                SessionId = Guid.NewGuid().ToString("N"),
                DesktopVersion = ResolveDesktopVersion(),
                MachineName = Safe(() => Environment.MachineName, "unknown-machine"),
                UserName = Safe(() => Environment.UserName, "unknown-user"),
                CreatedAt = DateTimeOffset.UtcNow,
            };
        }

        /// <summary>Best-effort MAC lookup: WMI (preferred) then NetworkInterface.</summary>
        private static string ResolveMacAddress()
        {
            string mac = QueryMacFromWmi();
            if (!string.IsNullOrWhiteSpace(mac))
                return mac;

            mac = QueryMacFromNetworkInterfaces();
            if (!string.IsNullOrWhiteSpace(mac))
                return mac;

            return "000000000000";
        }

        /// <summary>
        /// Reads the MAC of the first enabled, physical adapter from WMI.
        /// WMI can be disabled, firewalled or slow on some machines - any failure degrades
        /// quietly to the NetworkInterface fallback.
        /// </summary>
        private static string QueryMacFromWmi()
        {
            if (_triedWmi)
                return _wmiMac;

            _triedWmi = true;
            _wmiMac = string.Empty;

            try
            {
                using var searcher = new ManagementObjectSearcher(
                    "SELECT MACAddress FROM Win32_NetworkAdapterConfiguration " +
                    "WHERE IPEnabled = True AND MACAddress IS NOT NULL");

                foreach (ManagementObject item in searcher.Get())
                {
                    try
                    {
                        var mac = item["MACAddress"]?.ToString();
                        if (!string.IsNullOrWhiteSpace(mac))
                        {
                            _wmiMac = NormalizeMac(mac);
                            return _wmiMac;
                        }
                    }
                    finally
                    {
                        item.Dispose();
                    }
                }
            }
            catch
            {
                // WMI unavailable (disabled service, access denied, not on Windows) - fall back below.
            }

            _wmiMac = string.Empty;
            return _wmiMac;
        }

        /// <summary>Fallback MAC lookup using the managed NetworkInterface API.</summary>
        private static string QueryMacFromNetworkInterfaces()
        {
            try
            {
                var candidates = NetworkInterface.GetAllNetworkInterfaces()
                    .Where(n => n.OperationalStatus == OperationalStatus.Up)
                    .Where(n => n.NetworkInterfaceType is NetworkInterfaceType.Ethernet
                                or NetworkInterfaceType.Wireless80211
                                or NetworkInterfaceType.GigabitEthernet)
                    .OrderByDescending(n => n.Speed)
                    .ThenBy(n => n.Description, StringComparer.OrdinalIgnoreCase);

                foreach (var nic in candidates)
                {
                    var address = nic.GetPhysicalAddress();
                    if (address is null || address.GetAddressBytes().Length == 0)
                        continue;

                    var bytes = address.GetAddressBytes();
                    var mac = string.Join("-", bytes.Select(b => b.ToString("X2")));
                    if (!IsNullOrBroadcast(mac))
                        return NormalizeMac(mac);
                }
            }
            catch
            {
                // Network stack unavailable - degrade to the machine-name hash.
            }

            return string.Empty;
        }

        private static bool IsNullOrBroadcast(string mac)
        {
            var digits = mac.Replace(":", string.Empty).Replace("-", string.Empty);
            if (digits.Length != 12)
                return true;

            return digits.All(c => c == '0') || digits.Equals("FFFFFFFFFFFF", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>Normalizes a MAC to the colon-separated uppercase form, e.g. AA:BB:CC:DD:EE:FF.</summary>
        private static string NormalizeMac(string mac)
        {
            var digits = new string(mac.Where(char.IsLetterOrDigit).ToArray());
            if (digits.Length < 12)
                return mac.Trim().ToUpperInvariant();

            digits = digits[..12].ToUpperInvariant();
            return string.Join(":", Enumerable.Range(0, 6).Select(i => digits.Substring(i * 2, 2)));
        }

        /// <summary>
        /// Stable machine id: a salted SHA-256 prefix of the MAC (falls back to the machine name).
        /// Salted so the raw MAC is never transmitted or stored as the identifier.
        /// </summary>
        private static string DeriveMachineId(string mac)
        {
            string source = string.IsNullOrWhiteSpace(mac) || mac == "000000000000"
                ? "MACHINE:" + Safe(() => Environment.MachineName, "unknown-machine")
                : "MAC:" + mac;

            var salt = "tallylink.deviceid.v1";
            var bytes = Encoding.UTF8.GetBytes(salt + "|" + source);
            var hash = SHA256.HashData(bytes);
            return string.Concat(hash.Take(16).Select(b => b.ToString("X2")));
        }

        private static string ResolveDesktopVersion()
        {
            try
            {
                var assembly = Assembly.GetEntryAssembly() ?? Assembly.GetExecutingAssembly();

                var informational = assembly
                    .GetCustomAttributes(typeof(AssemblyInformationalVersionAttribute), false)
                    .Cast<AssemblyInformationalVersionAttribute>()
                    .FirstOrDefault();

                if (informational is not null && !string.IsNullOrWhiteSpace(informational.InformationalVersion))
                    return informational.InformationalVersion;

                return assembly.GetName().Version?.ToString() ?? "0.0.0.0";
            }
            catch
            {
                return "0.0.0.0";
            }
        }

        private static string Safe(Func<string> value, string fallback)
        {
            try
            {
                var result = value();
                return string.IsNullOrWhiteSpace(result) ? fallback : result;
            }
            catch
            {
                return fallback;
            }
        }
    }
}
