import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { events } = body;

    if (!events || !Array.isArray(events) || events.length === 0) {
      return new Response(JSON.stringify({ error: "No events provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: max 100 events per request
    const batch = events.slice(0, 100);

    const rows = batch.map((e: any) => ({
      user_id: user.id,
      company_id: e.company_id || null,
      event_type: e.event_type || "unknown",
      event_category: e.event_category || "general",
      page: e.page || "",
      element: e.element || "",
      metadata: e.metadata || {},
      session_id: e.session_id || null,
      device_info: e.device_info || {},
      ip_address: req.headers.get("x-forwarded-for") || "unknown",
      duration_ms: e.duration_ms || null,
      created_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from("user_activity_logs")
      .insert(rows)
      .select("id");

    if (error) {
      console.error("Insert error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update aggregated stats (async, don't block response)
    const statsUpdate = batch.reduce((acc: any, e: any) => {
      const key = `${e.event_type}:${e.page || "global"}`;
      if (!acc[key]) acc[key] = { event_type: e.event_type, page: e.page || "global", count: 0 };
      acc[key].count++;
      return acc;
    }, {});

    for (const stat of Object.values(statsUpdate) as any[]) {
      await supabase.rpc("upsert_activity_stat", {
        p_user_id: user.id,
        p_company_id: batch[0]?.company_id || null,
        p_event_type: stat.event_type,
        p_page: stat.page,
        p_count: stat.count,
      }).catch(() => {}); // ignore errors on stat update
    }

    return new Response(JSON.stringify({ success: true, recorded: data?.length || 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Track activity error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
