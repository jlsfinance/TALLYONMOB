import { createClient } from "npm:@supabase/supabase-js@2.108.1";
import {
  HELP,
  parseQuestion,
  type Question,
  renderReport,
  type Report,
} from "./questions.ts";

const botToken = Deno.env.get("TELEGRAM_REPORT_BOT_TOKEN") ?? "";
const webhookSecret = Deno.env.get("TELEGRAM_REPORT_WEBHOOK_SECRET") ?? "";
const dashboard = (Deno.env.get("TELEGRAM_REPORT_DASHBOARD_ORIGIN") ?? "")
  .replace(/\/$/, "");
const demo = Deno.env.get("TELEGRAM_REPORT_DEMO_MODE") !== "false";
const db = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
const setup =
  "Windows PC par Tally Prime kholo. SYNCORA Connector install karo, SYNCORA account se sign in karo, company select karo aur sync start karo.\n\nhttps://github.com/jlsfinance/TALLYONMOB/releases/latest";

function read<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw new Error("Supabase request failed");
  return data;
}

async function hashCode(code: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(code),
  );
  return Array.from(
    new Uint8Array(hash),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function secretMatches(actual: string) {
  if (!webhookSecret || actual.length !== webhookSecret.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index++) {
    difference |= actual.charCodeAt(index) ^ webhookSecret.charCodeAt(index);
  }
  return difference === 0;
}

async function manageLink(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || (origin !== dashboard && origin !== "https://localhost")) {
    return new Response(null, { status: 403 });
  }
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers });
  }
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status, headers });
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)
    ?.[1];
  if (!token) return reply({ error: "Sign in to SYNCORA first." }, 401);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) {
    return reply({ error: "Sign in to SYNCORA first." }, 401);
  }

  const body = await request.json().catch(() => null);
  try {
    if (body?.action === "unlink") {
      read(
        await db.rpc("telegram_report_unlink_account", {
          p_user_id: data.user.id,
        }),
      );
      return reply({ ok: true });
    }
    if (body?.action !== "create") {
      return reply({ error: "Invalid linking action." }, 400);
    }
    if (demo) {
      return reply(
        { error: "Account linking is disabled during demo mode." },
        503,
      );
    }

    const link = read(
      await db.from("telegram_report_links").select("chat_id").eq(
        "user_id",
        data.user.id,
      ).maybeSingle(),
    );
    if (link) {
      return reply({
        error:
          "A Telegram account is linked. Disconnect it before generating a new code.",
      }, 409);
    }
    const code = crypto.randomUUID().replaceAll("-", "");
    read(
      await db.from("telegram_report_challenges").upsert({
        user_id: data.user.id,
        code_hash: await hashCode(code),
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      }),
    );
    return reply({ ok: true, command: "/link " + code });
  } catch {
    return reply({
      error: "Could not update Telegram access. Please try again.",
    }, 503);
  }
}

function sample(question: Question) {
  if (question.kind === "company" || question.kind === "companies") {
    return "DEMO\nDemo Footwear";
  }
  const demoTime = new Date().toISOString();
  const demoResult: Report["result"] = question.kind === "sync"
    ? { status: "completed", time: demoTime }
    : question.kind === "balance"
    ? [{ name: question.name, current_balance: 12500, receivable: 11200 }]
    : question.kind === "stock"
    ? [{ name: question.name, current_stock: 42, unit: "pairs" }]
    : { total: 18340, count: 7 };
  const report = {
    company: "Demo Footwear",
    last_sync: demoTime,
    result: demoResult,
  };
  const previous = "start" in question && question.compare
    ? { ...report, result: { total: 15700, count: 5 } }
    : undefined;
  return "DEMO · Sample data\n" + renderReport(question, report, previous);
}

function linkingHelp() {
  return demo
    ? "DEMO: Account linking is off. Try Aaj ki sales or Last sync."
    : `SYNCORA mein sign in karke Settings → Telegram Bot kholo. Apna one-time code generate karo aur isi private chat mein /link command paste karo.\n\n${dashboard}/settings/telegram`;
}

