using System.Security;
using System.Text.RegularExpressions;

namespace TallySyncApp.Services;

/// <summary>
/// Turns a generated create-voucher XML into an alter of the voucher already in Tally.
/// TallyPrime alters only when REMOTEID + GUID + MASTERID match and the voucher date falls
/// inside SVFROMDATE/SVTODATE (verified live against TallyPrime).
/// </summary>
internal static class VoucherEditXml
{
    public static string Apply(string xml, string? guid, string? masterId, DateTime? date)
    {
        if (string.IsNullOrWhiteSpace(guid)) return xml;
        var safeGuid = SecurityElement.Escape(guid.Trim());

        var remote = Regex.Match(xml, "<VOUCHER[^>]*REMOTEID=\"([^\"]+)\"");
        if (remote.Success) xml = xml.Replace(remote.Groups[1].Value, safeGuid);
        xml = Regex.Replace(xml, "<GUID>[^<]*</GUID>", $"<GUID>{safeGuid}</GUID>");
        xml = xml.Replace("ACTION=\"Create\"", "ACTION=\"Alter\"", StringComparison.Ordinal);

        if (!string.IsNullOrWhiteSpace(masterId))
            xml = Regex.Replace(xml, "<VOUCHER([^>]*)>",
                $"<VOUCHER$1><MASTERID>{SecurityElement.Escape(masterId.Trim())}</MASTERID>");

        if (date.HasValue)
            xml = xml.Replace("<SVCURRENTCOMPANY>",
                $"<SVFROMDATE>{date:yyyyMMdd}</SVFROMDATE><SVTODATE>{date:yyyyMMdd}</SVTODATE><SVCURRENTCOMPANY>");
        return xml;
    }
}
