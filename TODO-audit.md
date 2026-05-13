# Code Audit — TODO List

_Generated: 2026-05-13_

---

## src/services/BudgetTracker.ts
- [ ] **Currency hardcoded as 'USD'** — `ExpenditureSummary` always returns `currency: 'USD'` on lines 56 and 150 while the entire UI (BudgetScreen, ListDetailScreen shopping header) displays amounts with a `£` symbol. This means the budget API response and the display are structurally inconsistent. Should be driven by a constant or a user/group-level locale setting.
- [ ] `list.totalAmount` is used with `||` operator (`if (list.totalAmount)`) which treats `0` as falsy — a list with a zero total will be counted in `listsWithoutReceipts` incorrectly. Use `!= null` or `?? 0` check instead.

---

## src/services/SyncEngine.ts
- [ ] **`getSyncStatus()` always returns `pendingOperations: 0`** (line 335 — stub value with a comment `// Would query sync queue`). Any UI that reads this field (sync badges, offline warnings) will always show "0 pending" regardless of actual queue depth. Implement the real queue count query.
- [ ] `syncToFirebase` destructures `syncStatus` from `data` using a bare `const { syncStatus, ...dataWithoutSyncStatus } = data` (line 362). If `data` is `null` or `undefined` (e.g., a delete operation with no data), this will throw a runtime TypeError. Add a `data != null` guard before destructuring.

---

## src/services/LocalStorageManager.ts
- [ ] **`clearAllData()` omits `urgent_items`, `category_history`, and `store_layouts` tables** (lines 1802–1817). After a user signs out or deletes their account, these three tables retain data from the previous session. When a different account signs in on the same device, it reads stale data from another user's history — a cross-account data bleed.
- [ ] `saveStoreLayout()` (line 1634) always calls `collection.create()` — it never checks for an existing record. If called twice for the same layout ID it will throw a unique-constraint error. The other save methods (saveList, saveItem) use upsert patterns; this one needs the same treatment.
- [ ] `updateItemsBatch` returns stale pre-update item snapshots (line 518: `updatedItems.push(this.itemModelToType(record))` is called before `database.batch(ops)` resolves). Callers that rely on the returned array will see old field values.
- [ ] `console.log` perf telemetry on lines 205, 524, 570, 629, 941, 1472, 1567, 1768 should use a debug-only logging utility rather than shipping to production builds.

---

## src/services/ItemManager.ts
- [ ] **Concurrency race on rapid double-tap of `toggleItemChecked`** — the function reads current item state with `getItem()`, computes `newCheckedState`, then calls `updateItem()`. If two taps fire within the same DB-read window, both reads return the original state, both compute the same toggled value, and both writes succeed — leaving the item in the wrong final state. Stale state also causes `CategoryHistoryService.recordCategoryUsage` and `PriceHistoryService.recordPrice` to fire twice for the same check-off event. The fix is to hold an in-progress flag per item ID, or use a DB-level transaction/optimistic lock.
- [ ] `addItemsBatch` (line 166) does not set `measurementUnit`, `measurementValue`, or `unitQty` fields — only `ItemManager.addItem` sets them. Batch-imported items (e.g. from receipt scanning) will silently lose those fields. The batch-created `Item` object needs all fields explicitly.

---

## src/services/CategoryHistoryService.ts
- [ ] **`hashItemName` encodes `.` as `_` (line 100), and `syncCategoryHistoryToLocal` / `saveCategoryHistoryBatch` decode by replacing `_` back to `.`** — this is not round-trip safe. An item named `"Dr. Pepper"` hashes to `"Dr_ Pepper"` and decodes back to `"Dr. Pepper"` correctly, but an item named `"Heinz_Beans"` (with a literal underscore) hashes to `"Heinz_Beans"` and then decodes to `"Heinz.Beans"`, corrupting the normalized name in local storage. The encoder must escape underscores before substituting periods, or use a different encoding scheme.
- [ ] `syncCategoryToFirebase` (line 65) is called inside `recordCategoryUsage` which itself is called fire-and-forget from `ItemManager.toggleItemChecked`. A Firebase transaction failure is silently swallowed. While not blocking, there is no retry mechanism — if the device is offline, the Firebase categoryHistory node will diverge from the local WatermelonDB state permanently (the sync listener only writes Firebase → local, never local → Firebase for category counts).

