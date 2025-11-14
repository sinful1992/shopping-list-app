# Setup Checklist for Urgent Items Feature

## What You Need to Do

### 1. Get Supabase Anon Key
**Where**: Supabase Dashboard → Settings → API

**What to copy**: The "anon public" key (starts with `eyJ...`)

**Where to paste**:
- Local: `.env` file → `SUPABASE_ANON_KEY=...`
- GitHub: Repository → Settings → Secrets → New secret: `SUPABASE_ANON_KEY`

### 2. Add Supabase URL to GitHub Secrets
**Where**: GitHub Repository → Settings → Secrets → Actions

**Add secret**:
- Name: `SUPABASE_URL`
- Value: `https://cwpzfsfjrlxekghfyqub.supabase.co`

### 3. Create Database Tables
**Where**: Supabase Dashboard → SQL Editor

**Run**: Copy the SQL from `SUPABASE_SETUP_GUIDE.md` Step 4

Creates:
- `device_tokens` table (stores FCM tokens)
- `urgent_items` table (stores urgent items)

### 4. Get Firebase Service Account JSON (V1 API)
**Where**: Firebase Console → Project Settings → Cloud Messaging → Manage service accounts

**What to do**:
1. Click "Manage service accounts"
2. Click the 3 dots → Manage keys
3. Add Key → Create new key → JSON
4. Download the JSON file

**Where to paste**: Supabase Dashboard → Edge Functions → notify-urgent-item → Settings → Secrets

Add secret:
- Key: `FIREBASE_SERVICE_ACCOUNT`
- Value: Paste the **entire JSON content** from the downloaded file

📖 **Detailed guide**: See `FIREBASE_V1_API_SETUP.md`

### 5. Create Database Trigger
**Where**: Supabase Dashboard → SQL Editor

**Run**: Copy the SQL from `SUPABASE_SETUP_GUIDE.md` Step 7

This calls the Edge Function automatically when urgent items are created.

### 6. Commit and Push Changes
```bash
git add .
git commit -m "Add Supabase integration for urgent items push notifications"
git push origin main
```

GitHub Actions will build your app with the Supabase configuration.

## Quick Test

1. Install app on 2 devices
2. Log in with same family group on both
3. Create urgent item on device 1
4. Device 2 should receive push notification 🔥

## Summary of Changes Made

### Files Modified:
- `.env` - Added Supabase URL and anon key
- `.github/workflows/android-build.yml` - Added Supabase secrets
- `src/services/NotificationManager.ts` - Sends FCM tokens to Supabase
- `src/services/UrgentItemManager.ts` - Syncs urgent items to Supabase

### What Happens Now:
1. User creates urgent item → Saved locally (WatermelonDB)
2. App sends to Supabase `urgent_items` table
3. Database trigger fires → Calls Edge Function
4. Edge Function gets all family FCM tokens
5. Edge Function sends push notifications via FCM
6. All family members get notified instantly! 🎉

## Need Help?

Check the detailed guide: `SUPABASE_SETUP_GUIDE.md`
