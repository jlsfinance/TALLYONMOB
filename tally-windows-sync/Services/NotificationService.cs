using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

namespace TallySyncApp.Services
{
    public class NotificationService
    {
        private readonly string _fcmServerKey;
        private readonly ILogger<NotificationService>? _logger;
        private readonly HttpClient _httpClient;

        public NotificationService(string fcmServerKey, ILogger<NotificationService>? logger = null)
        {
            _fcmServerKey = fcmServerKey;
            _logger = logger;
            _httpClient = new HttpClient();
        }

        public async Task SendNotificationAsync(string title, string body, List<string>? tokens = null)
        {
            if (string.IsNullOrEmpty(_fcmServerKey))
            {
                _logger?.LogWarning("FCM Server Key is missing. Skipping notification.");
                return;
            }

            if (tokens == null || tokens.Count == 0)
            {
                // Fallback to topic 'all' if no tokens provided
                // But generally we want tokens.
                // Let's keep topic support for legacy/broadcast if needed?
                // For now, let's just create a topic payload if tokens are null, 
                // OR just return if we want strict token usage.
                
                // Let's dual support: if empty, send to 'all'
                await SendToTopicAsync(title, body, "all");
                return;
            }

            try
            {
                var payload = new
                {
                    registration_ids = tokens,
                    notification = new
                    {
                        title = title,
                        body = body,
                        sound = "default",
                        android_channel_id = "sync_status"
                    },
                    data = new
                    {
                        click_action = "FLUTTER_NOTIFICATION_CLICK", 
                        type = "sync_status"
                    }
                };

                var json = JsonConvert.SerializeObject(payload);
                var request = new HttpRequestMessage(HttpMethod.Post, "https://fcm.googleapis.com/fcm/send");
                request.Headers.TryAddWithoutValidation("Authorization", $"key={_fcmServerKey}");
                request.Content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(request);
                if (response.IsSuccessStatusCode)
                {
                    _logger?.LogInformation($"Notification sent to {tokens.Count} devices: {title}");
                }
                else
                {
                    var responseBody = await response.Content.ReadAsStringAsync();
                    _logger?.LogError($"FCM Error: {response.StatusCode} - {responseBody}");
                }
            }
            catch (Exception ex)
            {
                _logger?.LogError($"Failed to send notification: {ex.Message}");
            }
        }

        private async Task SendToTopicAsync(string title, string body, string topic)
        {
             try
            {
                var payload = new
                {
                    to = $"/topics/{topic}",
                    notification = new
                    {
                        title = title,
                        body = body,
                        sound = "default",
                        android_channel_id = "sync_status"
                    },
                    data = new
                    {
                        click_action = "FLUTTER_NOTIFICATION_CLICK", 
                        type = "sync_status"
                    }
                };

                var json = JsonConvert.SerializeObject(payload);
                var request = new HttpRequestMessage(HttpMethod.Post, "https://fcm.googleapis.com/fcm/send");
                request.Headers.TryAddWithoutValidation("Authorization", $"key={_fcmServerKey}");
                request.Content = new StringContent(json, Encoding.UTF8, "application/json");

                await _httpClient.SendAsync(request);
            }
            catch {}
        }
    }
}
