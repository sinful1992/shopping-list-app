# Firebase Cloud Messaging V1 API Setup

Firebase has deprecated the legacy API. We're using the new V1 API instead.

## Step 1: Get Firebase Service Account JSON

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project
3. Go to **Project Settings** (gear icon) → **Cloud Messaging** tab
4. Under "Firebase Cloud Messaging API (V1)", click **"Manage service accounts"**
5. This opens Google Cloud Console
6. You'll see a service account like: `firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com`
7. Click the **3 dots** (⋮) on the right → **Manage keys**
8. Click **Add Key** → **Create new key**
9. Choose **JSON** format
10. Click **Create**
11. A JSON file will download (keep it safe!)

The JSON file looks like this:
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  ...
}
```

## Step 2: Add Service Account to Supabase Edge Function

You need to add the entire JSON file as a secret.

### Option A: Using Supabase CLI (Recommended)

```bash
# First, save the JSON content to a file (if not already downloaded)
# Then set it as a secret (the entire JSON content)

supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat path/to/your-service-account.json)" --project-ref cwpzfsfjrlxekghfyqub
```

### Option B: Using Supabase Dashboard

1. Go to Supabase Dashboard
2. Navigate to **Edge Functions** → **notify-urgent-item** → **Settings**
3. Click **Add Secret**
4. Name: `FIREBASE_SERVICE_ACCOUNT`
5. Value: Paste the **entire JSON content** from the file
   - Make sure it's valid JSON
   - Include the curly braces { }
   - Don't add extra quotes around it

## Step 3: Verify Secrets Are Set

Check that your Edge Function has these secrets:

```bash
supabase secrets list --project-ref cwpzfsfjrlxekghfyqub
```

You should see:
- `FIREBASE_SERVICE_ACCOUNT`
- `SUPABASE_URL` (auto-set)
- `SUPABASE_SERVICE_ROLE_KEY` (auto-set)

## Step 4: Deploy Updated Edge Function

The Edge Function code has been updated to use V1 API. Deploy it:

```bash
supabase functions deploy notify-urgent-item --project-ref cwpzfsfjrlxekghfyqub --no-verify-jwt
```

Or upload via Dashboard:
1. Go to **Edge Functions** → **notify-urgent-item**
2. Upload the file: `supabase/functions/notify-urgent-item/index.ts`
3. Click **Deploy**

## Step 5: Enable Firebase Cloud Messaging API (V1)

1. Go back to Firebase Console → **Project Settings** → **Cloud Messaging**
2. Under "Firebase Cloud Messaging API (V1)", make sure it says **"Enabled"**
3. If it says "Disabled", click **Enable**

## What Changed?

### Old (Legacy) API:
- Used Server Key
- Endpoint: `https://fcm.googleapis.com/fcm/send`
- Header: `Authorization: key=SERVER_KEY`
- ❌ Deprecated (will stop working)

### New (V1) API:
- Uses Service Account JSON + OAuth2
- Endpoint: `https://fcm.googleapis.com/v1/projects/PROJECT_ID/messages:send`
- Header: `Authorization: Bearer ACCESS_TOKEN`
- ✅ Recommended, modern, supported

## How the V1 API Works

1. Edge Function loads service account JSON from environment
2. Creates a JWT (JSON Web Token) signed with private key
3. Exchanges JWT for OAuth2 access token
4. Uses access token to send FCM messages
5. Access token is cached for 1 hour

## Testing

After deploying, test by creating an urgent item in your app.

Check Edge Function logs:
```bash
supabase functions logs notify-urgent-item --project-ref cwpzfsfjrlxekghfyqub
```

You should see:
- "Sent notifications to X devices"
- No errors about invalid credentials

## Troubleshooting

### Error: "Invalid service account"
- Check that FIREBASE_SERVICE_ACCOUNT is valid JSON
- Verify the service account has FCM permissions

### Error: "Project not found"
- Make sure the project_id in the JSON matches your Firebase project
- Verify the service account is from the correct project

### Error: "Permission denied"
- The service account needs the role: "Firebase Cloud Messaging Admin"
- Go to Google Cloud Console → IAM → Grant role to the service account

### No notifications received
1. Check Edge Function logs for errors
2. Verify device tokens are in Supabase device_tokens table
3. Check that FCM V1 API is enabled in Firebase Console
4. Test FCM token validity using Firebase Console → Cloud Messaging → Send test message

## Summary

| What | Where to Get It | Where to Put It |
|------|-----------------|-----------------|
| Service Account JSON | Firebase Console → Cloud Messaging → Manage service accounts | Supabase Edge Function secret: `FIREBASE_SERVICE_ACCOUNT` |
| Project ID | Inside the JSON file (`project_id` field) | Auto-used by Edge Function |

That's it! The V1 API is more secure and won't be deprecated.
