using System;
using Newtonsoft.Json;

namespace TallySyncApp.Models
{
    /// <summary>One entry in the user's licence history (signup, trial, purchase, extension, ...).</summary>
    public class LicenseHistoryEntry
    {
        public string EventType { get; set; } = string.Empty;   // "signup", "trial_activated", "license_purchased", "license_extended", "license_reactivated"
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public string PlanName { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public DateTime? ExpiryDate { get; set; }
        public decimal? Amount { get; set; }
        public string Icon { get; set; } = "📄";
        public string Color { get; set; } = "#6B7280";
    }
}
