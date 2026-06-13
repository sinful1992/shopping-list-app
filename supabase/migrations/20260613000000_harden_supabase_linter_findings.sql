-- Resolve Supabase database-linter SECURITY warnings (2026-06-13).
--
-- The live DB had drifted from the migration history. This migration realigns it
-- and is safe to re-run (every statement is idempotent / IF EXISTS). It addresses
-- three linter categories plus one exposure the linter does NOT flag:
--
--   1. function_search_path_mutable (0011) — handle_new_urgent_item and
--      check_rate_limit run with a role-mutable search_path, so a caller could
--      shadow an unqualified reference. Both bodies are fully schema-qualified /
--      pg_catalog-only, so pinning to '' is safe and is the hardened default for
--      SECURITY DEFINER functions.
--   2. rls_policy_always_true (0024) — device_tokens and urgent_items carry
--      "Allow … for all users" INSERT/UPDATE/DELETE policies (USING / WITH CHECK
--      true) that let anon/authenticated write directly, bypassing the edge
--      functions. These are NOT in any migration or any past commit — pre-history
--      drift created by hand in the dashboard. The documented design is RLS-on /
--      no-policies / service_role-only, and the client only ever writes these
--      tables via the upsert-urgent-item / register-device-token edge functions
--      (verified: zero supabase.from('urgent_items'|'device_tokens') in src/).
--   3. security_definer_function_executable (0028/0029) — handle_new_urgent_item
--      is reachable via /rpc because Postgres grants EXECUTE to PUBLIC by default.
--      Revoke it; the trigger still fires (Postgres doesn't check EXECUTE on
--      trigger functions). notify_urgent_item_created (the other flagged function)
--      is handled by dropping it — see below.
--   NOT flagged by the linter, but the worst of the set: matching
--      "Allow select for all users" policies (SELECT USING(true), which 0024
--      deliberately ignores) let any holder of the anon key read EVERY family's
--      urgent_items and every device's FCM token in device_tokens, cross-tenant.
--      The client never SELECTs these via PostgREST (urgent_items syncs through
--      Firebase RTDB), so these are dropped too.

-- ============================================
-- 1. Drop the orphan SECURITY DEFINER function
-- ============================================

-- notify_urgent_item_created is a dead, hand-created predecessor of
-- handle_new_urgent_item: same purpose (POST to notify-urgent-item on a new
-- urgent item) but weaker (hardcoded project URL, forwards the caller's own
-- Authorization header instead of the service-role key). It is wired to NO
-- trigger (only on_urgent_item_created -> handle_new_urgent_item exists) and
-- appears nowhere in the repo or git history. Dropping it clears its
-- search_path (0011) and both /rpc-executable (0028/0029) findings at once.
DROP FUNCTION IF EXISTS public.notify_urgent_item_created();

-- ============================================
-- 2. Pin search_path on the surviving functions
-- ============================================

ALTER FUNCTION public.handle_new_urgent_item() SET search_path = '';
ALTER FUNCTION public.check_rate_limit(text, text, int) SET search_path = '';

-- ============================================
-- 3. Revoke the default PUBLIC /rpc EXECUTE grant
-- ============================================

REVOKE EXECUTE ON FUNCTION public.handle_new_urgent_item() FROM PUBLIC, anon, authenticated;

-- ============================================
-- 4. Drop ALL permissive "for all users" policies (writes + reads)
-- ============================================

DROP POLICY IF EXISTS "Allow select for all users" ON public.urgent_items;
DROP POLICY IF EXISTS "Allow insert for all users" ON public.urgent_items;
DROP POLICY IF EXISTS "Allow update for all users" ON public.urgent_items;
DROP POLICY IF EXISTS "Allow delete for all users" ON public.urgent_items;

DROP POLICY IF EXISTS "Allow select for all users" ON public.device_tokens;
DROP POLICY IF EXISTS "Allow insert for all users" ON public.device_tokens;
DROP POLICY IF EXISTS "Allow update for all users" ON public.device_tokens;
DROP POLICY IF EXISTS "Allow delete for all users" ON public.device_tokens;
