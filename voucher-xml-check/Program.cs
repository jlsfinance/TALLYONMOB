using System.Reflection;
using System.Net.Http;
using System.Xml.Linq;
using Newtonsoft.Json.Linq;
using TallySyncApp.Services;

var type = typeof(TallyVoucherPusher);
var pusher = new TallyVoucherPusher(null!, null!);
var context = Activator.CreateInstance(type.GetNestedType("CompanyContext", BindingFlags.NonPublic)!, true)!;
if (args.Contains("--live"))
{
    using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
    foreach (var name in new[] { "Purchase", "Receipt", "Payment", "CreditNote", "DebitNote", "Sales" }.Where(n => args.Length < 2 || n == args[1]))
    {
        var money = name is "Receipt" or "Payment";
        var party = name == "Receipt" ? "Aajad Kumar" : name is "Purchase" or "Payment" or "DebitNote" ? "Aar Kay Electricals" : "Abbaskha Kirana Store";
        var ledger = money ? "Cash" : name is "Purchase" or "DebitNote" ? @"PURCHASE A\C" : "SALE";
        var liveData = JObject.Parse("{\"total_amount\":1,\"grand_total\":1,\"amount\":1,\"stock_entries\":[{\"item_name\":\"0%\",\"quantity\":1,\"rate\":1,\"amount\":1,\"unit\":\"PC\"}]}");
        var guid = Guid.NewGuid().ToString();
        var methodArgs = money ? new object[] { "Shauryaji", liveData, new DateTime(2026, 12, 1), party, "SYNCORA CLI TEST " + name, ledger, guid }
            : new object[] { "Shauryaji", liveData, new DateTime(2026, 10, 31), party, "SYNCORA CLI TEST " + name, ledger, context, guid };
        var generated = ((string, string?))type.GetMethod("Generate" + name + "VoucherXml", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(pusher, methodArgs)!;
        if (generated.Item2 != null) { Console.WriteLine(name + " GENERATION ERROR: " + generated.Item2); break; }
        using var content = new StringContent(generated.Item1, System.Text.Encoding.UTF8, "text/xml");
        using var response = await http.PostAsync("http://127.0.0.1:9000/", content);
        var body = await response.Content.ReadAsStringAsync();
        Console.WriteLine(name + " GUID=" + guid + " HTTP=" + (int)response.StatusCode + " RESPONSE=" + body.Replace('\n', ' ').Replace('\r', ' '));
        var tally = XDocument.Parse(body);
        if ((int?)tally.Descendants("CREATED").FirstOrDefault() != 1 && (int?)tally.Descendants("ALTERED").FirstOrDefault() != 1) break;
    }
    return;
}
var data = JObject.Parse("{\"voucher_number\":\"TEST-1\",\"total_amount\":100,\"grand_total\":100,\"amount\":100,\"stock_entries\":[{\"item_name\":\"Test Item\",\"quantity\":1,\"rate\":100,\"amount\":100,\"unit\":\"PC\"}]}");
var date = new DateTime(2026, 10, 30);
foreach (var name in new[] { "Receipt", "Payment", "Sales", "Purchase", "CreditNote", "DebitNote" })
{
    bool money = name is "Receipt" or "Payment";
    var methodArgs = money ? new object[] { "Test Company", data, date, "Test Party", "", "Test Bank", "test-guid" }
        : new object[] { "Test Company", data, date, "Test Party", "", "Test Account", context, "test-guid" };
    var result = ((string, string?))type.GetMethod("Generate" + name + "VoucherXml", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(pusher, methodArgs)!;
    if (result.Item2 != null) throw new Exception(name + ": " + result.Item2);
    var doc = XDocument.Parse(result.Item1);
    var voucher = doc.Descendants("VOUCHER").Single();
    var expected = name switch { "CreditNote" => "Credit Note", "DebitNote" => "Debit Note", _ => name };
    if ((string?)voucher.Element("VOUCHERTYPENAME") != expected) throw new Exception(name + ": incorrect voucher type");
    if (money)
    {
        if ((string?)voucher.Element("PARTYLEDGERNAME") != (name == "Receipt" ? "Test Party" : "Test Bank")) throw new Exception(name + ": wrong party ledger");
        var entries = voucher.Elements("ALLLEDGERENTRIES.LIST").ToList();
        var bank = entries.Single(e => (string?)e.Element("LEDGERNAME") == "Test Bank");
        var party = entries.Single(e => (string?)e.Element("LEDGERNAME") == "Test Party");
        var expectedBank = name == "Receipt" ? -100 : 100;
        if ((decimal)bank.Element("AMOUNT")! != expectedBank || (decimal)party.Element("AMOUNT")! != -expectedBank || (string?)bank.Element("ISPARTYLEDGER") != "Yes") throw new Exception(name + ": ledger signs or party marker incorrect");
    }
    else
    {
        var item = voucher.Elements("ALLINVENTORYENTRIES.LIST").Single();
        if ((string?)item.Element("ACCOUNTINGALLOCATIONS.LIST")?.Element("LEDGERNAME") != "Test Account") throw new Exception(name + ": wrong account ledger");
        var expectedAmount = name is "DebitNote" or "Sales" ? 100 : -100;
        if ((decimal)item.Element("AMOUNT")! != expectedAmount) throw new Exception(name + ": incorrect item amount sign");
    }
    Console.WriteLine(name + ": XML structure, selected ledger and amount signs PASS");
}
