require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Use environment variables for Supabase connection
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Supabase environment variables missing (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).');
    process.exit(1);
}

// Service role key bypasses RLS — use only on the backend for sync operations
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

// Legacy polyfills (unused, kept for backwards compat with any require references)
const databases = {};
const users = {};
const client = {};
const databaseId = 'supabase_postgres';

module.exports = { supabase, databases, users, client, databaseId };
