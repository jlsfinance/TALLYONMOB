import { createClient } from "@insforge/sdk";
const API_KEY = import.meta.env.VITE_INSFORGE_KEY || "ik_9bef5476d1f848d9f06212a645525293";
const API_URL = import.meta.env.VITE_INSFORGE_URL || "https://3uq8fv8r.ap-southeast.insforge.app";
const client = createClient({ baseUrl: API_URL, anonKey: API_KEY });
const normalizeError = (error, fallbackMessage) => {
  if (!error)
    return null;
  if (error instanceof Error)
    return error;
  if (typeof error === "string")
    return new Error(error);
  return new Error(fallbackMessage);
};
const authCompat = client.auth;
const nativeGetCurrentSession = typeof authCompat.getCurrentSession === "function" ? authCompat.getCurrentSession.bind(authCompat) : null;
const nativeGetCurrentUser = typeof authCompat.getCurrentUser === "function" ? authCompat.getCurrentUser.bind(authCompat) : null;
const getSessionLikeFromPayload = (payload) => {
  const session = payload?.session || payload || {};
  const user = session?.user || payload?.user || null;
  const accessToken = session?.accessToken || session?.access_token || payload?.accessToken || payload?.access_token || payload?.token || null;
  if (!user || !accessToken)
    return null;
  return { user, accessToken };
};
const persistSessionFromPayload = (payload) => {
  try {
    const session = getSessionLikeFromPayload(payload);
    if (!session)
      return false;
    client.tokenManager?.setStorageMode?.();
    client.tokenManager?.saveSession?.(session);
    client.getHttpClient?.()?.setAuthToken?.(session.accessToken);
    return true;
  } catch (_) {
    return false;
  }
};
const clearClientSession = () => {
  try {
    client.tokenManager?.clearSession?.();
  } catch (_) {
  }
  try {
    client.getHttpClient?.()?.setAuthToken?.(null);
  } catch (_) {
  }
};
try {
  client.tokenManager?.setStorageMode?.();
  const existingToken = client.tokenManager?.getAccessToken?.();
  if (existingToken) {
    client.getHttpClient?.()?.setAuthToken?.(existingToken);
  }
} catch (_) {
}
if (typeof authCompat.signInWithPassword === "function") {
  const nativeSignInWithPassword = authCompat.signInWithPassword.bind(authCompat);
  authCompat.signInWithPassword = async (credentials) => {
    const result = await nativeSignInWithPassword(credentials);
    if (!result?.error)
      persistSessionFromPayload(result?.data);
    return result;
  };
}
if (typeof authCompat.signUp === "function") {
  const nativeSignUp = authCompat.signUp.bind(authCompat);
  authCompat.signUp = async (payload) => {
    const result = await nativeSignUp(payload);
    if (!result?.error)
      persistSessionFromPayload(result?.data);
    return result;
  };
}
if (typeof authCompat.verifyEmail === "function") {
  const nativeVerifyEmail = authCompat.verifyEmail.bind(authCompat);
  authCompat.verifyEmail = async (payload) => {
    const result = await nativeVerifyEmail(payload);
    if (!result?.error)
      persistSessionFromPayload(result?.data);
    return result;
  };
}
if (typeof authCompat.signInWithIdToken === "function") {
  const nativeSignInWithIdToken = authCompat.signInWithIdToken.bind(authCompat);
  authCompat.signInWithIdToken = async (payload) => {
    const result = await nativeSignInWithIdToken(payload);
    if (!result?.error)
      persistSessionFromPayload(result?.data);
    return result;
  };
}
if (typeof authCompat.signInWithGoogle !== "function") {
  authCompat.signInWithGoogle = async (options = {}) => {
    const { redirectTo = `${window.location.origin}/auth/callback` } = options;
    return authCompat.signInWithOAuth({ provider: "google", redirectTo });
  };
}
if (typeof authCompat.setSession !== "function") {
  authCompat.setSession = async ({ access_token: accessToken, refresh_token: refreshToken }) => {
    if (!accessToken) {
      return { data: { session: null }, error: new Error("access_token is required") };
    }
    try {
      const tokenManager = client.tokenManager;
      tokenManager?.setStorageMode?.();
      if (tokenManager?.setAccessToken)
        tokenManager.setAccessToken(accessToken);
      client.getHttpClient?.()?.setAuthToken?.(accessToken);
      const cachedUser = tokenManager?.getUser?.();
      if (cachedUser) {
        return { data: { session: { accessToken, refreshToken, user: cachedUser } }, error: null };
      }
      const { data, error } = nativeGetCurrentUser ? await nativeGetCurrentUser() : { data: { user: null }, error: null };
      if (error) {
        return { data: { session: null }, error };
      }
      const user = data?.user || null;
      if (user && tokenManager?.setUser)
        tokenManager.setUser(user);
      return { data: { session: user ? { accessToken, refreshToken, user } : null }, error: null };
    } catch (error) {
      return { data: { session: null }, error: normalizeError(error, "Failed to set session") };
    }
  };
}
authCompat.getCurrentUser = async () => {
  try {
    const session = client.tokenManager?.getSession?.() || null;
    if (session?.accessToken && session?.user) {
      client.getHttpClient?.()?.setAuthToken?.(session.accessToken);
      return { data: { user: session.user }, error: null };
    }
    if (nativeGetCurrentUser) {
      const result = await nativeGetCurrentUser();
      if (!result?.error)
        persistSessionFromPayload(result?.data);
      return result;
    }
    return { data: { user: null }, error: null };
  } catch (error) {
    return { data: { user: null }, error: normalizeError(error, "Failed to get current user") };
  }
};
authCompat.getCurrentSession = async () => {
  try {
    const session = client.tokenManager?.getSession?.() || null;
    if (session?.accessToken && session?.user) {
      client.getHttpClient?.()?.setAuthToken?.(session.accessToken);
      return { data: { session }, error: null };
    }
    const { data, error } = await authCompat.getCurrentUser();
    if (error)
      return { data: { session: null }, error };
    const user = data?.user || null;
    const accessToken = client.tokenManager?.getAccessToken?.() || null;
    return { data: { session: user && accessToken ? { user, accessToken } : null }, error: null };
  } catch (error) {
    return { data: { session: null }, error: normalizeError(error, "Failed to get session") };
  }
};
const clearLocalSession = async () => {
  try {
    await authCompat.signOut?.();
  } catch (_) {
  }
  clearClientSession();
};
const supabase = new Proxy(client, { get(target, prop, receiver) {
  if (prop === "from")
    return target.database.from.bind(target.database);
  if (prop === "rpc")
    return target.database.rpc.bind(target.database);
  if (prop === "auth")
    return authCompat;
  return Reflect.get(target, prop, receiver);
} });
const auth = authCompat;
const db = client.database;
const DR_VOUCHER_TYPES = /* @__PURE__ */ new Set(["Sales", "Sales Invoice", "Payment", "Debit Note"]);
const CR_VOUCHER_TYPES = /* @__PURE__ */ new Set(["Purchase", "Purchase Invoice", "Receipt", "Credit Note"]);
const getVoucherAmount = (voucher) => {
  return Math.abs(Number(voucher?.grand_total) || Number(voucher?.total_amount) || Number(voucher?.amount) || 0);
};
const getVoucherEffect = (voucherType, amount) => {
  const safeAmount = Math.abs(Number(amount) || 0);
  const isDebit = DR_VOUCHER_TYPES.has(voucherType);
  const isCredit = CR_VOUCHER_TYPES.has(voucherType);
  return { debit: isDebit ? safeAmount : 0, credit: isCredit ? safeAmount : 0, net: (isDebit ? safeAmount : 0) - (isCredit ? safeAmount : 0), isDebit, isCredit };
};
const compareByVoucherDate = (a, b) => {
  const ad = new Date(a?.voucher_date || a?.created_at || 0).getTime();
  const bd = new Date(b?.voucher_date || b?.created_at || 0).getTime();
  if (ad !== bd)
    return ad - bd;
  return String(a?.id || a?.voucher_id || "").localeCompare(String(b?.id || b?.voucher_id || ""));
};
const buildVoucherMap = (rows) => {
  const map = {};
  (rows || []).forEach((row) => {
    if (!row)
      return;
    if (row.id)
      map[row.id] = row;
    if (row.voucher_id)
      map[row.voucher_id] = row;
  });
  return map;
};
const chunkValues = (values, chunkSize = 40) => {
  const chunks = [];
  for (let i = 0; i < values.length; i += chunkSize) {
    chunks.push(values.slice(i, i + chunkSize));
  }
  return chunks;
};
const fetchVouchersByIds = async ({ companyId, voucherIds, select, partyName = null, partyLike = false, fromDate = null, toDate = null, voucherTypes = null }) => {
  const uniqIds = [...new Set((voucherIds || []).filter(Boolean))];
  if (!companyId || uniqIds.length === 0) {
    return { data: [], error: null };
  }
  const chunks = chunkValues(uniqIds, 40);
  const rows = [];
  for (const idChunk of chunks) {
    let q = db.from("vouchers").select(select).eq("company_id", companyId).in("id", idChunk);
    if (partyName) {
      q = partyLike ? q.ilike("party_name", "%" + partyName + "%") : q.eq("party_name", partyName);
    }
    if (fromDate)
      q = q.gte("voucher_date", fromDate);
    if (toDate)
      q = q.lte("voucher_date", toDate);
    if (voucherTypes?.length)
      q = q.in("voucher_type", voucherTypes);
    const res = await q;
    if (res.error) {
      return { data: rows, error: res.error };
    }
    rows.push(...res.data || []);
  }
  return { data: rows, error: null };
};
const companyApi = { list: async () => db.from("companies").select("*").order("name"), getById: async (id) => db.from("companies").select("*").eq("id", id).single(), getAppSettings: async () => {
  const { data, error } = await db.from("app_settings").select("*");
  if (error)
    return { data: null, error };
  const settings = {};
  (data || []).forEach((s) => {
    settings[s.key] = s.value;
  });
  return { data: settings, error: null };
}, getSummary: async (companyId) => {
  try {
    const [l, v, s] = await Promise.all([db.from("ledgers").select("*", { head: true, count: "exact" }).eq("company_id", companyId), db.from("vouchers").select("*").eq("company_id", companyId).eq("is_deleted", false), db.from("stock_items").select("*", { head: true, count: "exact" }).eq("company_id", companyId)]);
    let totalSales = 0, totalPurchases = 0;
    if (v.data) {
      v.data.forEach((vd) => {
        const amt = Math.abs(Number(vd.grand_total) || Number(vd.total_amount) || 0);
        if (vd.voucher_type === "Sales")
          totalSales += amt;
        if (vd.voucher_type === "Purchase")
          totalPurchases += amt;
      });
    }
    return { ledgerCount: l.count || 0, voucherCount: v.data?.length || 0, stockCount: s.count || 0, totalSales, totalPurchases };
  } catch (e) {
    return { ledgerCount: 0, voucherCount: 0, stockCount: 0, totalSales: 0, totalPurchases: 0 };
  }
}, deleteCompanyData: async (companyId) => {
  return { success: true, error: "Not implemented in direct sdk safely" };
} };
const ledgerApi = { list: async (companyId, parentGroup = null) => {
  let q = db.from("ledgers").select("*").eq("company_id", companyId).order("name");
  if (parentGroup)
    q = q.eq("parent", parentGroup);
  return await q;
}, getById: async (id) => db.from("ledgers").select("*").eq("id", id).single(), getGroups: async (companyId) => {
  const { data, error } = await db.from("ledgers").select("parent").eq("company_id", companyId);
  if (error)
    return { data: [], error };
  return { data: [...new Set(data.map((l) => l.parent).filter(Boolean))], error: null };
}, getTransactions: async (ledgerId, fromDate, toDate) => {
  let q = db.from("vouchers").select("*").eq("party_name", ledgerId).order("voucher_date", { ascending: false });
  if (fromDate)
    q = q.gte("voucher_date", fromDate);
  if (toDate)
    q = q.lte("voucher_date", toDate);
  return await q;
}, getItemHistory: async (companyId, ledgerName, itemName, { fromDate, toDate, voucherTypes, sort = "desc", limit = 1e3 } = {}) => {
  try {
    if (!companyId || !ledgerName || !itemName) {
      return { data: [], error: null };
    }
    const rpcRes = await db.rpc("insforge_ledger_item_history", { p_company_id: companyId, p_ledger_name: ledgerName, p_item_name: itemName, p_from_date: fromDate || null, p_to_date: toDate || null, p_limit: limit, p_offset: 0 });
    if (!rpcRes.error && Array.isArray(rpcRes.data)) {
      return { data: sort === "asc" ? [...rpcRes.data].reverse() : rpcRes.data, error: null };
    }
    let entriesRes = await db.from("voucher_stock_entries").select("*").eq("company_id", companyId).eq("stock_item_name", itemName).limit(limit);
    if (entriesRes.error)
      return entriesRes;
    let entryRows = entriesRes.data || [];
    if (entryRows.length === 0 && itemName) {
      entriesRes = await db.from("voucher_stock_entries").select("*").eq("company_id", companyId).ilike("stock_item_name", "%" + String(itemName).trim() + "%").limit(limit);
      if (!entriesRes.error && Array.isArray(entriesRes.data)) {
        entryRows = entriesRes.data;
      }
    }
    const voucherIds = [...new Set(entryRows.map((e) => e.voucher_id).filter(Boolean))];
    if (voucherIds.length === 0) {
      return { data: [], error: null };
    }
    const vouchersRes = await fetchVouchersByIds({ companyId, voucherIds, select: "id, voucher_date, voucher_type, voucher_number, party_name, total_amount, grand_total", partyName: ledgerName, partyLike: true, fromDate, toDate, voucherTypes });
    if (vouchersRes.error)
      return { data: [], error: vouchersRes.error };
    const voucherMap = buildVoucherMap(vouchersRes.data || []);
    const merged = entryRows.map((entry) => {
      const voucher = voucherMap[entry.voucher_id];
      if (!voucher)
        return null;
      const quantity = Math.abs(Number(entry.quantity) || 0);
      const isInward = entry.is_inward === true || ["Purchase", "Purchase Invoice"].includes(voucher.voucher_type);
      return { ...entry, voucher, voucher_id: voucher.id || entry.voucher_id, voucher_date: voucher.voucher_date, voucher_type: voucher.voucher_type, voucher_number: voucher.voucher_number, party_name: voucher.party_name, qty_in: isInward ? quantity : 0, qty_out: isInward ? 0 : quantity, qty_delta: isInward ? quantity : -quantity, amount: Math.abs(Number(entry.amount) || 0), rate: Math.abs(Number(entry.rate) || 0) };
    }).filter(Boolean).sort(compareByVoucherDate);
    let runningQty = 0;
    const withRunning = merged.map((row) => {
      runningQty += row.qty_delta;
      return { ...row, running_item_qty: runningQty };
    });
    const output = sort === "asc" ? withRunning : [...withRunning].reverse();
    return { data: output, error: null };
  } catch (error) {
    return { data: [], error: normalizeError(error, "Failed to load ledger item history") };
  }
} };
const voucherApi = { list: async (companyId, { fromDate, toDate, type, party } = {}) => {
  let q = db.from("vouchers").select("*").eq("company_id", companyId).eq("is_deleted", false).order("voucher_date", { ascending: false });
  if (type)
    q = q.eq("voucher_type", type);
  if (fromDate)
    q = q.gte("voucher_date", fromDate);
  if (toDate)
    q = q.lte("voucher_date", toDate);
  if (party)
    q = q.ilike("party_name", "%" + party + "%");
  return await q;
}, getById: async (id) => {
  let q = await db.from("vouchers").select("*").eq("id", id).maybeSingle();
  if (!q.data)
    q = await db.from("vouchers").select("*").eq("voucher_id", id).maybeSingle();
  if (q.error || !q.data)
    return q;
  const lookupIds = [...new Set([q.data.id, q.data.voucher_id, id].filter(Boolean))];
  const [ledgerRes, stockRes] = await Promise.all([db.from("voucher_ledger_entries").select("*").in("voucher_id", lookupIds), db.from("voucher_stock_entries").select("*").in("voucher_id", lookupIds)]);
  return { data: { ...q.data, ledger_entries: ledgerRes.data || [], stock_entries: stockRes.data || [] }, error: q.error || ledgerRes.error || stockRes.error || null };
}, getWithContext: async (id, { companyId = null, ledgerName = null } = {}) => {
  const base = await voucherApi.getById(id);
  if (base.error || !base.data)
    return base;
  const voucher = base.data;
  const voucherAmount = getVoucherAmount(voucher);
  const voucherEffect = getVoucherEffect(voucher.voucher_type, voucherAmount);
  const party = ledgerName || voucher.party_name || null;
  if (!companyId || !party || !voucher.voucher_date) {
    return { data: { ...voucher, context: { voucher_effect: voucherEffect, running_balance_after: null, opening_balance: null } }, error: null };
  }
  try {
    const rpcCtxRes = await db.rpc("insforge_voucher_context", { p_company_id: companyId, p_voucher_id: id, p_ledger_name: party });
    if (!rpcCtxRes.error && Array.isArray(rpcCtxRes.data) && rpcCtxRes.data.length > 0) {
      const row = rpcCtxRes.data[0];
      return { data: { ...voucher, context: { voucher_effect: { debit: Number(row.debit_effect || 0), credit: Number(row.credit_effect || 0), net: Number(row.net_effect || 0) }, opening_balance: Number(row.opening_balance || 0), running_balance_after: row.running_balance_after !== null && row.running_balance_after !== void 0 ? Number(row.running_balance_after) : null } }, error: null };
    }
    const [ledgerRes, vouchersRes] = await Promise.all([db.from("ledgers").select("id, name, opening_balance").eq("company_id", companyId).ilike("name", party).maybeSingle(), db.from("vouchers").select("id, voucher_type, voucher_date, total_amount, grand_total, is_deleted").eq("company_id", companyId).eq("party_name", party).lte("voucher_date", voucher.voucher_date).eq("is_deleted", false)]);
    const openingBalance = Number(ledgerRes?.data?.opening_balance) || 0;
    const ordered = (vouchersRes.data || []).sort(compareByVoucherDate);
    let running = openingBalance;
    let runningAtVoucher = null;
    for (const row of ordered) {
      const rowAmount = getVoucherAmount(row);
      const eff = getVoucherEffect(row.voucher_type, rowAmount);
      running += eff.net;
      if (row.id === voucher.id || row.voucher_id === voucher.id || row.id === id || row.voucher_id === id) {
        runningAtVoucher = running;
      }
    }
    return { data: { ...voucher, context: { voucher_effect: voucherEffect, opening_balance: openingBalance, running_balance_after: runningAtVoucher } }, error: ledgerRes?.error || vouchersRes?.error || null };
  } catch (error) {
    return { data: { ...voucher, context: { voucher_effect: voucherEffect, opening_balance: null, running_balance_after: null } }, error: normalizeError(error, "Failed to build voucher context") };
  }
}, getTypes: async (companyId) => {
  const { data, error } = await db.from("vouchers").select("voucher_type").eq("company_id", companyId);
  if (error)
    return { data: [], error };
  return { data: [...new Set(data.map((v) => v.voucher_type).filter(Boolean))], error: null };
} };
const masterApi = { getLedgers: async (companyId) => db.from("ledgers").select("*").eq("company_id", companyId).order("name"), getStockItems: async (companyId) => db.from("stock_items").select("*").eq("company_id", companyId).order("name") };
const salesApi = { list: async (companyId, params = {}) => voucherApi.list(companyId, { ...params, type: "Sales" }), getById: voucherApi.getById };
const purchasesApi = { list: async (companyId, params = {}) => voucherApi.list(companyId, { ...params, type: "Purchase" }), getById: voucherApi.getById };
const stockApi = { list: async (companyId, stockGroup = null) => {
  let q = db.from("stock_items").select("*").eq("company_id", companyId).order("name");
  if (stockGroup)
    q = q.eq("stock_group", stockGroup);
  return await q;
}, getById: async (id) => db.from("stock_items").select("*").eq("id", id).single(), getGroups: async (companyId) => {
  const { data, error } = await db.from("stock_items").select("stock_group").eq("company_id", companyId);
  if (error)
    return { data: [], error };
  return { data: [...new Set(data.map((s) => s.stock_group).filter(Boolean))], error: null };
}, getHistory: async (companyId, itemIdOrName, { fromDate, toDate, party, voucherTypes, sort = "desc", limit = 5e3 } = {}) => {
  try {
    if (!companyId || !itemIdOrName)
      return { data: null, error: null };
    let item = null;
    let itemName = itemIdOrName;
    const itemByIdRes = await db.from("stock_items").select("*").eq("company_id", companyId).eq("id", itemIdOrName).maybeSingle();
    if (itemByIdRes.data) {
      item = itemByIdRes.data;
      itemName = item.name;
    } else {
      const itemByNameRes = await db.from("stock_items").select("*").eq("company_id", companyId).ilike("name", String(itemIdOrName)).maybeSingle();
      item = itemByNameRes.data || null;
      if (item?.name)
        itemName = item.name;
    }
    const voucherTypesParam = voucherTypes?.length ? voucherTypes : null;
    const rpcRowsRes = await db.rpc("insforge_stock_item_history", { p_company_id: companyId, p_item_name: itemName, p_from_date: fromDate || null, p_to_date: toDate || null, p_party: party || null, p_voucher_types: voucherTypesParam, p_limit: limit, p_offset: 0 });
    if (!rpcRowsRes.error && Array.isArray(rpcRowsRes.data)) {
      const rpcSummaryRes = await db.rpc("insforge_stock_item_history_summary", { p_company_id: companyId, p_item_name: itemName, p_from_date: fromDate || null, p_to_date: toDate || null, p_party: party || null, p_voucher_types: voucherTypesParam });
      const rows = sort === "asc" ? [...rpcRowsRes.data].reverse() : rpcRowsRes.data;
      const summary2 = rpcSummaryRes?.data?.[0] || { opening_qty: Number(item?.opening_stock || item?.opening_balance || 0), total_in_qty: 0, total_out_qty: 0, total_in_amount: 0, total_out_amount: 0, closing_qty: Number(item?.opening_stock || item?.opening_balance || 0) };
      return { data: { item, rows, summary: summary2 }, error: null };
    }
    let entriesRes = await db.from("voucher_stock_entries").select("*").eq("company_id", companyId).eq("stock_item_name", itemName).limit(limit);
    if (entriesRes.error)
      return entriesRes;
    let entryRows = entriesRes.data || [];
    if (entryRows.length === 0 && itemName) {
      entriesRes = await db.from("voucher_stock_entries").select("*").eq("company_id", companyId).ilike("stock_item_name", "%" + String(itemName).trim() + "%").limit(limit);
      if (!entriesRes.error && Array.isArray(entriesRes.data)) {
        entryRows = entriesRes.data;
      }
    }
    const voucherIds = [...new Set(entryRows.map((e) => e.voucher_id).filter(Boolean))];
    if (voucherIds.length === 0) {
      const emptySummary = { opening_qty: Number(item?.opening_stock || item?.opening_balance || 0), total_in_qty: 0, total_out_qty: 0, total_in_amount: 0, total_out_amount: 0, closing_qty: Number(item?.opening_stock || item?.opening_balance || 0) };
      return { data: { item, rows: [], summary: emptySummary }, error: null };
    }
    const vouchersRes = await fetchVouchersByIds({ companyId, voucherIds, select: "id, voucher_number, voucher_type, voucher_date, party_name", partyName: party || null, partyLike: true, fromDate, toDate, voucherTypes });
    if (vouchersRes.error)
      return { data: null, error: vouchersRes.error };
    const voucherMap = buildVoucherMap(vouchersRes.data || []);
    const normalized = entryRows.map((entry) => {
      const voucher = voucherMap[entry.voucher_id];
      if (!voucher)
        return null;
      const quantity = Math.abs(Number(entry.quantity) || 0);
      const amount = Math.abs(Number(entry.amount) || 0);
      const rate = Math.abs(Number(entry.rate) || 0);
      const isInward = entry.is_inward === true || ["Purchase", "Purchase Invoice"].includes(voucher.voucher_type);
      return { id: entry.id, voucher_id: voucher.id || entry.voucher_id, voucher_type: voucher.voucher_type, voucher_date: voucher.voucher_date, voucher_number: voucher.voucher_number, party_name: voucher.party_name, quantity, rate, amount, tax_rate: Number(entry.tax_rate ?? entry.gst_rate ?? 0), qty_in: isInward ? quantity : 0, qty_out: isInward ? 0 : quantity, qty_delta: isInward ? quantity : -quantity, raw: entry };
    }).filter(Boolean).sort(compareByVoucherDate);
    let runningQty = Number(item?.opening_stock || item?.opening_balance || 0);
    let totalInQty = 0;
    let totalOutQty = 0;
    let totalInAmount = 0;
    let totalOutAmount = 0;
    const rowsAsc = normalized.map((row) => {
      runningQty += row.qty_delta;
      totalInQty += row.qty_in;
      totalOutQty += row.qty_out;
      totalInAmount += row.qty_in > 0 ? row.amount : 0;
      totalOutAmount += row.qty_out > 0 ? row.amount : 0;
      return { ...row, running_stock: runningQty };
    });
    const summary = { opening_qty: Number(item?.opening_stock || item?.opening_balance || 0), total_in_qty: totalInQty, total_out_qty: totalOutQty, total_in_amount: totalInAmount, total_out_amount: totalOutAmount, closing_qty: runningQty };
    return { data: { item, rows: sort === "asc" ? rowsAsc : [...rowsAsc].reverse(), summary }, error: null };
  } catch (error) {
    return { data: null, error: normalizeError(error, "Failed to load stock history") };
  }
}, getHistorySummary: async (companyId, itemIdOrName, filters = {}) => {
  const { data, error } = await stockApi.getHistory(companyId, itemIdOrName, filters);
  if (error)
    return { data: null, error };
  return { data: data?.summary || null, error: null };
} };
const reportsApi = { getLedgerStatement: async (companyId, ledgerName, fromDate, toDate) => {
  let q = db.from("vouchers").select("*").eq("company_id", companyId).eq("party_name", ledgerName).order("voucher_date", { ascending: true });
  if (fromDate)
    q = q.gte("voucher_date", fromDate);
  if (toDate)
    q = q.lte("voucher_date", toDate);
  return await q;
}, getSalesSummary: async (companyId, fromDate, toDate) => salesApi.list(companyId, { fromDate, toDate }), getPurchaseSummary: async (companyId, fromDate, toDate) => purchasesApi.list(companyId, { fromDate, toDate }), getStockSummary: async (companyId) => stockApi.list(companyId) };
const syncHistoryApi = { list: async (companyId, limitCount = 20) => db.from("sync_history").select("*").eq("company_id", companyId).order("started_at", { ascending: false }).limit(limitCount), getById: async (id) => db.from("sync_history").select("*").eq("id", id).single(), deleteSync: async (syncId, companyId) => {
  try {
    const { data: deleted } = await db.from("vouchers").delete().eq("sync_batch_id", syncId).select("id");
    await db.from("sync_history").delete().eq("id", syncId);
    return { success: true, deletedVouchers: deleted?.length || 0, error: null };
  } catch (e) {
    return { success: false, deletedVouchers: 0, error: e.message };
  }
}, getStats: async (companyId) => {
  const { data, error } = await syncHistoryApi.list(companyId, 10);
  if (error || !data)
    return { data: null, error };
  return { data: { totalSyncs: data.length, lastSync: data[0] || null, successCount: data.filter((s) => s.status === "completed").length, failedCount: data.filter((s) => s.status === "failed").length, totalRecordsSynced: data.reduce((sum, s) => sum + (s.total_records || 0), 0) }, error: null };
} };
const normalizePendingVoucherData = (transactionType, voucherData) => {
  const safe = voucherData && typeof voucherData === "object" ? { ...voucherData } : {};
  if (!safe.voucher_type_name && transactionType)
    safe.voucher_type_name = transactionType;
  if (!safe.voucher_type && transactionType)
    safe.voucher_type = transactionType;
  if (!safe.voucher_date && safe.date)
    safe.voucher_date = safe.date;
  if (!safe.invoice_date && safe.voucher_date)
    safe.invoice_date = safe.voucher_date;
  return safe;
};
const pendingTransactionApi = { create: async (companyId, transactionType, voucherData) => {
  const normalizedCompanyId = String(companyId || "").trim();
  if (!normalizedCompanyId) {
    return { data: null, error: new Error("company_id is required") };
  }
  const { data: { user } } = await auth.getCurrentUser();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const payload = {
    company_id: normalizedCompanyId,
    transaction_type: String(transactionType || "Vouchers"),
    voucher_data: normalizePendingVoucherData(transactionType, voucherData),
    status: "pending",
    created_by: user?.id || null,
    created_at: now
  };
  const batchInsert = await db.from("pending_transactions").insert([payload]).select().single();
  if (!batchInsert.error)
    return batchInsert;
  const objectInsert = await db.from("pending_transactions").insert(payload).select().single();
  if (!objectInsert.error)
    return objectInsert;
  return batchInsert;
}, list: async (companyId, status = null) => {
  let q = db.from("pending_transactions").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
  if (Array.isArray(status) && status.length > 0)
    q = q.in("status", status);
  else if (status)
    q = q.eq("status", status);
  return await q;
}, getPendingCount: async (companyId) => db.from("pending_transactions").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending"), createSalesInvoice: async (companyId, invoiceData) => pendingTransactionApi.create(companyId, "Sales", invoiceData), createPurchaseInvoice: async (companyId, invoiceData) => pendingTransactionApi.create(companyId, "Purchase", invoiceData), createReceipt: async (companyId, receiptData) => pendingTransactionApi.create(companyId, "Receipt", receiptData), createPayment: async (companyId, paymentData) => pendingTransactionApi.create(companyId, "Payment", paymentData), updateStatus: async (id, status, tallyVoucherNumber = null, errorMessage = null) => {
  const updates = { status, error_message: errorMessage };
  if (tallyVoucherNumber) {
    updates.tally_voucher_number = tallyVoucherNumber;
    updates.synced_at = (/* @__PURE__ */ new Date()).toISOString();
  }
  return await db.from("pending_transactions").update(updates).eq("id", id).select().single();
}, delete: async (id) => db.from("pending_transactions").delete().eq("id", id) };
const portalApi = { submitContact: async (data) => ({ data: null, error: null }) };
var stdin_default = supabase;
export {
  auth,
  clearLocalSession,
  companyApi,
  stdin_default as default,
  ledgerApi,
  masterApi,
  pendingTransactionApi,
  portalApi,
  purchasesApi,
  reportsApi,
  salesApi,
  stockApi,
  supabase,
  syncHistoryApi,
  voucherApi
};

