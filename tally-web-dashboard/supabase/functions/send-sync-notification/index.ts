import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIREBASE_PROJECT_ID = "studio-1865737492-158b7";
const FIREBASE_CLIENT_EMAIL = "firebase-adminsdk-fbsvc@studio-1865737492-158b7.iam.gserviceaccount.com";
const FIREBASE_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCrBwjs7UZew7ww\npwIK9AfsD8N28jRT0KaS9APA6xy0XxhziBKujDrm8AFTqoZeDgMsYWiTx9YQOkVC\nA6mio3QODgq+v9yWOt69cXlAMcVRqhRi646uMRcyewEGBg8cq5MaNSsKUzynff1p\nMW+SEXup1ZDc/PpbhHPlXIOH5jlGnRd6N4M/Nm97CkW4qI7cjvwwPBMZHRPOak39\nc7bs/3j8xwKgTfAp3A0oBH82Odb1CtYXn7paSitCIpByqhQGXjig1E7EL/lTYwC6\nKdZfPbBAxomuITH4VywFR4l1WvIQgrkhe54EApNZFETG5XHMMNHjAlDfn+pVEEBH\nnWxmcyGzAgMBAAECggEAK0GGvOHQNASectGynxGUdVyRS+K7YF1729wSnPb6Fhad\nKQ9H5lS6SxF1zHLrNBuoKs/iMspOtmD+hlFF1MgxgKKFjjQZdvehwVlTWOydoud4\n64H3XtA0tUROAHeE1/P/Kxg6cAyYYSZo8vOZa+C3Hb/RuUrUiVQJOf/5lmQgpV6I\n6Jrus7YMzAICsl64YEIO4aAO+JHjdZ5PLL0J5P7J/vAZG3/KqxtCLMNuW+8nX9eU\nz56A5eAK+lNysl8evr6iKfmQiYEiDi3w12nEJ+Jf6pAFXKT1fgDdqJ0S2r75Isey\nRIgKnHOzVjs5nESxPVYJv5yjLbA0o4U2TkTnjOGGEQKBgQDgZAmP0qbvZoLnAk04\n+xGa3uavJXBNJqv8kuTo0cK5FuMxIJaLMkxx3fLtDsyRskkt7zioZT6udEy66YS2\nIvwk8EvoD/3sWBd7dboYF7DuP9JNapjIX7ApzTCU405eQJ+C/xo1YFmeY/TUfMuV\nlduEBQXkb0GzDa7zKH1coSjE4wKBgQDDHp1Y4GvQ0rMdAXEAElV+HHHiTxPYI2c6\n0/SVCdwDYwr2MYe+3vWDPe9zwO3pHIBNGg68NB79CqYqFOP1I1skzOaayBfVMPrm\nalXpTDqih2I/Y4VqBYfK+XliLspEsZx5mZlyZICwStqqs1m5F08GUXlRkXej5Xjb\nVawBwBmY8QKBgQCEhXBEOYOPpbovlmNnAJhwH66bx/+gAPPX8iUw/xkCWOsKi5V9\nVdJh+VPL/05/yYyAjWSnx0uSmmrqhJl1PAowAp7ByhgL6ibMKkYijnNW8ehRAmCD\nDkgrF9zWQbx5266ZHfIrjeC/s4bXq3BMwrlnKdRGChMCHVWyk7od56v9QwKBgGBX\n9Ym1BoeOAjMISyul4eDrWrBMK5hFoutBTTtqKuDhPsBhpI1yufeb1Whqkw7Pq+pm\nO3BirAp1/6Y3uneIhbCeHB/BPUNfdAPh7ZnMsgceojx6f53iLTLkDDOWtvlEWecR\nGNuLFJ/31hEDjgH+qF6OTEEietjKrepfWxdiK0GBAoGATRdL5wmwxyNq0KChMC7n\n8W7T/nP2lVhk+gZKZPb5RhCQZA+x/zdQnQ+WKhr+AjsyQ/2aVRzX6kUModeDHV1v\nk2qSMjLS00HgWsgjXCktnrKFZ5zc8egS39JMOV68m4TM0csesu9UeXOmrrpZx05x\nha5RgYk+mzZT0qKxqMSCim4=\n-----END PRIVATE KEY-----\n`;

// Generate OAuth2 JWT for FCM v1 API
async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: FIREBASE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const base64url = (obj: any) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const unsignedToken = `${base64url(header)}.${base64url(payload)}`;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(FIREBASE_PRIVATE_KEY);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, encoder.encode(unsignedToken));
  const signedToken = `${unsignedToken}.${btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${signedToken}`,
  });

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

// Send FCM v1 push notification
async function sendFCMMessage(
  token: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<boolean> {
  try {
    const accessToken = await getAccessToken();
    const message = {
      message: {
        token,
        notification: { title, body },
        data,
        android: {
          priority: "high" as const,
          notification: {
            channel_id: "tally_channel",
            sound: "default",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      },
    };

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      }
    );

    const result = await response.json();
    return !!result.name;
  } catch (err) {
    console.error("FCM send error:", err);
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Accept both authenticated and internal calls
    let companyId: string | null = null;
    let syncType: string = "unknown";
    let recordCount: number = 0;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      companyId = body.company_id;
      syncType = body.sync_type || "incremental";
      recordCount = body.record_count || 0;
    } else {
      // Try form data or query params
      const url = new URL(req.url);
      companyId = url.searchParams.get("company_id");
      syncType = url.searchParams.get("sync_type") || "incremental";
      recordCount = parseInt(url.searchParams.get("record_count") || "0");
    }

    if (!companyId) {
      return new Response(
        JSON.stringify({ error: "company_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all device tokens for this company
    const { data: devices, error: devError } = await supabase
      .from("device_tokens")
      .select("token, platform")
      .eq("company_id", companyId);

    if (devError || !devices || devices.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, reason: "no devices" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get company name
    const { data: company } = await supabase
      .from("companies")
      .select("company_name")
      .eq("id", companyId)
      .single();

    const companyName = company?.company_name || "Your company";

    // Build notification
    const title = "Sync Complete";
    const body = `${companyName}: ${recordCount} records synced from Tally.`;
    const data = { action: "sync-history", sync_type: syncType };

    // Send to all devices
    let sent = 0;
    let failed = 0;
    for (const device of devices) {
      const ok = await sendFCMMessage(device.token, title, body, data);
      if (ok) sent++;
      else failed++;
    }

    // Store notification in history
    await supabase.from("notifications").insert({
      id: crypto.randomUUID(),
      company_id: companyId,
      title,
      body,
      type: "sync_complete",
      metadata: { sync_type: syncType, record_count: recordCount, sent, failed },
      created_at: new Date().toISOString(),
    });

    // Update company last_sync_at
    await supabase
      .from("companies")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", companyId);

    return new Response(
      JSON.stringify({ sent, failed, total: devices.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
