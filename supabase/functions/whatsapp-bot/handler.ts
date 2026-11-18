import { createClient } from "npm:@supabase/supabase-js@2.108.1";
import {
  HELP,
  parseQuestion,
  type Question,
  renderReport,
  type Report,
} from "./questions.ts";

const configuration = {
  appSecret: Deno.env.get("WHATSAPP_APP_SECRET") ?? "",
  verifyToken: Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "",
  accessToken: Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "",
  phoneId: Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "",
  graphVersion: Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "",
  phoneKey: Deno.env.get("WHATSAPP_PHONE_KEY") ?? "",
  dashboard: (Deno.env.get("WHATSAPP_DASHBOARD_ORIGIN") ?? "").replace(
    /\/$/,
    "",
  ),
  demo: Deno.env.get("WHATSAPP_DEMO_MODE") !== "false",
};

const db = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
const setup =
  "Windows PC par Tally Prime open rakhein. SYNCORA Connector install karein, apne SYNCORA account se sign in karein, company select karein aur sync start karein.\n\nhttps://github.com/jlsfinance/TALLYONMOB/releases/latest";
const phonePattern = /^[1-9][0-9]{6,14}$/;

const encoder = new TextEncoder();
function hex(value: ArrayBuffer) {
  return Array.from(
    new Uint8Array(value),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
async function hmac(secret: string, value: BufferSource) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, value));
}
function equal(provided: string, expected: string) {
  if (provided.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}
async function codeHash(code: string) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(code)));
}

function read<T>(response: { data: T; error: unknown }): T {
  if (response.error) throw new Error("Supabase request failed");
  return response.data;
}

