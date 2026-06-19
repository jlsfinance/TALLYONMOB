import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "lovneetrathi@gmail.com";

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const email = body.email;
        const password = body.password;
        const tallySerial = body.tallySerial?.trim() || null;

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
            return new Response(JSON.stringify({
                valid: false,
                error: "AUTH_FAILED",
                status: "none",
                message: "Authentication failed. Invalid email or password."
            }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Super admin always valid (exempt from all restrictions)
        if (user.email === ADMIN_EMAIL) {
            // Even for super admin, bind tally_serial if provided
            if (tallySerial) {
                await supabase.rpc("bind_tally_serial", {
                    p_user_id: user.id,
                    p_tally_serial: tallySerial,
                    p_admin_override: true
                });
            }
            return new Response(JSON.stringify({
                valid: true,
                status: "active",
                plan: "super_admin",
                isSuperAdmin: true,
                daysRemaining: 36500,
                message: "Super admin access"
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Check license with tally_serial validation
        const { data: rpcResult, error: rpcError } = await supabase
            .rpc("validate_user_license", {
                p_user_id: user.id,
                p_tally_serial: tallySerial
            });

        if (!rpcError && rpcResult && rpcResult.valid) {
            return new Response(JSON.stringify({
                valid: true,
                status: rpcResult.status === "active" ? "active" : rpcResult.status,
                plan: rpcResult.plan_name || "Unknown",
                expiresAt: rpcResult.expiry_date,
                daysRemaining: rpcResult.days_left || 0,
                tallySerialBound: rpcResult.tally_serial_bound,
                emailBound: rpcResult.email_bound,
                features: [],
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Check for tally_mismatch specifically
        if (!rpcError && rpcResult && rpcResult.status === "tally_mismatch") {
            return new Response(JSON.stringify({
                valid: false,
                error: "TALLY_MISMATCH",
                status: "tally_mismatch",
                message: "This license is already linked to another Tally Serial Number (" + rpcResult.tally_serial_bound + "). Contact support to transfer.",
                boundSerial: rpcResult.tally_serial_bound,
                email: rpcResult.email_bound,
            }), {
                status: 403,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Check for other specific errors
        if (!rpcError && rpcResult) {
            const errorMap: Record<string, { error: string; message: string; status: number }> = {
                "expired": { error: "SUBSCRIPTION_EXPIRED", message: "Your subscription has expired. Please renew.", status: 403 },
                "suspended": { error: "LICENSE_SUSPENDED", message: "Your license has been suspended. Contact support.", status: 403 },
                "no_license": { error: "NO_LICENSE", message: "No active subscription found. Please purchase a plan.", status: 403 },
            };

            const errInfo = errorMap[rpcResult.status];
            if (errInfo) {
                return new Response(JSON.stringify({
                    valid: false,
                    error: errInfo.error,
                    status: rpcResult.status,
                    message: errInfo.message,
                    emailBound: rpcResult.email_bound,
                    tallySerialBound: rpcResult.tally_serial_bound,
                }), {
                    status: errInfo.status,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
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
            // Check tally_serial match on fallback too
            if (license.tally_serial && tallySerial && license.tally_serial !== tallySerial) {
                return new Response(JSON.stringify({
                    valid: false,
                    error: "TALLY_MISMATCH",
                    status: "tally_mismatch",
                    message: "This license is already linked to another Tally Serial Number (" + license.tally_serial + "). Contact support to transfer.",
                    boundSerial: license.tally_serial,
                }), {
                    status: 403,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

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

            // Auto-bind tally_serial if first time
            if (!license.tally_serial && tallySerial) {
                await supabase.rpc("bind_tally_serial", {
                    p_user_id: user.id,
                    p_tally_serial: tallySerial
                });
            }

            return new Response(JSON.stringify({
                valid: true,
                status: "active",
                plan: planName,
                expiresAt: license.expiry_date,
                daysRemaining: daysLeft,
                tallySerialBound: license.tally_serial,
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
            error: "NO_LICENSE",
            status: "none",
            message: "No active subscription found. Please purchase a plan.",
        }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("License validation error:", error);
        return new Response(JSON.stringify({
            valid: false,
            error: "SERVER_ERROR",
            status: "none",
            message: "Internal server error. Please try again."
        }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
