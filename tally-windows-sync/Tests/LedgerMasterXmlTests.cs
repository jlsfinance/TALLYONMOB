using System.Xml.Linq;
using TallySyncApp.Services;
namespace TallySyncApp.Tests;
public class LedgerMasterXmlTests
{
    private static string Master(string name="Cash",string guid="company-00000001") => $"<LEDGER NAME='{name}'><GUID>{guid}</GUID><PARENT>Cash-in-Hand</PARENT><MASTERID>1</MASTERID><ALTERID>2</ALTERID><OPENINGBALANCE>-125.50</OPENINGBALANCE></LEDGER>";
    private static XDocument Response(string objects) => XDocument.Parse($"<ENVELOPE><BODY><DESC><CMPINFO><LEDGER>878</LEDGER></CMPINFO></DESC><DATA><COLLECTION>{objects}</COLLECTION></DATA></BODY></ENVELOPE>");
    [Fact] public void CounterIsNotALedger() { var rows=LedgerMasterXml.Objects(Response(Master())); Assert.Single(rows);Assert.Equal("Cash",rows[0].Attribute("NAME")!.Value); }
    [Fact] public void NoModifiedLedgersProducesEmptyListNotUnknown() => Assert.Empty(LedgerMasterXml.Objects(Response("")));
    [Fact] public void MissingCollectionFails() => Assert.Throws<InvalidOperationException>(()=>LedgerMasterXml.Objects(XDocument.Parse("<ENVELOPE><CMPINFO><LEDGER>9</LEDGER></CMPINFO></ENVELOPE>")));
    [Fact] public void IncompleteObjectFailsInsteadOfInventingIdentity() => Assert.Throws<InvalidOperationException>(()=>LedgerMasterXml.Objects(Response("<LEDGER><NAME>Cash</NAME></LEDGER>")));
    [Fact] public void DuplicateGuidFails() => Assert.Throws<InvalidOperationException>(()=>LedgerMasterXml.Objects(Response(Master()+Master("Bank"))));
    [Fact] public void TallyErrorFails() => Assert.Throws<InvalidOperationException>(()=>LedgerMasterXml.Objects(XDocument.Parse("<ENVELOPE><LINEERROR>Company unavailable</LINEERROR></ENVELOPE>")));
    [Theory][InlineData("-125.50",125.50)][InlineData("350.25",-350.25)][InlineData("0.00",0)][InlineData("",0)][InlineData("-1,000.50",1000.50)]
    public void TallySignsBecomeWebDebitPositive(string input,decimal expected)=>Assert.Equal(expected,LedgerMasterXml.WebBalance(input));
    [Fact] public void InvalidBalanceCannotSilentlyBecomeZero()=>Assert.Throws<InvalidOperationException>(()=>LedgerMasterXml.WebBalance("bad"));
    [Fact] public void QueuedPlaceholderIdentityIsRejected()=>Assert.False(LedgerMasterXml.ValidIdentity("Unknown","random-guid",null,null,null));
    [Fact] public void GenuineLedgerNamedUnknownIsAccepted()=>Assert.True(LedgerMasterXml.ValidIdentity("Unknown","company-00000001","Sundry Debtors","4","9"));
}
