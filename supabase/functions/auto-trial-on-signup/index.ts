import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, email, full_name } = await req.json();

    if (!user_id || !email) {
      return new Response(
        JSON.stringify({ error: "user_id and email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client with service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user already has a license
    const { data: existingLicense } = await supabase
      .from("user_licenses")
      .select("id")
      .eq("user_id", user_id)
      .maybeSingle();

    if (existingLicense) {
      return new Response(
        JSON.stringify({ message: "License already exists for this user" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get trial plan
    const { data: trialPlan } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("slug", "trial")
      .eq("is_trial", true)
      .eq("is_active", true)
      .maybeSingle();

    if (!trialPlan) {
      return new Response(
        JSON.stringify({ error: "Trial plan not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate trial dates (server-side time)
    const trialStart = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trialPlan.duration_days);

    // Generate license key
    const licenseKey = `TOM-${new Date().getFullYear()}-TRIAL-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Insert trial history
    const { error: trialError } = await supabase.from("trial_history").insert({
      user_id,
      email,
      trial_start: trialStart.toISOString(),
      trial_end: trialEnd.toISOString(),
      trial_used: true,
      status: "completed",
    });

    if (trialError) {
      console.error("Trial history insert error:", trialError);
    }

    // Insert user license
    const { error: licenseError } = await supabase.from("user_licenses").insert({
      user_id,
      license_key: licenseKey,
      plan_id: trialPlan.id,
      status: "active",
      activation_date: trialStart.toISOString(),
      expiry_date: trialEnd.toISOString(),
    });

    if (licenseError) {
      console.error("License insert error:", licenseError);
      return new Response(
        JSON.stringify({ error: "Failed to create license" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Trial license assigned successfully",
        license_id: trialPlan.id,
        expiry_date: trialEnd.toISOString(),
        days_left: trialPlan.duration_days,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Auto-trial error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});