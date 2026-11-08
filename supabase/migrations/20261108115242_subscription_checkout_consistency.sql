CREATE OR REPLACE FUNCTION public.finalize_subscription_payment(p_order_id uuid, p_link_id text, p_payment_id text, p_amount_paise bigint, p_currency text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 INSERT INTO public.user_licenses(user_id,plan_id,plan_slug,license_key,status,activation_date,starts_at,expiry_date,expires_at,created_at)
 VALUES(o.user_id,o.plan_id,o.plan_slug,public.generate_license_key(o.plan_slug),'active',now(),now(),e,e,clock_timestamp()) RETURNING id INTO l;
 INSERT INTO public.payments(user_id,plan_id,plan_slug,amount,final_amount,discount,discount_amount,total_amount,status,payment_method,payment_gateway,gateway_transaction_id,paid_at,license_id,coupon_id,coupon_code)
 VALUES(o.user_id,o.plan_id,o.plan_slug,o.price,o.amount_paise/100.0,o.discount,o.discount,o.amount_paise/100.0,'completed','razorpay','razorpay',p_payment_id,now(),l,o.coupon_id,(SELECT code FROM public.coupons WHERE id=o.coupon_id));
 IF o.coupon_id IS NOT NULL THEN
   UPDATE public.coupons SET used_count=coalesce(used_count,0)+1 WHERE id=o.coupon_id;
   INSERT INTO public.coupon_usage(coupon_id,user_id,order_amount,discount_amount,license_id) VALUES(o.coupon_id,o.user_id,o.price,o.discount,l);
 END IF;
 UPDATE public.subscription_orders SET status='paid',gateway_payment_id=p_payment_id,license_id=l WHERE id=o.id;
 RETURN jsonb_build_object('success',true,'license_id',l,'expiry',e);
END $function$
;
