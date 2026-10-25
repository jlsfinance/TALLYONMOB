using System;
using System.Collections.Generic;
using System.IO;
using NLog;
using NLog.Config;
using NLog.Layouts;
using NLog.Targets;
using NLog.Targets.Wrappers;

namespace TallySyncApp.Services
{
    /// <summary>
    /// Central logging facade for TallyLink.
    ///
    /// Configures NLog from <c>NLog.config</c> (looked up next to the executable, then in the
    /// project folder) and exposes the three named loggers the application uses:
    /// <see cref="SyncingLogger"/> (sync progress), <see cref="AppLogger"/> (app telemetry) and
    /// <see cref="ActivityLogger"/> (structured audit/activity events).
    /// If the config file is missing or invalid, a local-file-only fallback configuration is
    /// installed so logging can never take the app down.
    /// </summary>
    public static class LoggingService
    {
        private const string ConfigFileName = "NLog.config";
        private const string LogFolderName = "logs";

        private static readonly object Gate = new object();
        private static bool _configured;

        /// <summary>
        /// Directory NLog writes to (<c>{exe}/logs</c>). The tray menu uses this to open the
        /// log folder. Note: on Windows this is the same directory the legacy
        /// <see cref="SyncLogger"/> writes its <c>sync.log</c> to.
        /// </summary>
        public static string LogDirectory { get; }

        /// <summary>Sync progress logger (writes logs/syncingLogger.log).</summary>
        public static Logger SyncingLogger => LogManager.GetLogger("SyncingLogger");

        /// <summary>Application telemetry logger (network target with local JSON fallback).</summary>
        public static Logger AppLogger => LogManager.GetLogger("AppLogger");

        /// <summary>Structured activity/audit logger (network target with offline file fallback).</summary>
        public static Logger ActivityLogger => LogManager.GetLogger("ActivityLogger");

        static LoggingService()
        {
            // Stable location: AppContext.BaseDirectory is %TEMP%\.net\... for the single-file bundle
            LogDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TallySync", "Logs");
            EnsureLogDirectory();
            Configure();
        }

        /// <summary>Ensures the log directory exists. Safe to call repeatedly.</summary>
        public static void EnsureLogDirectory()
        {
            try
            {
                if (!Directory.Exists(LogDirectory))
                    Directory.CreateDirectory(LogDirectory);
            }
            catch
            {
                // Logging must never break startup; NLog will retry/render errors internally.
            }
        }

        /// <summary>
        /// Loads the NLog configuration. Idempotent; call it again after the parent copies
        /// NLog.config next to the executable to pick it up.
        /// </summary>
        public static void Configure()
        {
            lock (Gate)
            {
                if (_configured)
                    return;

                var configPath = LocateConfigFile();

                try
                {
                    if (!string.IsNullOrEmpty(configPath))
                    {
                        var config = new XmlLoggingConfiguration(configPath, LogManager.LogFactory);
                        LogManager.Configuration = config;
                        _configured = true;
                        return;
                    }
                }
                catch
                {
                    // Malformed or unreadable config - fall through to the local fallback below.
                }

                LogManager.Configuration = BuildFallbackConfiguration();
                _configured = true;
            }
        }

        /// <summary>Alias for <see cref="Configure"/>.</summary>
        public static void Initialize() => Configure();

        /// <summary>Re-runs configuration (used if NLog.config appears later, e.g. after deploy).</summary>
        public static void Reload()
        {
            lock (Gate)
            {
                _configured = false;
                Configure();
            }
        }

        /// <summary>Flushes and closes all targets. Call once on application exit.</summary>
        public static void Shutdown()
        {
            try
            {
                LogManager.Shutdown();
            }
            catch
            {
                // Never throw during shutdown.
            }
        }

        #region Activity logging

        /// <summary>
        /// Writes a structured activity/audit event. Field names match the telemetry payload the
        /// competitor ships (msg, _userId, description, requestFrom, createdAt, company_id,
        /// customerStatus, customerSource) plus the device identity fields
        /// (macAddress, sessionId, desktopVersion) from <see cref="DeviceIdentityService"/>.
        /// </summary>
        public static void LogActivity(
            string message,
            string? companyId = null,
            string? customerStatus = null,
            string? customerSource = null,
            string? description = null,
            string? requestFrom = null,
            DateTimeOffset? createdAt = null,
            string? userId = null)
        {
            var logger = ActivityLogger;
            if (logger is null || !logger.IsInfoEnabled)
                return;

            var timestamp = createdAt ?? DateTimeOffset.UtcNow;

            var properties = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
            {
                ["msg"] = message ?? string.Empty,
                ["_userId"] = userId ?? string.Empty,
                ["description"] = description ?? string.Empty,
                ["requestFrom"] = string.IsNullOrWhiteSpace(requestFrom) ? "desktop" : requestFrom,
                ["createdAt"] = timestamp.ToString("O"),
                ["company_id"] = companyId ?? string.Empty,
                ["customerStatus"] = customerStatus ?? string.Empty,
                ["customerSource"] = customerSource ?? string.Empty,
            };

            // Device identity (macAddress / sessionId / desktopVersion).
            foreach (var property in DeviceIdentityService.ToLogProperties())
                properties[property.Key] = property.Value;

            var logEvent = new LogEventInfo(LogLevel.Info, ActivityLogger.Name, message ?? string.Empty);
            foreach (var property in properties)
                logEvent.Properties[property.Key] = property.Value;

            logger.Log(logEvent);
        }

