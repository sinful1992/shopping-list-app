# Quick Setup - Remove Limits for Your Family

## ⚡ Fastest Method (5 minutes)

### Step 1: Open Firebase Console
1. Go to: https://console.firebase.google.com/
2. Select your project
3. Click **Realtime Database** in the left menu

### Step 2: Find Your Family Group ID
1. In the database tree, expand **familyGroups**
2. You'll see entries like: `-Abc123XyZ` (your family group ID)
3. Click on your family group to see details
4. Verify it's yours by checking the `name` field

### Step 3: Update Subscription Tier
1. Click on the `subscriptionTier` field for your family group
2. Change the value from `"free"` to `"family"` (with quotes)
3. Press **Enter** or click the ✓ checkmark to save

### Step 4: Restart the App
1. Force close the shopping app completely
2. Reopen the app
3. ✅ Done! You now have unlimited everything!

---

## 🎯 What You Get

After setting your family to 'family' tier:

- ✅ **Unlimited Shopping Lists** (was 4)
- ✅ **Unlimited Receipt Scans** (was 1/month)
- ✅ **Unlimited Urgent Items** (was 1/month)
- ✅ **Up to 10 Family Members** (was unlimited)
- ✅ **All Features Unlocked**

**All family members get these benefits automatically!**

---

## 🔍 Can't Find Your Family Group?

### Option A: Check in App
1. Open the app
2. Go to **Settings** or **Family Group** screen
3. Look for your family group ID

### Option B: Check Your User Data
1. In Firebase Database, expand **users**
2. Find your user ID (matches your Firebase Auth UID)
3. Look for the `familyGroupId` field
4. That's your family group ID!

### Option C: Search in Console
1. In Firebase Database, use the search box
2. Search for your email or name
3. Find the associated family group

---

## ❓ Troubleshooting

**Problem:** Changes not taking effect
**Solution:**
- Make sure you saved the changes (click ✓)
- Force close the app completely
- Clear app cache if needed

**Problem:** Don't see familyGroups in database
**Solution:**
- You may not have created a family group yet
- Create one in the app first
- Then come back to update the tier

**Problem:** Multiple family groups
**Solution:**
- Check which one has your user ID in the `members` list
- Update the active one

---

## 🔄 Alternative: Use the Script

If you prefer command line:

```bash
# List all family groups
node scripts/update-family-tier.js --list

# Update your family group to 'family' tier
node scripts/update-family-tier.js YOUR_FAMILY_GROUP_ID family
```

**Note:** Requires Firebase Admin SDK setup (see SUBSCRIPTION_SETUP.md)

---

## ✨ That's It!

Your family now has unlimited access to all features without needing to purchase a subscription.

For more advanced options (admin claims, hardcoding), see **SUBSCRIPTION_SETUP.md**.
