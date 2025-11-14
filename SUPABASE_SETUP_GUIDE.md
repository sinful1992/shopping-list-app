# Supabase Setup Guide for Urgent Items

You've already deployed the Edge Function! Now let's complete the setup.

## Step 1: Get Your Supabase Keys ✅

1. Go to your Supabase project: https://cwpzfsfjrlxekghfyqub.supabase.co
2. Go to **Settings** → **API**
3. Copy these two values:
   - **Project URL**: `https://cwpzfsfjrlxekghfyqub.supabase.co`
   - **anon public** key (long string starting with `eyJ...`)

## Step 2: Update Local .env File

Replace the placeholder in your `.env` file:

```bash
SUPABASE_ANON_KEY=your_actual_anon_key_here
```

The URL is already set correctly.

## Step 3: Add GitHub Secrets for CI/CD

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these two secrets:

1. **Name**: `SUPABASE_URL`
   **Value**: `https://cwpzfsfjrlxekghfyqub.supabase.co`

2. **Name**: `SUPABASE_ANON_KEY`
   **Value**: Your anon key from Step 1

## Step 4: Create Supabase Tables

Go to your Supabase project → **SQL Editor** and run this SQL:

```sql
-- Create device_tokens table to store FCM tokens
CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  family_group_id TEXT NOT NULL,
  fcm_token TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, fcm_token)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_device_tokens_family_group ON device_tokens(family_group_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);

-- Enable Row Level Security
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Anyone can manage device tokens" ON device_tokens;
CREATE POLICY "Anyone can manage device tokens"
  ON device_tokens FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create urgent_items table in Supabase for syncing
CREATE TABLE IF NOT EXISTS urgent_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  family_group_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  resolved_by TEXT,
  resolved_by_name TEXT,
  resolved_at BIGINT,
  price NUMERIC,
  status TEXT NOT NULL CHECK (status IN ('active', 'resolved')),
  sync_status TEXT NOT NULL DEFAULT 'synced',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_urgent_items_family_group ON urgent_items(family_group_id);
CREATE INDEX IF NOT EXISTS idx_urgent_items_status ON urgent_items(status);

-- Enable Row Level Security
ALTER TABLE urgent_items ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Anyone can manage urgent items" ON urgent_items;
CREATE POLICY "Anyone can manage urgent items"
  ON urgent_items FOR ALL
  USING (true)
  WITH CHECK (true);
```

## Step 5: Set Up Edge Function Environment Variables

You need to add your FCM Server Key to the Edge Function.

### Get FCM Server Key:

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project
3. Go to **Project Settings** (gear icon) → **Cloud Messaging** tab
4. Scroll down to **Cloud Messaging API (Legacy)**
5. Copy the **Server key**

### Set Edge Function Secrets:

Run these commands in your terminal (or use Supabase dashboard):

```bash
# Set FCM Server Key
supabase secrets set FCM_SERVER_KEY=your_fcm_server_key_here --project-ref cwpzfsfjrlxekghfyqub

# Verify secrets are set
supabase secrets list --project-ref cwpzfsfjrlxekghfyqub
```

**OR** use the Supabase Dashboard:
1. Go to **Edge Functions** → **notify-urgent-item** → **Settings**
2. Add secret: `FCM_SERVER_KEY` = your FCM server key

## Step 6: Update Edge Function Code

Make sure your Edge Function uses the correct environment variables. The function should look like this:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  try {
    const { record } = await req.json()

    // Only send notification for new urgent items
    if (!record || record.status !== 'active') {
      return new Response(JSON.stringify({ message: 'No notification needed' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Get all device tokens for the family group (excluding creator)
    const { data: tokens, error } = await supabase
      .from('device_tokens')
      .select('fcm_token, user_id')
      .eq('family_group_id', record.family_group_id)
      .neq('user_id', record.created_by)

    if (error) {
      console.error('Error fetching tokens:', error)
      throw error
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'No tokens found' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Send FCM notification to all family members
    const fcmPromises = tokens.map((tokenData) => {
      const message = {
        to: tokenData.fcm_token,
        notification: {
          title: `🔥 Urgent: ${record.name} needed!`,
          body: `${record.created_by_name} needs this right away`,
          sound: 'default',
        },
        android: {
          priority: 'high',
          notification: {
            channel_id: 'urgent_items',
            color: '#FF6B35',
            sound: 'default',
          },
        },
        data: {
          type: 'urgent_item',
          item_id: record.id,
          item_name: record.name,
          created_by: record.created_by_name,
        },
      }

      return fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${FCM_SERVER_KEY}`,
        },
        body: JSON.stringify(message),
      })
    })

    await Promise.all(fcmPromises)

    return new Response(
      JSON.stringify({ message: `Sent notifications to ${tokens.length} devices` }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
```

## Step 7: Create Database Trigger

This trigger will automatically call your Edge Function when a new urgent item is inserted.

Run this SQL in Supabase SQL Editor:

```sql
-- Enable the HTTP extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION notify_urgent_item_created()
RETURNS TRIGGER AS $$
DECLARE
  request_id bigint;
  response record;
BEGIN
  -- Call Supabase Edge Function using pg_net
  SELECT
    net.http_post(
      url := 'https://cwpzfsfjrlxekghfyqub.supabase.co/functions/v1/notify-urgent-item',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object('record', row_to_json(NEW))
    ) INTO request_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS on_urgent_item_created ON urgent_items;

-- Create the trigger
CREATE TRIGGER on_urgent_item_created
  AFTER INSERT ON urgent_items
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION notify_urgent_item_created();
```

**Note**: If you get an error about `pg_net`, use this alternative approach:

```sql
-- Alternative: Use supabase_functions.http_request
CREATE OR REPLACE FUNCTION notify_urgent_item_created()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM supabase_functions.http_request(
    url := 'https://cwpzfsfjrlxekghfyqub.supabase.co/functions/v1/notify-urgent-item',
    method := 'POST',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('record', row_to_json(NEW))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Step 8: Test the Setup

1. **Build your app** (locally or via GitHub Actions)
2. **Install on 2 devices** (or use 2 emulators)
3. **Log in** with family members from the same family group
4. **Create an urgent item** on one device
5. **Check the other device** receives a push notification

### Debugging:

Check Edge Function logs:
```bash
supabase functions logs notify-urgent-item --project-ref cwpzfsfjrlxekghfyqub
```

Or in the dashboard:
**Edge Functions** → **notify-urgent-item** → **Logs**

## Complete! 🎉

Once all steps are done, the flow is:

1. User creates urgent item → Saved locally
2. App syncs to Supabase `urgent_items` table
3. Database trigger calls Edge Function
4. Edge Function queries `device_tokens` for family members
5. Edge Function sends FCM push to all family devices
6. Family members receive notification even if app is killed!

## Quick Checklist

- [ ] Supabase anon key added to `.env`
- [ ] GitHub secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` added
- [ ] `device_tokens` table created
- [ ] `urgent_items` table created
- [ ] FCM Server Key added to Edge Function secrets
- [ ] Database trigger created
- [ ] Tested on 2 devices
