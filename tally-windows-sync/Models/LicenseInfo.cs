using Newtonsoft.Json;

namespace TallySyncApp.Models
{
    /// <summary>Row returned by the validate_user_license RPC.</summary>
    public class LicenseInfo
    {
        [JsonProperty("valid")] public bool Valid { get; set; }
        [JsonProperty("status")] public string? Status { get; set; }
        [JsonProperty("plan_name")] public string? PlanName { get; set; }
        [JsonProperty("expiry_date")] public DateTime? ExpiryDate { get; set; }
        [JsonProperty("days_left")] public int DaysLeft { get; set; }
        [JsonProperty("tally_serial_bound")] public string? TallySerialBound { get; set; }
        [JsonProperty("email_bound")] public string? EmailBound { get; set; }
        [JsonProperty("mobile_bound")] public string? MobileBound { get; set; }
    }

    /// <summary>
    /// Authoritative license validation outcome for the PC Connector.
    /// The status is always derived from server-side data (validate_user_license RPC),
    /// never from the local PC clock or any client-side cached flag.
    /// </summary>
    public enum LicenseStatus
    {
        Unknown,
        Active,        // Valid paid licence – sync allowed
        TrialActive,   // Valid trial licence – sync allowed
        Expired,       // Trial or paid licence expired – sync blocked
        Suspended,     // Licence suspended – sync blocked
        Revoked,       // Licence revoked – sync blocked
        NoLicense,     // No licence assigned – sync blocked
        TallyMismatch, // Tally serial bound to another account – sync blocked
        NetworkError,  // Could not reach the server – sync blocked, distinct from expiry
    }

    /// <summary>
    /// Result of a single license validation. One instance per validation cycle.
    /// </summary>
    public class LicenseResult
    {
        /// <summary>True only when synchronisation is permitted.</summary>
        public bool Allowed { get; set; }

        public LicenseStatus Status { get; set; } = LicenseStatus.Unknown;

        public string? PlanName { get; set; }
        public DateTime? ExpiryDate { get; set; }
        public int DaysLeft { get; set; }

        /// <summary>Short user-facing status line (e.g. "Active · 45 days left").</summary>
        public string Message { get; set; } = "";

        /// <summary>True when the server could not be reached (distinct from expiry).</summary>
        public bool IsNetworkError { get; set; }

        /// <summary>Blocking-screen title.</summary>
        public string DisplayTitle { get; set; } = "";

        /// <summary>Blocking-screen explanatory message.</summary>
        public string DisplayMessage { get; set; } = "";

        /// <summary>Primary action button label on the blocking screen.</summary>
        public string DisplayAction { get; set; } = "Refresh License Status";

        /// <summary>Support contact name shown on the blocking screen.</summary>
        public string SupportName { get; set; } = "Lavneet Rathi";

        /// <summary>Support phone shown on the blocking screen.</summary>
        public string SupportPhone { get; set; } = "+91 94138 21007";

        /// <summary>Support email shown on the blocking screen.</summary>
        public string SupportEmail { get; set; } = "support@tallyonmobile.com";
    }
}
