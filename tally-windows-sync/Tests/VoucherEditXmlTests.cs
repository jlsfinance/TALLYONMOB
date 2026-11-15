using TallySyncApp.Services;

namespace TallySyncApp.Tests;

public class VoucherEditXmlTests
{
    private const string ExistingGuid = "1678a8ac-2a68-43e8-b044-54d95352050f-00000035";

    private static string CreateXml() => string.Join("\n",
        "<ENVELOPE><BODY>",
        "<STATICVARIABLES><SVCURRENTCOMPANY>Tera Baapp</SVCURRENTCOMPANY></STATICVARIABLES>",
        "<VOUCHER VCHTYPE=\"Receipt\" ACTION=\"Create\" REMOTEID=\"new-guid\">",
        "<GUID>new-guid</GUID><VOUCHERNUMBER>5</VOUCHERNUMBER>",
        "</VOUCHER></BODY></ENVELOPE>");

    [Fact]
    public void Edit_Reuses_Existing_Voucher_Identity()
    {
        var xml = VoucherEditXml.Apply(CreateXml(), ExistingGuid, "53", new DateTime(2026, 11, 1));

        Assert.Contains("ACTION=\"Alter\"", xml);
        Assert.Contains($"REMOTEID=\"{ExistingGuid}\"", xml);
        Assert.Contains($"<GUID>{ExistingGuid}</GUID>", xml);
        Assert.Contains("<MASTERID>53</MASTERID>", xml);
        Assert.Contains("<SVFROMDATE>20261101</SVFROMDATE><SVTODATE>20261101</SVTODATE>", xml);
        Assert.DoesNotContain("new-guid", xml);
    }

    [Fact]
    public void Edit_Without_Guid_Leaves_Create_Xml_Untouched()
    {
        var xml = VoucherEditXml.Apply(CreateXml(), null, "53", new DateTime(2026, 11, 1));

        Assert.Contains("ACTION=\"Create\"", xml);
        Assert.DoesNotContain("<MASTERID>", xml);
        Assert.DoesNotContain("SVFROMDATE", xml);
    }
}
