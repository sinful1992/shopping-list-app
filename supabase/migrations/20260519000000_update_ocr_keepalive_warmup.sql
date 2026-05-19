-- Switch keepalive from /health to /warmup so the cron exercises the inference
-- engine, not just the process liveness check. /warmup runs a dummy OCR pass
-- that keeps PaddlePaddle's JIT-compiled kernels hot between real requests.
select cron.unschedule('keep-ocr-alive');

select cron.schedule(
  'keep-ocr-alive',
  '0 */12 * * *',
  $$ select net.http_get('https://sinful1-receipt-ocr.hf.space/warmup') $$
);