async function manageLink(request: Request) {
  const origin = request.headers.get("origin");
  if (
    !origin ||
    (origin !== configuration.dashboard && origin !== "https://localhost")
  ) {
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

  try {
    const body = await request.json().catch(() => null);
    if (body?.action === "unlink") {
      read(
        await db.from("whatsapp_links").delete().eq("user_id", data.user.id),
      );
      return reply({ ok: true });
    }
    if (configuration.demo) {
      return reply({
        error: "WhatsApp account linking is disabled during demo mode.",
      }, 503);
    }
    const phone = typeof body?.phone === "string"
      ? body.phone.replace(/^\+/, "")
      : "";
    const code = typeof body?.code === "string"
      ? body.code.trim().toLowerCase()
      : "";
    if (
      body?.action !== "confirm" || !phonePattern.test(phone) ||
      !/^[0-9a-f]{32}$/.test(code)
    ) {
      return reply({
        error:
          "Enter your WhatsApp number with country code and the one-time code.",
      }, 400);
    }
    const linked = read(
      await db.rpc("whatsapp_confirm_link", {
        p_phone_key: await hmac(configuration.phoneKey, encoder.encode(phone)),
        p_code_hash: await codeHash(code),
        p_user_id: data.user.id,
      }),
    );
    return linked ? reply({ ok: true }) : reply({
      error:
        "Code did not match or expired. Send LINK from your WhatsApp and try again.",
    }, 400);
  } catch {
    return reply({
      error: "Could not update the WhatsApp link. Please try again.",
    }, 503);
  }
}

function demoReply(question: Question) {
  if (question.kind === "companies" || question.kind === "company") {
    return "DEMO\nDemo Footwear";
  }
  if (question.kind === "link" || question.kind === "unlink") {
    return "DEMO\nAccount linking is off. Try Aaj ki sales or Last sync.";
  }
  const demoResult: Report["result"] = question.kind === "sync"
    ? { status: "completed", time: "2026-11-18T05:30:00Z" }
    : question.kind === "balance"
    ? [{ name: question.name, current_balance: 12500, receivable: 11200 }]
    : question.kind === "stock"
    ? [{ name: question.name, current_stock: 42, unit: "pairs" }]
    : { total: 18340, count: 7 };
  const report = {
    company: "Demo Footwear",
    last_sync: "2026-11-18T05:30:00Z",
    result: demoResult,
  };
  const previous = "start" in question && question.compare
    ? { ...report, result: { total: 15700, count: 5 } }
    : undefined;
  return "DEMO · Sample data\n" + renderReport(question, report, previous);
}

async function answer(phone: string, text: string): Promise<string> {
  const question = parseQuestion(text);
  if (question.kind === "help") return HELP;
  if (question.kind === "setup") return setup;
  if (question.kind === "support") {
    const help =
      "Login ke liye wahi account use karein jo PC Connector mein use kiya tha. Reports update nahi hui? PC par Tally aur SYNCORA Connector kholkar company select karein aur sync karein.";
    return configuration.dashboard
      ? help + "\n\n" + configuration.dashboard + "/support"
      : help;
  }
  if (configuration.demo) return demoReply(question);

  const phoneKey = await hmac(configuration.phoneKey, encoder.encode(phone));
  const link = read(
    await db.from("whatsapp_links").select("user_id,company_id").eq(
      "phone_key",
      phoneKey,
    ).maybeSingle(),
  );
  if (question.kind === "unlink") {
    read(
      await db.from("whatsapp_challenges").delete().eq("phone_key", phoneKey),
    );
    read(await db.from("whatsapp_links").delete().eq("phone_key", phoneKey));
    return "WhatsApp access removed. Dobara connect karne ke liye LINK bhejein.";
  }
  if (question.kind === "link") {
    if (link) {
      return "WhatsApp pehle se linked hai. Account badalne ke liye UNLINK bhejein.";
    }
    const code = crypto.randomUUID().replaceAll("-", "");
    read(
      await db.from("whatsapp_challenges").upsert({
        phone_key: phoneKey,
        code_hash: await codeHash(code),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }),
    );
    return `Is number ko connect karne ke liye SYNCORA mein sign in karein aur apna WhatsApp number aur code enter karein. Code 10 minute tak valid hai. Kisi aur ke saath share na karein.\n\n${configuration.dashboard}/settings/whatsapp\n\n${code}`;
  }
  if (!link) {
    return "Company ka data dekhne ke liye pehle LINK bhejein. Connector installation ke liye SETUP bhejein.";
  }

  const companies = read(
    await db.from("companies").select("id,name").eq("owner_id", link.user_id)
      .order("name").order("id"),
  ) ?? [];
  if (!companies.length) {
    return "Aapke account ki koi owned company sync nahi hui. Connector setup ke liye SETUP bhejein.";
  }
  if (question.kind === "company") {
    const matches = companies.filter((company) =>
      question.byId
        ? company.id === question.name
        : company.name.toLowerCase() === question.name.toLowerCase()
    );
    if (matches.length > 1) {
      return "Is naam ki multiple companies hain. Ek command copy karke bhejein.\n" +
        matches.slice(0, 15).map((company) => "Company id " + company.id).join(
          "\n",
        );
    }
    if (!matches.length) {
      return "Company nahi mili. List ke liye COMPANIES bhejein.";
    }
    const selected = read(
      await db.from("whatsapp_links").update({ company_id: matches[0].id })
        .eq("phone_key", phoneKey).eq("user_id", link.user_id).select(
          "company_id",
        ).maybeSingle(),
    );
    return selected
      ? `Selected company: ${matches[0].name}`
      : "Account link badal gaya. LINK bhejein.";
  }
  const selected = link.company_id
    ? companies.find((company) => company.id === link.company_id)
    : companies.length === 1
    ? companies[0]
    : undefined;
  if (!selected || question.kind === "companies") {
    return `Company select karne ke liye ek command bhejein.\n${
      companies.slice(0, 15).map((company) => "Company " + company.name).join(
        "\n",
      )
    }${
      companies.length > 15
        ? "\nAur companies ke liye exact naam type karein."
        : ""
    }`;
  }

  const reportParams = {
    p_phone_key: phoneKey,
    p_company_id: selected.id,
    p_kind: question.kind,
    p_start: "start" in question ? question.start : null,
    p_end: "end" in question ? question.end : null,
    p_name: "name" in question ? question.name : null,
  };
  const report = read(await db.rpc("whatsapp_report", reportParams)) as
    | Report
    | null;
  if (!report) {
    return "Company access available nahi hai. COMPANIES bhejkar company dobara select karein.";
  }
  const previous = "start" in question && question.compare
    ? read(
      await db.rpc("whatsapp_report", {
        ...reportParams,
        p_start: question.compare,
        p_end: question.compare,
      }),
    ) as Report | null
    : undefined;
  if (previous === null) return "Company access available nahi hai.";
  return renderReport(question, report, previous);
}

async function sendMessage(phone: string, body: string) {
  const response = await fetch(
    `https://graph.facebook.com/${configuration.graphVersion}/${configuration.phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: { body: body.slice(0, 3900), preview_url: false },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`WhatsApp send failed (${response.status})`);
  }
  await response.body?.cancel();
}

type MetaMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
};
type MetaPayload = {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: MetaMessage[];
      };
    }[];
  }[];
};

export async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET") {
    if (
      configuration.verifyToken &&
      url.searchParams.get("hub.mode") === "subscribe" &&
      equal(
        url.searchParams.get("hub.verify_token") ?? "",
        configuration.verifyToken,
      )
    ) {
      return new Response(url.searchParams.get("hub.challenge") ?? "");
    }
    return new Response(null, { status: 403 });
  }

  if (
    !configuration.demo &&
    (configuration.phoneKey.length < 32 ||
      !/^https:\/\/[^/]+$/.test(configuration.dashboard))
  ) {
    return new Response(null, { status: 503 });
  }
  if (url.pathname.endsWith("/link")) return manageLink(request);
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (
    !configuration.appSecret || !configuration.accessToken ||
    !/^\d+$/.test(configuration.phoneId) ||
    !/^v\d+\.\d+$/.test(configuration.graphVersion)
  ) return new Response(null, { status: 503 });

  const signature = request.headers.get("x-hub-signature-256") ?? "";
  if (!/^sha256=[a-f0-9]{64}$/.test(signature)) {
    return new Response(null, { status: 401 });
  }
  const body = await request.arrayBuffer();
  if (
    !equal(signature, "sha256=" + await hmac(configuration.appSecret, body))
  ) return new Response(null, { status: 401 });
  let payload: MetaPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return new Response(null, { status: 400 });
  }

  if (payload?.object !== "whatsapp_business_account") {
    return new Response("OK");
  }
  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (
          change.field !== "messages" ||
          change.value?.metadata?.phone_number_id !== configuration.phoneId
        ) continue;
        for (const message of change.value.messages ?? []) {
          const { from, id } = message;
          const sentAt = Number(message.timestamp) * 1000;
          if (
            !from || !phonePattern.test(from) || !id?.startsWith("wamid.") ||
            id.length > 300 ||
            !Number.isFinite(sentAt) || sentAt <= Date.now() - 86_400_000 ||
            sentAt > Date.now() + 60_000
          ) continue;
          const claim = read(
            await db.rpc("whatsapp_claim_message", { p_id: id }),
          );
          if (claim === "delivered") continue;
          if (claim !== "claimed") return new Response(null, { status: 503 });
          try {
            const text = message.type === "text"
              ? message.text?.body
              : undefined;
            await sendMessage(
              from,
              text && text.length <= 400 ? await answer(from, text) : HELP,
            );
          } catch (error) {
            read(await db.from("whatsapp_messages").delete().eq("id", id));
            throw error;
          }
          read(
            await db.from("whatsapp_messages").update({ delivered: true }).eq(
              "id",
              id,
            ),
          );
        }
      }
    }
    return new Response("OK");
  } catch {
    console.error("WhatsApp webhook could not process a message");
    return new Response(null, { status: 503 });
  }
}
