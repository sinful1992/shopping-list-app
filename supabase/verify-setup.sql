-- ============================================
-- VERIFICATION SQL - Check Urgent Items Setup
-- Run this in Supabase SQL Editor to verify everything is configured correctly
-- ============================================

-- ============================================
-- 1. CHECK IF TABLES EXIST
-- ============================================
SELECT
    'Tables Check' as check_type,
    CASE
        WHEN EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'urgent_items')
        THEN '✅ urgent_items table exists'
        ELSE '❌ urgent_items table MISSING'
    END as urgent_items_table,
    CASE
        WHEN EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'device_tokens')
        THEN '✅ device_tokens table exists'
        ELSE '❌ device_tokens table MISSING'
    END as device_tokens_table;

-- ============================================
-- 2. CHECK ROW LEVEL SECURITY STATUS
-- ============================================
SELECT
    'RLS Status' as check_type,
    tablename,
    CASE
        WHEN rowsecurity = true THEN '✅ RLS Enabled'
        ELSE '❌ RLS Disabled'
    END as status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('urgent_items', 'device_tokens')
ORDER BY tablename;

-- ============================================
-- 3. CHECK RLS POLICIES FOR urgent_items
-- ============================================
SELECT
    'RLS Policies - urgent_items' as check_type,
    policyname as policy_name,
    cmd as operation,
    CASE
        WHEN 'anon' = ANY(roles::text[]) THEN '✅ anon allowed'
        ELSE '❌ anon NOT allowed'
    END as anon_access,
    roles as allowed_roles,
    permissive as permissive
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'urgent_items'
ORDER BY cmd;

-- ============================================
-- 4. CHECK RLS POLICIES FOR device_tokens
-- ============================================
SELECT
    'RLS Policies - device_tokens' as check_type,
    policyname as policy_name,
    cmd as operation,
    CASE
        WHEN 'anon' = ANY(roles::text[]) THEN '✅ anon allowed'
        ELSE '❌ anon NOT allowed'
    END as anon_access,
    roles as allowed_roles
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'device_tokens'
ORDER BY cmd;

-- ============================================
-- 5. CHECK IF POLICIES COVER ALL OPERATIONS
-- ============================================
WITH required_ops AS (
    SELECT unnest(ARRAY['INSERT', 'SELECT', 'UPDATE', 'DELETE']) as operation
),
existing_policies AS (
    SELECT DISTINCT cmd as operation
    FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'urgent_items'
    AND 'anon' = ANY(roles::text[])
)
SELECT
    'Policy Coverage - urgent_items' as check_type,
    r.operation,
    CASE
        WHEN e.operation IS NOT NULL THEN '✅ Policy exists for anon'
        ELSE '❌ NO policy for anon'
    END as status
FROM required_ops r
LEFT JOIN existing_policies e ON r.operation = e.operation
ORDER BY r.operation;

-- ============================================
-- 6. CHECK DATABASE TRIGGERS
-- ============================================
SELECT
    'Database Triggers' as check_type,
    trigger_name,
    event_manipulation as event,
    action_timing as timing,
    event_object_table as table_name,
    '✅ Trigger exists' as status
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table = 'urgent_items'
UNION ALL
SELECT
    'Database Triggers' as check_type,
    'on_urgent_item_created' as trigger_name,
    'INSERT' as event,
    'AFTER' as timing,
    'urgent_items' as table_name,
    '❌ Trigger MISSING' as status
WHERE NOT EXISTS (
    SELECT FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    AND event_object_table = 'urgent_items'
    AND trigger_name = 'on_urgent_item_created'
);

-- ============================================
-- 7. CHECK TABLE STRUCTURE
-- ============================================
SELECT
    'Table Structure - urgent_items' as check_type,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'urgent_items'
ORDER BY ordinal_position;

-- ============================================
-- 8. CHECK INDEXES
-- ============================================
SELECT
    'Indexes - urgent_items' as check_type,
    indexname as index_name,
    indexdef as definition
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename = 'urgent_items';

-- ============================================
-- 9. COUNT EXISTING DATA
-- ============================================
SELECT
    'Data Count' as check_type,
    (SELECT COUNT(*) FROM urgent_items) as urgent_items_count,
    (SELECT COUNT(*) FROM device_tokens) as device_tokens_count,
    (SELECT COUNT(*) FROM urgent_items WHERE status = 'active') as active_urgent_items,
    (SELECT COUNT(*) FROM urgent_items WHERE status = 'resolved') as resolved_urgent_items;

-- ============================================
-- 10. CHECK RECENT urgent_items
-- ============================================
SELECT
    'Recent Items (Last 5)' as check_type,
    id,
    name,
    status,
    created_by_name,
    created_at,
    family_group_id
FROM urgent_items
ORDER BY created_at DESC
LIMIT 5;

-- ============================================
-- 11. CHECK device_tokens
-- ============================================
SELECT
    'Device Tokens (Last 5)' as check_type,
    id,
    user_id,
    family_group_id,
    platform,
    CASE
        WHEN fcm_token IS NOT NULL THEN '✅ Token exists (' || length(fcm_token) || ' chars)'
        ELSE '❌ No token'
    END as token_status,
    created_at
FROM device_tokens
ORDER BY created_at DESC
LIMIT 5;

-- ============================================
-- 12. SUMMARY - WHAT'S MISSING?
-- ============================================
SELECT
    '=== SUMMARY ===' as check_type,
    CASE
        WHEN NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'urgent_items')
        THEN '❌ Create urgent_items table'
        WHEN NOT EXISTS (
            SELECT FROM pg_policies
            WHERE schemaname = 'public'
            AND tablename = 'urgent_items'
            AND cmd = 'INSERT'
            AND 'anon' = ANY(roles::text[])
        )
        THEN '❌ Add RLS policy for INSERT on urgent_items (anon role)'
        WHEN NOT EXISTS (SELECT FROM device_tokens LIMIT 1)
        THEN '⚠️ No device tokens registered - notifications will not work'
        WHEN NOT EXISTS (
            SELECT FROM information_schema.triggers
            WHERE trigger_schema = 'public'
            AND event_object_table = 'urgent_items'
        )
        THEN '⚠️ No database trigger - you need a webhook or trigger to call Edge Function'
        ELSE '✅ Basic setup looks good!'
    END as status,
    CASE
        WHEN NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'urgent_items')
        THEN 'Run setup-urgent-items.sql to create tables'
        WHEN NOT EXISTS (
            SELECT FROM pg_policies
            WHERE schemaname = 'public'
            AND tablename = 'urgent_items'
            AND cmd = 'INSERT'
            AND 'anon' = ANY(roles::text[])
        )
        THEN 'Run fix-rls-policies.sql to allow INSERT'
        WHEN NOT EXISTS (SELECT FROM device_tokens LIMIT 1)
        THEN 'Ensure NotificationManager registers FCM tokens in the app'
        WHEN NOT EXISTS (
            SELECT FROM information_schema.triggers
            WHERE trigger_schema = 'public'
            AND event_object_table = 'urgent_items'
        )
        THEN 'Set up Database Webhook in Supabase Dashboard'
        ELSE 'Try creating an urgent item in the app'
    END as action_needed;
