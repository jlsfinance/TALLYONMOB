// SYNCORA Telegram bot — webhook handler.
// Read-only: /start, /status, /help, /link. Sync start/finish messages are sent by
// the PC connector directly (Bot API); this function only answers user messages.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

const db = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function send(chatId: string, text: string, keyboard?: unknown): Promise<void> {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(keyboard ? { reply_markup: keyboard } : {}),
    }),
    signal: AbortSignal.timeout(10000),
  });
}

const MAIN_MENU = {
  keyboard: [[{ text: "Status" }, { text: "Help" }]],
  resize_keyboard: true,
  is_persistent: true,
};

const UNLINKED = `Telegram account link nahi hai.

Notifications paane ke liye apna email aur license key bhejo:
<code>/link you@email.com TOM-2026-XXXX-XXXX</code>

License key PC app me (License / About screen) milegi.`;

async function profileFor(chatId: string) {
  const { data } = await db
    .from("user_profiles")
    .select("id, full_name, email")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  return data as { id: string; full_name: string | null; email: string | null } | null;
}

async function statusMessage(chatId: string): Promise<string> {
  const user = await profileFor(chatId);
  if (!user) return UNLINKED;

  const { data: companies } = await db
    .from("companies")
    .select("id, name, last_sync_at")
    .or(`owner_id.eq.${user.id},user_id.eq.${user.id}`)
    .order("name");

  const list = (companies ?? []) as { id: string; name: string; last_sync_at: string | null }[];
  if (!list.length) {
    return `<b>${esc(user.full_name || user.email)}</b>

Koi company sync nahi hui.
PC par Syncora Connector kholo aur sync chalao.`;
  }

  const { data: last } = await db
    .from("sync_history")
    .select("status, sync_type, total_records, completed_at")
    .eq("owner_id", user.id)
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const h = last as { status: string; sync_type: string; total_records: number; completed_at: string | null } | null;
  const when = h?.completed_at
    ? new Date(h.completed_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : "-";

  const rows = list.slice(0, 10).map((c) => {
    const t = c.last_sync_at
      ? new Date(c.last_sync_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })
      : "kabhi nahi";
    return `- <b>${esc(c.name)}</b>: ${t}`;
  });

  return `<b>Syncora Status</b>

${esc(user.full_name || user.email)}
Companies: ${list.length}

${rows.join("\n")}

Last sync: ${h ? `${esc(h.sync_type)} / ${h.total_records} records / ${h.status}` : "-"}
${when}

<i>Sync start/finish par yahan message aayega.</i>`;
}

const HELP = `<b>Syncora Bot</b>

/start - account aur sync status
/status - last sync aur companies
/link email license-key - Telegram link karna
/help - ye message

Sync start/finish notifications automatically aate hain.`;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  if (WEBHOOK_SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const update = await req.json().catch(() => null) as
    | { message?: { chat?: { id?: number }; text?: string } }
    | null;

  const text = update?.message?.text?.trim() ?? "";
  const chatId = update?.message?.chat?.id ? String(update.message.chat.id) : "";
  if (!text || !chatId) return new Response("ok", { status: 200 }); // ignore non-text updates

  try {
    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase().replace(/^\//, "").split("@")[0];

    if (cmd === "start") {
      const user = await profileFor(chatId);
      if (!user) {
        await send(chatId, `Namaste! Main Syncora bot hoon.\n\n${UNLINKED}`, MAIN_MENU);
      } else {
        await send(
          chatId,
          `<b>${esc(user.full_name || user.email)}</b>\n\nTelegram linked hai. Sync start/finish par yahan message aayega.`,
          MAIN_MENU,
        );
        await send(chatId, await statusMessage(chatId));
      }
      return new Response("ok", { status: 200 });
    }

    if (cmd === "status" || text === "Status") {
      await send(chatId, await statusMessage(chatId), MAIN_MENU);
      return new Response("ok", { status: 200 });
    }

    if (cmd === "help" || text === "Help") {
      await send(chatId, HELP, MAIN_MENU);
      return new Response("ok", { status: 200 });
    }

    if (cmd === "link") {
      const email = (parts[1] ?? "").toLowerCase();
      const key = (parts[2] ?? "").trim().toUpperCase();
      if (!email.includes("@") || key.length < 8) {
        await send(chatId, "Format: <code>/link you@email.com TOM-2026-XXXX-XXXX</code>");
        return new Response("ok", { status: 200 });
      }

      // License key is the secret the user already holds; no extra UI needed.
      const { data: lic } = await db
        .from("user_licenses")
        .select("user_id, status, expires_at, license_key")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const row = lic as { user_id: string; status: string; expires_at: string | null; license_key: string | null } | null;
      if (!row || String(row.license_key ?? "").trim().toUpperCase() !== key) {
        await send(chatId, "Email ya license key match nahi hui.");
        return new Response("ok", { status: 200 });
      }
      if (row.status !== "active" || (row.expires_at && new Date(row.expires_at).getTime() < Date.now())) {
        await send(chatId, "License active nahi hai. Renew karke dobara try karo.");
        return new Response("ok", { status: 200 });
      }

      // One chat = one account.
      const existing = await profileFor(chatId);
      if (existing && existing.id !== row.user_id) {
        await send(chatId, "Ye Telegram pehle se dusre account se linked hai.");
        return new Response("ok", { status: 200 });
      }

      const { error } = await db
        .from("user_profiles")
        .update({ telegram_chat_id: chatId })
        .eq("id", row.user_id)
        .is("telegram_chat_id", null);
      if (error) {
        await send(chatId, "Link nahi ho paya. Thodi der baad try karo.");
        return new Response("ok", { status: 200 });
      }

      await send(chatId, "<b>Linked!</b>\n\nAb /status bhejo.", MAIN_MENU);
      return new Response("ok", { status: 200 });
    }

    await send(chatId, "Commands: /start /status /help", MAIN_MENU);
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("bot error", err);
    return new Response("ok", { status: 200 }); // always 200 so Telegram doesn't retry
  }
});
