import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_REDIRECT = 'https://tallyonmob.vercel.app/login';

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function sanitizeRedirectUrl(raw?: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_REDIRECT;
  const trimmed = raw.trim();
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://localhost') ||
    trimmed.startsWith('http://127.0.0.1')
  ) {
    return trimmed;
  }
  return DEFAULT_REDIRECT;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, emailSent: false, error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { success: false, emailSent: false, error: 'Server authentication environment not configured' },
      500,
    );
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return jsonResponse({ success: false, emailSent: false, error: 'Unauthorized: Bearer token required' }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerData, error: callerErr } = await adminClient.auth.getUser(token);
  const caller = callerData?.user;
  if (callerErr || !caller) {
    return jsonResponse({ success: false, emailSent: false, error: 'Unauthorized: Invalid session token' }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, emailSent: false, error: 'Invalid JSON request body' }, 400);
  }

  const invitationId = typeof body.invitationId === 'string' ? body.invitationId.trim() : '';
  const mode = body.mode === 'resend' ? 'resend' : 'invite';
  const safeRedirect = sanitizeRedirectUrl(body.redirectTo);

  if (!invitationId) {
    return jsonResponse({ success: false, emailSent: false, error: 'invitationId is required' }, 400);
  }

  const { data: inv, error: invErr } = await adminClient
    .from('team_invitations')
    .select('id, company_id, email, full_name, role, status')
    .eq('id', invitationId)
    .maybeSingle();

  if (invErr || !inv || inv.status !== 'pending') {
    return jsonResponse({ success: false, emailSent: false, error: 'Pending invitation not found' }, 404);
  }

  const { data: allowed, error: permErr } = await adminClient.rpc('user_has_company_permission', {
    p_company_id: inv.company_id,
    p_category: 'Settings',
    p_action: 'Manage Users',
    p_user_id: caller.id,
  });

  if (permErr || allowed !== true) {
    return jsonResponse(
      { success: false, emailSent: false, error: 'Forbidden: Missing Settings:Manage Users permission' },
      403,
    );
  }

  const { data: company } = await adminClient
    .from('companies')
    .select('name')
    .eq('id', inv.company_id)
    .maybeSingle();

  const companyName = company?.name || 'Syncora Company';
  const subject = mode === 'resend'
    ? `Reminder: You have been invited to ${companyName} on Syncora`
    : `You have been invited to ${companyName} on Syncora`;
  const emailBody = `You have been invited with role ${inv.role} to ${companyName}. Open your invitation link to access Syncora.`;

  let emailSent = false;
  let errMsg = '';
  try {
    const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(inv.email, {
      redirectTo: safeRedirect,
      data: {
        full_name: inv.full_name || '',
        invited_company_id: inv.company_id,
        invited_company_name: companyName,
        invited_role: inv.role,
      },
    });
    if (inviteErr) {
      errMsg = inviteErr.message || 'Auth invite failed';
    } else {
      emailSent = true;
    }
  } catch (err) {
    errMsg = err instanceof Error ? err.message : 'Unexpected email delivery error';
  }

  const nowIso = new Date().toISOString();

  // Record in public.email_queue using actual live schema (to_email, status, sent_at, error_message)
  try {
    await adminClient.from('email_queue').insert({
      company_id: inv.company_id,
      to_email: inv.email,
      subject,
      body: emailBody,
      status: emailSent ? 'sent' : 'failed',
      sent_at: emailSent ? nowIso : null,
      error_message: emailSent ? null : errMsg,
      created_at: nowIso,
    });
  } catch {
    // Non-blocking audit queue write
  }

  if (emailSent) {
    if (mode === 'resend') {
      await adminClient
        .from('team_invitations')
        .update({ resent_at: nowIso, updated_at: nowIso })
        .eq('id', inv.id);
    }

    try {
      await adminClient.from('activity_logs').insert({
        company_id: inv.company_id,
        user_id: caller.id,
        user_email: caller.email || null,
        action: mode === 'resend' ? 'rbac_invite_resent' : 'rbac_invite_email_sent',
        entity_type: 'rbac',
        entity_id: inv.id,
        entity_name: inv.email,
        details: {
          role: inv.role,
          delivery: 'supabase_auth_invite',
          email_sent: true,
        },
        created_at: nowIso,
      });
    } catch {
      // Non-blocking audit log write
    }

    return jsonResponse({
      success: true,
      emailSent: true,
      email: inv.email,
      mode,
    });
  }

  try {
    await adminClient.from('activity_logs').insert({
      company_id: inv.company_id,
      user_id: caller.id,
      user_email: caller.email || null,
      action: 'rbac_invite_email_failed',
      entity_type: 'rbac',
      entity_id: inv.id,
      entity_name: inv.email,
      details: {
        role: inv.role,
        error: errMsg,
        email_sent: false,
      },
      created_at: nowIso,
    });
  } catch {
    // Non-blocking audit log write
  }

  return jsonResponse({
    success: false,
    emailSent: false,
    email: inv.email,
    error: errMsg || 'Invitation email delivery failed',
  });
});
