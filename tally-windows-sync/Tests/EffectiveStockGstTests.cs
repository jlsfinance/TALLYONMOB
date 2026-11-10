using TallySyncApp.Models;
using TallySyncApp.Services;

public class EffectiveStockGstTests
{
    [Fact]
    public void InheritedGroupRateReplacesOldItemRateOnEffectiveDate()
    {
        var item = new StockItem { Name = "VICTOR", StockGroup = "Bairathi", GstHistory = new() {
            new() { From = new(2022,1,1), Rate = 12 },
            new() { From = new(2025,9,22), Inherits = true } } };
        var group = new StockGroup { Name = "Bairathi", GstHistory = new() {
            new() { From = new(2017,7,1), Rate = 12 },
            new() { From = new(2025,9,22), Rate = 5 },
            new() { From = new(2027,1,1), Rate = 0 } } };
        var history = EffectiveStockGst.Resolve(item, new[] { group });
        decimal Rate(DateTime d) => history.Last(s => s.From <= d).Rate;
        Assert.Equal(12m, Rate(new(2025,9,21)));
        Assert.Equal(5m, Rate(new(2026,10,31)));
        Assert.Equal(0m, Rate(new(2027,1,1)));
    }
}
