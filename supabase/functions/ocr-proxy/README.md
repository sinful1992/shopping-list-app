# ocr-proxy

Holds the receipt OCR server's shared secret so the app doesn't have to.

Before 1.41.0 the app sent `X-OCR-Key` with a constant compiled into the
bundle. This repo is public and the value was also printed in the 1.34.0
changelog, so the secret was readable by anyone who looked. This function
takes its place: the app authenticates with a Firebase ID token, and the
shared secret lives only in this function's environment.

```
app ──(Firebase ID token)──▶ ocr-proxy ──(X-OCR-Key)──▶ HF Space /ocr
```

`/health` is unauthenticated on the Space and still called directly by the
app — it never carried the key, so it needs no proxy.

## Environment

| Variable | Purpose |
|---|---|
| `OCR_SERVER_URL` | Base URL of the Space, no trailing slash — `https://sinful1-receipt-ocr.hf.space` |
| `OCR_SHARED_SECRET` | Must equal the Space's own `OCR_SHARED_SECRET` secret |
| `FIREBASE_PROJECT_ID` | Token audience/issuer check. Falls back to `project_id` inside `FIREBASE_SERVICE_ACCOUNT`, already set for the notification functions |

## Rotation runbook

The order matters. Steps 1–2 are safe at any time; step 3 is the cutover, and
scanning is down for older builds from that moment until they update.

1. **Set the function's secrets** to the *new* key value:
   ```
   supabase secrets set OCR_SERVER_URL=https://sinful1-receipt-ocr.hf.space
   supabase secrets set OCR_SHARED_SECRET=<new-key>
   ```
2. **Deploy the function:**
   ```
   supabase functions deploy ocr-proxy
   ```
   Verify it before cutting over — with the Space still on the old key this
   should return 401 from upstream, which proves auth and forwarding both work:
   ```
   curl -X POST "$SUPABASE_URL/functions/v1/ocr-proxy" \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
     -H "X-Firebase-Token: <a real ID token>" \
     -F "file=@receipt.jpg"
   ```
3. **Rotate the Space secret** — set `OCR_SHARED_SECRET` to `<new-key>` in the
   Space's settings. It restarts (a few minutes; model reload included). From
   here the old key is dead and pre-1.41.0 builds get a 401 on scan.
4. **Ship the app update.** Until it clears review and users take it, scanning
   is unavailable on older installs. That is the accepted cost of an immediate
   cutover; a staged alternative is to delay step 3 until the update is out.

## Notes

- The old key is in this repo's git history and cannot be recalled from forks
  or caches. Rotation is what retires it; history rewriting is not attempted.
- Request bodies are capped at 9MB here, under the platform's ~10MB limit and
  below the Space's 15MB. The app caps captures at 4096px to stay clear.
- `verify_jwt` is left at its default, so callers also need the Supabase anon
  key in `Authorization` — the app sends both headers.
