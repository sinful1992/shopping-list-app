-- Supabase Setup for Urgent Items Feature
-- Run this SQL in your Supabase SQL Editor to verify/create all necessary components

-- ============================================
-- 1. CREATE TABLES
-- ============================================

-- Create urgent_items table
CREATE TABLE IF NOT EXISTS public.urgent_items (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    family_group_id UUID NOT NULL,
    created_by UUID NOT NULL,
    created_by_name TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    resolved_by UUID,
    resolved_by_name TEXT,
    resolved_at BIGINT,
    price NUMERIC,
    status TEXT NOT NULL DEFAULT 'active',
    sync_status TEXT DEFAULT 'synced',
    created_at_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create device_tokens table (if not exists)
CREATE TABLE IF NOT EXISTS public.device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    family_group_id UUID NOT NULL,
    fcm_token TEXT NOT NULL,
    platform TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, fcm_token)
);

-- ============================================
-- 2. CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_urgent_items_family_group ON public.urgent_items(family_group_id);
CREATE INDEX IF NOT EXISTS idx_urgent_items_created_by ON public.urgent_items(created_by);
CREATE INDEX IF NOT EXISTS idx_urgent_items_status ON public.urgent_items(status);
CREATE INDEX IF NOT EXISTS idx_urgent_items_created_at ON public.urgent_items(created_at);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_family_group ON public.device_tokens(family_group_id);

-- ============================================
-- 3. ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.urgent_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. RLS POLICIES
-- All direct client access is blocked. Only service_role (used by Edge Functions)
-- can read/write these tables. service_role bypasses RLS automatically.
-- ============================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.urgent_items;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.urgent_items;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.urgent_items;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON public.urgent_items;
DROP POLICY IF EXISTS "Allow delete for authenticated users" ON public.urgent_items;

DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.device_tokens;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.device_tokens;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON public.device_tokens;
DROP POLICY IF EXISTS "Allow delete for authenticated users" ON public.device_tokens;

-- No new policies are created. RLS is enabled (below) with no permissive policies,
-- so anon and authenticated roles have zero direct access.
-- All writes go through upsert-urgent-item and register-device-token Edge Functions,
-- which run as service_role and bypass RLS server-side.

-- ============================================
-- 5. CREATE DATABASE TRIGGER
-- ============================================

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS on_urgent_item_created ON public.urgent_items;
DROP FUNCTION IF EXISTS handle_new_urgent_item();

-- Create trigger function to call Edge Function
CREATE OR REPLACE FUNCTION handle_new_urgent_item()
RETURNS TRIGGER AS $$
BEGIN
    -- Call the Edge Function using pg_net or supabase_functions
    PERFORM
        net.http_post(
            url := current_setting('app.settings.supabase_url') || '/functions/v1/notify-urgent-item',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
            ),
            body := jsonb_build_object('record', row_to_json(NEW))
        );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
CREATE TRIGGER on_urgent_item_created
    AFTER INSERT ON public.urgent_items
    FOR EACH ROW
    WHEN (NEW.status = 'active')
    EXECUTE FUNCTION handle_new_urgent_item();

-- ============================================
-- 6. VERIFICATION QUERIES
-- ============================================

-- Check if tables exist
SELECT 'urgent_items table exists' AS status
WHERE EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'urgent_items');

SELECT 'device_tokens table exists' AS status
WHERE EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'device_tokens');

-- Check if RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('urgent_items', 'device_tokens');

-- Check policies
SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('urgent_items', 'device_tokens');

-- Check trigger exists
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table = 'urgent_items';
