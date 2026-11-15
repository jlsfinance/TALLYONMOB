using TallySyncApp.Services;

namespace TallySyncApp.Tests;

public class VoucherEditXmlTests
{
    private const string ExistingGuid = "1678a8ac-2a68-43e8-b044-54d95352050f-00000035";

    private static string CreateXml() => string.Join("\n",
        "<ENVELOPE><BODY>",
        "<STATICVARIABLES><SVCURRENTCOMPANY>Tera Baap1</SVCURRENTCOMPANY></STATICVARIABLES>",
        "<VOUCHER VCHTYPE=\"Receipt\" ACTION=\"Create\" REMOTEID=\"new-guid\">",
        "<DATE>20261101</DATE><GUID>new-guid</GUID><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>",
        "<VOUCHERNUMBER>5</VOUCHERNUMBER>",
        "</VOUCHER></BODY></ENVELOPE>");

    [Fact]
    public void Edit_Reuses_Existing_Voucher_Identity()
    {
        var xml = VoucherEditXml.Apply(CreateXml(), ExistingGuid, "53", "70", "existing-key");

        Assert.Contains("Action=\"Alter\"", xml);
        Assert.Contains("<TALLYREQUEST>Import</TALLYREQUEST>", xml);
        Assert.DoesNotContain("REMOTEID=", xml);
        Assert.DoesNotContain("<GUID>", xml);
        Assert.DoesNotContain("<MASTERID>", xml);
        Assert.DoesNotContain("<ALTERID>", xml);
        Assert.Contains("TAGNAME=\"Master ID\"", xml);
        Assert.Contains("TAGVALUE=\"53\"", xml);
        Assert.DoesNotContain("VCHKEY=", xml);
        Assert.Contains("DATE=\"20261101\"", xml);
        Assert.DoesNotContain("new-guid", xml);
    }

    [Fact]
    public void Edit_Does_Not_Inject_Identity_Into_Voucher_Prefixed_Tags()
    {
        // Live bug: "<VOUCHER[^>]*>" also matched <VOUCHERTYPENAME>/<VOUCHERNUMBER>, and Tally
        // answered "Unknown Request, cannot be processed" for the nested MASTERID.
        var xml = VoucherEditXml.Apply(CreateXml(), ExistingGuid, "53", "70", "existing-key");

        Assert.Contains("<VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>", xml);
        Assert.Contains("<VOUCHERNUMBER>5</VOUCHERNUMBER>", xml);
        Assert.DoesNotContain("<VOUCHERTYPENAME><MASTERID>", xml);
        Assert.DoesNotContain("<VOUCHERNUMBER><MASTERID>", xml);
        Assert.DoesNotContain("SVFROMDATE", xml);
    }

    [Fact]
    public void Edit_Without_Guid_Is_Blocked()
    {
        Assert.Throws<InvalidOperationException>(() => VoucherEditXml.Apply(CreateXml(), null, "53", "70", "key"));
    }

    [Theory]
    [InlineData("1", "0", false)]
    [InlineData("1", "1", false)]
    [InlineData("0", "0", false)]
    [InlineData("0", "1", true)]
    public void EditRequiresAlterationAndMustNeverAcceptCreation(string created, string altered, bool expected)
    {
        var response = System.Xml.Linq.XDocument.Parse($"<RESPONSE><CREATED>{created}</CREATED><ALTERED>{altered}</ALTERED><ERRORS>0</ERRORS></RESPONSE>");
        Assert.Equal(expected, VoucherEditXml.IsConfirmedAlter(response));
    }

    [Fact]
    public void NarrationPreservesUserTextAndIncludesBeforeAfter()
    {
        var data = Newtonsoft.Json.Linq.JObject.Parse("{\"narration\":\"Original note\",\"edit_audit\":{\"edited_at\":\"2026-11-15T16:00:00Z\",\"edited_by\":\"tester\",\"changes\":[{\"label\":\"Amount\",\"before\":\"10000\",\"after\":\"1000\"}]}}");
        var result = VoucherEditXml.AuditNarration(data);
        Assert.StartsWith("Original note", result);
        Assert.Contains("Edited via Syncora", result);
        Assert.Contains("before [10000] -> after [1000]", result);
    }

    [Fact]
    public void DateChangeTargetsOldDateButImportsNewDate()
    {
        var xml = VoucherEditXml.Apply(CreateXml().Replace("20261101", "20261102"), ExistingGuid, "53", "70", "key", "Alter", "20261101");
        Assert.Contains("DATE=\"20261101\"", xml);
        Assert.Contains("<DATE>20261102</DATE>", xml);
    }

    [Fact]
    public void DeleteUsesTheSameExplicitMasterIdTarget()
    {
        var doc = System.Xml.Linq.XDocument.Parse(VoucherEditXml.Apply(CreateXml(), ExistingGuid, "53", "70", "key", "Delete"));
        var voucher = doc.Descendants("VOUCHER").Single();
        Assert.Equal("Delete", voucher.Attribute("Action")?.Value);
        Assert.Equal("53", voucher.Attribute("TAGVALUE")?.Value);
        Assert.Null(voucher.Attribute("REMOTEID"));
    }
}
