// Telegram Mini App — P1 READ-ONLY (additive: ye file kuch existing cheez nahi chheti).
// GET  = mini app ka HTML page (Telegram ke andar khulta hai)
// POST = JSON API: Telegram initData HMAC verify -> user_profiles.telegram_chat_id ->
//        companies (owner) -> v_outstanding_bills (ageing buckets)
// Writes zero data. Koi migration nahi, koi existing table/function change nahi.

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

const jsonRes = (status: number, obj: unknown): Response =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

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

// ---- Mini app page ----
// NOTE: HTML/script ke andar template-literal-escape nahi hai (${ ya ` nahi) —
// isliye ye pura PAGE literal me safe hai.
const PAGE = `<!doctype html>
<html lang="hi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<title>Dukan App</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
:root{--bg:#17212b;--card:#232e3c;--text:#f5f5f5;--muted:#8fa3b8;--line:#33455c;--accent:#2ea6ff}
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.45;padding:14px 12px 52px}
h1{font-size:19px;margin:2px 0 2px}
.sub{color:var(--muted);font-size:12.5px}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 2px}
.chip{background:var(--card);border:1px solid var(--line);color:var(--text);border-radius:999px;padding:6px 12px;font-size:13px;cursor:pointer}
.chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:10px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px}
.card .n{font-size:16px;font-weight:700;word-break:break-all}
.card .l{color:var(--muted);font-size:11.5px}
.row{display:flex;justify-content:space-between;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px;margin:6px 0}
.row .who{font-weight:600}
.row .meta{color:var(--muted);font-size:12px;margin-top:2px}
.amt{font-weight:700;white-space:nowrap}
.badge{display:inline-block;border-radius:6px;padding:2px 7px;font-size:11px;font-weight:700;margin-top:4px}
.b0{background:#2ecc71;color:#083b1e}
.b1{background:#f1c40f;color:#4a3b00}
.b2{background:#e67e22;color:#4a2300}
.b3{background:#e74c3c;color:#fff}
.state{padding:34px 10px;text-align:center;color:var(--muted)}
.state .big{font-size:34px;margin-bottom:8px}
footer{position:fixed;left:0;right:0;bottom:0;background:var(--bg);border-top:1px solid var(--line);color:var(--muted);font-size:11px;padding:6px 12px;text-align:center}
</style>
</head>
<body>
<h1>📚 Dukan Bills</h1>
<div class="sub" id="sub">Outstanding overview (read-only)</div>
<div id="chips" class="chips"></div>
<div id="box"><div class="state"><div class="big">⏳</div>Data aa raha hai…</div></div>
<footer>DukanApp v0.1.0 • P1 read-only • Supabase</footer>
<script>
(function(){
  var tg = window.Telegram && window.Telegram.WebApp;
  try { tg && tg.ready(); tg && tg.expand(); } catch (e) {}
  var tp = (tg && tg.themeParams) || {};
  var dark = !(tg && tg.colorScheme === 'light');
  var r = document.documentElement.style;
  r.setProperty('--bg', tp.bg_color || (dark ? '#17212b' : '#ffffff'));
  r.setProperty('--card', tp.secondary_bg_color || (dark ? '#232e3c' : '#f2f5f9'));
  r.setProperty('--text', tp.text_color || (dark ? '#f5f5f5' : '#111111'));
  r.setProperty('--muted', dark ? '#8fa3b8' : '#7a8899');
  r.setProperty('--line', dark ? '#33455c' : '#e1e7ee');
  r.setProperty('--accent', tp.button_color || '#2ea6ff');

  var box = document.getElementById('box');
  var chipsEl = document.getElementById('chips');
  var subEl = document.getElementById('sub');
  var DATA = null, CUR = 0;
  var BUCKETS = ['0-30', '31-60', '61-90', '90+'];
  var money = new Intl.NumberFormat('hi-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fail(msg, hint) {
    box.innerHTML = '<div class="state"><div class="big">😕</div>' + esc(msg) +
      (hint ? '<div style="margin-top:6px;font-size:12.5px">' + esc(hint) + '</div>' : '') + '</div>';
  }

  if (!(tg && tg.initData)) {
    fail('Ye app Telegram ke andar khulti hai', 'Bot @Dukanpc_bot ka 📦 menu button daba kar aao');
    return;
  }

  fetch(location.href, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: tg.initData })
  }).then(function (res) { return res.json(); }).then(function (j) {
    if (j.error) { fail(j.error, 'App band karke dobara kholo'); return; }
    DATA = j; CUR = 0; render();
  }).catch(function () {
    fail('Load nahi hua — internet check karo', 'Aur dobara kholo');
  });

  function badge(b) {
    var i = BUCKETS.indexOf(b);
    return '<span class="badge b' + (i < 0 ? 3 : i) + '">' + esc(b) + ' din</span>';
  }

  function render() {
    if (!DATA) return;
    var cs = DATA.companies || [], bills = DATA.bills || [];
    if (!cs.length) { fail('Koi company linked nahi', 'PC app (TallyLink) me login karke sync do'); return; }
    if (CUR >= cs.length) CUR = 0;
    chipsEl.innerHTML = cs.map(function (c, i) {
      return '<button class="chip' + (i === CUR ? ' on' : '') + '" data-i="' + i + '">' + esc(c.name) + '</button>';
    }).join('');
    Array.prototype.forEach.call(chipsEl.querySelectorAll('button'), function (b) {
      b.onclick = function () { CUR = Number(b.getAttribute('data-i')); render(); };
    });

    var co = cs[CUR], cid = co.id;
    var rows = bills.filter(function (x) { return x.company_id === cid; });
    var total = 0; var bsum = {};
    rows.forEach(function (x) {
      var a = Number(x.amount) || 0; total += a;
      var b = x.age_bucket || '90+'; bsum[b] = (bsum[b] || 0) + a;
    });
    subEl.textContent = (DATA.user && DATA.user.full_name ? DATA.user.full_name + ' • ' : '') + co.name + ' • ' + rows.length + ' bills';

    var cards = '<div class="cards"><div class="card"><div class="n">' + money.format(total) + '</div><div class="l">Total outstanding</div></div>' +
      BUCKETS.map(function (b) {
        return '<div class="card"><div class="n">' + money.format(bsum[b] || 0) + '</div><div class="l">' + b + ' din</div></div>';
      }).join('') + '</div>';

    if (!rows.length) {
      box.innerHTML = cards + '<div class="state"><div class="big">✅</div>Sab clear — koi outstanding bill nahi</div>';
      return;
    }
    box.innerHTML = cards + rows.map(function (x) {
      return '<div class="row"><div><div class="who">' + esc(x.ledger_name) + '</div>' +
        '<div class="meta">' + esc(x.bill_name || x.voucher_number || '') +
        (x.bill_date ? ' • ' + esc(x.bill_date) : '') + (x.due_date ? ' • due ' + esc(x.due_date) : '') + '</div>' +
        badge(x.age_bucket) + '</div>' +
        '<div class="amt">' + money.format(Number(x.amount) || 0) + '</div></div>';
    }).join('');
  }
})();
</script>
</body>
</html>`;

// ---- Router ----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") {
    return new Response(PAGE, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...CORS },
    });
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
