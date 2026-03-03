using System;
using System.Net.Http;
using System.Net.Sockets;
using System.Text.Json;
using System.Text;
using System.Threading.Tasks;

class Program
{
    static async Task Main(string[] args)
    {
        Console.WriteLine("Testing Supabase Login with real IP...");
        var _supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxjc2VoY3dvY3F2eHJyZ2JtaGN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMDg4NTEsImV4cCI6MjA4NDg4NDg1MX0.NcPhO9plyRhijUd4YZlJR2Of_sGBFRKb1HvGDgCMjt4";

        var socketsHandler = new SocketsHttpHandler
        {
            ConnectCallback = async (context, cancellationToken) =>
            {
                var socket = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
                socket.NoDelay = true;

                try
                {
                    // Real Cloudflare IP for Supabase
                    Console.WriteLine($"Connecting to real IP: 104.18.38.10");
                    await socket.ConnectAsync("104.18.38.10", context.DnsEndPoint.Port, cancellationToken);
                    return new NetworkStream(socket, ownsSocket: true);
                }
                catch
                {
                    socket.Dispose();
                    throw;
                }
            }
        };

        var handler = new HttpClientHandler
        {
            AllowAutoRedirect = true
        };

        var _httpClient = new HttpClient(socketsHandler) { Timeout = TimeSpan.FromSeconds(30) };
        _httpClient.DefaultRequestHeaders.Add("apikey", _supabaseAnonKey);

        try
        {
            var requestBody = new { email = "test@test.com", password = "wrongpassword" };
            var content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync($"https://lcsehcwocqvxrrgbmhcz.supabase.co/auth/v1/token?grant_type=password", content);
            var responseBody = await response.Content.ReadAsStringAsync();
            Console.WriteLine("Status: " + response.StatusCode);
            Console.WriteLine("Response: " + responseBody);
        }
        catch (Exception ex)
        {
            Console.WriteLine("Error: " + ex.ToString());
        }
    }
}
