using TallySyncApp.Services;

namespace TallySyncApp.Tests;

public class CompanyCloudIdentityTests
{
    private const string OldId = "11111111-1111-1111-1111-111111111111";

    [Fact]
    public void FreshCompanyUsesNameAndGuid()
    {
        Assert.Equal(CompanyCloudIdentity.Generate("ABC", "guid-1"),
            CompanyCloudIdentity.Resolve("ABC", "guid-1", null, []));
    }

    [Fact]
    public void GuidCasingAndPaddingDoNotCreateNewCompany()
    {
        Assert.Equal(CompanyCloudIdentity.Generate("ABC", "GUID-1"), CompanyCloudIdentity.Generate(" ABC ", " guid-1 "));
    }

    [Fact]
    public void SameGuidAtMovedPathKeepsPreviouslySyncedCloudId()
    {
        Assert.Equal(OldId, CompanyCloudIdentity.Resolve("ABC", "guid-1", "different-path-legacy-hash",
            [new ExistingCompanyIdentity(OldId, "guid-1")]));
    }

    [Fact]
    public void RecognizedLegacyIdIsReusedOnUpgrade()
    {
        Assert.Equal(OldId, CompanyCloudIdentity.Resolve("ABC", "guid-1", OldId,
            [new ExistingCompanyIdentity(OldId, null)]));
    }

    [Fact]
    public void ExistingNewSchemeIdIsReusedWithoutRegistryMapping()
    {
        var id = CompanyCloudIdentity.Generate("ABC", "guid-1");
        Assert.Equal(id, CompanyCloudIdentity.Resolve("ABC", "guid-1", null,
            [new ExistingCompanyIdentity(id, null)]));
    }

    [Fact]
    public void SameNameWithKnownDifferentGuidGetsDistinctCompany()
    {
        Assert.NotEqual(OldId, CompanyCloudIdentity.Resolve("ABC", "guid-2", null,
            [new ExistingCompanyIdentity(OldId, "guid-1")]));
    }

    [Fact]
    public void UnmappedLegacyCompanyIsBlockedInsteadOfDuplicatedOrMergedByName()
    {
        Assert.Throws<InvalidOperationException>(() => CompanyCloudIdentity.Resolve("ABC", "guid-1", null,
            [new ExistingCompanyIdentity(OldId, null)]));
    }

    [Fact]
    public void ConflictingCloudIdsForSameGuidRequireResolution()
    {
        Assert.Throws<InvalidOperationException>(() => CompanyCloudIdentity.Resolve("ABC", "guid-1", null,
            [new ExistingCompanyIdentity(OldId, "guid-1"), new ExistingCompanyIdentity(Guid.NewGuid().ToString(), "guid-1")]));
    }

    [Fact]
    public void MultiplePathsMappedToSameCloudIdRemainOneCompany()
    {
        Assert.Equal(OldId, CompanyCloudIdentity.Resolve("ABC", "guid-1", null,
            [new ExistingCompanyIdentity(OldId, "guid-1"), new ExistingCompanyIdentity(OldId, "guid-1")]));
    }

    [Fact]
    public void MissingGuidCannotSilentlyFallBackToNameOnly()
    {
        Assert.Throws<InvalidOperationException>(() => CompanyCloudIdentity.Generate("ABC", ""));
    }
}
