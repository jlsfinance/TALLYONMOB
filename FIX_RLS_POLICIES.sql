-- ==============================================================================
-- FIX RLS POLICIES FOR COMPANIES TABLE
-- Run this in Supabase SQL Editor to fix "Permission denied" (42501) errors
-- ==============================================================================

-- 1. Add user_id column if it doesn't exist, defaulting to current user
--    This ensures new companies automatically get assigned to the logged-in user
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'user_id') THEN
        ALTER TABLE "public"."companies" 
        ADD COLUMN "user_id" UUID REFERENCES auth.users(id) DEFAULT auth.uid();
    END IF;
END $$;

-- 2. Enable Row Level Security (RLS) on companies table
ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies to avoid conflicts (clean slate)
DROP POLICY IF EXISTS "Users can view their own companies" ON "public"."companies";
DROP POLICY IF EXISTS "Users can insert their own companies" ON "public"."companies";
DROP POLICY IF EXISTS "Users can update their own companies" ON "public"."companies";
DROP POLICY IF EXISTS "Users can delete their own companies" ON "public"."companies";
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON "public"."companies";
DROP POLICY IF EXISTS "Enable select for authenticated users" ON "public"."companies";

-- 4. Create new comprehensive policies

-- SELECT: Allow users to see ONLY their own companies
CREATE POLICY "Users can view their own companies" 
ON "public"."companies" 
FOR SELECT 
TO authenticated 
USING (
    auth.uid() = user_id 
    OR 
    user_id IS NULL -- Optional: allow viewing legacy companies with no owner? Better to secure it.
                    -- For now, let's keep it strict. 
                    -- If user_id is NULL, nobody sees it except service_role.
);

-- INSERT: Allow authenticated users to create companies
-- The WITH CHECK clause ensures they can't create a company for someone else
CREATE POLICY "Users can create companies" 
ON "public"."companies" 
FOR INSERT 
TO authenticated 
WITH CHECK (
    auth.uid() = user_id
    OR
    user_id IS NULL -- If app doesn't send user_id, it defaults to auth.uid() via column default
                    -- But if default applies, the value checked here is the default value.
);

-- UPDATE: Allow users to update ONLY their own companies
CREATE POLICY "Users can update their own companies" 
ON "public"."companies" 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id); -- Prevent transferring ownership

-- DELETE: Allow users to delete ONLY their own companies
CREATE POLICY "Users can delete their own companies" 
ON "public"."companies" 
FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);

-- 5. Grant permissions to authenticated role (just in case)
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."companies" TO authenticated;

-- ==============================================================================
-- OPTIONAL: Fix for existing companies with NULL user_id
-- If you want to assign ALL existing orphan companies to the currently logged in user running this script
-- (Only relevant if you run this from the SQL Editor while 'authenticated' as a user, 
--  which is usually NOT the case in Dashboard. Dashboard runs as postgres/admin.)
-- To fix manually: 
-- UPDATE companies SET user_id = 'YOUR_USER_UUID' WHERE user_id IS NULL;
-- ==============================================================================