---

## src/services/FirebaseSyncListener.ts
- [ ] **`hashItemName` decode `replace(/_/g, '.')` not round-trip safe** — same issue as `CategoryHistoryService`: `syncCategoryHistoryToLocal` on line 632 decodes `itemHash` using `replace(/_/g, '.')`. Item names containing underscores (e.g., `"bbq_sauce"`) will have their underscores corrupted to dots in local storage on every sync.
- [ ] `startListeningToItems` (line 122): `isCancelled` flag is set on unsubscribe, but the `filteredRef.once('value')` promise is already in flight. If the component unmounts before the promise resolves, the `await LocalStorageManager.saveItemsBatchUpsert(toSync)` on line 167 will still execute because `isCancelled` is only checked before the `getItemsForList` call (line 156), not before the upsert. Add a second `if (isCancelled) return;` check immediately before the upsert.
- [ ] Firebase listeners registered with `.on()` in `startListeningToLists`, `startListeningToUrgentItems`, `startListeningToCategoryHistory`, and `startListeningToStoreLayouts` are async functions but Firebase does not await them. An unhandled rejection inside any of these callbacks will be silently dropped. Wrap each `async (snapshot) =>` body in a try/catch with CrashReporting.

---

## src/services/PriceHistoryService.ts
- [ ] **`suggestionsCache` is never invalidated on family-group switch** — `getSmartSuggestions` caches by `familyGroupId` (line 473) with a 5-minute TTL. If a user switches family groups within a session (possible via admin flows), the old group's store-suggestion data leaks into the new group's view until the TTL expires. `clearSuggestionsCache()` must be called on family-group change.
- [ ] `getMostVolatileItems` (line 327) does not use the dedicated `price_history` table — it re-fetches all completed lists and their items in a nested loop, bypassing the indexed `price_history` table. For users with many completed lists this will be very slow. Should be rewritten to use `LocalStorageManager.getDistinctTrackedItems` + `getPriceHistoryForItem`.
- [ ] `backfillPriceHistory` (lines 154–165) writes all records to Firebase with `database().ref().update(updateMap)` but does not handle the case where the update map has more than 10,000 keys (Firebase `update()` limit per call). For large data sets the call will silently fail or throw. The chunking already applied for writing (line 153: `CHUNK = 500`) is correct but a failure in any chunk is not caught — the `for` loop has no try/catch.

---

## src/services/AuthenticationModule.ts
- [ ] **`joinFamilyGroup` (line 311) adds the user to `memberIds` before verifying the group still exists** — if the group is deleted between steps 1 (read invitation) and 2 (update memberIds), the orphaned `memberIds` write succeeds but the subsequent group read fails. The cleanup logic on lines 337–340 tries to remove the membership, but that second Firebase write may also fail if the group node was deleted with cascading security rules. The join should be a single atomic transaction.
- [ ] `getCurrentUser` (line 375) fetches fresh data from Firebase RTDB on every call. This is called in many tight loops (e.g., `loadListMetadata` in ListDetailScreen which runs on every list subscription update). This causes N unnecessary network round-trips per screen interaction. The result should be cached in memory for a short TTL or read from EncryptedStorage when the Firebase user UID matches the cached UID.
- [ ] `deleteUserAccount` (line 522) deletes urgent items using `Promise.all` with individual `.remove()` calls (lines 603–606) — N+1 Firebase operations. Should use a single multi-path `update()` with null values like the list/item deletion path above.

---

## src/screens/settings/SettingsScreen.tsx
- [ ] **`Clipboard` imported from `react-native` (line 9)** — the `Clipboard` API was removed from React Native core in RN 0.65 and replaced with `@react-native-clipboard/clipboard`. Calling `Clipboard.setString(invitationCode)` on line 129 will throw at runtime on modern RN versions. Replace with the community package.

---

## src/contexts/RevenueCatContext.tsx
- [ ] **Firebase RTDB subscription is torn down and recreated every time `isPurchasing` flips** — the dependency array of the RTDB effect is `[user?.familyGroupId, isPurchasing]` (line 156). Every `setIsPurchasing(true/false)` call tears down and reinstates the `tierRef.on('value', onTierChange)` listener. This causes an unnecessary round-trip (off + on) during purchase/restore flows. Remove `isPurchasing` from the dependency array and handle the `isPurchasing` check inside the callback using a ref.
- [ ] `onTierChange` callback (line 136) references `isPurchasing` from closure — after removing it from the dep array (above fix), this ref must also be converted to a `useRef` to avoid a stale closure bug where the callback always sees `isPurchasing = false`.

