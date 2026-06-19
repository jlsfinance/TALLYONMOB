-- Add email column to user_licenses and backfill from auth.users
DO $$ BEGIN ALTER TABLE user_licenses ADD COLUMN IF NOT EXISTS email TEXT; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Backfill emails from auth.users
DO $$ BEGIN
    UPDATE user_licenses ul SET email = u.email FROM auth.users u WHERE ul.user_id = u.id AND ul.email IS NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Create trigger to auto-set email on insert
CREATE OR REPLACE FUNCTION set_user_license_email()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.email IS NULL THEN
        SELECT email INTO NEW.email FROM auth.users WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_license_email ON user_licenses;
CREATE TRIGGER trg_set_license_email
    BEFORE INSERT ON user_licenses
    FOR EACH ROW
    EXECUTE FUNCTION set_user_license_email();
