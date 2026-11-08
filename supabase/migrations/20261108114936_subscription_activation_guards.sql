CREATE OR REPLACE FUNCTION public.assign_license(p_email text, p_plan_slug text, p_duration_days integer DEFAULT 30, p_mobile text DEFAULT NULL::text, p_tally_serial text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF auth.uid() IS NULL OR NOT COALESCE((
        SELECT up.is_admin
        FROM public.user_profiles up
        WHERE up.id = auth.uid()
    ), false) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN public.assign_license_impl(p_email, p_plan_slug, p_duration_days, p_mobile, p_tally_serial);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.extend_license(p_license_id uuid, p_days integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF auth.uid() IS NULL OR NOT COALESCE((
        SELECT up.is_admin
        FROM public.user_profiles up
        WHERE up.id = auth.uid()
    ), false) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN public.extend_license_impl(p_license_id, p_days);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_license_status(p_license_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF auth.uid() IS NULL OR NOT COALESCE((
        SELECT up.is_admin
        FROM public.user_profiles up
        WHERE up.id = auth.uid()
    ), false) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN public.update_license_status_impl(p_license_id, p_status);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.activate_trial(p_idempotency_key text, p_email text, p_mobile text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text, p_device_fingerprint text DEFAULT NULL::text, p_tally_serial text DEFAULT NULL::text, p_company_gst text DEFAULT NULL::text, p_company_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_email TEXT;
  v_access JSONB;
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
  SELECT lower(trim(u.email)) INTO v_email FROM auth.users u WHERE u.id=v_user_id;
  IF coalesce(v_email,'')='' OR v_email IS DISTINCT FROM lower(trim(coalesce(p_email,''))) THEN
    RETURN jsonb_build_object('success',false,'error','INVALID_ACCOUNT_EMAIL');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('lic-user:'||v_user_id::text,0));
  v_access:=public.subscription_access_for_user(v_user_id);
  IF v_access->>'status' IN ('blocked','suspended','revoked') THEN
    RETURN jsonb_build_object('success',false,'error','ACCESS_RESTRICTED');
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

  IF coalesce((v_access->>'valid')::boolean,false) THEN
    v_response := jsonb_build_object('success', false, 'error', 'ACTIVE_LICENSE_EXISTS');
  ELSIF EXISTS (
    SELECT 1 FROM public.trial_history
    WHERE trial_used = true AND (
      user_id = v_user_id OR
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_subscription_order(p_plan_slug text, p_coupon_code text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE q jsonb; c public.coupons; o public.subscription_orders; r jsonb; n bigint; u bigint;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('checkout:'||auth.uid()::text,0));
 r:=public.subscription_access_for_user(auth.uid());
 IF r->>'status' IN ('blocked','suspended','revoked') THEN RAISE EXCEPTION 'Contact support to restore access'; END IF;
 SELECT * INTO o FROM public.subscription_orders WHERE id=p_request_id;
 IF FOUND THEN
   IF o.user_id<>auth.uid() OR o.plan_slug<>p_plan_slug THEN RAISE EXCEPTION 'Invalid checkout request'; END IF;
   RETURN to_jsonb(o);
 END IF;
 -- Quote enforces plan eligibility, coupon audience and per-user limits.
 IF nullif(trim(p_coupon_code),'') IS NOT NULL THEN
   SELECT * INTO c FROM public.coupons WHERE code=upper(trim(p_coupon_code)) FOR UPDATE;
 END IF;
 q:=public.quote_subscription_plan(p_plan_slug,p_coupon_code);
 IF NOT coalesce((q->>'valid')::boolean,false) THEN RAISE EXCEPTION '%',coalesce(q->>'error','Invalid plan'); END IF;
 IF (q->>'final_amount')::numeric<=0 THEN RAISE EXCEPTION 'Zero-value plans require administrator activation'; END IF;
 IF c.id IS NOT NULL THEN
   SELECT count(*),count(*) FILTER(WHERE user_id=auth.uid()) INTO n,u FROM public.subscription_orders
     WHERE coupon_id=c.id AND status='pending' AND expires_at>now();
   IF c.usage_limit IS NOT NULL AND coalesce(c.used_count,0)+n>=c.usage_limit THEN RAISE EXCEPTION 'Coupon usage limit reached'; END IF;
   SELECT u+count(*) INTO u FROM public.coupon_usage WHERE coupon_id=c.id AND user_id=auth.uid();
   IF c.per_user_limit IS NOT NULL AND u>=c.per_user_limit THEN RAISE EXCEPTION 'Coupon usage limit reached for this account'; END IF;
 END IF;
 INSERT INTO public.subscription_orders(id,user_id,plan_id,plan_slug,duration_days,amount_paise,price,discount,coupon_id)
 VALUES(p_request_id,auth.uid(),(q->>'plan_id')::uuid,p_plan_slug,(q->>'duration_days')::integer,
 round((q->>'final_amount')::numeric*100)::bigint,(q->>'price')::numeric,(q->>'discount')::numeric,c.id)
 RETURNING * INTO o;
 RETURN to_jsonb(o);
END $function$
;
