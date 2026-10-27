// Telegram Mini App API — P1 READ-ONLY (additive feature; existing cheez kuch nahi chheda).
// HTML UI Vercel pe hosted hai (supabase.co default domain GET pe text/html ko
// text/plain me rewrite karta hai — platform limit, docs: functions/limits).
// Ye function sirf POST JSON API hai:
//   POST { initData } -> Telegram HMAC verify -> user_profiles.telegram_chat_id ->
//   companies (owner) -> v_outstanding_bills (ageing buckets)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const jsonRes = (status: number, obj: unknown): Response => {
  const headers = new Headers({ ...CORS });
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(obj), { status, headers });
};

// ---- Telegram initData validation (official algorithm) ----
type TgUser = { id: number | string; first_name?: string; username?: string };

async function verifyInitData(initData: string): Promise<TgUser | null> {
  if (!initData || !BOT_TOKEN) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  const pairs: string[] = [];
  for (const [k, v] of params) if (k !== "hash") pairs.push(k + "=" + v);
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const enc = new TextEncoder();
  const key1 = await crypto.subtle.importKey(
    "raw", enc.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const step1 = await crypto.subtle.sign("HMAC", key1, enc.encode(BOT_TOKEN));
  const key2 = await crypto.subtle.importKey(
    "raw", step1,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key2, enc.encode(dataCheckString)));
  const computed = Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (computed !== hash.toLowerCase()) return null;

  // freshness: 24h
  const authDate = Number(params.get("auth_date") ?? "0");
  if (!authDate || Math.abs(Date.now() / 1000 - authDate) > 86400) return null;

  let user: unknown = null;
  try { user = JSON.parse(params.get("user") ?? "null"); } catch { user = null; }
  if (!user || typeof user !== "object") return null;
  const u = user as TgUser;
  return u.id ? u : null;
}

// ---- Router ----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") {
    // HTML yahan nahi milta (platform limit) — UI Vercel pe; ye sirf API hai.
    return jsonRes(200, { ok: true, hint: "POST {initData} — API only; UI: Vercel static site" });
  }
  if (req.method !== "POST") return jsonRes(405, { error: "Method not allowed" });

  let body: { initData?: string } | null = null;
  try { body = await req.json(); } catch { body = null; }

  const tgUser = await verifyInitData(body?.initData ?? "");
  if (!tgUser) return jsonRes(401, { error: "Telegram session invalid — app band karke dobara kholo." });

  const chatId = String(tgUser.id);
  const pRes = await db.from("user_profiles")
    .select("id, full_name, role")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  if (pRes.error || !pRes.data) {
    return jsonRes(403, { error: "Profile linked nahi — PC app (TallyLink) me login karo, fir wapas aao." });
  }
  const profile = pRes.data as { id: string; full_name: string | null; role: string | null };

  const cRes = await db.from("companies").select("id, name").eq("owner_id", profile.id).order("name");
  const companies = (cRes.data ?? []) as { id: string; name: string }[];
  if (!companies.length) return jsonRes(200, { user: profile, companies: [], bills: [] });

  const ids = companies.map((c) => c.id);
  const bRes = await db
    .from("v_outstanding_bills")
    .select("*")
    .in("company_id", ids)
    .order("company_id")
    .order("age_days", { ascending: false });

  return jsonRes(200, { user: profile, companies, bills: bRes.data ?? [] });
});
