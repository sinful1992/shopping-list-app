# Urgent Items Feature - Implementation Summary

## Overview
The urgent items feature allows family members to create standalone urgent item requests that immediately notify all family members via push notifications. This is separate from regular shopping lists and designed for immediate needs like "we need milk now!"

## What's Been Implemented

### 1. Database & Models ✅
- **Schema Version**: Updated from v2 to v3
- **New Table**: `urgent_items` with fields:
  - id, name, family_group_id
  - created_by, created_by_name, created_at
  - resolved_by, resolved_by_name, resolved_at
  - price (optional), status, sync_status
- **Model**: `UrgentItemModel` in `src/database/models/UrgentItem.ts`
- **Types**: Added `UrgentItem` and `UrgentItemStatus` to `src/models/types.ts`
- **Entity Type**: Updated to include 'urgentItem' for sync engine

### 2. Services ✅

#### LocalStorageManager
- `saveUrgentItem()` - Create/update urgent item
- `getUrgentItem()` - Get by ID
- `getActiveUrgentItems()` - Get active items for family
- `getResolvedUrgentItems()` - Get resolved items with date filtering
- `getAllUrgentItems()` - Get all items (active + resolved)
- `updateUrgentItem()` - Update item properties
- `deleteUrgentItem()` - Delete item

#### UrgentItemManager (`src/services/UrgentItemManager.ts`)
- `createUrgentItem()` - Create new urgent item, trigger sync/notification
- `getActiveUrgentItems()` - Get active items
- `getResolvedUrgentItems()` - Get resolved items
- `getAllUrgentItems()` - Get all items
- `resolveUrgentItem()` - Mark item as picked up with optional price
- `updateUrgentItem()` - Update item
- `deleteUrgentItem()` - Delete item
- `subscribeToUrgentItems()` - Real-time subscription

#### NotificationManager (`src/services/NotificationManager.ts`)
- `requestPermissions()` - Request notification permissions (Android 13+)
- `getFCMToken()` - Get device FCM token
- `registerToken()` - Register token with Supabase (stores locally for now)
- `initializeListeners()` - Set up FCM message handlers
- `createNotificationChannel()` - Android notification channel setup
- `clearToken()` - Clear token on logout

#### BudgetTracker
- **Updated** to include resolved urgent items in:
  - `calculateExpenditureForDateRange()` - Adds urgent item prices to totals
  - `getExpenditureByMember()` - Includes items resolved by specific user

### 3. UI Components ✅

#### UrgentItemsScreen (`src/screens/urgent/UrgentItemsScreen.tsx`)
- **Active Items Section**: Shows urgent items needing attention
  - Red/orange gradient background
  - Fire emoji (🔥) icon
  - Shows creator name and time ago
  - "Mark Done" button
- **Resolved Items Section**: Shows completed urgent items
  - Green tint background
  - Checkmark (✓) icon
  - Shows creator, resolver, and price
- **Floating Action Button**: Fire emoji (🔥) to create new urgent item
- **Create Modal**: Input item name, sends notification to family
- **Resolve Modal**: Mark as done, optionally add price

#### Navigation (`App.tsx`)
- Added "Urgent" tab to bottom navigation
- Icon: Flame icon
- Position: Between Lists and Budget tabs
- FCM initialization on app start

### 4. Push Notifications ✅

#### Dependencies Installed
- `@react-native-firebase/messaging@^19.0.0`
- Android permission: `POST_NOTIFICATIONS` in AndroidManifest.xml

#### FCM Setup
- Token registration on user login
- Foreground notification handler (shows alert)
- Background notification handler
- Notification tap handler (navigation)
- Token refresh handler

#### Supabase Edge Function (Setup Guide Created)
- **File**: `supabase_edge_function_setup.md`
- **Tables**: `device_tokens`, `urgent_items`
- **Function**: `notify-urgent-item` - Sends FCM push to all family members
- **Trigger**: Database trigger on urgent_items insert
- **Message Format**:
  ```
  Title: "🔥 Urgent: {item_name} needed!"
  Body: "{user_name} needs this right away"
  Priority: High
  Channel: urgent_items
  ```

## What Needs to Be Done (Next Steps)

