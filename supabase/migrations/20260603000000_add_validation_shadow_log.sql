-- Shadow log for edge-function request validation (PR4).
--
-- Stricter validation rules (enums, length caps) that don't fail today run in
-- shadow mode: the edge functions still return 200, but record each would-be
-- rejection here so we can SELECT by rule/field across client versions and only
-- promote a rule to a hard 400 once telemetry shows no legit client trips it.
--
-- The sink must not become the abuse target: edge functions write here only
-- AFTER verifying the Firebase ID token (post-auth) and only on a sampled
-- fraction of requests. This sweep bounds the table regardless.

create table if not exists public.validation_shadow_log (
  id         bigint generated always as identity primary key,
  fn         text not null,
  rule       text not null,
  field      text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_validation_shadow_log_created_at
  on public.validation_shadow_log (created_at);
create index if not exists idx_validation_shadow_log_fn_rule
  on public.validation_shadow_log (fn, rule);

-- Service-role only (edge functions). RLS on with no policies ⇒ anon/authenticated
-- have zero direct access; service_role bypasses RLS.
alter table public.validation_shadow_log enable row level security;

-- Daily sweep: keep ~14 days of signal, drop the rest. pg_cron is already enabled
-- (see 20260518000000_add_ocr_keepalive_cron.sql). Unschedule-then-schedule keeps
-- this migration idempotent on re-apply.
do $$
begin
  perform cron.unschedule('sweep-validation-shadow-log');
exception when others then
  null;
end $$;

select cron.schedule(
  'sweep-validation-shadow-log',
  '0 3 * * *',
  $$ delete from public.validation_shadow_log where created_at < now() - interval '14 days' $$
);
