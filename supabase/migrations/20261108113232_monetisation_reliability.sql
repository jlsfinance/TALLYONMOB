-- One authoritative subscription decision, shared by web and desktop.
CREATE OR REPLACE FUNCTION public.subscription_access_for_user(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE l public.user_licenses; p public.subscription_plans; e timestamptz; s text; a boolean;
BEGIN
 SELECT coalesce(up.is_admin,false) INTO a FROM public.user_profiles up WHERE up.id=p_user_id;
 IF EXISTS(SELECT 1 FROM public.user_profiles up WHERE up.id=p_user_id AND up.is_active=false)
 OR EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_user_id AND u.banned_until>now()) THEN
   RETURN jsonb_build_object('valid',false,'status','blocked','is_admin',false);
 END IF;
 SELECT * INTO l FROM public.user_licenses WHERE user_id=p_user_id ORDER BY created_at DESC,id DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('valid',false,'status','no_license','is_admin',coalesce(a,false)); END IF;
 SELECT * INTO p FROM public.subscription_plans WHERE id=l.plan_id;
 e:=coalesce(l.expiry_date,l.expires_at);
 s:=CASE WHEN l.status='cancelled' THEN 'revoked' WHEN l.status='suspended' THEN 'suspended'
     WHEN l.status<>'active' OR (e IS NOT NULL AND e<=now()) THEN 'expired'
     WHEN coalesce(l.activation_date,l.starts_at)>now() THEN 'not_started'
     WHEN e IS NULL AND coalesce(p.slug,l.plan_slug,'')<>'lifetime' THEN 'invalid'
     WHEN coalesce(p.is_trial,false) OR coalesce(p.slug,l.plan_slug)='trial' THEN 'trial'
     ELSE 'active' END;
 RETURN jsonb_build_object('valid',s IN ('active','trial'),'status',s,'license_id',l.id,
   'plan_slug',coalesce(p.slug,l.plan_slug,''),'plan_name',coalesce(p.name,l.plan_slug,'Licence'),
   'expiry_date',e,'days_left',CASE WHEN e IS NULL THEN 0 ELSE greatest(0,ceil(extract(epoch FROM(e-now()))/86400))::integer END,
   'license_key',l.license_key,'tally_serial_bound',l.tally_serial,'email_bound',l.email,'mobile_bound',l.mobile,
   'is_admin',coalesce(a,false),'company_limit',CASE WHEN s='trial' THEN 1 ELSE -1 END);
