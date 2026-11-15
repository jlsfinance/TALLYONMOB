using Newtonsoft.Json.Linq;

namespace TallySyncApp.Services;

internal static class VoucherInventoryPayload
{
    public static JArray Read(JObject data)
    {
        var source = data["inventory_entries"] as JArray ?? data["items"] as JArray ?? data["stock_entries"] as JArray ?? new JArray();
        return new JArray(source.OfType<JObject>().Select(original =>
        {
            var item = (JObject)original.DeepClone();
            item["stock_item_name"] ??= item["stock_item"] ?? item["item_name"] ?? item["name"] ?? item["description"];
            item["discount_value"] ??= item["discountPercent"] ?? item["discount_percent"] ?? item["discount"];
            return item;
        }));
    }
}
