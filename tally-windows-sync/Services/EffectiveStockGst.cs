using TallySyncApp.Models;

namespace TallySyncApp.Services;

public static class EffectiveStockGst
{
    public static List<GstRateSlab> Resolve(StockItem item, IEnumerable<StockGroup> groups)
    {
        var chain = new List<List<GstRateSlab>> { item.GstHistory };
        var lookup = groups.GroupBy(g => g.Name.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var parent = item.StockGroup;
        while (parent != null && visited.Add(parent.Trim()) && lookup.TryGetValue(parent.Trim(), out var group))
        {
            chain.Add(group.GstHistory);
            parent = group.Parent;
        }
        var result = new List<GstRateSlab>();
        foreach (var date in chain.SelectMany(h => h).Select(s => s.From.Date).Distinct().OrderBy(d => d))
        {
            foreach (var history in chain)
            {
                var slab = history.Where(s => s.From.Date <= date).OrderByDescending(s => s.From).FirstOrDefault();
                if (slab == null || slab.Inherits) continue;
                result.Add(new GstRateSlab { From = date, Rate = slab.Rate });
                break;
            }
        }
        return result;
    }
}
