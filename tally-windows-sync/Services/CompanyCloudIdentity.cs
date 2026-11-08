using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace TallySyncApp.Services;

public sealed record ExistingCompanyIdentity(string Id, string? TallyGuid);

public static class CompanyCloudIdentity
{
    // Folder location is metadata, not part of a company's cloud identity.
    public static string Generate(string name, string tallyGuid)
    {
        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(tallyGuid))
            throw new InvalidOperationException("Company name and Tally GUID are required to create a cloud ID.");
        return new Guid(MD5.HashData(Encoding.UTF8.GetBytes($"{name.Trim()}|{tallyGuid.Trim().ToLowerInvariant()}"))).ToString();
    }

    public static string Resolve(string name, string tallyGuid, string? legacyCurrentPathId, IReadOnlyList<ExistingCompanyIdentity> existing)
    {
        var generated = Generate(name, tallyGuid);
        var matches = existing.Where(row =>
            string.Equals(row.Id, generated, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(row.Id, legacyCurrentPathId, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(row.TallyGuid?.Trim(), tallyGuid.Trim(), StringComparison.OrdinalIgnoreCase))
            .Select(row => row.Id).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (matches.Count > 1)
            throw new InvalidOperationException("Multiple cloud companies match this Tally GUID. Resolve the existing mappings before syncing; no new company was created.");
        if (matches.Count == 1) return matches[0];
        if (existing.Any(row => string.IsNullOrWhiteSpace(row.TallyGuid)))
            throw new InvalidOperationException("A same-name cloud company already exists without a verified Tally GUID mapping. Link the existing company before syncing from a changed path; no duplicate was created.");
        return generated;
    }
}
