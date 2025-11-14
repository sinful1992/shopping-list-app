# Supabase Edge Function Setup for Urgent Items Push Notifications

This guide explains how to set up the Supabase Edge Function that sends FCM push notifications when urgent items are created.

## Prerequisites

1. Supabase project set up
2. Firebase Cloud Messaging (FCM) server key from Firebase Console
3. Supabase CLI installed (`npm install -g supabase`)

## Step 1: Create Device Tokens Table in Supabase

Run this SQL in your Supabase SQL Editor:

```sql
-- Create device_tokens table to store FCM tokens
CREATE TABLE device_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  family_group_id TEXT NOT NULL,
  fcm_token TEXT NOT NULL,
  platform TEXT NOT NULL, -- 'android' or 'ios'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, fcm_token)
);

-- Create index for faster queries
CREATE INDEX idx_device_tokens_family_group ON device_tokens(family_group_id);
CREATE INDEX idx_device_tokens_user ON device_tokens(user_id);

-- Enable Row Level Security
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust based on your auth setup)
CREATE POLICY "Users can insert their own tokens"
  ON device_tokens FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own tokens"
  ON device_tokens FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete their own tokens"
  ON device_tokens FOR DELETE
  USING (true);

CREATE POLICY "Users can read tokens in their family group"
  ON device_tokens FOR SELECT
  USING (true);
```

## Step 2: Create Urgent Items Table in Supabase

```sql
-- Create urgent_items table in Supabase for syncing
CREATE TABLE urgent_items (
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
CREATE INDEX idx_urgent_items_family_group ON urgent_items(family_group_id);
CREATE INDEX idx_urgent_items_status ON urgent_items(status);

-- Enable Row Level Security
ALTER TABLE urgent_items ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read urgent items in their family group"
  ON urgent_items FOR SELECT
  USING (true);

CREATE POLICY "Users can insert urgent items"
  ON urgent_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update urgent items in their family group"
  ON urgent_items FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete urgent items in their family group"
  ON urgent_items FOR DELETE
  USING (true);
```

## Step 3: Create Edge Function

Initialize Supabase in your project (if not already done):

```bash
cd C:\Users\barku\Documents\shoping
supabase init
```

Create the Edge Function:

```bash
supabase functions new notify-urgent-item
```

Replace the content of `supabase/functions/notify-urgent-item/index.ts` with:

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

## Step 4: Set up Environment Variables

Create a `.env` file in `supabase/functions/`:

```bash
FCM_SERVER_KEY=your_firebase_server_key_here
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Get FCM Server Key from:
1. Go to Firebase Console > Project Settings > Cloud Messaging
2. Copy the "Server key" (Legacy)

## Step 5: Create Database Trigger

Run this SQL to trigger the Edge Function when urgent items are created:

```sql
-- Create trigger function
CREATE OR REPLACE FUNCTION notify_urgent_item_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Call Supabase Edge Function
  PERFORM net.http_post(
    url := 'https://your-project-ref.supabase.co/functions/v1/notify-urgent-item',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object('record', row_to_json(NEW))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER on_urgent_item_created
  AFTER INSERT ON urgent_items
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION notify_urgent_item_created();
```

## Step 6: Deploy Edge Function

```bash
supabase functions deploy notify-urgent-item --no-verify-jwt
```

## Step 7: Update App to Store FCM Tokens in Supabase

You'll need to create an API endpoint or update the `NotificationManager.ts` to send FCM tokens to Supabase:

```typescript
// In NotificationManager.ts, update registerToken method:
async registerToken(userId: string, familyGroupId: string): Promise<void> {
  try {
    const token = await this.getFCMToken();
    if (!token) {
      return;
    }

    // Send to Supabase
    const response = await fetch('https://your-project-ref.supabase.co/rest/v1/device_tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'your_supabase_anon_key',
        'Authorization': 'Bearer your_supabase_anon_key',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        user_id: userId,
        family_group_id: familyGroupId,
        fcm_token: token,
        platform: Platform.OS
      })
    });

    if (!response.ok) {
      throw new Error('Failed to register token');
    }
  } catch (error) {
    console.error('Error registering FCM token:', error);
  }
}
```

## Testing

1. Create a new urgent item using the app
2. The urgent_items record will be inserted into Supabase
3. The trigger will call the Edge Function
4. The Edge Function will send FCM notifications to all family members
5. Family members will receive push notifications even if the app is killed

## Troubleshooting

- Check Edge Function logs: `supabase functions logs notify-urgent-item`
- Verify FCM Server Key is correct
- Ensure device tokens are being saved to Supabase
- Check Firebase Console for FCM delivery status
- Verify notification permissions are granted on devices
