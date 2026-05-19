const { createClient } = require('@insforge/sdk');
require('dotenv').config();

const baseUrl = process.env.INFORGE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.INFORGE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!baseUrl || !anonKey) {
    console.error('❌ Insforge credentials missing in .env');
}

const supabase = createClient({ baseUrl, anonKey });

module.exports = { supabase };
