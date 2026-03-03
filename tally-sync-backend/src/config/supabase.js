require('dotenv').config();
const { createClient } = require('@insforge/sdk');

// We use the admin API key for the backend to bypass RLS and perform syncs successfully.
const API_URL = 'https://3uq8fv8r.ap-southeast.insforge.app';
const API_KEY = 'ik_9bef5476d1f848d9f06212a645525293';

if (!API_URL || !API_KEY) {
    console.error('❌ InsForge Environment variables missing.');
    process.exit(1);
}

// createClient expects object with baseUrl and anonKey
// But InsForge admin key can also be passed as anonKey to get admin privileges
const supabase = createClient({
    baseUrl: API_URL,
    anonKey: API_KEY, // Using admin key
});

// Appwrite polyfills to avoid crashing legacy requires
const databases = {};
const users = {};
const client = {};
const databaseId = 'insforge_postgres';

module.exports = { supabase, databases, users, client, databaseId };
