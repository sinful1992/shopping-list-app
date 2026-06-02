# Operations Runbook

Recovery and operational procedures for the Family Shopping List app
(Firebase RTDB/Auth/Storage + Supabase edge functions/Postgres, React Native).

---

## 1. One-time setup: backup encryption keys

The `RTDB Backup` workflow (`.github/workflows/rtdb-backup.yml`) encrypts each
export with [age](https://github.com/FiloSottile/age) using **asymmetric** keys.
Only the public key is ever in CI.

```bash
age-keygen -o rtdb-backup-key.txt
# Output:
#   Public key: age1qz...        <- goes in the AGE_PUBLIC_KEY GitHub secret
#   (file contents = the private identity)
```

1. Add the **public key** as repo secret `AGE_PUBLIC_KEY`.
2. Store the **private identity** (`rtdb-backup-key.txt`) **offline, in two
   places** — e.g. a password manager entry **and** a printed paper copy in a
   safe. It must NEVER be committed or placed in GitHub secrets: keeping it out of
   CI is what makes the backup survive a GitHub/account compromise. Keeping a
   second copy is what makes it survive losing the first.

Required existing secrets (already used by `android-build.yml`):
`FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_PROJECT_ID`.

---

## 2. Restore RTDB from a backup

> ⚠️ `database:set /` **overwrites the entire database**. Confirm you have the
> right backup and consider exporting the current state first.

```bash
# 1. Download the encrypted artifact from the RTDB Backup workflow run.
# 2. Decrypt with the OFFLINE private identity (not available in CI):
age -d -i rtdb-backup-key.txt -o rtdb-backup.json rtdb-backup.json.age

# 3. Sanity-check it is valid, non-empty JSON:
jq 'keys' rtdb-backup.json

# 4. Authenticate and restore:
export GOOGLE_APPLICATION_CREDENTIALS=./sa.json   # service account JSON
firebase database:set / rtdb-backup.json --project <PROJECT_ID>
```

Backups are retained 30 days. If corruption is suspected, restore from a backup
dated **before** the suspected corruption, not the latest.

---

## 3. Redeploy backend

**Supabase edge functions** (auto-deploy on push to master via
`deploy-supabase-functions.yml`, or manually):
```bash
supabase functions deploy <name> --project-ref <ref>
```
Functions: `upsert-urgent-item`, `register-device-token`, `notify-shopping-started`,
`notify-urgent-item`, `revenuecat-webhook`, `reconcile-subscription`.

**RTDB security rules** (deployed by `android-build.yml` on master push, or):
```bash
export GOOGLE_APPLICATION_CREDENTIALS=./sa.json
firebase deploy --only database --project <PROJECT_ID>
```

**Database migrations** (Supabase): apply files under `supabase/migrations/` in
order. They require `pg_cron` + `pg_net` (Dashboard → Database → Extensions).

---

## 4. Rotate the Firebase service-account key

If `FIREBASE_SERVICE_ACCOUNT_JSON` is exposed:
1. Firebase Console → Project Settings → Service accounts → generate a new
   private key; disable the old one in Google Cloud IAM.
2. Update the `FIREBASE_SERVICE_ACCOUNT_JSON` repo secret and the Supabase
   function secret (`supabase secrets set FIREBASE_SERVICE_ACCOUNT=...`).
3. Re-run a backup and confirm it succeeds with the new key.

---

## 5. Post-recovery verification checklist

After any restore/redeploy, verify on a device/AVD:
- [ ] Sign in (email + Google).
- [ ] **Family-group join → approve → join** flow end-to-end (the one rule path
      historically under-tested).
- [ ] Create a list + item; confirm it syncs across two accounts in the group.
- [ ] Urgent item create/resolve (exercises `upsert-urgent-item`).
- [ ] OCR health: `curl https://sinful1-receipt-ocr.hf.space/health` → 200.
- [ ] Push notification arrives for a second group member.

---

## 6. Uptime monitoring (external, no CI noise)

Use a free external monitor (e.g. UptimeRobot) — do **not** build a CI cron
(cold-starting HF Spaces + no dedup = alert spam):
- HTTP(s) monitor on `https://sinful1-receipt-ocr.hf.space/health`, 5–15 min
  interval, alert after 2 consecutive failures (absorbs cold starts).

---

## 7. CI / merge protection

`ci.yml` runs typecheck + tests + lint on every PR into `master` and gates the
release build (`android-build.yml` → `needs: verify`). To make it enforced:
- GitHub → Settings → Branches → add a rule for `master` → **Require status
  checks to pass** → select the `verify` / CI check.

---

## 8. Staging via Play Store testing tracks

There is no separate staging server — use Play Console **internal/closed/open
testing tracks** as staging/preview:
- Promote a release to **Internal testing** first; validate against production
  backend with the checklist in §5 before promoting to Production.

---

## 9. App Check rollout (Play Integrity) — see PR6

App Check attests requests come from the genuine app (anti-scripting). It is
**not** a request-volume ceiling. Rollout:
1. Register the app in Firebase Console → App Check with the **Play Integrity**
   provider; add a **debug token** for any emulator/AVD (Play Integrity fails on
   emulators by default — without this, legit AVD traffic fails attestation).
2. Run in **monitor mode** and watch the metrics until legit traffic passes.
3. Only then **enforce** on RTDB, Storage, and the client-facing edge functions.
