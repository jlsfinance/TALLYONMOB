const { createClient } = require('@supabase/supabase-js');
const url = 'https://pfqmqpboomwtxgyfqnsn.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmcW1xcGJvb213dHhneWZxbnNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNjE5OTcsImV4cCI6MjA5NjkzNzk5N30.pgs5CbFK7h9T2YNqtHk5VKQLYgtv_CSKsYNdOaaN7u0';
const s = createClient(url, key);

async function check() {
  const tables = [
    'activity_logs', 'audit_logs', 'sync_logs', 'sync_history',
    'telemetry_events', 'vouchers', 'pending_transactions',
    'user_sessions', 'login_history', 'company', 'companies',
    'app_users', 'users'
  ];
  for (const t of tables) {
    try {
      const { data, error, count } = await s.from(t).select('*', { count: 'exact', head: true });
      console.log(t, error ? 'ERR: ' + error.message : 'OK count: ' + count);
    } catch(e) {
      console.log(t, 'EX: ' + e.message);
    }
  }
}
check();
