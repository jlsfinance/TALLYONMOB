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
        Console.WriteLine("Testing Supabase Login...");
        var _supabaseUrl = "https://lcsehcwocqvxrrgbmhcz.supabase.co";
        var _supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxjc2VoY3dvY3F2eHJyZ2JtaGN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMDg4NTEsImV4cCI6MjA4NDg4NDg1MX0.NcPhO9plyRhijUd4YZlJR2Of_sGBFRKb1HvGDgCMjt4";

        var socketsHandler = new SocketsHttpHandler
        {
            ConnectCallback = async (context, cancellationToken) =>
            {
                // Force IPv4 lookup
                var entry = await System.Net.Dns.GetHostEntryAsync(context.DnsEndPoint.Host, cancellationToken);
                var socket = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
                socket.NoDelay = true;

                try
                {
                    foreach (var address in entry.AddressList)
                    {
                        if (address.AddressFamily == AddressFamily.InterNetwork) // Force IPv4
                        {
                            Console.WriteLine($"Trying IPv4: {address}");
                            await socket.ConnectAsync(address, context.DnsEndPoint.Port, cancellationToken);
                            return new NetworkStream(socket, ownsSocket: true);
                        }
                    }
                    throw new Exception("No IPv4 address found.");
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

        // For .NET 8, we can use SocketsHttpHandler to force IPv4
        var _httpClient = new HttpClient(socketsHandler) { Timeout = TimeSpan.FromSeconds(30) };
        _httpClient.DefaultRequestHeaders.Add("apikey", _supabaseAnonKey);

        try
        {
            Console.WriteLine("Sending request again with IPv4 forced...");
            var requestBody = new { email = "test@test.com", password = "wrongpassword" };
            var content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync($"{_supabaseUrl}/auth/v1/token?grant_type=password", content);
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
