using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using TallySyncApp.Models;

namespace TallySyncApp.Services
{
    // Matching is deliberately conservative: legacy and ambiguous rows must never be deleted.
    public sealed class CloudVoucherIdentity
    {
        public string Id { get; set; } = "";
        public string? Guid { get; set; }
        public string? AlterId { get; set; }
        public bool? IsDeleted { get; set; }
        public string? PartyName { get; set; }
        public string? VoucherNumber { get; set; }
        public string? VoucherType { get; set; }
    }

    public sealed class VoucherReconciliationResult
    {
        public List<long> MissingAlterIds { get; } = new();
        public List<string> PossibleDeletedIds { get; } = new();
        public int AmbiguousRows { get; set; }
    }

    public static class VoucherReconciliation
    {
        // Fail closed if snapshots differ, coverage is weak, identities are ambiguous,
        // or the independent ALTERID-only list does not match the index. Reversible soft delete only.
        public static List<CloudVoucherIdentity> SafeDeleteCandidates(
            IReadOnlyList<VoucherIndexEntry> first, IReadOnlyList<VoucherIndexEntry> second,
            IReadOnlyList<long> alterIds,
            IReadOnlyList<CloudVoucherIdentity> cloud, VoucherReconciliationResult diff)
            => SafeDeleteCandidates(first, second, alterIds, cloud, diff, out _);

        public static List<CloudVoucherIdentity> SafeDeleteCandidates(
            IReadOnlyList<VoucherIndexEntry> first, IReadOnlyList<VoucherIndexEntry> second,
            IReadOnlyList<long> alterIds,
            IReadOnlyList<CloudVoucherIdentity> cloud, VoucherReconciliationResult diff, out string reason)
        {
            reason = "";
            if (first.Count < 1 || second.Count != first.Count) { reason = "Tally index count is too small or changed between snapshots"; return new(); }
            if (first.Any(v => string.IsNullOrWhiteSpace(v.Guid)) || second.Any(v => string.IsNullOrWhiteSpace(v.Guid))) { reason = "Tally index contains missing GUIDs"; return new(); }
            var firstKeys = first.Select(v => (v.Guid.Trim().ToUpperInvariant(), (v.AlterId ?? "").Trim())).ToHashSet();
            var secondKeys = second.Select(v => (v.Guid.Trim().ToUpperInvariant(), (v.AlterId ?? "").Trim())).ToHashSet();
            if (firstKeys.Count != first.Count || secondKeys.Count != second.Count || !firstKeys.SetEquals(secondKeys)) { reason = "Tally snapshots contain duplicates or changed identities"; return new(); }
            if (first.Select(v => v.Guid.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).Count() != first.Count) { reason = "Tally index contains duplicate GUIDs"; return new(); }
            if (first.Any(v => string.IsNullOrWhiteSpace(v.Guid) || !long.TryParse(v.AlterId, out var id) || id <= 0)) { reason = "Tally index contains invalid ALTERIDs"; return new(); }
            // Independent proof of completeness (LK parity): the ALTERID-only list is a far
            // smaller payload than the full index, so a truncated or partial full index cannot
            // match it. Only when both agree is the Tally snapshot known to be whole.
            var indexAlterIds = new HashSet<long>(first.Select(v => long.Parse(v.AlterId!.Trim())));
            var independentAlterIds = new HashSet<long>(alterIds.Where(a => a > 0));
            if (independentAlterIds.Count == 0 || !independentAlterIds.SetEquals(indexAlterIds))
            { reason = $"Independent Tally ALTERID list does not match the index (alterid-only={independentAlterIds.Count}, index={indexAlterIds.Count})"; return new(); }
            // Duplicate cloud rows must not inflate the number of distinct Tally identities.
            // Duplicates remain ineligible for deletion via the candidate check below.
            var activeKnown = cloud.Where(v => v.IsDeleted == false && !string.IsNullOrWhiteSpace(v.Guid))
                .Select(v => v.Guid!.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).Count();
            if (first.Count < 20)
            {
                // Small companies: losing one row can exceed any percentage threshold, so
                // require a complete, unambiguous identity match for every row. The number of
                // deletions is no longer capped - the independent ALTERID list above already
                // proved the index is whole, so any number of real deletions is safe.
                if (diff.PossibleDeletedIds.Count < 1 ||
                    activeKnown != first.Count + diff.PossibleDeletedIds.Count ||
                    diff.MissingAlterIds.Count != 0 || diff.AmbiguousRows != 0 ||
                    cloud.Any(v => v.IsDeleted != true && (v.IsDeleted != false || string.IsNullOrWhiteSpace(v.Guid))) ||
                    cloud.Count(v => v.IsDeleted == false) != activeKnown)
                { reason = "Small-company identity coverage is incomplete or ambiguous"; return new(); }
            }
            else if (activeKnown == 0 || activeKnown != first.Count + diff.PossibleDeletedIds.Count) { reason = $"Tally index coverage is insufficient (Tally={first.Count}, cloud active GUIDs={activeKnown}, possible deleted={diff.PossibleDeletedIds.Count})"; return new(); }
            var ids = new HashSet<string>(diff.PossibleDeletedIds, StringComparer.OrdinalIgnoreCase);
            var grouped = cloud.Where(v => v.IsDeleted == false && !string.IsNullOrWhiteSpace(v.Guid))
                .GroupBy(v => v.Guid!.Trim(), StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);
            var candidates = cloud.Where(v => ids.Contains(v.Id) && v.IsDeleted == false && !string.IsNullOrWhiteSpace(v.Guid)
                && !string.IsNullOrWhiteSpace(v.AlterId) && grouped[v.Guid.Trim()] == 1
                && string.Equals(v.Id, new Guid(MD5.HashData(Encoding.UTF8.GetBytes(v.Guid.Trim()))).ToString(), StringComparison.OrdinalIgnoreCase)).ToList();
            if (candidates.Count != ids.Count) { reason = $"Candidate identity check failed (possible={ids.Count}, verified={candidates.Count})"; return new(); }
            return candidates;
        }

