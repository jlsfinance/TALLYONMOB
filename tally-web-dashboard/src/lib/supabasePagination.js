export const DEFAULT_SUPABASE_PAGE_SIZE = 1000;

function defaultRowKey(row) {
  if (row && row.id !== null && row.id !== undefined) return String(row.id);
  return null;
}

/**
 * Fetch every visible row from a Supabase/PostgREST query in bounded ranges.
 * The builder must reapply the same filters and a deterministic order for each
 * requested range. Offset advances by the number actually returned (not the
 * requested page size), so a server-side max_rows smaller than the requested
 * range cannot silently skip records. A final empty response is the only EOF
 * signal; errors are never converted into partial success.
 */
export async function fetchAllSupabaseRows(
  buildQuery,
  { pageSize = DEFAULT_SUPABASE_PAGE_SIZE, maxRows = Number.POSITIVE_INFINITY, getRowKey = defaultRowKey } = {},
) {
  if (typeof buildQuery !== 'function') {
    throw new TypeError('fetchAllSupabaseRows requires a query builder');
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new RangeError('pageSize must be a positive safe integer');
  }
  if (maxRows !== Number.POSITIVE_INFINITY && (!Number.isSafeInteger(maxRows) || maxRows < 0)) {
    throw new RangeError('maxRows must be a non-negative safe integer or Infinity');
  }

  const rows = [];
  const seen = new Set();
  let offset = 0;

  while (rows.length < maxRows) {
    const requestedPageSize = Math.min(pageSize, maxRows - rows.length);
    const { data, error } = await buildQuery(offset, offset + requestedPageSize - 1);
    if (error) throw error;

    const batch = Array.isArray(data) ? data : [];
    if (batch.length === 0) break;

    let added = 0;
    for (const row of batch) {
      const key = getRowKey ? getRowKey(row) : null;
      if (key !== null && key !== undefined) {
        const normalizedKey = String(key);
        if (seen.has(normalizedKey)) continue;
        seen.add(normalizedKey);
      }
      rows.push(row);
      added += 1;
    }

    // Protect against an ignored/broken range that keeps returning the same
    // non-empty page forever. Returning an error is safer than partial totals.
    if (added === 0) {
      throw new Error(`Supabase pagination made no progress at offset ${offset}`);
    }

    // A PostgREST server may return fewer rows than requested because its
    // configured max_rows is lower. Move by the actual response length.
    offset += batch.length;
  }

  return rows;
}
