# Supabase Real-Time Setup

## Installation

The Supabase real-time sync requires the `@supabase/supabase-js` package.

### Install the package:

```bash
npm install @supabase/supabase-js
```

## What It Does

The `SupabaseSyncListener` service provides real-time synchronization for urgent items:

1. **Listens to Supabase Realtime** - Subscribes to INSERT, UPDATE, DELETE events on the `urgent_items` table
2. **Auto-syncs to Local DB** - When Supabase data changes, automatically updates local WatermelonDB
3. **True Real-Time** - Changes propagate instantly across all devices in the family group
4. **No Polling** - Event-driven architecture (no battery drain)

## Architecture

```
User A creates urgent item
    ↓
Supabase Database (via UrgentItemManager.syncToSupabase)
    ↓
Supabase Realtime (postgres_changes event)
    ↓
SupabaseSyncListener.syncUrgentItemToLocal()
    ↓
WatermelonDB (LocalStorageManager.saveUrgentItem)
    ↓
WatermelonDB Observer (observeActiveUrgentItems)
    ↓
User B's UI updates instantly (UrgentItemsScreen)
```

## Usage

The real-time sync is automatically enabled in `UrgentItemsScreen`:

```typescript
// Step 1: Listen to Supabase for remote changes
const unsubscribeSupabase = SupabaseSyncListener.startListeningToUrgentItems(
  familyGroupId
);

// Step 2: Subscribe to local WatermelonDB changes (triggered by Supabase or local edits)
const unsubscribeLocal = UrgentItemManager.subscribeToUrgentItems(
  familyGroupId,
  (updatedItems) => {
    setActiveItems(updatedItems);
  }
);

// Cleanup
return () => {
  unsubscribeSupabase();
  unsubscribeLocal();
};
```

## Configuration

Make sure your `.env` file has the correct Supabase credentials:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

## Benefits

✅ **Instant notifications** - Family members see urgent items immediately
✅ **Battery efficient** - No continuous polling
✅ **Offline support** - Changes sync when connection is restored
✅ **Real-time updates** - See when someone resolves an urgent item instantly

## Troubleshooting

If real-time sync isn't working:

1. **Check Supabase credentials** - Verify `.env` file has correct values
2. **Check Supabase Realtime is enabled** - Go to Supabase dashboard → Database → Replication
3. **Check console logs** - Look for "Supabase channel status" messages
4. **Verify Row Level Security (RLS)** - Make sure policies allow SELECT for family group members

## Related Files

- `src/services/SupabaseSyncListener.ts` - Supabase real-time listener service
- `src/services/UrgentItemManager.ts` - Urgent items manager (uses observers)
- `src/screens/urgent/UrgentItemsScreen.tsx` - UI with real-time subscriptions
- `src/services/LocalStorageManager.ts` - WatermelonDB observer methods
