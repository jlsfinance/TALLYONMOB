// Callers supply a stable unique sort before applying the inclusive REST range.
export async function readAllPages(buildQuery, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) return { data: rows, error: null };
  }
}