---

## src/screens/lists/ListDetailScreen.tsx
- [ ] **`index={0}` hardcoded for every AnimatedItemCard in the unchecked-items drag list** (line 115) — `CategoryItemList` passes a constant `index={0}` to every `AnimatedItemCard`. The `AnimatedItemCard` uses `index` to drive stagger animations (confirmed in AnimatedItemCard.tsx). All items animate identically instead of staggering. Should pass the actual item index within the category group.
- [ ] `handleToggleItem` wraps an async function in `startTransition` (line 636). `startTransition` is designed for synchronous state updates; wrapping async operations is an anti-pattern that can cause the optimistic state to be rolled back unexpectedly mid-await. The optimistic toggle should be separated from the async `ItemManager.toggleItemChecked` call.
- [ ] `loadCurrentUser()` is a fire-and-forget async call without error handling (line 415 — `useEffect(() => { loadCurrentUser(); }, [])`). If `AuthenticationModule.getCurrentUser()` rejects, the error is silently dropped and `currentUserId` remains null, preventing item additions and shopping mode.
- [ ] `SyncEngine.syncPendingChanges()` is called in a `useEffect` that fires on every `isOnline` change (lines 260–266). If the device flickers online/offline rapidly, multiple sync runs can be triggered in parallel. `SyncEngine.processOperationQueue` has a `syncInProgress` guard, but `syncPendingChanges` will still run the queue-fetch and response-shaping code N times needlessly.
- [ ] `showInterstitial()` is called in `performFullCompletion` (line 854) which is a synchronous function called from within an alert `onPress` callback. `showInterstitial` is also called in `performPartialCompletion` (line 877). Both paths can be triggered by the same `handleDoneShopping` call if the user taps "Done" rapidly; the cooldown guard in AdMobContext should prevent double shows, but the `completeShoppingFast` + `createList` race is not guarded — only `isCreatingPartialList` guards `performPartialCompletion`, not the full completion path.
- [ ] The `CategoryItemList` `key` prop (line 1367) is computed by sorting item IDs and joining them — this is O(n log n) on every render and will cause a full remount of the `NestedReorderableList` whenever any item is added or removed. Use a stable key derived from the category name only.

---

## src/contexts/AdMobContext.tsx
- [ ] `setPendingInterstitial` sets an expiry of `Date.now() + 10 * 60 * 1000` (10 minutes) with a hardcoded magic number (line 279). Should be a named constant.
- [ ] `loadInterstitial` and `loadRewarded` (lines 154, 187) are `useCallback` functions with an empty dependency array, but they call `loadInterstitial` and `loadRewarded` recursively (in the `CLOSED` and `ERROR` handlers). This works at runtime because the ref closure captures the latest function reference, but the ESLint exhaustive-deps rule will flag these as missing dependencies. The recursive pattern should be clarified or restructured.

---

## src/services/NotificationManager.ts
- [ ] **`removeFromQueue` in `ImageStorageManager` uses `AsyncStorage` (line 177) but `getUploadQueue` uses `EncryptedStorage` (line 167)** — the write and read use different storage backends, so removed items will reappear on the next read because `EncryptedStorage` still holds the un-removed entry. `removeFromQueue` must use `EncryptedStorage`, not `AsyncStorage`.
- [ ] Foreground notification handler (line 128) shows an `Alert.alert` modal for every incoming push — including background shopping notifications from other family members. This will interrupt any modal or active workflow the user is in. Should use an in-app banner instead of the system Alert.
- [ ] `initializeListeners` (line 126) registers `messaging().onMessage`, `messaging().onNotificationOpenedApp`, and `messaging().onTokenRefresh` listeners but does not return cleanup functions. If the component calling this is unmounted and remounted, duplicate listeners accumulate. The callers must store and call the unsubscribe functions returned by each `messaging().*` call.

---

