export function effectiveGstRate(stock, date) {
    const history = stock?.gst_details?.effective_rates;
    if (Array.isArray(history) && history.length) {
        const applicable = history.filter(s => s.from <= date && Number.isFinite(Number(s.rate)))
            .sort((a, b) => b.from.localeCompare(a.from))[0];
        return applicable ? Number(applicable.rate) : 0;
    }
    return Number(stock?.gst_rate) || 0;
}
