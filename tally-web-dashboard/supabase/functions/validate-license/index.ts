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
                plan: "Super Admin",
                planName: "Super Admin",
                isSuperAdmin: true,
                daysLeft: 3650,
                activatedAt: null,
                expiresAt: null,
                features: ["all"],
                serialNumber: null,
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Check active license
        const { data: license } = await supabase
            .from("user_licenses")
            .select("*, subscription_plans(name, slug, features, duration_days)")
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
            const planName = license.subscription_plans?.name ?? license.plan_name ?? "Pro";
            const features = license.subscription_plans?.features ?? license.features ?? [];

            return new Response(JSON.stringify({
                valid: true,
                status: "active",
                plan: planName,
                planName: planName,
                isSuperAdmin: false,
                daysLeft,
                activatedAt: license.activated_at,
                expiresAt: license.expires_at,
                features,
                serialNumber: license.serial_number ?? null,
                licenseKey: license.license_key ?? null,
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
            const trialStart = new Date(trial.start_date);
            const trialEnd = new Date(trialStart);
            trialEnd.setDate(trialEnd.getDate() + 7);

            if (trialEnd > new Date()) {
                const daysLeft = Math.ceil(
                    (trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
                return new Response(JSON.stringify({
                    valid: true,
                    status: "trial",
                    plan: "Free Trial",
                    planName: "Free Trial",
                    isSuperAdmin: false,
                    daysLeft,
                    activatedAt: trial.start_date,
                    expiresAt: trialEnd.toISOString(),
                    features: ["basic"],
                    serialNumber: trial.tally_serial ?? null,
                    licenseKey: null,
                }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            } else {
                // Trial expired
                return new Response(JSON.stringify({
                    valid: false,
                    status: "expired",
                    plan: "Free Trial",
                    planName: "Free Trial",
                    isSuperAdmin: false,
                    daysLeft: 0,
                    activatedAt: trial.start_date,
                    expiresAt: trialEnd.toISOString(),
                    features: [],
                    serialNumber: trial.tally_serial ?? null,
                    licenseKey: null,
                    error: "Trial expired",
                }), {
                    status: 403,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
        }

        // No valid license or trial
        return new Response(JSON.stringify({
            valid: false,
            status: "none",
            error: "No active subscription",
            plan: "None",
            planName: "None",
            isSuperAdmin: false,
            daysLeft: 0,
            activatedAt: null,
            expiresAt: null,
            features: [],
            serialNumber: null,
            licenseKey: null,
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
