using Newtonsoft.Json.Linq;
using TallySyncApp.Services;

namespace TallySyncApp.Tests;

public class VoucherInventoryPayloadTests
{
    [Fact]
    public void EditInventoryHasPriorityAndNormalizesNamesWithoutMutatingAuditSource()
    {
        var data = JObject.Parse("{\"inventory_entries\":[{\"stock_item\":\"THEBAAO\",\"quantity\":1,\"rate\":1000,\"amount\":1000,\"discount\":5}],\"items\":[{\"stock_item_name\":\"old\",\"rate\":100}]}");
        var item = Assert.Single(VoucherInventoryPayload.Read(data));
        Assert.Equal("THEBAAO", item.Value<string>("stock_item_name"));
        Assert.Equal(1000, item.Value<decimal>("amount"));
        Assert.Equal(5, item.Value<decimal>("discount_value"));
        Assert.Null(data["inventory_entries"]![0]!["stock_item_name"]);
    }

    [Theory]
    [InlineData("items")]
    [InlineData("stock_entries")]
    public void ExistingCreatePayloadsStillWork(string key)
    {
        var data = new JObject { [key] = JArray.Parse("[{\"stock_item_name\":\"Shoe\",\"rate\":100,\"amount\":100}]") };
        Assert.Equal("Shoe", Assert.Single(VoucherInventoryPayload.Read(data)).Value<string>("stock_item_name"));
    }
}
