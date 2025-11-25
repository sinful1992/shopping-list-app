# Subscription Setup Guide

This guide explains how to manage subscription tiers and bypass limits for your family group.

---

## 📊 Subscription Tiers Overview

| Tier | Lists | OCR Scans | Urgent Items | Family Members |
|------|-------|-----------|--------------|----------------|
| **Free** | 4 | 1/month | 1/month | Unlimited |
| **Premium** | Unlimited | 20/month | 3/month | Unlimited |
| **Family** | Unlimited | Unlimited | Unlimited | Up to 10 |

---

## 🔧 Option 1: Set Family Group to 'family' Tier (Recommended)

### Step 1: Find Your Family Group ID

1. Open Firebase Console: https://console.firebase.google.com/
2. Select your project
3. Go to **Realtime Database**
4. Navigate to: `/familyGroups/`
5. Find your family group - the ID will be something like: `-NxYz12345AbCdE`

### Step 2: Update Subscription Tier

**Via Firebase Console:**
1. In Firebase Realtime Database
2. Navigate to: `/familyGroups/YOUR_FAMILY_GROUP_ID/`
3. Find the `subscriptionTier` field
4. Change the value from `"free"` to `"family"`
5. Click ✓ to save

**Via Firebase CLI:**
```bash
# Set your family group to 'family' tier
firebase database:set /familyGroups/YOUR_FAMILY_GROUP_ID/subscriptionTier "family"
```

**Via REST API:**
```bash
# Replace YOUR_PROJECT_ID and YOUR_FAMILY_GROUP_ID
curl -X PUT \
  https://YOUR_PROJECT_ID.firebaseio.com/familyGroups/YOUR_FAMILY_GROUP_ID/subscriptionTier.json \
  -d '"family"'
```

### Step 3: Verify Changes

1. Restart the app (force close and reopen)
2. The limits should now show "Unlimited" everywhere
3. All family members will have unlimited access

---

## 🔐 Option 2: Use Firebase Admin Custom Claims (Most Secure)

This method uses Firebase Custom Claims to give admin privileges. Admins bypass ALL limits.

### Prerequisites:
- Firebase Cloud Functions deployed
- Access to Firebase Console

### Setup Steps:

#### Step 1: Deploy Admin Cloud Functions

```bash
cd C:\Users\barku\Documents\shoping
firebase deploy --only functions:initializeFirstAdmin,functions:setAdminClaim
```

#### Step 2: Initialize First Admin

Call the `initializeFirstAdmin` function with your email:

```bash
# Via HTTP request (replace with your actual function URL and email)
curl "https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/initializeFirstAdmin?email=YOUR_EMAIL@example.com"
```

Or visit the URL in your browser:
```
https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/initializeFirstAdmin?email=YOUR_EMAIL@example.com
```

#### Step 3: Sign Out and Back In

**IMPORTANT:** You must sign out and back in to get the new token with admin claim.

1. Open the app
2. Go to Settings → Sign Out
3. Sign back in with your credentials
4. Admin privileges are now active

#### Step 4: Add More Admins (Optional)

Use the `setAdminClaim` function to add more admin users:

```bash
curl -X POST \
  https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/setAdminClaim \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetEmail": "another-admin@example.com",
    "isAdmin": true
  }'
```

---

## 🛠️ Option 3: Hardcode Family Group ID Bypass (Dev Only)

For development/testing, you can hardcode your family group ID in the app.

**File:** `src/services/UsageTracker.ts`

Add this method after `isAdmin()`:

```typescript
/**
 * Check if family group should bypass limits
 * FOR DEVELOPMENT ONLY - Add your family group ID here
 */
private isDevBypass(familyGroupId: string | null): boolean {
  const BYPASS_FAMILY_IDS = [
    'YOUR_FAMILY_GROUP_ID_HERE', // Your family group
  ];
  return familyGroupId ? BYPASS_FAMILY_IDS.includes(familyGroupId) : false;
}
```

Then update each `can*` method to check this:

```typescript
async canCreateList(user: User): Promise<{ allowed: boolean; reason?: string }> {
  // Admin check
  if (await this.isAdmin()) {
    return { allowed: true };
  }

  // Dev bypass check
  if (this.isDevBypass(user.familyGroupId)) {
    return { allowed: true };
  }

  // ... rest of the method
}
```

**⚠️ Warning:** This only works in the app. Cloud Functions will still enforce limits.

---

## 📱 How to Find Your Family Group ID in the App

If you need to find your family group ID from within the app:

1. Open the app
2. Go to **Settings** screen
3. Look for your family group information
4. The ID should be displayed there

Or check in code:

```typescript
import AuthenticationModule from './services/AuthenticationModule';

const user = await AuthenticationModule.getCurrentUser();
console.log('Family Group ID:', user?.familyGroupId);
```

---

## ✅ Verification

After applying any of these methods, verify by:

1. **Check Usage Indicators:**
   - Go to Settings or Subscription screen
   - Verify limits show as "Unlimited"

2. **Test Creating Lists:**
   - Try creating more than 4 shopping lists
   - Should work without prompts

3. **Test OCR:**
   - Scan a receipt
   - Should work without monthly limit warnings

4. **Test Urgent Items:**
   - Create urgent items
   - Should work without limits

---

## 🔄 Reverting Changes

### To Remove Family Tier:
```bash
# Set back to free tier
firebase database:set /familyGroups/YOUR_FAMILY_GROUP_ID/subscriptionTier "free"
```

### To Remove Admin Claims:
```bash
# Call setAdminClaim with isAdmin: false
curl -X POST \
  https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/setAdminClaim \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetEmail": "user@example.com",
    "isAdmin": false
  }'
```

---

## 📊 Current Usage Tracker Logic

The app checks limits in this order:

1. **Admin Custom Claim** → Bypass everything ✅
2. **Family Group Subscription Tier** → Apply tier limits
3. **Monthly Usage Counters** → Track usage within limits

### Where Limits Are Checked:

**Client-Side (UX):**
- `UsageTracker.canCreateList()`
- `UsageTracker.canProcessOCR()`
- `UsageTracker.canCreateUrgentItem()`

**Server-Side (Enforcement):**
- Cloud Functions: `create-list`, `process-ocr`, `create-urgent-item`
- Firebase Database Rules

**⚠️ Important:** Client-side checks are for UX only. Server-side enforcement requires:
- Setting family tier to 'family' in database, OR
- Setting admin custom claim for the user

---

## 🎯 Recommended Approach for Your Family

**Best Option:** Set family group to 'family' tier in Firebase Database

**Why?**
- ✅ Works everywhere (app + Cloud Functions)
- ✅ All family members benefit
- ✅ No code changes needed
- ✅ Easy to manage via Firebase Console
- ✅ Can be reverted anytime

**Steps:**
1. Open Firebase Console → Realtime Database
2. Navigate to `/familyGroups/YOUR_FAMILY_GROUP_ID/subscriptionTier`
3. Change value to `"family"`
4. Save and restart app

Done! 🎉

---

## 📞 Support

If you encounter issues:
1. Check Firebase Console for errors
2. Verify family group ID is correct
3. Ensure you've restarted the app after changes
4. Check Cloud Function logs for server-side errors

For questions about Firebase Custom Claims:
- [Firebase Auth Documentation](https://firebase.google.com/docs/auth/admin/custom-claims)
