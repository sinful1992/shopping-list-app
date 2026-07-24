# Codebase Improvement Plan

*Audit date: 2026-07-11 · v1.30.4 · branch `dev`*

Baseline health: typecheck **clean**, eslint **11 warnings / 0 errors**, knip **clean**,
jest **81/81 passing** (7 suites, needs `--forceExit`). 129 source files, ~30k lines.
The codebase is in good shape overall — this plan targets the remaining structural debt,
type-safety escapes, missing user-facing behaviour, and test/accessibility gaps.

---

## Priority 1 — User-visible gaps (bugs in behaviour, not code style)

### 1.1 Notification taps do nothing (`src/services/NotificationManager.ts:146-157`)
`onNotificationOpenedApp` and `getInitialNotification` are TODO stubs. A user who taps an
urgent-item push notification lands on whatever screen was last open — the notification
is a dead end. Implement navigation to UrgentItemsScreen via a navigation ref
(App.tsx already owns the NavigationContainer).
**Effort:** small · `feat(nav)` · needs AVD + physical-device validation (FCM is device-only).

### 1.2 Silent sync failures (`src/screens/lists/ListDetailScreen.tsx:174`)
When reconnect-sync fails (`failedCount > 0`) nothing is shown; queued offline edits can
silently stay unsynced forever. Add the planned failure banner with a retry action, and
surface `SyncEngine.getStatus().pendingOperations` somewhere discoverable.
**Effort:** medium · `feat(sync)`.

### 1.3 `getCurrentUser()` — network read on every call, cache written but never read (`src/services/AuthenticationModule.ts:325-345`)
Every call does a fresh RTDB `get(/users/{uid})`; there are **16 call sites** (most run
per-screen-mount). The EncryptedStorage `@user` cache is written in 5 places but **never
read** — dead writes. Worse, any failure (e.g. offline with cold RTDB cache) hits
`catch { return null }`, so screens conclude "no user" while offline.
Fix in two steps:
1. Make `getCurrentUser()` fall back to the EncryptedStorage cache on failure instead of
   returning null; report the error to CrashReporting instead of swallowing it.
2. Introduce a `UserProvider` context holding one `onValue(/users/{uid})` subscription;
   migrate screens/hooks off ad-hoc `getCurrentUser()` calls. Kills 16 redundant network
   round-trips and the per-screen loading jank.
**Effort:** step 1 small, step 2 medium · `fix(auth)` then `refactor(auth)`.

### 1.4 Foreground notifications use raw `Alert.alert` (`NotificationManager.ts:138`)
Everything else uses the themed CustomAlert via AlertContext. Route foreground
notifications through the same path (or a toast) for consistency.
**Effort:** small · `style(ui)`.

---

## Priority 2 — Structural refactors (the two remaining oversized modules)

### 2.1 ListDetailScreen hook extraction (1,498 lines) — *already on the backlog*
Largest file in the app: ~25 state hooks + ~10 refs + subscriptions + debounced qty
writes + shopping-mode logic in one component. Extract, in this order (each step
shippable, screen behaviour unchanged):
1. `useListSubscriptions(listId)` — WatermelonDB list/item observers, NetInfo, Firebase
   items listener, optimistic-qty merge (lines ~217-390).
2. `useQuantityEditor()` — optimisticQtyRef + per-item debounce timers + unmount flush.
3. `useShoppingMode()` — lock state, running total / checked counts, store picker.
4. `useListModals()` — the activeModal discriminated union + handlers.
Follow the LocalStorageManager playbook: characterization behaviour first, then move.
**Effort:** large (split over several commits) · `refactor(ui)` · AVD validation required
(reorder drag, rapid qty taps, offline toggle — the flows past bugs lived in).

### 2.2 FirebaseSyncListener mapper extraction (889 lines)
Firebase→model field mapping (`data.name || ''`, `data.createdAt ?? Date.now()`, …31
default-fallback expressions) is duplicated between each entity's initial `get()` load
and its `syncXToLocal()` handler — a new ShoppingList field must be added in 2+ places
or the paths drift (this class of bug has bitten before). Extract
`src/services/storage/firebaseMappers.ts` with `mapFirebaseList / mapFirebaseItem /
mapFirebaseUrgentItem / …`, used by both paths, and unit-test the mappers directly
(nullable fields, missing fields, legacy records). This also eliminates most of the
file's 11 `any`s by typing the raw Firebase payload shapes.
**Effort:** medium · `refactor(sync)` + `test(sync)`.

### 2.3 (Optional, later) ReceiptMatchScreen (941) / ReceiptViewScreen (720)
Same disease, smaller dose. Only worth it when receipts work is next touched.

---

## Priority 3 — Type safety (187 `any`-family hits in src)

### 3.1 `Item.category: string` → `CategoryType` (`src/models/types.ts:105`)
Root cause of the repeated `CategoryService.getCategory(item.category as any)` cast in
6+ components. Either narrow the model field to `CategoryType | null` or widen
`getCategory` to accept `string` and validate internally (safer — Firebase data isn't
guaranteed to hold a valid enum). Prefer the latter.
**Effort:** small · `refactor(types)`.

