-- Grant 30-day free trial to all users who signed up in last 24 hours but don't have a license
-- Run this once to backfill trials

-- Insert trial_history for users who signed up in last 24 hours and don't have a license
INSERT INTO public.trial_history (
    user_id,
    trial_start,
    trial_end,
    trial_used,
    status,
    created_at
)
SELECT 
    u.id,
    now(),
    now() + (sp.duration_days || ' days')::interval,
    true,
    'completed',
    now()
FROM auth.users u
JOIN public.subscription_plans sp ON sp.slug = 'trial' AND sp.is_trial = true AND sp.is_active = true
WHERE u.created_at >= now() - interval '24 hours'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_licenses ul WHERE ul.user_id = u.id
  );

-- Insert user_licenses for those who got trial_history
INSERT INTO public.user_licenses (
    user_id,
    license_key,
    plan_id,
    status,
    activation_date,
    expiry_date,
    created_at,
    updated_at
)
SELECT 
    th.user_id,
    'TOM-' || EXTRACT(YEAR FROM th.trial_start)::text || '-TRIAL-' || SUBSTRING(MD5(th.user_id::text) FROM 1 FOR 8),
    sp.id,
    'active',
    th.trial_start,
    th.trial_end,
    th.created_at,
    th.created_at
FROM trial_history th
JOIN public.subscription_plans sp ON sp.id = (
    SELECT id FROM public.subscription_plans WHERE slug = 'trial' AND is_trial = true AND is_active = true LIMIT 1
)
WHERE th.trial_used = true
  AND th.status = 'completed'
  AND th.created_at >= now() - interval '24 hours'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_licenses ul WHERE ul.user_id = th.user_id
  );

-- Report results
SELECT 'Users who got trial' as metric, COUNT(*) as count
FROM trial_history th
WHERE th.created_at >= now() - interval '24 hours'
  AND th.status = 'completed'
UNION ALL
SELECT 'Users who already had license', COUNT(*)
FROM auth.users u
WHERE u.created_at >= now() - interval '24 hours'
  AND EXISTS (SELECT 1 FROM public.user_licenses ul WHERE ul.user_id = u.id)
UNION ALL
SELECT 'Users who signed up in last 24h', COUNT(*)
FROM auth.users u
WHERE u.created_at >= now() - interval '24 hours';