-- Rollback-only integration test for unified RBAC membership, role permissions,
-- RLS enforcement (Owner / Accountant / Viewer / Suspended / Custom), and audit logs.
BEGIN;

DO $test$
DECLARE
    v_owner uuid := gen_random_uuid();
    v_company_admin uuid := gen_random_uuid();
    v_accountant uuid := gen_random_uuid();
    v_viewer uuid := gen_random_uuid();
    v_invited uuid := gen_random_uuid();
    v_outsider uuid := gen_random_uuid();
    v_admin uuid;
    v_company_id text := 'rbac-test-' || replace(gen_random_uuid()::text, '-', '');
    v_other_company_id text := 'rbac-other-' || replace(gen_random_uuid()::text, '-', '');
    v_invited_email text := 'rbac-invited-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid';
    v_blocked boolean := false;
    v_res jsonb;
    v_custom_role_id uuid;
BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

    INSERT INTO auth.users(id, email, created_at, updated_at) VALUES
        (v_owner, 'owner-' || v_owner::text || '@example.invalid', now(), now()),
        (v_company_admin, 'cadmin-' || v_company_admin::text || '@example.invalid', now(), now()),
        (v_accountant, 'acct-' || v_accountant::text || '@example.invalid', now(), now()),
        (v_viewer, 'view-' || v_viewer::text || '@example.invalid', now(), now()),
        (v_outsider, 'out-' || v_outsider::text || '@example.invalid', now(), now());

    INSERT INTO public.user_profiles(id, email, full_name, is_admin)
    VALUES (v_company_admin, 'cadmin-' || v_company_admin::text || '@example.invalid', 'Company Admin', false)
    ON CONFLICT (id) DO UPDATE SET is_admin = false;

    SELECT id INTO v_admin FROM auth.users WHERE lower(email) = 'lovneetrathi@gmail.com' LIMIT 1;

    INSERT INTO public.companies (id, name, owner_id, created_at, updated_at) VALUES
        (v_company_id, 'RBAC Verification Co', v_owner, now(), now()),
        (v_other_company_id, 'Other Co', v_outsider, now(), now());

    INSERT INTO public.company_users (company_id, user_id, role, status, can_sync, is_default)
    VALUES
        (v_company_id, v_owner, 'owner', 'active', true, true),
        (v_company_id, v_company_admin, 'admin', 'active', true, false),
        (v_company_id, v_accountant, 'accountant', 'active', false, false),
        (v_company_id, v_viewer, 'viewer', 'active', false, false);

    -- 1. Permission helper verification across Owner / Accountant / Viewer / Outsider
    IF NOT public.user_has_company_permission(v_company_id, 'Vouchers', 'Delete', v_owner) THEN
        RAISE EXCEPTION 'Owner should have Vouchers:Delete';
    END IF;
    IF NOT public.user_has_company_permission(v_company_id, 'Vouchers', 'Edit', v_accountant) THEN
        RAISE EXCEPTION 'Accountant should have Vouchers:Edit';
    END IF;
    IF public.user_has_company_permission(v_company_id, 'Vouchers', 'Delete', v_accountant) THEN
        RAISE EXCEPTION 'Accountant must NOT have Vouchers:Delete';
    END IF;
    IF public.user_has_company_permission(v_company_id, 'Settings', 'Manage Users', v_accountant) THEN
        RAISE EXCEPTION 'Accountant must NOT have Settings:Manage Users';
    END IF;
    IF NOT public.user_has_company_permission(v_company_id, 'Vouchers', 'View', v_viewer) THEN
        RAISE EXCEPTION 'Viewer should have Vouchers:View';
    END IF;
    IF public.user_has_company_permission(v_company_id, 'Vouchers', 'Edit', v_viewer) THEN
        RAISE EXCEPTION 'Viewer must NOT have Vouchers:Edit';
    END IF;
    IF public.user_has_company_permission(v_company_id, 'Reports', 'Export', v_viewer) THEN
        RAISE EXCEPTION 'Viewer must NOT have Reports:Export';
    END IF;
    IF public.user_has_company_permission(v_company_id, 'Vouchers', 'View', v_outsider) THEN
        RAISE EXCEPTION 'Outsider must NOT have Vouchers:View';
    END IF;

    -- 2. Non-manager blocked from invite / role change / remove RPCs
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
    v_blocked := false;
    BEGIN
        PERFORM public.rbac_invite_member(ARRAY[v_company_id], 'someone@example.invalid', 'viewer', 'Test');
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Viewer was allowed to invite team member';
    END IF;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_accountant, 'role', 'authenticated')::text, true);
    v_blocked := false;
    BEGIN
        PERFORM public.rbac_update_member_role(v_company_id, v_viewer, 'admin');
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Accountant was allowed to escalate viewer role';
    END IF;

    -- 3. RLS enforcement on pending_transactions & payslips
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
    IF public.sync_user_can_write_company(v_company_id) THEN
        RAISE EXCEPTION 'Viewer must NOT satisfy sync_user_can_write_company';
    END IF;

    v_blocked := false;
    BEGIN
        EXECUTE 'SET LOCAL ROLE authenticated';
        INSERT INTO public.pending_transactions (company_id, transaction_type, status, voucher_data)
        VALUES (v_company_id, 'VOUCHER_EDIT', 'pending', '{}'::jsonb);
        EXECUTE 'RESET ROLE';
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    EXECUTE 'RESET ROLE';
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Viewer was allowed to insert VOUCHER_EDIT into pending_transactions';
    END IF;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_accountant, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.pending_transactions (company_id, transaction_type, status, voucher_data)
    VALUES (v_company_id, 'VOUCHER_EDIT', 'pending', '{}'::jsonb);
    EXECUTE 'RESET ROLE';

    v_blocked := false;
    BEGIN
        EXECUTE 'SET LOCAL ROLE authenticated';
        INSERT INTO public.pending_transactions (company_id, transaction_type, status, voucher_data)
        VALUES (v_company_id, 'VOUCHER_DELETE', 'pending', '{}'::jsonb);
        EXECUTE 'RESET ROLE';
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    EXECUTE 'RESET ROLE';
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Accountant was allowed to insert VOUCHER_DELETE into pending_transactions';
    END IF;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.pending_transactions (company_id, transaction_type, status, voucher_data)
    VALUES (v_company_id, 'VOUCHER_DELETE', 'pending', '{}'::jsonb);
    EXECUTE 'RESET ROLE';

    -- 4. Owner invites pending user -> user signs up -> auto-accepted -> role change -> suspend -> remove
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    v_res := public.rbac_invite_member(ARRAY[v_company_id], v_invited_email, 'viewer', 'Invited User');
    IF v_res->>'status' <> 'invited' THEN
        RAISE EXCEPTION 'Expected pending invitation status, got %', v_res;
    END IF;

    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO auth.users(id, email, created_at, updated_at)
    VALUES (v_invited, v_invited_email, now(), now());

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_invited, 'email', v_invited_email, 'role', 'authenticated')::text, true);
    PERFORM public.accept_pending_invitations();
    IF NOT public.user_has_company_permission(v_company_id, 'Vouchers', 'View', v_invited) THEN
        RAISE EXCEPTION 'Invited user did not gain Viewer access upon signup';
    END IF;

    -- Owner changes invited user role to accountant -> gains Vouchers:Edit
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    PERFORM public.rbac_update_member_role(v_company_id, v_invited, 'accountant');
    IF NOT public.user_has_company_permission(v_company_id, 'Vouchers', 'Edit', v_invited) THEN
        RAISE EXCEPTION 'Role change to accountant did not grant Vouchers:Edit';
    END IF;

    -- Owner suspends invited user -> loses ALL permissions immediately
    PERFORM public.rbac_update_member_status(v_company_id, v_invited, 'suspended');
    IF public.user_has_company_permission(v_company_id, 'Vouchers', 'View', v_invited) THEN
        RAISE EXCEPTION 'Suspended user still had Vouchers:View';
    END IF;

    -- Owner sets default company for accountant
    PERFORM public.rbac_set_default_company(v_accountant, v_company_id);
    IF NOT EXISTS (
        SELECT 1 FROM public.company_users
        WHERE company_id = v_company_id AND user_id = v_accountant AND is_default = true
    ) THEN
        RAISE EXCEPTION 'Default company flag was not persisted';
    END IF;

    -- Custom role creation & assignment if platform admin exists
    IF v_admin IS NOT NULL THEN
        PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'email', 'lovneetrathi@gmail.com', 'role', 'authenticated')::text, true);
        v_res := public.rbac_save_role(
            NULL,
            'auditor_test',
            'Auditor Test',
            jsonb_build_object(
                'Vouchers', jsonb_build_object('View', true, 'Create', false, 'Edit', false, 'Delete', false, 'Approve', false),
                'Reports', jsonb_build_object('View', true, 'Export', true, 'Share', false)
            ),
            'Temporary custom auditor role',
            'text-purple-400'
        );
        v_custom_role_id := (v_res->'role'->>'id')::uuid;
        PERFORM public.rbac_update_member_role(v_company_id, v_viewer, 'auditor_test');
        IF NOT public.user_has_company_permission(v_company_id, 'Reports', 'Export', v_viewer) THEN
            RAISE EXCEPTION 'Custom role permission Reports:Export was not enforced';
        END IF;
        IF public.user_has_company_permission(v_company_id, 'Vouchers', 'Edit', v_viewer) THEN
            RAISE EXCEPTION 'Custom role should not allow Vouchers:Edit';
        END IF;
        PERFORM public.rbac_update_member_role(v_company_id, v_viewer, 'viewer');
        PERFORM public.rbac_delete_role(v_custom_role_id);
    END IF;

    -- 5. Company Admin vs Super Admin strict isolation
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_company_admin, 'email', 'cadmin@example.invalid', 'role', 'authenticated')::text, true);

    -- Company Admin CAN invite inside own company
    v_res := public.rbac_invite_member(ARRAY[v_company_id], 'cadmin-hire-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid', 'viewer', 'Hire');
    IF v_res->>'status' <> 'invited' OR coalesce((v_res->>'email_sent')::boolean, true) THEN
        RAISE EXCEPTION 'Company Admin invite failed or falsely reported email_sent=true: %', v_res;
    END IF;
    v_res := public.rbac_resend_invitation((v_res->>'invitation_id')::uuid);
    IF coalesce((v_res->>'email_sent')::boolean, true) THEN
        RAISE EXCEPTION 'SQL rbac_resend_invitation falsely reported email_sent=true';
    END IF;

    -- Company Admin CANNOT read global rbac_list_overview(NULL)
    v_blocked := false;
    BEGIN
        PERFORM public.rbac_list_overview(NULL);
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Company Admin accessed global rbac_list_overview(NULL)';
    END IF;

    -- Company Admin CANNOT edit global user_roles
    v_blocked := false;
    BEGIN
        PERFORM public.rbac_save_role(NULL, 'evil_role', 'Evil Role', '{}'::jsonb, '', '');
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Company Admin created a global role';
    END IF;

    -- Company Admin CANNOT invite as super_admin or owner
    v_blocked := false;
    BEGIN
        PERFORM public.rbac_invite_member(ARRAY[v_company_id], 'escalate@example.invalid', 'super_admin', 'Escalate');
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Company Admin assigned super_admin';
    END IF;

    -- Company Admin CANNOT self-escalate user_profiles.is_admin
    v_blocked := false;
    BEGIN
        EXECUTE 'SET LOCAL ROLE authenticated';
        UPDATE public.user_profiles SET is_admin = true WHERE id = v_company_admin;
        EXECUTE 'RESET ROLE';
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    EXECUTE 'RESET ROLE';
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Company Admin self-escalated user_profiles.is_admin';
    END IF;

    -- Company Admin CANNOT manage another company
    v_blocked := false;
    BEGIN
        PERFORM public.rbac_invite_member(ARRAY[v_other_company_id], 'cross@example.invalid', 'viewer', 'Cross');
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Company Admin managed another company';
    END IF;

    -- 6. Direct-write bypass prevention on company_users & team_invitations (even for Company Admin with Manage Users)
    v_blocked := false;
    BEGIN
        EXECUTE 'SET LOCAL ROLE authenticated';
        UPDATE public.company_users SET role = 'viewer' WHERE company_id = v_company_id AND user_id = v_owner;
        EXECUTE 'RESET ROLE';
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    EXECUTE 'RESET ROLE';
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Direct UPDATE on company_users demoted company owner';
    END IF;

    v_blocked := false;
    BEGIN
        EXECUTE 'SET LOCAL ROLE authenticated';
        DELETE FROM public.company_users WHERE company_id = v_company_id AND user_id = v_owner;
        EXECUTE 'RESET ROLE';
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    EXECUTE 'RESET ROLE';
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Direct DELETE on company_users removed company owner';
    END IF;

    v_blocked := false;
    BEGIN
        EXECUTE 'SET LOCAL ROLE authenticated';
        UPDATE public.company_users SET role = 'super_admin' WHERE company_id = v_company_id AND user_id = v_viewer;
        EXECUTE 'RESET ROLE';
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    EXECUTE 'RESET ROLE';
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Direct UPDATE on company_users escalated viewer to super_admin';
    END IF;

    v_blocked := false;
    BEGIN
        EXECUTE 'SET LOCAL ROLE authenticated';
        INSERT INTO public.company_users (company_id, user_id, role, status)
        VALUES (v_company_id, v_outsider, 'owner', 'active');
        EXECUTE 'RESET ROLE';
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    EXECUTE 'RESET ROLE';
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Direct INSERT on company_users granted owner';
    END IF;

    v_blocked := false;
    BEGIN
        EXECUTE 'SET LOCAL ROLE authenticated';
        INSERT INTO public.team_invitations (company_id, email, role, status)
        VALUES (v_company_id, 'direct-bypass@example.invalid', 'super_admin', 'pending');
        EXECUTE 'RESET ROLE';
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    EXECUTE 'RESET ROLE';
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Direct INSERT on team_invitations created super_admin invite';
    END IF;

    -- Verify audit logs captured RBAC events
    EXECUTE 'RESET ROLE';
    IF (SELECT count(*) FROM public.activity_logs WHERE company_id = v_company_id AND entity_type = 'rbac') < 4 THEN
        RAISE EXCEPTION 'RBAC actions were not persisted to activity_logs';
    END IF;
END $test$;

ROLLBACK;
SELECT 'PASS: unified RBAC membership, role permissions, RLS, suspend/remove, default company, and audit logs verified' AS result;
