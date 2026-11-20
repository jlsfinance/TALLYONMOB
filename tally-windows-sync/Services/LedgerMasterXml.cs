using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Xml.Linq;

namespace TallySyncApp.Services;

/// <summary>Only collection objects are masters; CMPINFO/LEDGER is a numeric counter.</summary>
public static class LedgerMasterXml
{
    public static bool ValidIdentity(string? name, string? guid, string? parent, string? masterId, string? alterId) =>
        !string.IsNullOrWhiteSpace(name) && !string.IsNullOrWhiteSpace(guid) && !string.IsNullOrWhiteSpace(parent) &&
        long.TryParse(masterId?.Trim(), out var master) && master > 0 &&
        long.TryParse(alterId?.Trim(), out var alter) && alter >= 0;

    public static IReadOnlyList<XElement> Objects(XDocument document)
    {
        if (document.Descendants().Any(e => e.Name.LocalName == "LINEERROR"))
            throw new InvalidOperationException("Tally rejected the ledger export.");
        var collections = document.Descendants().Where(e => e.Name.LocalName == "COLLECTION" &&
            e.Ancestors().Any(a => a.Name.LocalName == "DATA")).ToList();
        if (collections.Count == 0)
            throw new InvalidOperationException("Tally ledger collection missing; master sync stopped.");
        var objects = collections.SelectMany(c => c.Elements().Where(e => e.Name.LocalName == "LEDGER")).ToList();
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var ledger in objects)
        {
            var name = ledger.Attribute("NAME")?.Value ?? ledger.Element("NAME")?.Value;
            var guid = ledger.Element("GUID")?.Value;
            if (!ValidIdentity(name, guid, ledger.Element("PARENT")?.Value,
                    ledger.Element("MASTERID")?.Value, ledger.Element("ALTERID")?.Value) || !ids.Add(guid!.Trim()))
                throw new InvalidOperationException("Incomplete/duplicate Tally ledger master; no placeholder will be uploaded.");
        }
        return objects;
    }

    // Tally XML: negative = debit. The web statement uses positive = debit.
    public static decimal WebBalance(string? nativeAmount)
    {
        if (string.IsNullOrWhiteSpace(nativeAmount)) return 0;
        if (!decimal.TryParse(nativeAmount.Trim(), NumberStyles.Number | NumberStyles.AllowLeadingSign,
                CultureInfo.InvariantCulture, out var amount))
            throw new InvalidOperationException("Invalid Tally ledger balance; master sync stopped.");
        return -amount;
    }
}
