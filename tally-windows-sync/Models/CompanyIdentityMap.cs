using System;
using Newtonsoft.Json;

namespace TallySyncApp.Models
{
    /// <summary>
    /// Maps a Tally company identity (GUID + Data Path + Source) to a cloud company_id.
    /// Owner-scoped: same Tally GUID + Data Path can exist under different owners.
    /// SourceId is independent of GUID and Name — prevents collision when same GUID is copied.
    /// </summary>
    public class CompanyIdentityMap
    {
        public string SupabaseCompanyId { get; set; } = string.Empty;
        public string TallyGuid { get; set; } = string.Empty;
        public string DataPath { get; set; } = string.Empty;
        public string SourceId { get; set; } = string.Empty;
        public string OwnerId { get; set; } = string.Empty;
        public DateTime RegisteredAt { get; set; }
        public DateTime? LastSeenAt { get; set; }
        public bool IsVerified { get; set; }
        public bool IsActive { get; set; } = true;
        /// <summary>
        /// Cloud confirmation state. Pending = local mapping exists but cloud activation
        /// has not been confirmed. Confirmed = both local and cloud agree on this path.
        /// Sync must not resume until state is Confirmed.
        /// </summary>
        public string ConfirmationState { get; set; } = "pending";
    }
}
