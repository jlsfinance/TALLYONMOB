-- Phase 5: server-authoritative, atomic and idempotent trial activation.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.trial_activation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_trial_activation_requests_created
  ON public.trial_activation_requests (created_at);

ALTER TABLE public.trial_activation_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trial_activation_requests_own_read ON public.trial_activation_requests;
CREATE POLICY trial_activation_requests_own_read
  ON public.trial_activation_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.activate_trial(
  p_idempotency_key TEXT,
  p_email TEXT,
  p_mobile TEXT DEFAULT NULL,
  p_device_id TEXT DEFAULT NULL,
  p_device_fingerprint TEXT DEFAULT NULL,
  p_tally_serial TEXT DEFAULT NULL,
  p_company_gst TEXT DEFAULT NULL,
  p_company_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_email TEXT := lower(trim(coalesce(p_email, '')));
  v_mobile TEXT := nullif(regexp_replace(trim(coalesce(p_mobile, '')), '[^0-9+]', '', 'g'), '');
  v_device_id TEXT := nullif(trim(coalesce(p_device_id, '')), '');
  v_fingerprint TEXT := nullif(trim(coalesce(p_device_fingerprint, '')), '');
  v_serial TEXT := nullif(upper(trim(coalesce(p_tally_serial, ''))), '');
  v_gst TEXT := nullif(upper(trim(coalesce(p_company_gst, ''))), '');
  v_existing JSONB;
  v_plan RECORD;
  v_license RECORD;
  v_trial_end TIMESTAMPTZ;
  v_response JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUTH_REQUIRED');
  END IF;
  IF v_email = '' OR p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 16 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_REQUEST');
  END IF;

  SELECT response INTO v_existing
  FROM public.trial_activation_requests
  WHERE user_id = v_user_id AND idempotency_key = trim(p_idempotency_key)
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Serialize requests sharing any approved eligibility signal.
  PERFORM pg_advisory_xact_lock(hashtextextended('email:' || v_email, 0));
  IF v_mobile IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('mobile:' || v_mobile, 0)); END IF;
  IF v_device_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('device:' || v_device_id, 0)); END IF;
  IF v_serial IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('serial:' || v_serial, 0)); END IF;
  IF v_gst IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('gst:' || v_gst, 0)); END IF;

  IF EXISTS (SELECT 1 FROM public.user_licenses WHERE user_id = v_user_id AND status = 'active' AND expiry_date > now()) THEN
    v_response := jsonb_build_object('success', false, 'error', 'ACTIVE_LICENSE_EXISTS');
  ELSIF EXISTS (
    SELECT 1 FROM public.trial_history
    WHERE trial_used = true AND (
      lower(email) = v_email OR
      (v_mobile IS NOT NULL AND mobile = v_mobile) OR
      (v_device_id IS NOT NULL AND device_id = v_device_id) OR
      (v_serial IS NOT NULL AND upper(tally_serial) = v_serial) OR
      (v_gst IS NOT NULL AND upper(company_gst) = v_gst)
    )
  ) THEN
    v_response := jsonb_build_object('success', false, 'error', 'TRIAL_ALREADY_USED');
  ELSE
    SELECT id, duration_days, features INTO v_plan
    FROM public.subscription_plans
    WHERE slug = 'trial' AND is_trial IS TRUE AND is_active IS TRUE
    LIMIT 1;
    IF v_plan.id IS NULL THEN
      v_response := jsonb_build_object('success', false, 'error', 'TRIAL_PLAN_UNAVAILABLE');
    ELSE
      v_trial_end := now() + make_interval(days => v_plan.duration_days);
      INSERT INTO public.user_licenses (
        user_id, license_key, plan_id, status, activation_date, expiry_date,
        device_fingerprint, tally_serial, company_gst
      ) VALUES (
        v_user_id, public.generate_license_key('trial'), v_plan.id, 'active', now(), v_trial_end,
        v_fingerprint, v_serial, v_gst
      ) RETURNING id, license_key, plan_id, status, activation_date, expiry_date,
                  device_fingerprint, tally_serial, company_gst INTO v_license;

      INSERT INTO public.trial_history (
        user_id, email, mobile, device_id, device_fingerprint, tally_serial,
        company_gst, company_name, trial_start, trial_end, trial_used, license_id
      ) VALUES (
        v_user_id, v_email, v_mobile, v_device_id, v_fingerprint, v_serial,
        v_gst, nullif(trim(coalesce(p_company_name, '')), ''), now(), v_trial_end, true, v_license.id
      );

      v_response := jsonb_build_object(
        'success', true,
        'license', jsonb_build_object(
          'id', v_license.id, 'license_key', v_license.license_key,
          'plan_id', v_license.plan_id, 'status', v_license.status,
          'activation_date', v_license.activation_date, 'expiry_date', v_license.expiry_date,
          'tally_serial', v_license.tally_serial, 'company_gst', v_license.company_gst
        )
      );
    END IF;
  END IF;

  INSERT INTO public.trial_activation_requests (user_id, idempotency_key, response)
  VALUES (v_user_id, trim(p_idempotency_key), v_response)
  ON CONFLICT (user_id, idempotency_key) DO NOTHING;
  RETURN v_response;
END;
$function$;

REVOKE ALL ON FUNCTION public.activate_trial(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_trial(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
