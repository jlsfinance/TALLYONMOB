import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ valid: false, error: "No authorization" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            { global: { headers: { Authorization: authHeader } } }
        );

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return new Response(JSON.stringify({ valid: false, error: "Unauthorized" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Super admin always valid
        if (user.email === "lovneetrathi@gmail.com") {
            return new Response(JSON.stringify({
                valid: true,
                status: "active",
                planName: "Super Admin",
                isSuperAdmin: true,
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Check active license
        const { data: license } = await supabase
            .from("user_licenses")
            .select("*")
            .eq("user_id", user.id)
            .eq("status", "active")
            .gte("expires_at", new Date().toISOString())
            .order("expires_at", { ascending: false })
            .limit(1)
            .single();

        if (license) {
            const daysLeft = Math.ceil(
                (new Date(license.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );
            return new Response(JSON.stringify({
                valid: true,
                status: "active",
                planName: license.plan_name,
                expiresAt: license.expires_at,
                daysLeft,
                features: license.features || [],
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Check trial
        const { data: trial } = await supabase
            .from("trial_history")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        if (trial && trial.status === "active") {
            const trialEnd = new Date(trial.start_date);
            trialEnd.setDate(trialEnd.getDate() + 7);
            if (trialEnd > new Date()) {
                const daysLeft = Math.ceil(
                    (trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
                return new Response(JSON.stringify({
                    valid: true,
                    status: "trial",
                    planName: "Free Trial",
                    expiresAt: trialEnd.toISOString(),
                    daysLeft,
                    features: ["basic"],
                }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
        }

        // No valid license or trial
        return new Response(JSON.stringify({
            valid: false,
            status: "none",
            error: "No active subscription",
        }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        return new Response(JSON.stringify({ valid: false, error: "Server error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
