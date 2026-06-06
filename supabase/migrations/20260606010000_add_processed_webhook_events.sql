-- Idempotency ledger for the RevenueCat webhook (PR3).
--
-- RevenueCat retries webhook deliveries (network blips, non-2xx), so the same
-- event.id can arrive multiple times. setFamilyTier already ratchets on
-- tierUpdatedAt, so a replay can't move a tier backwards — but recording the
-- event id lets us ack duplicates without re-doing Firebase/RevenueCat work.
--
-- The webhook CLAIMS an id before processing and RELEASES it (deletes) if
-- processing throws, so a failed delivery is re-processed on RC's retry.

create table if not exists public.processed_webhook_events (
  event_id    text        primary key,
  received_at timestamptz not null default now()
);

create index if not exists idx_processed_webhook_events_received_at
  on public.processed_webhook_events (received_at);

-- Service-role only (edge function). RLS on with no policies ⇒ anon/authenticated
-- have zero direct access; service_role bypasses RLS.
alter table public.processed_webhook_events enable row level security;

-- Daily sweep: RC never retries an event for anywhere near 30 days, so older ids
-- are safe to drop. pg_cron is already enabled (see the OCR keepalive migration).
do $$
begin
  perform cron.unschedule('sweep-processed-webhook-events');
exception when others then
  null;
end $$;

select cron.schedule(
  'sweep-processed-webhook-events',
  '30 3 * * *',
  $$ delete from public.processed_webhook_events where received_at < now() - interval '30 days' $$
);