        /// <summary>Convenience overload for a short activity message with no extra context.</summary>
        public static void LogActivity(string message)
        {
            LogActivity(message, null, null, null, null, null, null, null);
        }

        /// <summary>Writes a sync progress line to the dedicated sync log.</summary>
        public static void LogSync(string message)
        {
            try
            {
                SyncingLogger.Info(message);
            }
            catch
            {
                // Ignore.
            }
        }

        #endregion

        #region Configuration loading

        /// <summary>
        /// Finds NLog.config next to the executable first, then in the project folder
        /// (walking up from the executable, which covers the dev layout bin/&lt;config&gt;/net8.0-windows).
        /// </summary>
        private static string? LocateConfigFile()
        {
            var candidates = new List<string>
            {
                Path.Combine(AppContext.BaseDirectory, ConfigFileName),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ConfigFileName),
                Path.Combine(Environment.CurrentDirectory, ConfigFileName),
            };

            try
            {
                var directory = new DirectoryInfo(AppContext.BaseDirectory);
                for (var depth = 0; depth < 8 && directory is not null; depth++)
                {
                    candidates.Add(Path.Combine(directory.FullName, ConfigFileName));
                    directory = directory.Parent;
                }
            }
            catch
            {
                // Ignore - the candidates collected so far are enough.
            }

            foreach (var candidate in candidates)
            {
                try
                {
                    if (File.Exists(candidate))
                        return candidate;
                }
                catch
                {
                    // Ignore inaccessible paths.
                }
            }

            return null;
        }

        /// <summary>
        /// Local-only configuration used when NLog.config cannot be loaded: every logger gets a
        /// file target, so nothing is lost and the app never blocks on a network target.
        /// </summary>
        private static LoggingConfiguration BuildFallbackConfiguration()
        {
            var config = new LoggingConfiguration();

            var syncing = new FileTarget("SyncingLogger")
            {
                FileName = Path.Combine(LogDirectory, "syncingLogger.log"),
                Layout = "${longdate} ${message}",
                KeepFileOpen = true,
                ArchiveAboveSize = 1048576,
                MaxArchiveFiles = 1,
            };

            var appLog = new FileTarget("AppLogger")
            {
                FileName = Path.Combine(LogDirectory, "tdcLog.log"),
                Layout = BuildJsonLayout("functionName"),
                KeepFileOpen = false,
                ArchiveAboveSize = 200000,
                MaxArchiveFiles = 2,
            };

            var activityLog = new FileTarget("ActivityLogger")
            {
                FileName = Path.Combine(LogDirectory, "tdcActivityOffline.log"),
                Layout = BuildActivityJsonLayout(),
                KeepFileOpen = false,
                ArchiveAboveSize = 500000,
                MaxArchiveFiles = 2,
            };

            var asyncWrapper = new AsyncTargetWrapper(appLog);
            var asyncActivity = new AsyncTargetWrapper(activityLog);

            config.AddRule(LogLevel.Info, LogLevel.Fatal, syncing, "SyncingLogger");
            config.AddRule(LogLevel.Trace, LogLevel.Fatal, asyncWrapper, "AppLogger");
            config.AddRule(LogLevel.Info, LogLevel.Fatal, asyncActivity, "ActivityLogger");

            return config;
        }

        private static Layout BuildJsonLayout(string messageField)
        {
            var layout = new JsonLayout { IncludeScopeProperties = true };
            layout.Attributes.Add(new JsonAttribute("systemDateTime", "${date:format=O}"));
            layout.Attributes.Add(new JsonAttribute(messageField, "${message}"));
            layout.Attributes.Add(new JsonAttribute("logger", "${logger}"));
            layout.Attributes.Add(new JsonAttribute("level", "${level}"));
            layout.Attributes.Add(new JsonAttribute("exception", "${exception:format=tostring}"));
            return layout;
        }

        private static Layout BuildActivityJsonLayout()
        {
            var layout = new JsonLayout { IncludeScopeProperties = true };
            layout.Attributes.Add(new JsonAttribute("msg", "${event-properties:msg}"));
            layout.Attributes.Add(new JsonAttribute("_userId", "${event-properties:_userId}"));
            layout.Attributes.Add(new JsonAttribute("description", "${event-properties:description}"));
            layout.Attributes.Add(new JsonAttribute("requestFrom", "${event-properties:requestFrom}"));
            layout.Attributes.Add(new JsonAttribute("createdAt", "${event-properties:createdAt}"));
            layout.Attributes.Add(new JsonAttribute("company_id", "${event-properties:company_id}"));
            layout.Attributes.Add(new JsonAttribute("customerStatus", "${event-properties:customerStatus}"));
            layout.Attributes.Add(new JsonAttribute("customerSource", "${event-properties:customerSource}"));
            layout.Attributes.Add(new JsonAttribute("macAddress", "${event-properties:macAddress}"));
            layout.Attributes.Add(new JsonAttribute("sessionId", "${event-properties:sessionId}"));
            layout.Attributes.Add(new JsonAttribute("desktopVersion", "${event-properties:desktopVersion}"));
            return layout;
        }

        #endregion
    }
}