END $$;
REVOKE ALL ON FUNCTION public.subscription_access_for_user(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_access_for_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_subscription_access()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 RETURN public.subscription_access_for_user(auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.get_subscription_access() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_subscription_access() TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_user_license(p_user_id uuid,p_tally_serial text DEFAULT NULL)
RETURNS TABLE(valid boolean,status text,plan_name text,expiry_date timestamptz,days_left integer,tally_serial_bound text,email_bound text,mobile_bound text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb; s text; ok boolean;
BEGIN
 IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 r:=public.subscription_access_for_user(p_user_id); s:=r->>'status'; ok:=coalesce((r->>'valid')::boolean,false);
 IF ok AND nullif(r->>'tally_serial_bound','') IS NOT NULL AND nullif(p_tally_serial,'') IS NOT NULL
 AND r->>'tally_serial_bound'<>p_tally_serial THEN s:='tally_mismatch'; ok:=false; END IF;
 RETURN QUERY SELECT ok,s,coalesce(r->>'plan_name','None'),(r->>'expiry_date')::timestamptz,
 coalesce((r->>'days_left')::integer,0),r->>'tally_serial_bound',r->>'email_bound',r->>'mobile_bound';
END $$;
REVOKE ALL ON FUNCTION public.validate_user_license(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.validate_user_license(uuid,text) TO authenticated;

-- Never reference absent legacy columns; protect the entire entitlement row.
CREATE OR REPLACE FUNCTION public.guard_license_updates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role()='service_role' OR EXISTS(SELECT 1 FROM public.user_profiles up WHERE up.id=auth.uid() AND up.is_admin=true) THEN RETURN NEW; END IF;
 IF to_jsonb(NEW)-ARRAY['email','mobile','updated_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['email','mobile','updated_at']
 THEN RAISE EXCEPTION 'License fields are immutable for non-admin' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;

UPDATE public.subscription_plans SET duration_days=30 WHERE slug='trial';

CREATE OR REPLACE FUNCTION public.has_subscription_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND coalesce((r->>'valid')::boolean,false)
 FROM (SELECT public.subscription_access_for_user(auth.uid()) r) s;
$$;
REVOKE ALL ON FUNCTION public.has_subscription_access() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_subscription_access() TO authenticated;
-- Existing ownership policies still apply. Reads retain access to saved data;
-- writes additionally require a current server-verified trial or paid licence.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['companies','vouchers','ledgers','stock_items','voucher_ledger_entries','voucher_stock_entries','sales','sales_items','purchases','purchase_items','pending_transactions'] LOOP
   IF to_regclass('public.'||t) IS NOT NULL THEN
     EXECUTE format('CREATE POLICY subscription_insert_access ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((SELECT public.has_subscription_access()))',t);
     EXECUTE format('CREATE POLICY subscription_update_access ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT public.has_subscription_access())) WITH CHECK ((SELECT public.has_subscription_access()))',t);
     EXECUTE format('CREATE POLICY subscription_delete_access ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT public.has_subscription_access()))',t);
   END IF;
 END LOOP;
END $$;

-- Persist the price and duration at checkout; browser-supplied amounts are never accepted.
CREATE TABLE public.subscription_orders(
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id),
 plan_id uuid NOT NULL REFERENCES public.subscription_plans(id), plan_slug text NOT NULL,
 duration_days integer NOT NULL CHECK(duration_days>0), amount_paise bigint NOT NULL CHECK(amount_paise>0),
 price numeric NOT NULL, discount numeric NOT NULL DEFAULT 0, coupon_id uuid REFERENCES public.coupons(id),
 gateway_link_id text UNIQUE, gateway_payment_id text UNIQUE, checkout_url text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed')),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',
 license_id uuid REFERENCES public.user_licenses(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscription_orders_read_own ON public.subscription_orders FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
GRANT SELECT ON public.subscription_orders TO authenticated;
GRANT ALL ON public.subscription_orders TO service_role;

CREATE OR REPLACE FUNCTION public.create_subscription_order(p_plan_slug text,p_coupon_code text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q jsonb; c public.coupons; o public.subscription_orders; r jsonb; n bigint; u bigint;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('checkout:'||auth.uid()::text,0));
 SELECT * INTO o FROM public.subscription_orders WHERE id=p_request_id;
 IF FOUND THEN
   IF o.user_id<>auth.uid() OR o.plan_slug<>p_plan_slug THEN RAISE EXCEPTION 'Invalid checkout request'; END IF;
   RETURN to_jsonb(o);
 END IF;
 r:=public.subscription_access_for_user(auth.uid());
 IF r->>'status' IN ('blocked','suspended','revoked') THEN RAISE EXCEPTION 'Contact support to restore access'; END IF;
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
END $$;
REVOKE ALL ON FUNCTION public.create_subscription_order(text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_subscription_order(text,text,uuid) TO authenticated;

-- Only the trusted webhook/API verifier may finalize. One transaction makes retries safe.
CREATE OR REPLACE FUNCTION public.finalize_subscription_payment(p_order_id uuid,p_link_id text,p_payment_id text,p_amount_paise bigint,p_currency text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.subscription_orders; l uuid; e timestamptz; r jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.subscription_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.gateway_link_id IS DISTINCT FROM p_link_id OR o.amount_paise IS DISTINCT FROM p_amount_paise
 OR p_currency IS DISTINCT FROM 'INR' OR coalesce(p_payment_id,'') NOT LIKE 'pay_%' THEN RAISE EXCEPTION 'Payment does not match checkout'; END IF;
 IF o.status='paid' THEN
   IF o.gateway_payment_id<>p_payment_id THEN RAISE EXCEPTION 'Payment mismatch'; END IF;
   RETURN jsonb_build_object('success',true,'replayed',true,'license_id',o.license_id);
 END IF;
 IF o.status<>'pending' THEN RAISE EXCEPTION 'Checkout is not pending'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('lic-user:'||o.user_id::text,0));
 r:=public.subscription_access_for_user(o.user_id);
 IF r->>'status' IN ('blocked','suspended','revoked') THEN RAISE EXCEPTION 'Access restricted; payment requires administrator review'; END IF;
 e:=greatest(now(),CASE WHEN coalesce((r->>'valid')::boolean,false) THEN (r->>'expiry_date')::timestamptz ELSE now() END)+make_interval(days=>o.duration_days);
 INSERT INTO public.user_licenses(user_id,plan_id,plan_slug,license_key,status,activation_date,starts_at,expiry_date,expires_at)
 VALUES(o.user_id,o.plan_id,o.plan_slug,public.generate_license_key(o.plan_slug),'active',now(),now(),e,e) RETURNING id INTO l;
 INSERT INTO public.payments(user_id,plan_id,plan_slug,amount,final_amount,discount,discount_amount,total_amount,status,payment_method,payment_gateway,gateway_transaction_id,paid_at,license_id,coupon_id,coupon_code)
 VALUES(o.user_id,o.plan_id,o.plan_slug,o.price,o.amount_paise/100.0,o.discount,o.discount,o.amount_paise/100.0,'completed','razorpay','razorpay',p_payment_id,now(),l,o.coupon_id,(SELECT code FROM public.coupons WHERE id=o.coupon_id));
 IF o.coupon_id IS NOT NULL THEN
   UPDATE public.coupons SET used_count=coalesce(used_count,0)+1 WHERE id=o.coupon_id;
   INSERT INTO public.coupon_usage(coupon_id,user_id,order_amount,discount_amount,license_id) VALUES(o.coupon_id,o.user_id,o.price,o.discount,l);
 END IF;
 UPDATE public.subscription_orders SET status='paid',gateway_payment_id=p_payment_id,license_id=l WHERE id=o.id;
 RETURN jsonb_build_object('success',true,'license_id',l,'expiry',e);
END $$;
REVOKE ALL ON FUNCTION public.finalize_subscription_payment(uuid,text,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_subscription_payment(uuid,text,text,bigint,text) TO service_role;

CREATE OR REPLACE FUNCTION public.temporary_license_admin_action(p_user_id uuid, p_action text, p_days integer, p_reason text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email    text;
  v_license  public.user_licenses;
  v_existing public.license_admin_actions;
  v_expiry   timestamptz;
  v_status   text;
  v_result   jsonb;
begin
  -- Only the platform admin may call this.
  if auth.uid() is null or (auth.jwt() ->> 'email') is distinct from 'lovneetrathi@gmail.com' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_user_id is null or p_request_id is null then
    raise exception 'Missing user or request id';
  end if;
  if p_action is null or p_action not in ('EXTEND','REVOKE','RESTORE') then
    raise exception 'Invalid action';
  end if;
  if length(coalesce(p_reason,'')) > 500 then
    raise exception 'Reason too long';
  end if;
  if p_action <> 'REVOKE' and (p_days is null or p_days < 1 or p_days > 36500) then
    raise exception 'Invalid number of days';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('lic-request:' || p_request_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('lic-user:' || p_user_id::text, 0));

  -- Idempotent replay: same request id never applies twice.
  select * into v_existing from public.license_admin_actions where request_id = p_request_id;
  if found then
    if v_existing.user_id is distinct from p_user_id or v_existing.action is distinct from p_action
       or v_existing.days is distinct from (case when p_action='REVOKE' then null else p_days end)
       or v_existing.reason is distinct from nullif(trim(coalesce(p_reason,'')), '') then
      raise exception 'Request id was already used for a different action';
    end if;
    return coalesce(v_existing.result, jsonb_build_object('ok', true, 'replayed', true));
  end if;

  select coalesce(u.email,'') into v_email from auth.users u where u.id = p_user_id;
  if not found then
    raise exception 'User not found';
  end if;

  -- Same "current license" pick as admin_list_temporary_licenses.
  select ul.* into v_license
    from public.user_licenses ul
   where ul.user_id = p_user_id
   order by ul.created_at desc, ul.id desc
   limit 1;

  if p_action = 'REVOKE' then
    if v_license.id is null then
      raise exception 'No license found for this user';
    end if;
    update public.user_licenses
       set status = 'cancelled', updated_at = now()
     where user_id = p_user_id;
    v_status := 'REVOKED';
    v_expiry := coalesce(v_license.expiry_date, v_license.expires_at);

  else
    if p_action = 'RESTORE' and v_license.id is null then
      raise exception 'No license found for this user';
    end if;

    v_expiry := greatest(now(), coalesce(v_license.expiry_date, v_license.expires_at, now()))
                + make_interval(days => p_days);

    if v_license.id is null then
      insert into public.user_licenses
        (user_id, plan_id, plan_slug, status, starts_at, expires_at, expiry_date, activation_date, email, updated_at)
      values
        (p_user_id, null, 'temporary', 'active', now(), v_expiry, v_expiry, now(), v_email, now());
    else
      -- Keep an existing paid plan label; only fill in a blank one.
      update public.user_licenses
         set status      = 'active',
             plan_slug   = coalesce(nullif(plan_slug, ''), (SELECT sp.slug FROM public.subscription_plans sp WHERE sp.id=v_license.plan_id), 'temporary'),
             expires_at  = v_expiry,
             expiry_date = v_expiry,
             starts_at   = coalesce(starts_at, now()),
             updated_at  = now()
       where id = v_license.id;
    end if;
    update public.trial_history set trial_end=v_expiry, ended_at=v_expiry where license_id=v_license.id;
    v_status := 'ACTIVE';
  end if;

  v_result := jsonb_build_object(
    'ok', true, 'user_id', p_user_id, 'action', p_action,
    'status', v_status, 'expiry', v_expiry
  );

  insert into public.license_admin_actions
    (request_id, user_id, action, days, reason, actor_id, actor_email, result)
  values
    (p_request_id, p_user_id, p_action,
     case when p_action = 'REVOKE' then null else p_days end,
     nullif(trim(coalesce(p_reason,'')), ''),
     auth.uid(), auth.jwt() ->> 'email', v_result)
  on conflict (request_id) do nothing;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_list_temporary_licenses(p_search text DEFAULT ''::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(user_id uuid, email text, full_name text, phone text, registered_at timestamp with time zone, last_active_at timestamp with time zone, account_status text, company_names text, company_count bigint, license_type text, status text, expiry timestamp with time zone)
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
    IF LENGTH(COALESCE(p_search, '')) > 120 OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100 OR p_offset IS NULL OR p_offset < 0 THEN
        RAISE EXCEPTION 'Invalid search or pagination';
    END IF;
    RETURN QUERY
    SELECT u.id, COALESCE(u.email, '')::text, COALESCE(p.full_name, '')::text,
           COALESCE(p.phone, u.phone, '')::text, u.created_at, u.last_sign_in_at,
           CASE WHEN u.banned_until > now() THEN 'BLOCKED' WHEN p.is_active = FALSE THEN 'INACTIVE' ELSE 'ACTIVE' END,
           COALESCE(c.names, '')::text, COALESCE(c.n, 0)::bigint,
           COALESCE(l.plan_slug, sp.slug, CASE WHEN t.user_id IS NOT NULL THEN 'trial' END)::text,
           CASE WHEN l.status = 'suspended' THEN 'SUSPENDED'
                WHEN l.status = 'cancelled' THEN 'REVOKED'
                WHEN l.status = 'active' AND (COALESCE(l.expiry_date,l.expires_at) IS NULL OR COALESCE(l.expiry_date,l.expires_at) > now()) THEN
                    CASE WHEN COALESCE(l.plan_slug,sp.slug,'') = 'trial' THEN 'TRIAL' ELSE 'ACTIVE' END
                WHEN l.id IS NOT NULL THEN 'EXPIRED'
                WHEN t.user_id IS NOT NULL AND COALESCE(t.trial_end,t.ended_at) > now() THEN 'TRIAL'
                WHEN t.user_id IS NOT NULL THEN 'EXPIRED'
                ELSE 'NONE' END,
           COALESCE(l.expiry_date,l.expires_at,t.trial_end,t.ended_at)
    FROM auth.users u
    LEFT JOIN public.user_profiles p ON p.id = u.id
    LEFT JOIN LATERAL (
        SELECT string_agg(co.name, ', ' ORDER BY co.name) names, count(*) n
        FROM public.companies co WHERE co.owner_id = u.id
    ) c ON TRUE
    LEFT JOIN LATERAL (
        SELECT ul.* FROM public.user_licenses ul WHERE ul.user_id = u.id
        ORDER BY ul.created_at DESC, ul.id DESC LIMIT 1
    ) l ON TRUE
    LEFT JOIN public.subscription_plans sp ON sp.id = l.plan_id
    LEFT JOIN LATERAL (
        SELECT th.user_id, th.trial_end, th.ended_at FROM public.trial_history th WHERE th.user_id = u.id
        ORDER BY th.created_at DESC, th.id DESC LIMIT 1
    ) t ON TRUE
    WHERE COALESCE(u.email,'') ILIKE '%' || COALESCE(p_search,'') || '%'
       OR COALESCE(p.full_name,'') ILIKE '%' || COALESCE(p_search,'') || '%'
       OR COALESCE(c.names,'') ILIKE '%' || COALESCE(p_search,'') || '%'
    ORDER BY u.created_at DESC NULLS LAST, u.id
    LIMIT p_limit OFFSET p_offset;
END;
$function$
;