## src/services/ImageStorageManager.ts
- [ ] **`removeFromQueue` (line 174) writes the updated queue to `AsyncStorage` but `getUploadQueue` (line 166) reads from `EncryptedStorage`** — the queue write/read backends are inconsistent. Queued uploads written to `EncryptedStorage` will never be removed because the removal writes to `AsyncStorage`. Effectively all queued uploads persist forever across sessions.
- [ ] `uploadReceipt` (line 20) updates `LocalStorageManager.updateList` with `receiptUrl: storagePath` (the storage path, not the download URL). However, `getReceiptData` in the same file returns `list.receiptData`, and other callers (e.g. `HistoryTracker.getListDetails`) separately call `ImageStorageManager.getReceiptDownloadUrl(list.receiptUrl)`. The naming is confusing — `receiptUrl` stores a path not a URL. This mismatch should at least be documented, and the field ideally renamed to `receiptStoragePath`.

---

## src/services/AnalyticsService.ts
- [ ] `getAnalyticsSummary` and `calculateMonthlyTrend` both call `ItemManager.getItemsForList` in a `for` loop over all completed lists — this is an N+1 query pattern. For a user with 100 completed lists this will issue 200 sequential DB queries. Use `LocalStorageManager.getItemsForLists(listIds)` (the batch method already exists) and compute the same aggregations in memory.
- [ ] `categoryBreakdown` percentage calculation (line 156) divides by `totalSpent` which may be `0` if no items have prices — produces `NaN` percentages that will silently corrupt the UI.
- [ ] `getAnalyticsSummary` catch block (line 172) re-throws the error — calling code in `AnalyticsScreen.tsx` should handle this, but the catch block's re-throw pattern (`throw error`) means it is functionally equivalent to having no try/catch at all, wasting the wrapping.

---

## src/services/BudgetAlertService.ts
- [ ] Budget settings are stored in `AsyncStorage` keyed by `familyGroupId` but are NOT cleared when the user switches family groups or logs out. Joining a new family group with the same ID as a previous group would load stale budget limits silently. Should clear on sign-out alongside `LocalStorageManager.clearAllData()`.
- [ ] `checkBudget` uses a rolling-window approach (`Date.now() - 30 * 24 * 60 * 60 * 1000`) rather than the actual calendar month or week. A user who sets a monthly budget at the end of January will see the last 30 days of spending, not January's spending. Should align to calendar month/week boundaries.

---

## src/services/PricePredictionService.ts
- [ ] **Prediction cache is never cleared on family-group switch** — `predictionCache` and `cacheTimestamps` are keyed by `familyGroupId`, but after a sign-out and sign-in with a different account that happens to be in the same family group, the cached predictions from the previous session persist (the in-memory map is module-level). `invalidateCache` is never called on sign-out in any auth flow. `clearAllCaches()` must be called on logout.
- [ ] `calculatePredictions` calls `ShoppingListManager.getAllLists(familyGroupId)` (not `getActiveLists`) and then filters in JS. This loads all lists including completed and deleted ones from local DB unnecessarily — use `getCompletedLists` directly.

---

## src/services/UsageTracker.ts
- [ ] `checkAndResetIfNeeded` compares months (line 62) but this is client-side only. If the user's device clock is incorrect or set to a past date, the monthly reset will be skipped indefinitely. The reset should be authoritative server-side (Cloud Function) with the client only reading the counter, not resetting it.
- [ ] `canCreateList` is documented as "client-side UX check only" (line 84 comment) — the actual enforcement is in Cloud Functions. However, the usage counter is incremented client-side via `incrementListCounter` (line 147 — a Firebase transaction). If the Cloud Function rejects the create, the counter is already incremented. Should move counter increment after confirmed server-side success.

---

## src/hooks/useSettings.ts
- [ ] `loadFamilyMembers` (line 130) fires N parallel Firebase RTDB reads (`Promise.all`) — one per family member UID. For a large family group this is an N-way fan-out. Should use a single Firebase query or the `once('value')` on the family group's members node.
- [ ] `loadSettingsData` (line 93) silently swallows all errors in its outer `catch {}` block (line 123). If the user's family group data fails to load (network error, permission denied), the settings screen will silently show empty state with no feedback to the user.
- [ ] `updateName` (line 142) does not update the `EncryptedStorage` user cache — so `AuthenticationModule.getCurrentUser()` will return the old display name until the next Firebase RTDB event fires the `onAuthStateChanged` listener that overwrites the cache. The fix is to call `EncryptedStorage.setItem(USER_KEY, ...)` after the RTDB update.

