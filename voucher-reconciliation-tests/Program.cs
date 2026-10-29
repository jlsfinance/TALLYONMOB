using TallySyncApp.Models;
using TallySyncApp.Services;
using System.Security.Cryptography;
using System.Text;

static void Check(bool ok, string message) { if (!ok) throw new Exception(message); }
static VoucherIndexEntry T(string guid, string alter) => new() { Guid = guid, AlterId = alter };
static CloudVoucherIdentity C(string guid, string alter) => new() { Id = Guid.NewGuid().ToString(), Guid = guid, AlterId = alter };
var empty = VoucherReconciliation.Compare(new[] { T("one", "10") }, Array.Empty<CloudVoucherIdentity>());
Check(empty.MissingAlterIds.SequenceEqual(new long[] { 10 }), "missing voucher");
var same = VoucherReconciliation.Compare(new[] { T("one", "10") }, new[] { C("one", "10") });
Check(same.MissingAlterIds.Count == 0 && same.PossibleDeletedIds.Count == 0, "matching GUID");
var edited = VoucherReconciliation.Compare(new[] { T("one", "11") }, new[] { C("one", "10") });
Check(edited.MissingAlterIds.SequenceEqual(new long[] { 11 }), "old edited voucher");
var legacy = VoucherReconciliation.Compare(new[] { T("new", "12") }, new[] { new CloudVoucherIdentity { Id = "legacy", AlterId = "4" } });
Check(legacy.MissingAlterIds.Count == 0 && legacy.AmbiguousRows > 0, "legacy rows must block unsafe additions");
var extras = VoucherReconciliation.Compare(new[] { T("one", "10") }, new[] { C("one", "10"), C("old", "4") });
Check(extras.PossibleDeletedIds.Count == 1, "delete candidate reported only");
var sameId = new Guid(MD5.HashData(Encoding.UTF8.GetBytes("one"))).ToString();
var guidless = VoucherReconciliation.Compare(new[] { T("one", "10") }, new[] { new CloudVoucherIdentity { Id = sameId } });
Check(guidless.MissingAlterIds.Count == 0, "deterministic ID prevents duplicate");
var duplicates = VoucherReconciliation.Compare(new[] { T("one", "11") }, new[] { C("one", "10"), C("one", "10") });
Check(duplicates.MissingAlterIds.Count == 0 && duplicates.AmbiguousRows > 0, "duplicate identity ambiguity");
var full = Enumerable.Range(1, 1200).Select(i => T($"v-{i}", i.ToString())).ToArray();
var liveCloud = full.Select(v => C(v.Guid, v.AlterId!)).ToList();
var removedGuid = "deleted-guid";
var removedId = new Guid(MD5.HashData(Encoding.UTF8.GetBytes(removedGuid))).ToString();
liveCloud.Add(new CloudVoucherIdentity { Id = removedId, Guid = removedGuid, AlterId = "9000", IsDeleted = false });
foreach (var item in liveCloud) item.IsDeleted = false;
var deletionDiff = VoucherReconciliation.Compare(full, liveCloud);
Check(VoucherReconciliation.SafeDeleteCandidates(full, full, liveCloud, deletionDiff).Single().Id == removedId, "confirmed deletion");
var duplicateCloud = liveCloud.Concat(full.Take(20).Select(v => { var duplicate = C(v.Guid, v.AlterId!); duplicate.IsDeleted = false; return duplicate; })).ToList();
Check(VoucherReconciliation.SafeDeleteCandidates(full, full, duplicateCloud, VoucherReconciliation.Compare(full, duplicateCloud)).Single().Id == removedId, "duplicate unrelated cloud GUIDs must not block a unique confirmed deletion");
var duplicateCandidate = duplicateCloud.Append(new CloudVoucherIdentity { Id = Guid.NewGuid().ToString(), Guid = removedGuid, AlterId = "9001", IsDeleted = false }).ToList();
Check(VoucherReconciliation.SafeDeleteCandidates(full, full, duplicateCandidate, VoucherReconciliation.Compare(full, duplicateCandidate)).Count == 0, "ambiguous deletion candidate must remain blocked");
Check(VoucherReconciliation.SafeDeleteCandidates(full, full.Skip(1).ToArray(), liveCloud, deletionDiff).Count == 0, "incomplete Tally index");
var changedIndex = full.Select(v => T(v.Guid, v.AlterId!)).ToArray();
changedIndex[0].AlterId = "9999";
Check(VoucherReconciliation.SafeDeleteCandidates(full, changedIndex, liveCloud, deletionDiff).Count == 0, "changed Tally snapshot");
var untrusted = new CloudVoucherIdentity { Id = Guid.NewGuid().ToString(), Guid = "cloud-only", AlterId = "10000", IsDeleted = false };
liveCloud.Add(untrusted);
Check(VoucherReconciliation.SafeDeleteCandidates(full, full, liveCloud, VoucherReconciliation.Compare(full, liveCloud)).Count == 0, "cloud-only row must not be deleted");
var withoutConfirmedState = new CloudVoucherIdentity { Id = removedId, Guid = removedGuid, AlterId = "9000", IsDeleted = null };
var unknownStateCloud = liveCloud.Where(v => v.Guid != removedGuid && v.Guid != "cloud-only").Append(withoutConfirmedState).ToList();
Check(VoucherReconciliation.SafeDeleteCandidates(full, full, unknownStateCloud, VoucherReconciliation.Compare(full, unknownStateCloud)).Count == 0, "unknown deleted state must not be mutated");
var tooManyCloud = liveCloud.Where(v => v.Guid != "cloud-only").ToList();
for (int i = 0; i < 6; i++) { var g = $"extra-{i}"; tooManyCloud.Add(new CloudVoucherIdentity { Id = new Guid(MD5.HashData(Encoding.UTF8.GetBytes(g))).ToString(), Guid = g, AlterId = (11000 + i).ToString(), IsDeleted = false }); }
Check(VoucherReconciliation.SafeDeleteCandidates(full, full, tooManyCloud, VoucherReconciliation.Compare(full, tooManyCloud)).Count == 0, "bulk deletes blocked");
Console.WriteLine("Voucher reconciliation checks passed.");

namespace TallySyncApp.Models { public class VoucherIndexEntry { public string Guid { get; set; } = ""; public string? AlterId { get; set; } } }