async function answer(chatId: string, text: string): Promise<string> {
  const normalized = text.replace(/^\/(\w+)@[A-Za-z0-9_]+(?=\s|$)/, "/$1");
  const code = normalized.match(/^\/link\s+([0-9a-f]{32})$/i)?.[1]
    ?.toLowerCase();
  if (code) {
    if (demo) return linkingHelp();
    const linked = read(
      await db.rpc("telegram_report_confirm_link", {
        p_chat_id: chatId,
        p_code_hash: await hashCode(code),
      }),
    );
    return linked
      ? "Telegram linked. Company select karne ke liye /companies bhejo."
      : "Code expired ya invalid hai, ya account pehle se linked hai. SYNCORA Settings mein check karo.";
  }

  const question = parseQuestion(normalized);
  if (question.kind === "help") return HELP;
  if (question.kind === "setup") return setup;
  if (question.kind === "support") {
    const help =
      "Login ke liye PC Connector wala SYNCORA account use karo. Data update nahi hua? Tally aur SYNCORA Connector kholkar company select karo aur sync chalao.";
    return dashboard ? help + "\n\n" + dashboard + "/support" : help;
  }
  if (question.kind === "link") return linkingHelp();
  if (question.kind === "unlink") {
    if (demo) return linkingHelp();
    read(await db.from("telegram_report_links").delete().eq("chat_id", chatId));
    return "Telegram report access disconnect ho gaya.";
  }
  if (demo) return sample(question);

  const link = read(
    await db.from("telegram_report_links").select("user_id,company_id").eq(
      "chat_id",
      chatId,
    ).maybeSingle(),
  );
  if (!link) return linkingHelp();
  const companies = read(
    await db.from("companies").select("id,name").eq("owner_id", link.user_id)
      .order("name").order("id"),
  ) ?? [];
  if (!companies.length) {
    return "Is account ki koi owned company sync nahi hui. SETUP bhejo.";
  }
  if (question.kind === "company") {
    const matches = companies.filter((company) =>
      question.byId
        ? company.id === question.name
        : company.name.toLowerCase() === question.name.toLowerCase()
    );
    if (matches.length > 1) {
      return "Is naam ki multiple companies hain. Ek command copy karke bhejo.\n" +
        matches.slice(0, 15).map((company) => "Company id " + company.id).join(
          "\n",
        );
    }
    if (!matches.length) {
      return "Company nahi mili. List ke liye /companies bhejo.";
    }
    const selected = read(
      await db.from("telegram_report_links").update({
        company_id: matches[0].id,
      })
        .eq("chat_id", chatId).eq("user_id", link.user_id).select("company_id")
        .maybeSingle(),
    );
    return selected ? `Selected company: ${matches[0].name}` : linkingHelp();
  }
  const selected = link.company_id
    ? companies.find((company) => company.id === link.company_id)
    : companies.length === 1
    ? companies[0]
    : undefined;
  if (!selected || question.kind === "companies") {
    return `Company select karne ke liye ek command bhejo.\n${
      companies.slice(0, 15).map((company) => "Company " + company.name).join(
        "\n",
      )
    }${
      companies.length > 15
        ? "\nAur companies ke liye exact naam type karo."
        : ""
    }`;
  }

  const params = {
    p_chat_id: chatId,
    p_company_id: selected.id,
    p_kind: question.kind,
    p_start: "start" in question ? question.start : null,
    p_end: "end" in question ? question.end : null,
    p_name: "name" in question ? question.name : null,
  };
  const report = read(await db.rpc("telegram_report_read", params)) as
    | Report
    | null;
  if (!report) {
    return "Company access available nahi hai. /companies bhejkar dobara select karo.";
  }
  const previous = "start" in question && question.compare
    ? read(
      await db.rpc("telegram_report_read", {
        ...params,
        p_start: question.compare,
        p_end: question.compare,
      }),
    ) as Report | null
    : undefined;
  if (previous === null) return "Company access available nahi hai.";
  return renderReport(question, report, previous);
}

async function send(chatId: string, text: string) {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 3900),
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    throw new Error("Telegram declined the reply");
  }
}

type Update = {
  update_id?: number;
  message?: {
    chat?: { id?: number; type?: string };
    from?: { id?: number; is_bot?: boolean };
    text?: string;
  };
};

export async function handle(request: Request): Promise<Response> {
  if (!demo && !/^https:\/\/[^/]+$/.test(dashboard)) {
    return new Response(null, { status: 503 });
  }
  if (new URL(request.url).pathname.endsWith("/link")) {
    return manageLink(request);
  }
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (!botToken || !webhookSecret) return new Response(null, { status: 503 });
  if (
    !secretMatches(request.headers.get("x-telegram-bot-api-secret-token") ?? "")
  ) {
    return new Response(null, { status: 403 });
  }

  const update = await request.json().catch(() => null) as Update | null;
  const message = update?.message;
  const chat = message?.chat;
  if (
    !Number.isSafeInteger(update?.update_id) || !chat ||
    chat.type !== "private" ||
    !Number.isSafeInteger(chat.id) || (chat.id ?? 0) < 1 ||
    message?.from?.id !== chat.id ||
    message?.from?.is_bot !== false || typeof message.text !== "string"
  ) return new Response("OK");

  const id = String(update?.update_id);
  const chatId = String(chat.id);
  const text = message.text;
  try {
    const reply = () => text.length <= 400 ? answer(chatId, text.trim()) : HELP;
    if (demo) {
      await send(chatId, await reply());
      return new Response("OK");
    }
    const claim = read(
      await db.rpc("telegram_report_claim_message", { p_id: id }),
    );
    if (claim === "delivered") return new Response("OK");
    if (claim !== "claimed") return new Response(null, { status: 503 });
    try {
      await send(chatId, await reply());
    } catch {
      read(await db.from("telegram_report_messages").delete().eq("id", id));
      return new Response(null, { status: 503 });
    }
    read(
      await db.from("telegram_report_messages").update({ delivered: true }).eq(
        "id",
        id,
      ),
    );
    return new Response("OK");
  } catch {
    console.error("Telegram reporting webhook could not process an update");
    return new Response(null, { status: 503 });
  }
}
