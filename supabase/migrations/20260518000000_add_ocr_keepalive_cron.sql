-- Requires pg_cron and pg_net extensions.
-- Enable both in Supabase Dashboard → Database → Extensions before applying.

create extension if not exists pg_net schema extensions;
create extension if not exists pg_cron;

-- Ping the HuggingFace OCR Space every 30 minutes to prevent it sleeping.
-- Free-tier Spaces sleep after 48h of inactivity; 30 min is conservative.
select cron.schedule(
  'keep-ocr-alive',
  '*/30 * * * *',
  $$ select net.http_get('https://sinful1-receipt-ocr.hf.space/health') $$
);
