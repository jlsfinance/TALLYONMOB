export function removeMirroredStockEntries(items, netAmount, taxAmount = 0) {
    if (!Array.isArray(items) || items.length < 2 || items.length % 2 !== 0 || !netAmount) return items;
    const half = items.length / 2;
    const key = item => JSON.stringify([
        String(item.item_name || item.stock_item_name || item.item_label || item.StockItemName || '').trim().toLowerCase(),
        Math.abs(Number(item.quantity ?? item.billed_qty ?? item.Quantity) || 0),
        Math.abs(Number(item.rate ?? item.unit_price ?? item.Rate) || 0),
        Math.abs(Number(item.amount ?? item.Amount) || 0)
    ]);
    const first = items.slice(0, half);
    const second = items.slice(half);
    const counts = new Map();
    first.forEach(item => counts.set(key(item), (counts.get(key(item)) || 0) + 1));
    for (const item of second) {
        const k = key(item);
        if (!counts.get(k)) return items;
        counts.set(k, counts.get(k) - 1);
    }
    const total = first.reduce((sum, item) => sum + Math.abs(Number(item.amount ?? item.Amount) || 0), 0);
    const tolerance = Math.max(10, Math.abs(netAmount) * 0.001);
    return total > 0 && Math.abs(total + taxAmount - Math.abs(netAmount)) <= tolerance ? first : items;
}
