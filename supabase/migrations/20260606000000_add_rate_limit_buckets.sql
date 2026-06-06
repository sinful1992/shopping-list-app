-- Per-UID rate limiting for edge functions (PR2).
--
-- Free-tier, no Redis: a fixed-window counter in Postgres. Each edge function,
-- AFTER verifying the Firebase ID token, calls check_rate_limit() keyed on the
-- verified uid. The counter is atomic (INSERT ... ON CONFLICT DO UPDATE), so
-- concurrent requests in the same window increment the same row safely.
--
-- This is abuse/cost protection, not a security boundary — auth + membership
-- checks already gate access. So edge functions fail OPEN if this call errors
-- (a limiter blip must not deny legit users), but a working limiter caps spam.

create table if not exists public.rate_limit_buckets (
  uid          text        not null,
  fn           text        not null,
  window_start timestamptz not null,
  count        int         not null default 0,
  primary key (uid, fn, window_start)
);

create index if not exists idx_rate_limit_buckets_window_start
  on public.rate_limit_buckets (window_start);

-- Service-role only (edge functions). RLS on with no policies ⇒ anon/authenticated
-- have zero direct access; service_role bypasses RLS.
alter table public.rate_limit_buckets enable row level security;

-- Atomic fixed-window increment. Floors now() to the window boundary, bumps the
-- bucket, and returns the post-increment count. Caller compares against its limit:
-- allowed ⇔ returned count <= limit.
create or replace function public.check_rate_limit(
  p_uid text,
  p_fn text,
  p_window_seconds int
) returns int
language plpgsql
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_buckets (uid, fn, window_start, count)
  values (p_uid, p_fn, v_window_start, 1)
  on conflict (uid, fn, window_start)
  do update set count = rate_limit_buckets.count + 1
  returning count into v_count;

  return v_count;
end;
$$;

-- Hourly sweep: windows are at most a few minutes wide, so anything older than an
-- hour is dead weight. pg_cron is already enabled (see the OCR keepalive migration).
-- Unschedule-then-schedule keeps this migration idempotent on re-apply.
do $$
begin
  perform cron.unschedule('sweep-rate-limit-buckets');
exception when others then
  null;
end $$;

select cron.schedule(
  'sweep-rate-limit-buckets',
  '0 * * * *',
  $$ delete from public.rate_limit_buckets where window_start < now() - interval '1 hour' $$
);
