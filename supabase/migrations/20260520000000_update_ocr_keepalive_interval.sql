-- Increase keepalive frequency from every 12h to every 10min.
-- HF free spaces sleep after a short idle period; 12h was too infrequent.
select cron.unschedule('keep-ocr-alive');

select cron.schedule(
  'keep-ocr-alive',
  '*/10 * * * *',
  $$ select net.http_get('https://sinful1-receipt-ocr.hf.space/warmup') $$
);
