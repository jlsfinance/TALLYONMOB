BEGIN; DO $test$
DECLARE u uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); oid uuid:=gen_random_uuid(); q jsonb; denied boolean:=false; code text:=upper('ROLLBACK-'||gen_random_uuid()::text);
BEGIN
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO auth.users(id,email,created_at,updated_at) VALUES(u,'coupon-test-'||u||'@example.invalid',now(),now());
 INSERT INTO public.coupons(id,code,discount_type,discount_value,usage_limit,per_user_limit,is_active,audience) VALUES(c,code,'percentage',10,1,1,true,'global');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 q:=public.create_subscription_order('monthly',code,oid);
 IF (q->>'discount')::numeric<=0 THEN RAISE EXCEPTION 'Coupon discount missing'; END IF;
 PERFORM public.create_subscription_order('monthly',code,oid);
 IF (SELECT count(*) FROM public.subscription_orders WHERE user_id=u)<>1 THEN RAISE EXCEPTION 'Checkout replay duplicated reservation'; END IF;
 BEGIN PERFORM public.create_subscription_order('monthly',code,gen_random_uuid()); EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Pending coupon reservation exceeded limit'; END IF;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 UPDATE public.subscription_orders SET gateway_link_id='plink_couponrollback' WHERE id=oid;
 PERFORM public.finalize_subscription_payment(oid,'plink_couponrollback','pay_couponrollback',(q->>'amount_paise')::bigint,'INR');
 PERFORM public.finalize_subscription_payment(oid,'plink_couponrollback','pay_couponrollback',(q->>'amount_paise')::bigint,'INR');
 IF (SELECT used_count FROM public.coupons WHERE id=c)<>1 OR (SELECT count(*) FROM public.coupon_usage WHERE coupon_id=c)<>1 THEN RAISE EXCEPTION 'Coupon consumed more than once'; END IF;
END $test$; ROLLBACK; SELECT 'PASS: coupon quote, pending capacity reservation, checkout replay and once-only coupon consumption; fixtures rolled back' result;
