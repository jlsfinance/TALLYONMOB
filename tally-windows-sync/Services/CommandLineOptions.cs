using System;
using System.Collections.Generic;
using System.Text;

namespace TallySyncApp.Services
{
    /// <summary>
    /// The switch the installer's <c>[Run]</c> entry passes on first launch after install.
    /// Mirrors the reference product's <c>/installation@1</c> marker.
    /// </summary>
    public static class CommandLineSwitches
    {
        /// <summary>Started by Windows at login: start minimised and sync without the login window.</summary>
        public const string AutoStart = "/auto";

        /// <summary>First run immediately after installation.</summary>
        public const string PostInstall = "/installation@1";
    }

    /// <summary>
    /// Parsed command line for TallyLink.
    ///
    /// Recognised switches (matching the Inno Setup installer's <c>[Run]</c> and
    /// <c>[Registry]</c> entries):
    /// <list type="bullet">
    ///   <item><c>/auto</c> — launched by the login autostart entry. Start minimised to the tray
    ///         and, when a session already exists, begin syncing without showing the login
    ///         window.</item>
    ///   <item><c>/installation@1</c> — launched for the first time right after install.</item>
    /// </list>
    ///
    /// <para>
    /// The parser is deliberately tolerant: switches are matched case-insensitively, may be
    /// prefixed with <c>/</c> or <c>-</c>, may appear in any order, and a trailing <c>=1</c>
    /// (or <c>:1</c>) suffix is accepted so <c>/installation@1</c> and <c>/installation</c>
    /// both set <see cref="IsPostInstall"/>. Unrecognised arguments are collected in
    /// <see cref="Unrecognised"/> and never throw, so a stray switch cannot stop the app from
    /// starting.
    /// </para>
    /// </summary>
    public sealed class CommandLineOptions
    {
        /// <summary>
        /// Gets a value indicating whether the app was started by the Windows login autostart
        /// entry (the <c>/auto</c> switch).
        /// </summary>
        public bool IsAutoStart { get; private set; }

        /// <summary>
        /// Gets a value indicating whether this is the first run right after installation
        /// (the <c>/installation@1</c> switch).
        /// </summary>
        public bool IsPostInstall { get; private set; }

        /// <summary>
        /// Gets a value indicating whether the app was started with no recognised switch, i.e.
        /// by a normal double-click or Start Menu shortcut.
        /// </summary>
        public bool IsNormalStart => !IsAutoStart && !IsPostInstall;

        /// <summary>
        /// Gets the raw, unparsed arguments (excluding the executable path).
        /// </summary>
        public IReadOnlyList<string> RawArguments { get; private set; } = Array.Empty<string>();

        /// <summary>
        /// Gets any arguments that were not recognised as a known switch.
        /// </summary>
        public IReadOnlyList<string> Unrecognised { get; private set; } = Array.Empty<string>();

        /// <summary>
        /// Parses <see cref="Environment.CommandLine"/> (the whole command line, including the
        /// executable path).
        /// </summary>
        public static CommandLineOptions ParseFromEnvironment() =>
            Parse(Environment.GetCommandLineArgs());

        /// <summary>
        /// Parses an argument vector whose first element is the executable path, as returned by
        /// <see cref="Environment.GetCommandLineArgs"/>.
        /// </summary>
        /// <param name="args">Argument vector; may be empty.</param>
        public static CommandLineOptions Parse(IReadOnlyList<string>? args)
        {
            args ??= Array.Empty<string>();

            var unrecognised = new List<string>();
            var raw = new List<string>();
            bool isAutoStart = false;
            bool isPostInstall = false;

            // Skip element 0: it is the executable path.
            for (int i = 1; i < args.Count; i++)
            {
                var argument = args[i];
                if (string.IsNullOrWhiteSpace(argument))
                    continue;

                raw.Add(argument);

                var normalised = Normalise(argument);
                if (normalised.Length == 0)
                    continue;

                if (Matches(normalised, CommandLineSwitches.AutoStart))
                {
                    isAutoStart = true;
                }
                else if (Matches(normalised, CommandLineSwitches.PostInstall))
                {
                    isPostInstall = true;
                }
                else
                {
                    unrecognised.Add(argument);
                }
            }

            return new CommandLineOptions
            {
                IsAutoStart = isAutoStart,
                IsPostInstall = isPostInstall,
                RawArguments = raw,
                Unrecognised = unrecognised
            };
        }

        /// <summary>
        /// Returns a stable, log-friendly representation of the parsed options.
        /// </summary>
        public override string ToString()
        {
            var builder = new StringBuilder("TallyLink command line: ");

            if (IsAutoStart)
                builder.Append("[auto-start] ");
            if (IsPostInstall)
                builder.Append("[post-install] ");

            if (IsNormalStart)
                builder.Append("[normal-start] ");

            if (RawArguments.Count == 0)
            {
                builder.Append("(no arguments)");
                return builder.ToString();
            }

            builder.Append("args=");
            builder.Append(string.Join(", ", RawArguments));

            if (Unrecognised.Count > 0)
            {
                builder.Append(" | unrecognised=");
                builder.Append(string.Join(", ", Unrecognised));
            }

            return builder.ToString();
        }

        /// <summary>
        /// Produces the argument string that should be written into the login autostart
        /// registry entry.
        /// </summary>
        public static string BuildAutoStartArguments() => CommandLineSwitches.AutoStart;

        // -----------------------------------------------------------------------
        // Internals
        // -----------------------------------------------------------------------

        /// <summary>
        /// Strips a leading <c>/</c>, <c>-</c> or <c>--</c> prefix and lower-cases the result.
        /// </summary>
        private static string Normalise(string argument)
        {
            var trimmed = argument.Trim();
            if (trimmed.StartsWith("--", StringComparison.Ordinal))
                trimmed = trimmed.Substring(2);
            else if (trimmed.StartsWith("-", StringComparison.Ordinal) || trimmed.StartsWith("/", StringComparison.Ordinal))
                trimmed = trimmed.Substring(1);

            return trimmed.ToLowerInvariant();
        }

        /// <summary>
        /// Compares a normalised argument against a switch name, ignoring a trailing
        /// <c>=1</c> or <c>:1</c> value suffix.
        /// </summary>
        private static bool Matches(string normalisedArgument, string switchName)
        {
            var normalisedSwitch = Normalise(switchName);
            if (string.Equals(normalisedArgument, normalisedSwitch, StringComparison.Ordinal))
                return true;

            // Accept "/installation@1" and "/installation" alike: compare the part before a
            // trailing '=' or ':' separator.
            int separator = normalisedArgument.IndexOfAny(new[] { '=', ':' });
            if (separator <= 0)
                return false;

            return string.Equals(
                normalisedArgument.Substring(0, separator),
                normalisedSwitch,
                StringComparison.Ordinal);
        }
    }
}