### 1. Supabase Setup (Manual)
1. Create Supabase account/project (if not already)
2. Run SQL to create `device_tokens` and `urgent_items` tables
3. Set up Supabase Edge Function `notify-urgent-item`
4. Configure FCM Server Key in Edge Function environment
5. Create database trigger to call Edge Function

### 2. Update NotificationManager to Send Tokens to Supabase
Currently, `NotificationManager.registerToken()` only stores tokens locally. You need to:
1. Update it to call Supabase REST API
2. Send FCM token + user ID + family group ID to `device_tokens` table
3. Get Supabase URL and anon key from environment

### 3. Update SyncEngine to Sync Urgent Items
The SyncEngine currently handles 'list' and 'item' entities. You need to:
1. Add 'urgentItem' handling to `SyncEngine.pushChange()`
2. Sync urgent items to Supabase `urgent_items` table
3. Pull remote urgent item changes

### 4. Testing
1. Test creating urgent item (should notify family)
2. Test resolving item with/without price
3. Test budget calculations including urgent items
4. Test notifications in foreground/background/killed states
5. Test with multiple family members

### 5. Optional Enhancements
- Add badge count to Urgent tab showing active item count
- Add ability to edit urgent item name
- Add ability to delete urgent items (admin only?)
- Add notification sound customization
- Add urgency levels (urgent vs very urgent)

## Files Created/Modified

### New Files
- `src/database/models/UrgentItem.ts`
- `src/services/UrgentItemManager.ts`
- `src/services/NotificationManager.ts`
- `src/screens/urgent/UrgentItemsScreen.tsx`
- `supabase_edge_function_setup.md`
- `URGENT_ITEMS_IMPLEMENTATION.md` (this file)

### Modified Files
- `src/models/types.ts` - Added UrgentItem types
- `src/database/schema.ts` - Added urgent_items table, version 3
- `src/services/LocalStorageManager.ts` - Added urgent item methods
- `src/services/BudgetTracker.ts` - Integrated urgent items in calculations
- `App.tsx` - Added Urgent tab, FCM initialization
- `android/app/src/main/AndroidManifest.xml` - Added POST_NOTIFICATIONS permission
- `package.json` - Added @react-native-firebase/messaging

## Architecture Highlights

### Offline-First
Urgent items follow the same offline-first pattern as shopping lists:
1. Save locally first
2. Trigger sync to Supabase
3. Supabase Edge Function sends FCM notifications
4. All devices receive push, then pull latest data

### True Push Notifications
Unlike the flawed approach of using local notifications + Firebase listeners, this implementation uses:
- **FCM (Firebase Cloud Messaging)** for true push notifications
- **Supabase Edge Functions** as the backend (100% free, no Firebase Blaze plan needed)
- Works even when app is force-killed

### Budget Integration
Resolved urgent items with prices are automatically included in:
- Monthly spending totals
- Per-member spending calculations
- Budget reports and charts

## Example User Flow

1. **Sarah** needs milk urgently
2. Opens app → Urgent tab → Taps 🔥 button
3. Types "Milk" → "Create & Notify"
4. App saves locally, syncs to Supabase
5. Supabase Edge Function triggered
6. **John** and **Emma** receive push notification: "🔥 Urgent: Milk needed!"
7. **John** opens app → Urgent tab → Sees "Milk" with fire icon
8. John picks up milk for £2.50
9. Taps "Mark Done" → Enters price → "Done"
10. Item moves to "Resolved" section
11. Shows: "Milk • Added by Sarah • Picked up by John • £2.50"
12. Budget automatically updated to include £2.50 spending

## Next Actions for User

1. **Complete Supabase Setup** (follow `supabase_edge_function_setup.md`)
2. **Update NotificationManager** to send tokens to Supabase
3. **Update SyncEngine** to sync urgent items to Supabase
4. **Test** the feature end-to-end
5. **Optional**: Add badge count to Urgent tab icon

## Notes

- Database schema version bumped to v3 (WatermelonDB will auto-migrate)
- FCM requires `google-services.json` in `android/app/` (already present)
- Notification permissions auto-requested on app start
- Fire emoji (🔥) used consistently throughout UI
- Red/orange color scheme (#FF6B35) for urgent items
- Green color scheme (#30D158) for resolved items
