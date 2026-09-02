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

Deploy against the **current** key first and prove the whole path works, then
rotate. Doing it the other way round means the first end-to-end test of a
never-deployed function happens at the same moment older builds start failing,
with nothing known-good to fall back to.

1. **Set the function's secrets to the key that is live right now:**
   ```
   supabase secrets set OCR_SERVER_URL=https://sinful1-receipt-ocr.hf.space
   supabase secrets set OCR_SHARED_SECRET=<current-key>
   ```
2. **Deploy:**
   ```
   supabase functions deploy ocr-proxy
   ```
3. **Prove it end to end — a real 200, not a plumbing check.** Nothing has
   changed for users yet, so this is free to retry:
   ```
   curl -X POST "$SUPABASE_URL/functions/v1/ocr-proxy" \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
     -F "idToken=<a real Firebase ID token>" \
     -F "file=@receipt.jpg"
   ```
   Expect the parsed receipt JSON. A 401 mentioning a token means auth; a 502
   means the Space is unreachable; a gateway 401 with no JSON body from this
   function means the anon key was rejected before the code ran.
4. **Rotate both sides.** Set the Space's `OCR_SHARED_SECRET` to `<new-key>`
   (it restarts — a few minutes, model reload included), then
   `supabase secrets set OCR_SHARED_SECRET=<new-key>`. Re-run the step 3 curl;
   it should still return 200. From here the old key is dead and pre-1.41.0
   builds get a 401 on scan.
5. **Ship the app update.** Until it clears review and users take it, scanning
   is unavailable on older installs. That is the accepted cost of an immediate
   cutover; the staged alternative is to delay step 4 until the update is out.

## Notes

- The old key is in this repo's git history and cannot be recalled from forks
  or caches. Rotation is what retires it; history rewriting is not attempted.
- The ID token is read from the `idToken` multipart field, with the
  `X-Firebase-Token` header as a fallback. Supabase's gateway has been
  observed stripping non-standard headers before the function runs, so the
  header alone is not dependable; a body field always survives.
- Request bodies are capped at 9MB here. Supabase does not document the
  platform's own request limit — 9MB is chosen against a community-reported
  ~10MB and Supabase's own example, not a published number. The app caps
  captures at 4096px to stay well clear.
- The client's OCR timeout is 120s, inside the 150s free-plan function wall
  clock. If either moves, keep the client under the platform ceiling so a slow
  scan surfaces as the app's own error rather than a platform timeout.
- `verify_jwt` is left at its default, so callers also need the Supabase anon
  key in `Authorization`.
