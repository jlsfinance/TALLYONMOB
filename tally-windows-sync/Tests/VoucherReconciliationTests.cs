using System.Security.Cryptography;
using System.Text;
using TallySyncApp.Models;
using TallySyncApp.Services;

namespace TallySyncApp.Tests;

public class VoucherReconciliationTests
{
    private const string Company = "de822af9-31b3-1022-d69f-6b3226e07356";
    private const string DeletedGuid = "027603ac-813c-4fbc-aecd-9cbc01277707-0000aa2a";
    private static string Id(string input) => new Guid(MD5.HashData(Encoding.UTF8.GetBytes(input))).ToString();
    private static List<VoucherIndexEntry> Index() => Enumerable.Range(1, 25)
        .Select(n => new VoucherIndexEntry { Guid = $"present-{n}", AlterId = n.ToString() }).ToList();
    private static List<CloudVoucherIdentity> Cloud(List<VoucherIndexEntry> index, bool scoped) => index
        .Select(v => new CloudVoucherIdentity { Id = Id(scoped ? $"{Company}|{v.Guid}" : v.Guid), Guid = v.Guid, AlterId = v.AlterId, IsDeleted = false })
        .Append(new CloudVoucherIdentity { Id = scoped ? "2a29beb2-c83e-d7c5-bcf3-53f1f451ce68" : Id(DeletedGuid), Guid = DeletedGuid, AlterId = "105629", IsDeleted = false }).ToList();

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void ConfirmedDeletionSupportsActualCompanyScopedAndLegacyIds(bool scoped)
    {
        var index = Index();
        var cloud = Cloud(index, scoped);
        var diff = VoucherReconciliation.Compare(index, cloud);
        var candidates = VoucherReconciliation.SafeDeleteCandidates(index, index, index.Select(v => long.Parse(v.AlterId!)).ToList(), cloud, diff, out var reason, Company);
        Assert.Equal("", reason);
        Assert.Equal(cloud.Last().Id, Assert.Single(candidates).Id);
    }

    [Theory]
    [InlineData("other-company")]
    [InlineData("arbitrary-id")]
    [InlineData("duplicate-guid")]
    [InlineData("changed-index")]
    [InlineData("incomplete-index")]
    public void UnsafeCandidatesRemainBlocked(string failure)
    {
        var index = Index();
        var second = Index();
        var cloud = Cloud(index, true);
        var alters = index.Select(v => long.Parse(v.AlterId!)).ToList();
        var company = Company;
        if (failure == "other-company") company = "11111111-1111-1111-1111-111111111111";
        if (failure == "arbitrary-id") cloud.Last().Id = Guid.NewGuid().ToString();
        if (failure == "duplicate-guid") cloud.Add(new CloudVoucherIdentity { Id = Guid.NewGuid().ToString(), Guid = DeletedGuid, AlterId = "105629", IsDeleted = false });
        if (failure == "changed-index") second[0].AlterId = "900";
        if (failure == "incomplete-index") alters.Add(999);
        var diff = VoucherReconciliation.Compare(index, cloud);
        Assert.Empty(VoucherReconciliation.SafeDeleteCandidates(index, second, alters, cloud, diff, out var reason, company));
        Assert.NotEmpty(reason);
    }
}