        public static VoucherReconciliationResult Compare(IReadOnlyList<VoucherIndexEntry> tally, IReadOnlyList<CloudVoucherIdentity> cloud)
        {
            var result = new VoucherReconciliationResult();
            var valid = tally.Where(v => !string.IsNullOrWhiteSpace(v.Guid)).ToList();
            var tallyGuids = new HashSet<string>(valid.Select(v => v.Guid.Trim()), StringComparer.OrdinalIgnoreCase);
            var tallyAlterIds = new HashSet<string>(valid.Where(v => !string.IsNullOrWhiteSpace(v.AlterId)).Select(v => v.AlterId!.Trim()), StringComparer.Ordinal);
            var cloudIds = new HashSet<string>(cloud.Where(v => v.IsDeleted != true).Select(v => v.Id), StringComparer.OrdinalIgnoreCase);
            // ALTERID can change on edit, so a GUID-less legacy record matching by ALTERID
            // is treated as present but not as a reliable deletion candidate.
            var hasUnresolvedLegacy = cloud.Any(v => v.IsDeleted != true && string.IsNullOrWhiteSpace(v.Guid));
            var softDeletedGuids = new HashSet<string>(cloud.Where(v => v.IsDeleted == true && !string.IsNullOrWhiteSpace(v.Guid)).Select(v => v.Guid!.Trim()), StringComparer.OrdinalIgnoreCase);
            var allCloudAlterIds = new HashSet<string>(cloud.Where(v => !string.IsNullOrWhiteSpace(v.AlterId)).Select(v => v.AlterId!.Trim()), StringComparer.Ordinal);
            var legacyAlterIds = new HashSet<string>(cloud.Where(v => v.IsDeleted != true && string.IsNullOrWhiteSpace(v.Guid) && !string.IsNullOrWhiteSpace(v.AlterId)).Select(v => v.AlterId!.Trim()), StringComparer.Ordinal);
            var knownByGuid = cloud.Where(v => v.IsDeleted != true && !string.IsNullOrWhiteSpace(v.Guid))
                .GroupBy(v => v.Guid!.Trim(), StringComparer.OrdinalIgnoreCase)
                .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.OrdinalIgnoreCase);
            foreach (var v in valid)
            {
                var guid = v.Guid.Trim();
                var deterministicId = new Guid(MD5.HashData(Encoding.UTF8.GetBytes(guid))).ToString();
                if (knownByGuid.TryGetValue(guid, out var matches))
                {
                    if (matches.Count != 1) { result.AmbiguousRows++; continue; }
                    if (long.TryParse(v.AlterId, out var tallyAlter) && tallyAlter > 0 && long.TryParse(matches[0].AlterId, out var cloudAlter) && tallyAlter > cloudAlter)
                        result.MissingAlterIds.Add(tallyAlter);
                    continue;
                }
                if (cloudIds.Contains(deterministicId) || (!string.IsNullOrWhiteSpace(v.AlterId) && legacyAlterIds.Contains(v.AlterId.Trim()))) continue;
                if (hasUnresolvedLegacy || softDeletedGuids.Contains(guid) || (!string.IsNullOrWhiteSpace(v.AlterId) && allCloudAlterIds.Contains(v.AlterId.Trim()))) { result.AmbiguousRows++; continue; }
                if (long.TryParse(v.AlterId, out var alterId) && alterId > 0) result.MissingAlterIds.Add(alterId);
                else result.AmbiguousRows++;
            }
            foreach (var v in cloud.Where(v => v.IsDeleted != true))
            {
                if (string.IsNullOrWhiteSpace(v.Guid)) { result.AmbiguousRows++; continue; }
                var guid = v.Guid.Trim();
                if (tallyGuids.Contains(guid)) continue;
                if (!string.IsNullOrWhiteSpace(v.AlterId) && tallyAlterIds.Contains(v.AlterId.Trim())) { result.AmbiguousRows++; continue; }
                result.PossibleDeletedIds.Add(v.Id);
            }
            result.MissingAlterIds.Sort();
            return result;
        }
    }
}
