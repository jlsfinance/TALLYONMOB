using System.Xml.Linq;
using Newtonsoft.Json.Linq;

namespace TallySyncApp.Services;

internal static class VoucherEditXml
{
    public static string Apply(string xml, string? guid, string? masterId, string? alterId, string? vchKey, string action = "Alter", string? originalDate = null)
    {
        if (string.IsNullOrWhiteSpace(guid) || string.IsNullOrWhiteSpace(masterId)
            || string.IsNullOrWhiteSpace(alterId) || string.IsNullOrWhiteSpace(vchKey))
            throw new InvalidOperationException("Existing Tally voucher identity is incomplete; edit blocked.");
        var doc = XDocument.Parse(xml);
        var voucher = doc.Descendants("VOUCHER").Single();
        if (action != "Alter" && action != "Delete") throw new ArgumentException("Unsupported existing-voucher action.", nameof(action));
        voucher.Attributes().Where(a => a.Name.LocalName.Equals("ACTION", StringComparison.OrdinalIgnoreCase)).Remove();
        voucher.SetAttributeValue("Action", action);
        voucher.SetAttributeValue("TAGNAME", "Master ID");
        voucher.SetAttributeValue("TAGVALUE", masterId.Trim());
        // Exported internal GUID/VCHKEY are not the original external import identity.
        // Sending them as REMOTEID can make Tally create a second voucher. Address the
        // existing object exclusively through its live Master ID; keep GUID for verification.
        foreach (var name in new[] { "REMOTEID", "VCHKEY", "DATE" }) voucher.Attribute(name)?.Remove();
        foreach (var name in new[] { "GUID", "MASTERID", "ALTERID", "VOUCHERKEY", "VOUCHERRETAINKEY", "REUSEHOLEID" })
            voucher.Elements(name).Remove();
        var lookupDate = originalDate ?? voucher.Element("DATE")?.Value.Trim();
        if (string.IsNullOrWhiteSpace(lookupDate)) throw new InvalidOperationException("Original voucher date is missing; edit blocked.");
        voucher.SetAttributeValue("DATE", lookupDate);
        var company = doc.Descendants("SVCURRENTCOMPANY").Single().Value;
        return new XDocument(new XElement("ENVELOPE",
            new XElement("HEADER", new XElement("VERSION", "1"), new XElement("TALLYREQUEST", "Import"),
                new XElement("TYPE", "Data"), new XElement("ID", "Vouchers")),
            new XElement("BODY", new XElement("DESC", new XElement("STATICVARIABLES", new XElement("SVCURRENTCOMPANY", company))),
                new XElement("DATA", new XElement("TALLYMESSAGE", new XElement(voucher)))))).ToString();
    }

    public static bool IsConfirmedAlter(XDocument response) =>
        response.Descendants("ALTERED").FirstOrDefault()?.Value.Trim() == "1"
        && response.Descendants("CREATED").FirstOrDefault()?.Value.Trim() == "0"
        && (response.Descendants("ERRORS").FirstOrDefault()?.Value.Trim() ?? "0") == "0"
        && (response.Descendants("EXCEPTIONS").FirstOrDefault()?.Value.Trim() ?? "0") == "0";

    public static string AuditNarration(JObject data)
    {
        var narration = data.Value<string>("narration") ?? "";
        var audit = data["edit_audit"] as JObject;
        if (audit == null) return narration;
        var changes = (audit["changes"] as JArray ?? new JArray()).OfType<JObject>()
            .Select(c => $"{c.Value<string>("label")}: before [{c.Value<string>("before")}] -> after [{c.Value<string>("after")}]");
        var record = $"Edited via Syncora at {audit.Value<string>("edited_at")} by {audit.Value<string>("edited_by")}. " + string.Join("; ", changes);
        return string.IsNullOrWhiteSpace(narration) ? record : narration + "\n" + record;
    }
}
