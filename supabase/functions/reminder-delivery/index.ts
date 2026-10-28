import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1';
import webpush from 'npm:web-push@3.6.7';

const url = Deno.env.get('SUPABASE_URL') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const triggerSecret = Deno.env.get('REMINDER_WORKER_SECRET') || '';
const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const publicKey = Deno.env.get('WEB_PUSH_PUBLIC_KEY') || '';
const privateKey = Deno.env.get('WEB_PUSH_PRIVATE_KEY') || '';
const subject = Deno.env.get('WEB_PUSH_SUBJECT') || '';
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!triggerSecret || req.headers.get('x-reminder-secret') !== triggerSecret) return new Response('Unauthorized', { status: 401 });
  const { data: jobs, error } = await db.rpc('claim_reminder_jobs', { batch_size: 25 });
  if (error) return new Response('Could not claim jobs', { status: 500 });
  for (const job of jobs || []) {
    try {
      const { data: reminder, error: readError } = await db.from('party_reminders').select('id,user_id,company_id,party_name,message,due_at').eq('id', job.reminder_id).single();
      if (readError || !reminder) throw new Error('Reminder not found');
      const title = job.event_type === 'created' ? 'Reminder saved' : 'Reminder due';
      const when = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(reminder.due_at));
      const message = `${title}\n${reminder.party_name}\n${reminder.message}\n${when}`;
      if (job.channel === 'telegram') {
        if (!botToken) throw new Error('Telegram is not configured');
        const { data: profile, error: profileError } = await db.from('user_profiles').select('telegram_chat_id').eq('id', reminder.user_id).maybeSingle();
        if (profileError || !profile?.telegram_chat_id) throw new Error('Telegram account is not linked');
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: profile.telegram_chat_id, text: message }), signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`Telegram returned ${response.status}`);
      } else {
        if (!publicKey || !privateKey || !subject) throw new Error('Web push is not configured');
        const { data: subscriptions, error: subError } = await db.from('reminder_push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', reminder.user_id).eq('company_id', reminder.company_id);
        if (subError || !subscriptions?.length) throw new Error('No registered push device');
        webpush.setVapidDetails(subject, publicKey, privateKey);
        for (const sub of subscriptions) {
          const endpoint = new URL(sub.endpoint);
          if (endpoint.protocol !== 'https:' || !['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','wns.windows.com','notify.windows.com'].some(host => endpoint.hostname === host || endpoint.hostname.endsWith('.' + host))) throw new Error('Unsupported push endpoint');
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title, body: `${reminder.party_name}: ${reminder.message}`, url: '/ledgers', tag: `reminder-${job.id}` }));
        }
      }
      const { error: updateError } = await db.from('reminder_delivery_jobs').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null }).eq('id', job.id).eq('status', 'processing').eq('attempts', job.attempts).eq('claimed_at', job.claimed_at);
      if (updateError) throw new Error('Could not record delivery');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delivery failed';
      await db.from('reminder_delivery_jobs').update({ status: job.attempts >= 8 ? 'failed' : 'pending', available_at: new Date(Date.now() + 60000 * Math.min(30, 2 ** job.attempts)).toISOString(), last_error: message.slice(0, 200) }).eq('id', job.id).eq('status', 'processing').eq('attempts', job.attempts).eq('claimed_at', job.claimed_at);
    }
  }
  return Response.json({ processed: (jobs || []).length });
});