---

## src/screens/lists/HomeScreen.tsx
- [ ] `loadInitialData` directly writes `familyGroupId: null` to the Firebase RTDB user node (line 64) when the family group is not found — bypassing `AuthenticationModule` entirely, leaving `EncryptedStorage` user cache stale (it still has the old `familyGroupId`). Should go through `AuthenticationModule` to keep caches consistent.
- [ ] List name is generated using `toLocaleDateString('en-US', ...)` (line 140) regardless of device locale. On a UK device set to `en-GB`, the list name format will still use US locale month-day-year ordering. Use device locale or a consistent ISO format.

---

## src/screens/auth/FamilyGroupScreen.tsx
- [ ] **`completeJoinAfterApproval` error is silently swallowed** (lines 91–95) — if `completeJoinAfterApproval` or `refreshUserData` throws, the catch block is empty and the user stays on the "approved" screen with no indication of failure. The `refreshUserData` failure is suppressed with the comment "triggers onAuthStateChanged which navigates" — but this is only true if `refreshUserData` succeeds. Add explicit error handling.
- [ ] `handleCancelRequest` (line 111) calls `AuthenticationModule.cancelJoinRequest` and catches errors silently (`.catch(() => {})`). If the cancellation fails while the user navigates away, the stale join request remains in Firebase and will appear in the group admin's join-requests list indefinitely.

---

## src/screens/budget/BudgetScreen.tsx
- [ ] Budget amounts are displayed with `£` currency symbol hardcoded in the JSX (line 80: `£${item.totalAmount.toFixed(2)}`). This contradicts `BudgetTracker` returning `currency: 'USD'` and also hardcodes the locale. All monetary displays should derive their currency symbol from a shared constant or locale setting.

---

## src/services/ReceiptOCRService.ts / src/services/ReceiptCaptureModule.ts
- [ ] These files were not individually reviewed in depth during this audit pass but should be flagged: `ReceiptCaptureModule` exposes camera permissions flow — verify that `PermissionsAndroid.request` results are checked before accessing the camera, and that the module gracefully handles `DENIED` vs `NEVER_ASK_AGAIN` on Android 13+.

---

## src/services/SearchService.ts
- [ ] (Not reviewed in full) — flag for follow-up: verify that search queries are sanitized before being used in WatermelonDB `Q.where` string comparisons to prevent injection of query operators.

---

## Cross-cutting / Architecture Issues

### No issues found in these files (clean)
`src/styles/theme.ts`, `src/utils/safeJsonParse.ts`, `src/utils/sanitize.ts`, `src/utils/errors.ts`, `src/utils/validation.ts`, `src/services/CrashReporting.ts`, `src/services/CategoryService.ts`, `src/services/StoreLayoutService.ts`, `src/services/ArchiveService.ts`, `src/services/HistoryTracker.ts`, `src/contexts/AlertContext.tsx`, `src/i18n/`, `src/database/schema.ts`, `src/database/migrations/`

### Global concerns
- [ ] **`console.log` performance telemetry throughout production code** (`saveListsBatch`, `saveItemsBatch`, `updateItemsBatch`, `saveUrgentItemsBatch`, `saveCategoryHistoryBatch`, `savePriceHistoryBatch`, `saveStoreLayoutsBatch`) — these fire on every sync and will spam production logs. Gate behind `__DEV__` or remove.
- [ ] **No currency abstraction** — the `£` pound sign is hardcoded across at least 8 separate JSX files (ListDetailScreen, BudgetScreen, BudgetAlertService) while `BudgetTracker` returns `currency: 'USD'`. There is no single source of truth for the app's display currency. Create a `formatCurrency(amount: number)` utility that reads from a locale/settings constant.
- [ ] **`AsyncStorage` and `EncryptedStorage` mixed without clear policy** — budget settings, store history, haptic preference, OCR URL, and prediction cache use `AsyncStorage` (unencrypted); FCM tokens and user data use `EncryptedStorage`. The upload queue is read from `EncryptedStorage` but written to `AsyncStorage` in one code path (a bug, covered above). Establish and document a clear policy: sensitive data → `EncryptedStorage`, non-sensitive preferences → `AsyncStorage`.
