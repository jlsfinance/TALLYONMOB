using System;
using MongoDB.Bson;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;

namespace TallySyncApp.Models
{
    /// <summary>
    /// Severity of a <see cref="TelemetryEvent"/>.
    /// Mirrors the levels the LiveKeeping connector emitted over its NLog network targets
    /// (see livekeeping-rea/FINDINGS.md §3).
    /// </summary>
    [JsonConverter(typeof(StringEnumConverter))]
    public enum TelemetryLevel
    {
        Debug = 0,
        Info = 1,
        Warning = 2,
        Error = 3,
        Critical = 4
    }

    /// <summary>
    /// Strongly-typed activity / audit event.
    ///
    /// The field set mirrors the LiveKeeping activity log shape recorded in
    /// livekeeping-rea/FINDINGS.md §3:
    ///   msg, userId, description, requestFrom, createdAt, companyId, customerStatus,
    ///   customerSource, macAddress, sessionId, desktopVersion
    /// plus two extra fields the TallyLink backend needs: eventType and level.
    ///
    /// LiveKeeping shipped its wire keys as "_userId" and "company_id" (snake_case); the
    /// C# properties below keep the casing used everywhere else in this app. If the Supabase
    /// telemetry table is created with the LiveKeeping names, map them at the column level
    /// (see <see cref="WireFieldNames"/>) — the JSON produced by <see cref="ToJson"/> is
    /// plain camelCase.
    /// </summary>
    public class TelemetryEvent
    {
        /// <summary>Short, machine-readable message / operation name. Required.</summary>
        public string msg { get; set; } = string.Empty;

        /// <summary>Authenticated user id (Supabase auth uid), or empty for anonymous/system events.</summary>
        public string? userId { get; set; }

        /// <summary>Human-readable detail of what happened.</summary>
        public string? description { get; set; }

        /// <summary>Origin of the request, e.g. "sync-loop", "startup", "user-action".</summary>
        public string? requestFrom { get; set; }

        /// <summary>UTC timestamp the event was created.</summary>
        public DateTime createdAt { get; set; } = DateTime.UtcNow;

        /// <summary>Company the event relates to. Mirrors LiveKeeping "company_id".</summary>
        public string? companyId { get; set; }

        /// <summary>Tally company status, e.g. "active" / "trial" / "expired".</summary>
        public string? customerStatus { get; set; }

        /// <summary>Where the customer came from, e.g. "web" / "android" / "referral".</summary>
        public string? customerSource { get; set; }

        /// <summary>Hardware identity (WMI MAC address), when available.</summary>
        public string? macAddress { get; set; }

        /// <summary>Unique session identifier for the running desktop instance.</summary>
        public string? sessionId { get; set; }

        /// <summary>Executing desktop application version, e.g. "2.0.1".</summary>
        public string? desktopVersion { get; set; }

        /// <summary>Logical category, e.g. "sync", "auth", "connection", "lifecycle".</summary>
        public string? eventType { get; set; }

        /// <summary>Severity of the event. Defaults to <see cref="TelemetryLevel.Info"/>.</summary>
        public TelemetryLevel level { get; set; } = TelemetryLevel.Info;

        /// <summary>Optional correlation id to group related events.</summary>
        public string? correlationId { get; set; }

        /// <summary>Optional free-form extra data (counts, durations, error strings...).</summary>
        public Dictionary<string, object?>? data { get; set; }

        /// <summary>
        /// Serialise to a JSON string using Newtonsoft.Json, omitting null properties.
        /// </summary>
        public string ToJson(bool indented = false)
        {
            return JsonConvert.SerializeObject(this, new JsonSerializerSettings
            {
                NullValueHandling = NullValueHandling.Ignore,
                DateFormatString = "yyyy-MM-ddTHH:mm:ssZ",
                Formatting = indented ? Formatting.Indented : Formatting.None
            });
        }

        /// <summary>
        /// Serialise to a BSON byte array (MongoDB.Bson document format), matching the
        /// payload encoding the LiveKeeping connector used.
        /// </summary>
        public byte[] ToBson()
        {
            return ToBsonDocument().ToBson();
        }

        /// <summary>
        /// Convert to a <see cref="BsonDocument"/> so callers can embed the event inside a
        /// larger document or use the MongoDB driver directly.
        /// </summary>
        public BsonDocument ToBsonDocument()
        {
            // BsonExtensionMethods.ToBsonDocument runs the full BSON serializer over the object.
            // (BsonDocument.Create(object) only maps primitives and throws for a POCO.)
            // Called statically so it cannot collide with this instance method's own name.
            return BsonExtensionMethods.ToBsonDocument(this);
        }
    }

    /// <summary>
    /// LiveKeeping wire field names, for reference when aligning a Supabase telemetry table
    /// with the competitor's activity schema. Not used by <see cref="TelemetryEvent.ToJson"/>.
    /// </summary>
    public static class WireFieldNames
    {
        public const string msg = "msg";
        public const string userId = "_userId";
        public const string description = "description";
        public const string requestFrom = "requestFrom";
        public const string createdAt = "createdAt";
        public const string companyId = "company_id";
        public const string customerStatus = "customerStatus";
        public const string customerSource = "customerSource";
        public const string macAddress = "macAddress";
        public const string sessionId = "sessionId";
        public const string desktopVersion = "desktopVersion";
    }
}
