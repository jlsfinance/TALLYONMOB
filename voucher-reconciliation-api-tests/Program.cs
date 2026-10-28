using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using TallySyncApp.Services;
var socket = new TcpListener(IPAddress.Loopback, 0); socket.Start(); int port = ((IPEndPoint)socket.LocalEndpoint).Port; socket.Stop();
using var server = new HttpListener(); server.Prefixes.Add($"http://127.0.0.1:{port}/"); server.Start();
var id = Guid.NewGuid().ToString();
var first = Task.Run(async () => {
    var ctx = await server.GetContextAsync();
    var body = await new StreamReader(ctx.Request.InputStream).ReadToEndAsync();
    if (ctx.Request.HttpMethod != "PATCH" || !ctx.Request.QueryString["company_id"]!.StartsWith("eq.") || ctx.Request.QueryString["id"] != "eq." + id || ctx.Request.QueryString["guid"] != "eq.tally-guid" || ctx.Request.QueryString["alter_id"] != "eq.123" || ctx.Request.QueryString["is_deleted"] != "eq.false" || !body.Contains("\"is_deleted\":true")) throw new Exception("Unsafe request");
    var bytes = Encoding.UTF8.GetBytes($"[{{\"id\":\"{id}\",\"is_deleted\":true}}]"); ctx.Response.ContentType = "application/json"; ctx.Response.ContentLength64 = bytes.Length; await ctx.Response.OutputStream.WriteAsync(bytes); ctx.Response.Close();
});
using var api = new ApiClient($"http://127.0.0.1:{port}", "test-key"); api.SetUserToken("test-token");
if (!await api.SoftDeleteReconciledVoucherAsync("company-one", new CloudVoucherIdentity { Id = id, Guid = "tally-guid", AlterId = "123", IsDeleted = false })) throw new Exception("Expected verified delete");
await first;
var second = Task.Run(async () => { var c = await server.GetContextAsync(); var bytes = Encoding.UTF8.GetBytes("[]"); c.Response.ContentLength64 = bytes.Length; await c.Response.OutputStream.WriteAsync(bytes); c.Response.Close(); });
if (await api.SoftDeleteReconciledVoucherAsync("company-one", new CloudVoucherIdentity { Id = id, Guid = "tally-guid", AlterId = "123", IsDeleted = false })) throw new Exception("Empty update must not count as delete");
await second;
if (await api.SoftDeleteReconciledVoucherAsync("company-one", new CloudVoucherIdentity { Id = id, Guid = "tally-guid", AlterId = "123", IsDeleted = null })) throw new Exception("Unknown state must fail closed");
Console.WriteLine("Scoped soft-delete HTTP checks passed.");

