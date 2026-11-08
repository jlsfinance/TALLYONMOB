-- Canonical display price for the three mobile/web subscription plans.
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS price_inr numeric(10,2) CHECK (price_inr >= 0);
INSERT INTO public.subscription_plans(name,slug,price_inr,duration_days,sort_order,is_active)
VALUES ('Monthly','monthly',159,30,10,true),('6 Months','half_yearly',599,180,20,true),('Yearly','yearly',999,365,30,true)
ON CONFLICT (slug) DO UPDATE SET price_inr=excluded.price_inr,duration_days=excluded.duration_days,sort_order=excluded.sort_order;

-- Reuse existing RLS and targeted-coupon admin functions. No new privilege bypass.
CREATE OR REPLACE FUNCTION public.admin_save_subscription_coupon(p_coupon_id uuid,p_settings jsonb,p_audience text,p_emails text[])
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 v_id uuid := p_coupon_id;
 v_code text := upper(trim(p_settings->>'code'));
 v_type text := p_settings->>'discount_type';
 v_value numeric := (p_settings->>'discount_value')::numeric;
 v_min numeric := coalesce((p_settings->>'min_order')::numeric,0);
 v_max numeric := (p_settings->>'max_discount')::numeric;
 v_limit integer := (p_settings->>'usage_limit')::integer;
 v_per_user integer := coalesce((p_settings->>'per_user_limit')::integer,1);
 v_expiry timestamptz := (p_settings->>'expiry_date')::timestamptz;
 v_plans uuid[];
BEGIN
 IF auth.uid() IS NULL OR (auth.jwt()->>'email') IS DISTINCT FROM 'lovneetrathi@gmail.com' THEN
   RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
 END IF;
 IF v_code IS NULL OR v_code !~ '^[A-Z0-9_-]{1,80}$' OR v_type IS NULL OR v_type NOT IN ('flat','percentage')
 OR v_value IS NULL OR v_value<=0 OR v_value::text IN ('NaN','Infinity','-Infinity')
 OR (v_type='percentage' AND v_value>100) OR v_min<0 OR v_min::text IN ('NaN','Infinity','-Infinity')
 OR (v_max IS NOT NULL AND (v_max<=0 OR v_max::text IN ('NaN','Infinity','-Infinity')))
 OR (v_limit IS NOT NULL AND v_limit<1) OR v_per_user<1 THEN RAISE EXCEPTION 'Invalid coupon details'; END IF;
 IF EXISTS (SELECT 1 FROM public.coupons WHERE upper(trim(code))=v_code AND id IS DISTINCT FROM v_id) THEN
   RAISE EXCEPTION 'A coupon with this code already exists';
 END IF;
 SELECT coalesce(array_agg(value::uuid),array[]::uuid[]) INTO v_plans
 FROM jsonb_array_elements_text(coalesce(p_settings->'applicable_plans','[]'::jsonb));
 IF EXISTS(SELECT 1 FROM unnest(v_plans) x WHERE NOT EXISTS(SELECT 1 FROM public.subscription_plans WHERE id=x)) THEN
   RAISE EXCEPTION 'Invalid plan selection';
 END IF;
 IF v_id IS NULL THEN
   v_id := public.admin_create_targeted_coupon(v_code,v_type,v_value,v_limit,p_audience,p_emails);
 ELSE
   PERFORM public.admin_set_coupon_audience(v_id,p_audience,p_emails);
 END IF;
 UPDATE public.coupons SET code=v_code,discount_type=v_type,discount_value=v_value,
 min_order=v_min,max_discount=v_max,usage_limit=v_limit,per_user_limit=v_per_user,
 expiry_date=v_expiry,applicable_plans=v_plans,is_active=coalesce((p_settings->>'is_active')::boolean,true),updated_at=now()
 WHERE id=v_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Coupon not saved'; END IF;
 RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_save_subscription_coupon(uuid,jsonb,text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_save_subscription_coupon(uuid,jsonb,text,text[]) TO authenticated;

-- Quote only: reads current plan and validates a coupon without recording a use or activating a licence.
CREATE OR REPLACE FUNCTION public.quote_subscription_plan(p_plan_slug text,p_coupon_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 p public.subscription_plans%rowtype;
 c public.coupons%rowtype;
 v_discount numeric := 0;
 v_uses integer;
 v_code text := upper(trim(coalesce(p_coupon_code,'')));
BEGIN
 SELECT * INTO p FROM public.subscription_plans
 WHERE slug=p_plan_slug AND slug IN ('monthly','half_yearly','yearly') AND is_active AND price_inr IS NOT NULL AND duration_days>0;
 IF NOT FOUND THEN RETURN jsonb_build_object('valid',false,'error','This plan is no longer available.'); END IF;
 IF v_code<>'' THEN
   IF auth.uid() IS NULL THEN RETURN jsonb_build_object('valid',false,'error','Please sign in to apply a coupon.'); END IF;
   SELECT * INTO c FROM public.coupons WHERE code=v_code AND is_active;
   IF NOT FOUND THEN RETURN jsonb_build_object('valid',false,'error','Coupon is invalid or unavailable for your account.'); END IF;
   IF c.expiry_date IS NOT NULL AND c.expiry_date<=now() THEN RETURN jsonb_build_object('valid',false,'error','This coupon has expired.'); END IF;
   IF c.usage_limit IS NOT NULL AND coalesce(c.used_count,0)>=c.usage_limit THEN RETURN jsonb_build_object('valid',false,'error','Coupon usage limit reached.'); END IF;
   SELECT count(*) INTO v_uses FROM public.coupon_usage WHERE coupon_id=c.id AND user_id=auth.uid();
   IF c.per_user_limit IS NOT NULL AND v_uses>=c.per_user_limit THEN RETURN jsonb_build_object('valid',false,'error','You have already used this coupon.'); END IF;
   IF cardinality(c.applicable_plans)>0 AND NOT(p.id=ANY(c.applicable_plans)) THEN RETURN jsonb_build_object('valid',false,'error','Coupon does not apply to this plan.'); END IF;
   IF p.price_inr<coalesce(c.min_order,0) THEN RETURN jsonb_build_object('valid',false,'error','Minimum plan price for this coupon is INR '||c.min_order); END IF;
   IF c.discount_value<=0 OR c.discount_value IS NULL OR c.discount_value::text IN ('NaN','Infinity','-Infinity')
     OR (c.discount_type='percentage' AND c.discount_value>100) THEN RETURN jsonb_build_object('valid',false,'error','Coupon is unavailable.'); END IF;
   v_discount := CASE WHEN c.discount_type='flat' THEN c.discount_value ELSE p.price_inr*c.discount_value/100 END;
   IF c.max_discount IS NOT NULL THEN v_discount:=least(v_discount,c.max_discount); END IF;
   v_discount:=round(greatest(0,least(p.price_inr,v_discount)),2);
 END IF;
 RETURN jsonb_build_object('valid',true,'plan_id',p.id,'plan_slug',p.slug,'price',p.price_inr,'duration_days',p.duration_days,
   'coupon_code',nullif(v_code,''),'discount',v_discount,'final_amount',p.price_inr-v_discount);
END;
$$;
REVOKE ALL ON FUNCTION public.quote_subscription_plan(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quote_subscription_plan(text,text) TO anon,authenticated;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
 AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='subscription_plans') THEN
   ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_plans;
 END IF;
END $$;

