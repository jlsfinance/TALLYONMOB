-- Exercises the real deployed RPCs. Every change and audit row is rolled back.
BEGIN;
DO $$
DECLARE
  admin_id uuid;
  target_id uuid;
  target_email text;
  request_id uuid := gen_random_uuid();
  result jsonb;
  access_result jsonb;
  desktop_valid boolean;
  directory_status text;
BEGIN
  SELECT id INTO admin_id FROM auth.users WHERE email='lovneetrathi@gmail.com';
  SELECT u.id,u.email INTO target_id,target_email
    FROM public.user_licenses l JOIN auth.users u ON u.id=l.user_id
    LEFT JOIN public.user_profiles p ON p.id=u.id
    WHERE l.status='cancelled' AND NOT coalesce(p.is_admin,false)
    ORDER BY l.updated_at DESC LIMIT 1;
  IF admin_id IS NULL OR target_id IS NULL THEN RAISE EXCEPTION 'An existing revoked non-admin test account is required'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'email','lovneetrathi@gmail.com','role','authenticated')::text,true);
  result := public.temporary_license_admin_action(target_id,'RESTORE',1,'Rollback-only licence regression test',gen_random_uuid());
  IF result->>'status' <> 'ACTIVE' THEN RAISE EXCEPTION 'Restore did not confirm active status'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',target_id,'email',target_email,'role','authenticated')::text,true);
  access_result := public.get_subscription_access();
  IF NOT coalesce((access_result->>'valid')::boolean,false) THEN RAISE EXCEPTION 'Restored user does not have access'; END IF;
  BEGIN
    PERFORM public.temporary_license_admin_action(target_id,'REVOKE',NULL,'Unauthorized test',gen_random_uuid());
    RAISE EXCEPTION 'Non-admin was allowed to revoke';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'email','lovneetrathi@gmail.com','role','authenticated')::text,true);
  result := public.temporary_license_admin_action(target_id,'REVOKE',NULL,'Rollback-only licence regression test',request_id);
  IF result->>'status' <> 'REVOKED' OR NOT coalesce((result->>'ok')::boolean,false) THEN RAISE EXCEPTION 'Revoke was not confirmed'; END IF;
  IF result IS DISTINCT FROM public.temporary_license_admin_action(target_id,'REVOKE',NULL,'Rollback-only licence regression test',request_id) THEN RAISE EXCEPTION 'Idempotent replay changed the result'; END IF;
  SELECT d.status INTO directory_status FROM public.admin_list_temporary_licenses(target_email,50,0) d WHERE d.user_id=target_id;
  IF directory_status IS DISTINCT FROM 'REVOKED' THEN RAISE EXCEPTION 'Admin directory does not show revoked'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',target_id,'email',target_email,'role','authenticated')::text,true);
  access_result := public.get_subscription_access();
  IF access_result->>'status' <> 'revoked' OR coalesce((access_result->>'valid')::boolean,true) THEN RAISE EXCEPTION 'Revoked user still has web access'; END IF;
  SELECT v.valid INTO desktop_valid FROM public.validate_user_license(target_id,NULL) v;
  IF desktop_valid IS DISTINCT FROM false THEN RAISE EXCEPTION 'Revoked user still has connector access'; END IF;
END $$;
SELECT 'PASS: restore, revoke, duplicate request, directory, web access, connector access and non-admin denial; all changes rolled back' AS result;
ROLLBACK;
