using Newtonsoft.Json;

namespace TallySyncApp.Models
{
    /// <summary>
    /// One row of tally_push_queue — server/web-created push for the connector
    /// (sync request, voucher import, ...). Consumed by SyncManager and acked.
    /// </summary>
    public class PushQueueItem
    {
        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("company_id")]
        public string CompanyId { get; set; } = string.Empty;

        [JsonProperty("action")]
        public string Action { get; set; } = string.Empty;

        [JsonProperty("payload")]
        public object? Payload { get; set; }

        [JsonProperty("retry_count")]
        public int RetryCount { get; set; }
    }
}
