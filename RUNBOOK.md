# Operations Runbook

What to do when something breaks, or when you need to restore, redeploy, or
rotate keys for the Family Shopping List app.

**The app runs on two backends:**
- **Firebase** — login, the realtime database (RTDB), and receipt image storage.
- **Supabase** — edge functions and the Postgres database.
- The app itself is React Native.

**Jump to what you need:**
- [1. Set up backup keys](#1-set-up-backup-encryption-keys-one-time) (one-time)
- [2. Restore the database from a backup](#2-restore-the-database-from-a-backup)
- [3. Redeploy the backend](#3-redeploy-the-backend)
- [4. Replace a leaked Firebase key](#4-replace-a-leaked-firebase-service-account-key)
- [5. Check everything works after a restore](#5-check-everything-works-after-a-restore)
- [6. Uptime monitoring](#6-uptime-monitoring)
- [7. Stop broken code reaching master](#7-stop-broken-code-reaching-master)
- [8. Test a release before users get it](#8-test-a-release-before-users-get-it)
- [9. Turn on App Check](#9-turn-on-app-check-anti-scripting)

---

## 1. Set up backup encryption keys (one-time)

Every night, the `RTDB Backup` workflow
(`.github/workflows/rtdb-backup.yml`) saves a copy of the database and **locks
it with encryption** using a tool called [age](https://github.com/FiloSottile/age).

age uses a **pair of keys**: a *public* key that locks (encrypts) the backup,
and a *private* key that unlocks (decrypts) it. Only the public key is ever in
GitHub — so even if someone breaks into the GitHub account, they get locked
backups they can't open.

**Create the key pair:**
```bash
age-keygen -o rtdb-backup-key.txt
# Prints:
#   Public key: age1qz...        <- this goes in GitHub
#   (the file itself = the private key)
```

**Then:**
1. Put the **public key** in a GitHub repo secret named `AGE_PUBLIC_KEY`.
2. Keep the **private key** (`rtdb-backup-key.txt`) **offline, in two separate
   places** — e.g. a password manager *and* a printed copy in a safe.
   - Never commit it. Never put it in GitHub secrets. Keeping it out of GitHub
     is the whole point — it's what lets the backup survive a GitHub or account
     breach.
   - Two copies means losing one doesn't lock you out forever.

You also need two secrets that already exist (used by `android-build.yml`):
`FIREBASE_SERVICE_ACCOUNT_JSON` and `FIREBASE_PROJECT_ID`.

---

## 2. Restore the database from a backup

> ⚠️ **This wipes the entire database and replaces it.** Double-check you picked
> the right backup. Consider exporting the current database first, in case you
> need to undo.

```bash
# 1. Download the encrypted backup file from a "RTDB Backup" workflow run.

# 2. Unlock it with your OFFLINE private key (the one not in CI):
age -d -i rtdb-backup-key.txt -o rtdb-backup.json rtdb-backup.json.age

# 3. Confirm it's real, non-empty data before restoring:
jq 'keys' rtdb-backup.json

# 4. Log in and restore:
export GOOGLE_APPLICATION_CREDENTIALS=./sa.json   # service account JSON file
firebase database:set / rtdb-backup.json --project <PROJECT_ID>
```

Backups are kept for **30 days**. If you think the data got corrupted, restore
a backup from **before** the corruption started — not the most recent one (which
may already contain the bad data).

---

## 3. Redeploy the backend

**Supabase edge functions** — these deploy automatically when you push to
`master` (via `deploy-supabase-functions.yml`). To deploy one by hand:
```bash
supabase functions deploy <name> --project-ref <ref>
```
The functions are: `upsert-urgent-item`, `register-device-token`,
`notify-shopping-started`, `notify-urgent-item`, `revenuecat-webhook`,
`reconcile-subscription`.

**Firebase database security rules** — these deploy automatically on a `master`
push (via `android-build.yml`). To deploy by hand:
```bash
export GOOGLE_APPLICATION_CREDENTIALS=./sa.json
firebase deploy --only database --project <PROJECT_ID>
```

**Database migrations (Supabase)** — apply the files in `supabase/migrations/`
**in order**. They need the `pg_cron` and `pg_net` extensions turned on
(Supabase Dashboard → Database → Extensions).

---

## 4. Replace a leaked Firebase service-account key

If `FIREBASE_SERVICE_ACCOUNT_JSON` is ever exposed:
1. Firebase Console → Project Settings → Service accounts → generate a new
   private key. Then disable the old key in Google Cloud IAM.
2. Update the new key in two places: the `FIREBASE_SERVICE_ACCOUNT_JSON` GitHub
   secret, and the Supabase function secret
   (`supabase secrets set FIREBASE_SERVICE_ACCOUNT=...`).
3. Re-run a backup and confirm it succeeds with the new key.

---

## 5. Check everything works after a restore

After any restore or redeploy, run through this on a real device or emulator:
- [ ] Sign in (both email and Google).
- [ ] **Family-group join → approve → join**, all the way through. (This path
      has historically been the least tested — pay extra attention here.)
- [ ] Create a list and an item; confirm it shows up on a second account in the
      same group.
- [ ] Create and resolve an urgent item (this exercises `upsert-urgent-item`).
- [ ] OCR is up: `curl https://sinful1-receipt-ocr.hf.space/health` returns 200.
- [ ] A push notification reaches a second group member.

---

## 6. Uptime monitoring

Use a free external monitor like **UptimeRobot** — don't build a CI cron job for
this (HF Spaces is slow to wake from cold, and a cron with no de-duplication
will spam you with false alarms):
- Monitor `https://sinful1-receipt-ocr.hf.space/health` over HTTP(s).
- Check every 5–15 minutes.
- Only alert after **2 failures in a row** (this rides out normal cold starts).

---

## 7. Stop broken code reaching master

`ci.yml` runs typecheck + tests + lint on every PR into `master`, and the
release build (`android-build.yml`) won't run unless that passes (`needs:
verify`). Right now those checks run but aren't *required*. To make them
mandatory:
- GitHub → Settings → Branches → add a rule for `master` → turn on **Require
  status checks to pass** → select the `verify` / CI check.

---

## 8. Test a release before users get it

There's no separate staging server. Use the Play Console **testing tracks** as
your staging area:
- Push a release to **Internal testing** first.
- Validate it against the real backend using the checklist in §5.
- Only then promote it to **Production**.

---

## 9. Turn on App Check (anti-scripting)

App Check confirms that requests are coming from the genuine app, not a script
or bot. (Note: it does **not** cap how many requests can be made — it's about
authenticity, not rate limiting.) Roll it out gradually:
1. Firebase Console → App Check → register the app with the **Play Integrity**
   provider. Add a **debug token** for any emulator/AVD — Play Integrity
   normally fails on emulators, so without this token your legit test traffic
   gets rejected.
2. Run in **monitor mode** first and watch the metrics until you're sure real
   traffic is passing.
3. Only then **enforce** it — on RTDB, Storage, and the client-facing edge
   functions.
