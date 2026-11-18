import { parseQuestion, renderReport } from "./questions.ts";

function strictEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

function deepStrictEqual(actual: unknown, expected: unknown) {
  strictEqual(JSON.stringify(actual), JSON.stringify(expected));
}

function match(actual: string, pattern: RegExp) {
  if (!pattern.test(actual)) {
    throw new Error(`Expected "${actual}" to match ${pattern}`);
  }
}

async function sign(body: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(body)),
  );
  return "sha256=" +
    Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
}

Deno.test("report questions use the India business date and avoid guessing qualifiers", () => {
  const now = new Date("2026-11-17T19:00:00Z");
  deepStrictEqual(parseQuestion("Aaj ki sales kal se compare karo?", now), {
    kind: "sales",
    start: "2026-11-18",
    end: "2026-11-18",
    compare: "2026-11-17",
  });
  deepStrictEqual(parseQuestion("Is mahine ki purchase kitni hui?", now), {
    kind: "purchase",
    start: "2026-11-01",
    end: "2026-11-18",
    compare: undefined,
  });
  deepStrictEqual(parseQuestion("Sharma Traders se kitna lena hai?"), {
    kind: "balance",
    name: "Sharma Traders",
  });
  deepStrictEqual(parseQuestion("Aaj ki sales excluding GST?"), {
    kind: "help",
  });
  match(
    renderReport({ kind: "stock", name: "105" }, {
      company: "Footwear",
      last_sync: null,
      result: [{ name: "105-A" }, { name: "105-B" }],
    }),
    /Multiple matches/,
  );
});

Deno.test("webhook accepts signed messages for its own number and skips verified duplicates", async () => {
  for (
    const [name, value] of Object.entries({
      SUPABASE_URL: "https://demo.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "demo-service-key",
      WHATSAPP_APP_SECRET: "test-meta-secret",
      WHATSAPP_VERIFY_TOKEN: "test-webhook-token",
      WHATSAPP_ACCESS_TOKEN: "test-graph-token",
      WHATSAPP_PHONE_NUMBER_ID: "42",
      WHATSAPP_GRAPH_VERSION: "v27.0",
      WHATSAPP_DEMO_MODE: "true",
    })
  ) Deno.env.set(name, value);

  const originalFetch = globalThis.fetch;
  let sent = 0;
  let claims = 0;
  let delivered = false;
  let failNext = true;
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.pathname.endsWith("/whatsapp_claim_message")) {
      claims++;
      return Response.json(delivered ? "delivered" : "claimed");
    }
    if (url.pathname.endsWith("/whatsapp_messages")) {
      if (req.method === "PATCH") delivered = true;
      return new Response(null, { status: 204 });
    }
    if (url.hostname === "graph.facebook.com") {
      if (failNext) {
        failNext = false;
        return new Response(null, { status: 503 });
      }
      sent++;
      const body = await req.json();
      strictEqual(body.to, "919000000001");
      match(body.text.body, /DEMO.*Sample data/);
      match(body.text.body, /Sales/);
      return Response.json({ messages: [{ id: "outbound" }] });
    }
    throw new Error("Unexpected request: " + req.url);
  };
  try {
    const { handle } = await import("./handler.ts");
    const base = "https://demo.invalid/functions/v1/whatsapp-bot";
    const callback = await handle(
      new Request(
        base +
          "?hub.mode=subscribe&hub.verify_token=test-webhook-token&hub.challenge=123",
      ),
    );
    strictEqual(await callback.text(), "123");

    const event = (numberId: string, timestamp = Date.now()) =>
      JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            field: "messages",
            value: {
              metadata: { phone_number_id: numberId },
              messages: [{
                id: "wamid.demo",
                from: "919000000001",
                timestamp: String(Math.floor(timestamp / 1000)),
                type: "text",
                text: { body: "Aaj ki sales" },
              }],
            },
          }],
        }],
      });
    const post = async (body: string, secret = "test-meta-secret") =>
      handle(
        new Request(base, {
          method: "POST",
          body,
          headers: {
            "x-hub-signature-256": await sign(body, secret),
          },
        }),
      );

    strictEqual((await post(event("42"), "wrong-secret")).status, 401);
    strictEqual((await post(event("43"))).status, 200);
    strictEqual((await post(event("42", Date.now() - 90_000_000))).status, 200);
    strictEqual(claims, 0);
    strictEqual((await post(event("42"))).status, 503);
    strictEqual((await post(event("42"))).status, 200);
    strictEqual((await post(event("42"))).status, 200);
    strictEqual(sent, 1);
    strictEqual(claims, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
