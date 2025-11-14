-- ============================================
-- FIX: Change urgent_items UUID columns to TEXT
-- This fixes the issue where Firebase Auth IDs (non-UUID format)
-- were being rejected by UUID columns
-- ============================================

-- Drop the existing table (if you have test data you want to keep, backup first!)
DROP TABLE IF EXISTS public.urgent_items CASCADE;

-- Recreate table with TEXT for ID columns
CREATE TABLE public.urgent_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    family_group_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_by_name TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    resolved_by TEXT,
    resolved_by_name TEXT,
    resolved_at BIGINT,
    price NUMERIC,
    status TEXT NOT NULL DEFAULT 'active',
    sync_status TEXT DEFAULT 'synced',
    created_at_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- UPDATE device_tokens table too (for consistency)
-- ============================================

-- Drop and recreate device_tokens table
DROP TABLE IF EXISTS public.device_tokens CASCADE;

CREATE TABLE public.device_tokens (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL,
    family_group_id TEXT NOT NULL,
    fcm_token TEXT NOT NULL,
    platform TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, fcm_token)
);

-- ============================================
-- CREATE INDEXES
-- ============================================

CREATE INDEX idx_urgent_items_family_group ON public.urgent_items(family_group_id);
CREATE INDEX idx_urgent_items_created_by ON public.urgent_items(created_by);
CREATE INDEX idx_urgent_items_status ON public.urgent_items(status);
CREATE INDEX idx_urgent_items_created_at ON public.urgent_items(created_at);

CREATE INDEX idx_device_tokens_user ON public.device_tokens(user_id);
CREATE INDEX idx_device_tokens_family_group ON public.device_tokens(family_group_id);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.urgent_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================
-- CREATE RLS POLICIES
-- ============================================

-- urgent_items policies
CREATE POLICY "Allow insert for all users"
    ON public.urgent_items
    FOR INSERT
    TO authenticated, anon
    WITH CHECK (true);

CREATE POLICY "Allow select for all users"
    ON public.urgent_items
    FOR SELECT
    TO authenticated, anon
    USING (true);

CREATE POLICY "Allow update for all users"
    ON public.urgent_items
    FOR UPDATE
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow delete for all users"
    ON public.urgent_items
    FOR DELETE
    TO authenticated, anon
    USING (true);

-- device_tokens policies
CREATE POLICY "Allow insert for all users"
    ON public.device_tokens
    FOR INSERT
    TO authenticated, anon
    WITH CHECK (true);

CREATE POLICY "Allow select for all users"
    ON public.device_tokens
    FOR SELECT
    TO authenticated, anon
    USING (true);

CREATE POLICY "Allow update for all users"
    ON public.device_tokens
    FOR UPDATE
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow delete for all users"
    ON public.device_tokens
    FOR DELETE
    TO authenticated, anon
    USING (true);

-- ============================================
-- CREATE DATABASE TRIGGER FOR EDGE FUNCTION
-- ============================================

-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS on_urgent_item_created ON public.urgent_items;
DROP FUNCTION IF EXISTS handle_new_urgent_item();

-- Create trigger function to call Edge Function
CREATE OR REPLACE FUNCTION handle_new_urgent_item()
RETURNS TRIGGER AS $$
DECLARE
    supabase_url TEXT;
    service_key TEXT;
BEGIN
    -- Get Supabase URL from environment
    -- You'll need to set these using: ALTER DATABASE postgres SET app.settings.supabase_url = 'your-url';
    BEGIN
        supabase_url := current_setting('app.settings.supabase_url', true);
        service_key := current_setting('app.settings.service_role_key', true);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Supabase settings not configured. Please run: ALTER DATABASE postgres SET app.settings.supabase_url = ''your-url'';';
        RETURN NEW;
    END;

    -- Only call Edge Function if settings are configured
    IF supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
        -- Call the Edge Function using pg_net
        PERFORM
            net.http_post(
                url := supabase_url || '/functions/v1/notify-urgent-item',
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || service_key
                ),
                body := jsonb_build_object('record', row_to_json(NEW))
            );
    END IF;

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
-- VERIFICATION
-- ============================================

SELECT 'urgent_items table created' AS status
WHERE EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'urgent_items');

SELECT 'device_tokens table created' AS status
WHERE EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'device_tokens');

SELECT 'Trigger created' AS status
WHERE EXISTS (
    SELECT FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    AND event_object_table = 'urgent_items'
    AND trigger_name = 'on_urgent_item_created'
);
