/**
 * SyncIdentity - Isolated Supabase client for company identity registration.
 *
 * This module uses @supabase/supabase-js directly (NOT @insforge/sdk)
 * to connect to the authoritative Supabase project for identity registry operations.
 *
 * Security properties:
 * - Only uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from env
 * - Validates that the configured project URL matches the authoritative project
 *   using strict hostname matching (not substring)
 * - Does not log credentials or JWTs
 * - Auto-refresh and persist session disabled for server-side use
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const AUTHORITATIVE_PROJECT = 'pfqmqpboomwtxgyfqnsn';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let configError = null;
let supabaseIdentity = null;

// Validate configuration
if (!supabaseUrl || !supabaseServiceRoleKey) {
    configError = 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables';
} else {
    // Strict hostname validation: only accept the authoritative project URL
    let parsedUrl;
    try {
        parsedUrl = new URL(supabaseUrl);
    } catch (e) {
        configError = `Invalid SUPABASE_URL format: ${supabaseUrl}`;
    }

    if (!configError) {
        const hostname = parsedUrl.hostname;
        const expectedHost = `${AUTHORITATIVE_PROJECT}.supabase.co`;

        if (hostname !== expectedHost) {
            configError = `Supabase URL host '${hostname}' does not match authoritative project '${expectedHost}'`;
        } else {
            supabaseIdentity = createClient(supabaseUrl, supabaseServiceRoleKey, {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            });
        }
    }
}

module.exports = {
    supabaseIdentity,
    configError,
    AUTHORITATIVE_PROJECT
};
