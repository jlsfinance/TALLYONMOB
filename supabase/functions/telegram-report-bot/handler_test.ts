import { parseQuestion, renderReport } from "./questions.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function configure(demo: boolean) {
  for (
    const [name, value] of Object.entries({
      SUPABASE_URL: "https://test.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "mock-db-key",
      TELEGRAM_REPORT_BOT_TOKEN: "mock-bot-token",
      TELEGRAM_REPORT_WEBHOOK_SECRET: "mock-webhook-secret",
      TELEGRAM_REPORT_DASHBOARD_ORIGIN: "https://dashboard.invalid",
      TELEGRAM_REPORT_DEMO_MODE: String(demo),
    })
  ) Deno.env.set(name, value);
}

Deno.test("India dates and ambiguous stock matches", () => {
  const now = new Date("2026-11-17T19:00:00Z");
  equal(parseQuestion("Aaj ki sales kal se compare karo?", now), {
    kind: "sales",
    start: "2026-11-18",
    end: "2026-11-18",
    compare: "2026-11-17",
  });
  equal(parseQuestion("Aaj ki sales excluding GST?", now), { kind: "help" });
  equal(
    renderReport({ kind: "stock", name: "105" }, {
      company: "Footwear",
      last_sync: null,
      result: [{ name: "105-A" }, { name: "105-B" }],
    }).includes("Multiple matches"),
    true,
  );
});

Deno.test("webhook requires its secret, ignores groups, and replies once to a retried live update", async () => {
  configure(false);

  const originalFetch = globalThis.fetch;
  let deliveryAttempts = 0;
  let claims = 0;
  let delivered = false;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname.endsWith("/telegram_report_claim_message")) {
      claims++;
      return Response.json(delivered ? "delivered" : "claimed");
    }
    if (url.pathname.endsWith("/telegram_report_messages")) {
      if (request.method === "PATCH") delivered = true;
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith("/telegram_report_links")) {
      return Response.json([{ user_id: "owner", company_id: "company" }]);
    }
    if (url.pathname.endsWith("/companies")) {
      equal(url.searchParams.get("owner_id"), "eq.owner");
      return Response.json([{ id: "company", name: "Footwear" }]);
    }
    if (url.pathname.endsWith("/telegram_report_read")) {
      const query = await request.json();
      equal([query.p_chat_id, query.p_company_id, query.p_kind], [
        "42",
        "company",
        "sales",
      ]);
      return Response.json({
        company: "Footwear",
        last_sync: null,
        result: { count: 2, total: 1200 },
      });
    }
    if (url.hostname === "api.telegram.org") {
      deliveryAttempts++;
      const reply = await request.json();
      equal(reply.chat_id, "42");
      equal(reply.parse_mode, undefined);
      equal(reply.text.includes("₹1,200.00 (2 vouchers)"), true);
      return deliveryAttempts === 1
        ? new Response(null, { status: 503 })
        : Response.json({ ok: true });
    }
    throw new Error(`Unexpected request to ${url.hostname}${url.pathname}`);
  };

  try {
    const { handle } = await import("./handler.ts");
    const endpoint = "https://test.invalid/functions/v1/telegram-report-bot";
    const send = (type: string, secret = "mock-webhook-secret", from = 42) =>
      handle(
        new Request(endpoint, {
          method: "POST",
          headers: { "x-telegram-bot-api-secret-token": secret },
          body: JSON.stringify({
            update_id: 123,
            message: {
              chat: { type, id: 42 },
              from: { id: from, is_bot: false },
              text: "/sales@SyncoraBot",
            },
          }),
        }),
      );

    equal((await send("private", "")).status, 403);
    equal((await send("supergroup")).status, 200);
    equal((await send("private", "mock-webhook-secret", 99)).status, 200);
    equal(claims, 0);
    equal((await send("private")).status, 503);
    equal((await send("private")).status, 200);
    equal((await send("private")).status, 200);
    equal(deliveryAttempts, 2);
    equal(claims, 3);

    const unsignedLink = new Request(endpoint + "/link", {
      method: "POST",
      headers: { origin: "https://dashboard.invalid" },
      body: JSON.stringify({ action: "create" }),
    });
    equal((await handle(unsignedLink)).status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("demo sends sample data without querying SYNCORA tables", async () => {
  configure(true);
  const originalFetch = globalThis.fetch;
  let sent = false;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    equal(new URL(request.url).hostname, "api.telegram.org");
    const payload = await request.json();
    equal(payload.text.includes("DEMO · Sample data"), true);
    sent = true;
    return Response.json({ ok: true });
  };
  try {
    const { handle } = await import("./handler.ts?demo");
    const response = await handle(
      new Request("https://test.invalid/functions/v1/telegram-report-bot", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": "mock-webhook-secret" },
        body: JSON.stringify({
          update_id: 321,
          message: {
            chat: { type: "private", id: 42 },
            from: { id: 42, is_bot: false },
            text: "Aaj ki sales",
          },
        }),
      }),
    );
    equal(response.status, 200);
    equal(sent, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
