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
        const body = await req.json().catch(() => ({}));
        const email = body.email;
        const password = body.password;

        let supabase;
        let user = null;

        // Method 1: Try auth header first
        const authHeader = req.headers.get("Authorization");
        if (authHeader) {
            supabase = createClient(
                Deno.env.get("SUPABASE_URL") ?? "",
                Deno.env.get("SUPABASE_ANON_KEY") ?? "",
                { global: { headers: { Authorization: authHeader } } }
            );
            const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
            if (!authError && authUser) {
                user = authUser;
            }
        }

        // Method 2: If no auth header or auth failed, try email/password login
        if (!user && email && password) {
            supabase = createClient(
                Deno.env.get("SUPABASE_URL") ?? "",
                Deno.env.get("SUPABASE_ANON_KEY") ?? ""
            );
            const { data: { user: loginUser }, error: loginError } = await supabase.auth.signInWithPassword({
                email: email.trim().toLowerCase(),
                password,
            });
            if (!loginError && loginUser) {
                user = loginUser;
            }
        }

        if (!user) {
            return new Response(JSON.stringify({ valid: false, error: "Unauthorized", status: "none" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Super admin always valid
        if (user.email === "lovneetrathi@gmail.com") {
            return new Response(JSON.stringify({
                valid: true,
                status: "active",
                plan: "pro",
                isSuperAdmin: true,
                daysRemaining: 36500,
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Check active license using SECURITY DEFINER RPC
        const { data: rpcResult, error: rpcError } = await supabase
            .rpc("validate_user_license", { p_user_id: user.id });

        if (!rpcError && rpcResult && rpcResult.valid) {
            return new Response(JSON.stringify({
                valid: true,
                status: rpcResult.status === "active" ? "active" : rpcResult.status,
                plan: rpcResult.plan_name || "Unknown",
                expiresAt: rpcResult.expiry_date,
                daysRemaining: rpcResult.days_left || 0,
                features: [],
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Fallback: direct query (may fail due to RLS)
        const { data: license } = await supabase
            .from("user_licenses")
            .select("*")
            .eq("user_id", user.id)
            .eq("status", "active")
            .gte("expiry_date", new Date().toISOString())
            .order("expiry_date", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (license) {
            const daysLeft = Math.ceil(
                (new Date(license.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );
            let planName = "Unknown";
            if (license.plan_id) {
                const { data: plan } = await supabase
                    .from("subscription_plans")
                    .select("name")
                    .eq("id", license.plan_id)
                    .maybeSingle();
                planName = plan?.name || license.plan_slug || "Unknown";
            } else if (license.plan_slug) {
                planName = license.plan_slug;
            }

            return new Response(JSON.stringify({
                valid: true,
                status: "active",
                plan: planName,
                expiresAt: license.expiry_date,
                daysRemaining: daysLeft,
                features: [],
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
            .maybeSingle();

        if (trial && trial.trial_used) {
            const trialEnd = new Date(trial.trial_end);
            if (trialEnd > new Date()) {
                const daysLeft = Math.ceil(
                    (trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
                return new Response(JSON.stringify({
                    valid: true,
                    status: "trial",
                    plan: "trial",
                    expiresAt: trialEnd.toISOString(),
                    daysRemaining: daysLeft,
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
        return new Response(JSON.stringify({ valid: false, error: "Server error", status: "none" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
