-- ============================================
-- Configure Database Settings for Edge Function Trigger
-- ============================================
-- IMPORTANT: Replace the placeholder values below with your actual Supabase project values
-- You can find these in your Supabase Dashboard:
--   - URL: Project Settings > API > Project URL
--   - Service Role Key: Project Settings > API > service_role secret (NOT anon key!)
-- ============================================

-- Set Supabase URL (replace with your actual project URL)
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://your-project-ref.supabase.co';

-- Set Service Role Key (replace with your actual service_role key - keep this secret!)
ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key-here';

-- ============================================
-- Verify settings are configured
-- ============================================
SELECT
    'Database Settings' as check_type,
    CASE
        WHEN current_setting('app.settings.supabase_url', true) IS NOT NULL
        THEN '✅ Supabase URL configured: ' || current_setting('app.settings.supabase_url', true)
        ELSE '❌ Supabase URL NOT configured'
    END as supabase_url_status,
    CASE
        WHEN current_setting('app.settings.service_role_key', true) IS NOT NULL
        THEN '✅ Service Role Key configured (hidden for security)'
        ELSE '❌ Service Role Key NOT configured'
    END as service_key_status;

-- ============================================
-- IMPORTANT SECURITY NOTE
-- ============================================
-- The service_role key has full admin access to your database
-- Never expose it in client-side code or commit it to version control
-- Only use it in server-side contexts like database triggers
-- ============================================
