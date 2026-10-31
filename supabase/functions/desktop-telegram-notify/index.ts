import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sanitizeTelegramHtml(message: string): string {
  return message
    .split(/(<\/?(?:b|i|code)>)/gi)
    .map((part) => /^<\/?(?:b|i|code)>$/i.test(part) ? part : escapeHtml(part))
    .join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  const authorization = req.headers.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return jsonResponse(401, { error: 'Sign in required' });

  if (!supabaseUrl || !anonKey) return jsonResponse(503, { error: 'Notification service is not configured' });
  if (!botToken) return jsonResponse(503, { error: 'Telegram notification service is not configured' });

  try {
    const token = match[1];
    const userDb = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: userResult, error: authError } = await userDb.auth.getUser(token);
    const user = userResult?.user;
    if (authError || !user) return jsonResponse(401, { error: 'Session is invalid or expired' });

    const declaredLength = Number(req.headers.get('content-length') ?? 0);
    if (declaredLength > 12_000) return jsonResponse(413, { error: 'Message is too large' });

    const body = await req.json().catch(() => null) as { chat_id?: unknown; message?: unknown } | null;
    const chatId = typeof body?.chat_id === 'string' ? body.chat_id.trim() : '';
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!chatId || chatId.length > 128 || !message || message.length > 4096) {
      return jsonResponse(400, { error: 'A valid linked chat and message are required' });
    }

    // Read through the caller's JWT/RLS; never trust a client-supplied recipient.
    const { data: profile, error: profileError } = await userDb
      .from('user_profiles')
      .select('telegram_chat_id')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) return jsonResponse(500, { error: 'Could not verify the linked Telegram account' });
    if (!profile?.telegram_chat_id || String(profile.telegram_chat_id) !== chatId) {
      return jsonResponse(403, { error: 'Telegram chat is not linked to this signed-in account' });
    }

    const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: profile.telegram_chat_id,
        text: sanitizeTelegramHtml(message),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!telegramResponse.ok) {
      return jsonResponse(502, { error: `Telegram delivery failed (HTTP ${telegramResponse.status})` });
    }
    return jsonResponse(200, { sent: true });
  } catch {
    return jsonResponse(500, { error: 'Telegram notification could not be sent' });
  }
});