### 3.2 `QueuedOperation.data: any` (`types.ts:185`)
Make it a discriminated union keyed on `entityType`; removes the `(operation.data as
any)?.updatedAt` casts in SyncEngine (`SyncEngine.ts:132,253`) and makes conflict
resolution checkable.
**Effort:** small-medium · `refactor(types)`.

### 3.3 Typed Firebase payloads
Falls out of 2.2 — declare `FirebaseListPayload` etc. once in the mappers module.
Clears most `any`s in `storage/items.ts` (12), `storage/history.ts` (11),
`HistoryTracker.ts` (9), `storage/lists.ts` (10).

---

## Priority 4 — Testing (7 suites for 129 files)

Current tests cover storage characterization, sync conflict resolution, deleteList,
category history, receipt matching. **Zero hook, component, or screen tests.** Highest
value additions, in order:
1. **Firebase mappers** (after 2.2) — pure functions, trivial to test, guard the sync
   boundary where past bugs lived.
2. **`useShoppingLists` merge/pending logic** (`mergeWithPendingLists`, optimistic
   create/delete rollback) — extract the merge as a pure function and test it; the
   2s MIN_PENDING_AGE window logic is untested.
3. **Extracted ListDetail hooks** (after 2.1) — especially the qty debounce/flush.
4. **`calculateShoppingStats`** — extract from ListDetailScreen as a pure function
   (checked-only total was bug 1.30.2; pin it with a test).
5. Add `coverageThreshold` to jest.config.js once the above lands, and wire
   `--coverage` into the CI verify job so it can't regress.

Also: **fix the jest open-handle leak** (`--forceExit` currently required). Run
`npx jest --detectOpenHandles`, add proper teardown (likely a WatermelonDB/LokiJS or
timer handle), then drop `--forceExit` from the workflow and memory notes.
**Effort:** medium, incremental · `test(...)` commits.

---

## Priority 5 — Accessibility (near-zero today)

**3 `accessibilityLabel`s in the entire app** (2 files). For a shipped Play Store app
this is the weakest user-facing area of the codebase. Do one focused pass:
- Icon-only `TouchableOpacity`s (FAB, header buttons, item check circles, qty +/-,
  modal close buttons) → `accessibilityLabel` + `accessibilityRole="button"`.
- Checkable items → `accessibilityState={{ checked }}`.
- Modals → `accessibilityViewIsModal`, focus management.
- Verify with TalkBack on the AVD.
**Effort:** medium (mechanical but wide) · `feat(ui)` or `fix(ui)` per screen.

---

## Priority 6 — Cleanup & polish (small, batchable)

| Item | Where | Note |
|---|---|---|
| Empty catches swallow errors | `AnalyticsScreen.tsx:89,175`, `AuthenticationModule.ts:342` | route to `CrashReporting.recordError` |
| Legacy price-history read path | `PriceHistoryService.ts:191` TODO | check if `priceHistoryBackfillDone_v1` has fully propagated; then delete `getFromCompletedListsLegacy` |
| Backfill sunset plan | `hoistedFieldsBackfill.ts`, `receiptSyncBackfill.ts` | same pattern: confirm propagation, then remove |
| ArchiveService in-memory filtering | `ArchiveService.ts:61,81` TODOs | add `archived` DB queries when archived-list UI is built — leave until then |
| Lint to zero warnings | App.tsx exhaustive-deps ×2 + inline styles; supabase fns `no-div-regex` ×7 | mostly `--fix`-able; the two deps warnings need real review |
| Interstitial retry duplicated | `ListDetailScreen.tsx:364-375` vs AdMobContext retry logic | move retry into `showInterstitial()` itself |
| `ocr-test-results/` tracked in git | repo root (56K) | decide: fixtures (keep, move under `__tests__/fixtures`) or scratch (gitignore) |
| `shrinkResources false` | `android/app/build.gradle:68` | proguard already on; enabling shrink cuts APK size — needs a release-build device validation pass, do alongside next release |

---

## Explicitly out of scope (considered, rejected for now)

- **i18n extraction** — app is deliberately en-GB single-locale; premature.
- **State-management library** — the WatermelonDB-observer + context pattern works and
  was recently stabilized; don't churn it.
- **Skew/tilt OCR preprocessing** — previously attempted and reverted; do not re-attempt.
- **More screen splits beyond 2.1/2.3** — remaining screens (~600-700 lines with styles
  already extracted) are within reason.

---

## Suggested sequencing

Each phase = one `dev`-branch batch, merged to `master` only after tests green + AVD validation.

| Phase | Contents | Version bump |
|---|---|---|
| 1 | 1.1 notification nav, 1.2 sync banner, 1.3 step-1 cache fallback, 1.4, P6 empty catches | 1.31.0 (feat) |
| 2 | 2.2 Firebase mappers + tests, 3.3 typed payloads, jest open-handle fix | 1.31.x |
| 3 | 2.1 ListDetail hook extraction (multi-commit), 4.3/4.4 tests | 1.32.0 |
| 4 | 1.3 step-2 UserProvider, 3.1/3.2 type fixes | 1.32.x |
| 5 | 5 accessibility pass | 1.33.0 |
| 6 | P6 leftovers + lint-zero + coverage threshold in CI | 1.33.x |
