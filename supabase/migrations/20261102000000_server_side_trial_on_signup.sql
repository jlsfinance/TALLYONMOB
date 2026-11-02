-- Server-side 30-day trial on signup.
-- Root cause of the failing trial: trial_history has no `email` column, so
-- check_trial_eligibility(p_email => ...) raised "column email does not exist"
-- and client-side trialService.activate() always returned "Unable to verify
-- trial eligibility". Trial is now granted by the auth.users trigger instead,
-- so it cannot be skipped or forged from the client.

ALTER TABLE public.trial_history ADD COLUMN IF NOT EXISTS email text;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_plan public.subscription_plans;
    v_start timestamptz := now();
    v_end timestamptz;
    v_license_id uuid;
BEGIN
    INSERT INTO public.user_profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    );

    -- Trial must never block or fail signup (Google OAuth included).
    BEGIN
        SELECT * INTO v_plan
        FROM public.subscription_plans
        WHERE slug = 'trial' AND is_trial AND is_active
        LIMIT 1;

        IF FOUND
           AND NOT EXISTS (SELECT 1 FROM public.user_licenses WHERE user_id = NEW.id)
           AND NOT EXISTS (SELECT 1 FROM public.trial_history WHERE user_id = NEW.id)
        THEN
            v_end := v_start + (v_plan.duration_days || ' days')::interval;

            INSERT INTO public.user_licenses
                (user_id, license_key, plan_id, status, activation_date, expiry_date)
            VALUES
                (NEW.id, public.generate_license_key('trial'), v_plan.id, 'active', v_start, v_end)
            RETURNING id INTO v_license_id;

            INSERT INTO public.trial_history
                (user_id, email, trial_start, trial_end, trial_used, status, license_id)
            VALUES
                (NEW.id, NEW.email, v_start, v_end, true, 'completed', v_license_id);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'auto trial failed for %: %', NEW.id, SQLERRM;
    END;

    RETURN NEW;
END;
$function$;
