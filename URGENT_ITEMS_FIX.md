# 🔥 URGENT ITEMS FIX - Root Cause and Solution

## 🐛 Root Cause

The urgent items were **not being inserted** into the Supabase `urgent_items` table due to a **data type mismatch**:

### The Problem
- **Supabase table schema**: Expected `UUID` type for `id`, `family_group_id`, `created_by`
- **App sends**: Firebase Auth IDs (format: `abc123XYZ`) which are NOT in UUID format (format: `550e8400-e29b-41d4-a716-446655440000`)
- **Result**: Supabase **rejects the INSERT** → No row inserted → Trigger never fires → Edge Function never called → No notifications sent ❌

### Why device_tokens appeared to work
The `device_tokens` table had the same UUID issue, but:
1. Either it wasn't actually working (check your Supabase dashboard)
2. Or it was created with TEXT fields initially

## ✅ Solution

Change the Supabase tables to use `TEXT` instead of `UUID` for ID columns, since Firebase Auth IDs are not in UUID format.

## 🚀 Step-by-Step Fix

### Step 1: Run the Schema Fix

1. Go to your **Supabase Dashboard**
2. Navigate to **SQL Editor**
3. Open the file `supabase/fix-urgent-items-schema.sql`
4. Copy and paste the entire contents into the SQL Editor
5. Click **Run**

⚠️ **Note**: This will **drop and recreate** the `urgent_items` and `device_tokens` tables. If you have existing data you want to keep, back it up first!

### Step 2: Configure Database Settings

The database trigger needs to know your Supabase URL and Service Role Key to call the Edge Function.

1. Stay in **SQL Editor**
2. Open the file `supabase/configure-database-settings.sql`
3. **Replace the placeholder values**:
   ```sql
   -- Find your values in Supabase Dashboard > Project Settings > API
   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://xxxxx.supabase.co';
   ALTER DATABASE postgres SET app.settings.service_role_key = 'eyJhbG...your-key';
   ```
4. Copy and paste into SQL Editor
5. Click **Run**
6. Verify you see ✅ for both settings

### Step 3: Verify the Setup

Run this query in SQL Editor to verify everything is configured:

```sql
-- Check tables exist
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('urgent_items', 'device_tokens');

-- Check trigger exists
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table = 'urgent_items';

-- Check database settings
SELECT
    current_setting('app.settings.supabase_url', true) as supabase_url,
    CASE
        WHEN current_setting('app.settings.service_role_key', true) IS NOT NULL
        THEN 'configured'
        ELSE 'NOT configured'
    END as service_key_status;

-- Check pg_net extension is enabled
SELECT * FROM pg_extension WHERE extname = 'pg_net';
```

You should see:
- ✅ Both tables listed
- ✅ Trigger `on_urgent_item_created` exists
- ✅ Supabase URL shows your project URL
- ✅ Service key status shows "configured"
- ✅ pg_net extension is present

### Step 4: Re-register Device Tokens

Since we recreated the `device_tokens` table, you need to re-register all devices:

1. **On each device**, sign out and sign back in (or just restart the app)
2. This will trigger `NotificationManager.registerToken()` which will re-add the device tokens

### Step 5: Test Urgent Items

1. **On Device A**: Create an urgent item (tap the 🔥 button)
2. **Check Supabase Dashboard**:
   - Go to **Table Editor** > `urgent_items`
   - Verify the row was inserted ✅
3. **On Device B**: You should receive a push notification 🔔

## 🔍 Debugging

If it still doesn't work:

### Check App Logs (React Native)
```bash
# Android
npx react-native log-android

# iOS
npx react-native log-ios
```

Look for:
- `"Syncing urgent item to Supabase"` - App is trying to sync
- `"Supabase response status: 201"` - Success! Row inserted
- `"Failed to sync urgent item"` - Error inserting row

### Check Supabase Logs

1. Go to **Supabase Dashboard** > **Logs** > **Edge Functions**
2. Look for `notify-urgent-item` function calls
3. Check for errors in the logs

### Check Database Trigger

Run this query to test if the trigger can call the Edge Function:

```sql
-- Insert a test urgent item manually
INSERT INTO public.urgent_items (
    id,
    name,
    family_group_id,
    created_by,
    created_by_name,
    created_at,
    status
) VALUES (
    'test-' || gen_random_uuid()::TEXT,
    'Test Item',
    'test-family-group',
    'test-user-id',
    'Test User',
    extract(epoch from now())::BIGINT * 1000,
    'active'
);

-- Check Edge Function logs in Supabase Dashboard
-- You should see the notify-urgent-item function being called
```

## 📋 Checklist

- [ ] Run `fix-urgent-items-schema.sql` in Supabase SQL Editor
- [ ] Update and run `configure-database-settings.sql` with your actual values
- [ ] Verify tables, trigger, and settings are configured
- [ ] Re-register device tokens (sign out/in on all devices)
- [ ] Test creating an urgent item
- [ ] Verify row appears in Supabase `urgent_items` table
- [ ] Verify other family members receive push notification

## 🎉 Success Indicators

When everything is working:
1. ✅ Creating urgent item shows "Success" alert in app
2. ✅ Row appears immediately in Supabase `urgent_items` table
3. ✅ Edge Function logs show `notify-urgent-item` was called
4. ✅ Family members receive push notification within seconds
5. ✅ Notification tap opens app to Urgent Items screen

## 🆘 Still Not Working?

If you've completed all steps and it's still not working:

1. Share the **app logs** when creating an urgent item
2. Share the **Supabase response** (look for error messages)
3. Share a screenshot of the **Supabase Table Editor** showing the `urgent_items` schema
4. Verify your Edge Function is deployed: `supabase/functions/notify-urgent-item/index.ts`

---

**Files Changed:**
- ✅ `supabase/fix-urgent-items-schema.sql` - Schema fix
- ✅ `supabase/configure-database-settings.sql` - Database settings configuration
- 📝 `URGENT_ITEMS_FIX.md` - This guide
