# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [1.33.0] - 2026-07-22

### Added
- **Server: `notify-receipt-scanned` edge function.** Sends a push notification to the rest of the family group when a member applies a quick-scanned receipt — "🧾 {name} just bought N items" with the store and total in the body, and the completed list's id in the data payload for deep-linking. Same hardening as `notify-shopping-started`: Firebase ID-token verification, caller-must-be-shopper check, group-membership check, per-user rate limit, stale-token cleanup. Auto-deployed via the existing edge-functions workflow.

## [1.32.4] - 2026-07-17

### Fixed
- **Skipping a quick-scan import now discards the list.** After confirming a scan, pressing Skip on the match screen (including the no-receipt-data / no-line-items states) left an empty active list with the receipt attached. In the quick-scan flow the list exists only for that receipt, so Skip now deletes it; the regular match-from-list flow is unaffected.

## [1.32.3] - 2026-07-17

### Fixed
- **Quick scan now completes the shopping trip.** Applying a scanned receipt added the items (checked) but left the list active, so a fully recognised receipt never reached History. Apply in the quick-scan flow now marks the list completed (with completer and receipt total already attached at confirm time).

## [1.32.2] - 2026-07-17

### Fixed
- **Cancelling a quick scan no longer leaves an empty list behind.** The camera button created the list before the camera even opened, so backing out of the capture (or a failed capture, or the ad gate) orphaned an empty list on Home. The list is now created only when the scanned receipt is confirmed.

## [1.32.1] - 2026-07-17

### Fixed
- **OCR confidence no longer shows 100% on arithmetically wrong parses.** Confidence was scored purely on field presence, so a parse with the wrong total (e.g. from a skewed photo shifting the price column) could still read "Confidence 100%". The score now mirrors the OCR server's completeness gate — line items net of discounts must sum to the printed total — and is capped at 50% ("please verify" territory) when the arithmetic doesn't hold.

## [1.32.0] - 2026-07-13

### Added
- **Check-off now animates in place.** Previously the checkmark pop played only after the card had already teleported to the Completed section (usually off-screen), so tapping a checkbox looked like the row just vanished. The card now flips to its checked look (checkmark pop, strikethrough, dim) immediately under your finger, and moves to Completed 400ms later. Unchecking stays instant. A rapid second tap during the animation is ignored (the toggle is already in flight). Follow-up TODO: soften the remaining section move with a layout transition.

## [1.31.1] - 2026-07-13

### Fixed
- **Checked items no longer replay the checkmark pop on remount.** The check animation ran in the card's mount effect, so every already-checked card re-popped whenever the Completed section rebuilt (re-entering the screen, sync updates). The animation now only plays on an actual check-state change.

## [1.31.0] - 2026-07-12

### Added
- **Notification taps now navigate to the Urgent tab.** Urgent-item pushes are routed through React Navigation's deep-linking config (`familyshoppinglist://urgent`), covering both quit-state and background taps. Foreground notifications show the themed in-app alert instead of the raw system alert.
- **Sync status banner on Home and List screens.** Unsynced offline edits are no longer invisible: the banner shows "N changes waiting to sync" while offline and "N changes not synced · Retry" once back online.
- **Accessibility pass.** Icon-only buttons across all screens gained labels, checkboxes announce their checked state, and modals are announced as modal to screen readers.

### Fixed
- **Offline no longer looks logged-out.** `getCurrentUser` falls back to the cached user when the network read fails (guarding against a stale cache from a different uid) and reports errors to Crashlytics instead of swallowing them.
- **Duplicate FCM listeners.** `initializeListeners` never unsubscribed, so effect re-runs stacked `onMessage` handlers; it now returns a cleanup.
- **Stale running total.** The shopping-mode total was computed against the previous price predictions; predictions are now passed explicitly.

### Changed
- **UserContext distributes the app's live user state** — screens read the user from context instead of issuing per-mount network reads (14 of 16 call sites migrated).
- **ListDetailScreen restructured** via four extracted hooks (`useShoppingMode`, `useListSubscriptions`, `useQuantityEditor`, `useListModals`); Firebase payload defaulting single-sourced in typed mappers; `getCategory` widened to `string` and `QueuedOperation` made a discriminated union.
- **Release builds strip unused resources** (`shrinkResources`).
- **CI workflow** runs typecheck, lint, and tests with a coverage gate on every push/PR.

## [1.30.4] - 2026-07-10

### Fixed
- **Settings screen bottom content hidden behind Android navigation buttons.** With edge-to-edge rendering (targetSdk 36) the app draws under the transparent system nav bar, but the settings ScrollView had no bottom safe-area inset — the Delete Account button and footer sat permanently behind the nav buttons. The scroll content now pads by the bottom inset. The Edit Name and OCR Server URL modals also gained `KeyboardAvoidingView`, so their input and Save/Cancel buttons stay visible while typing.

## [1.30.3] - 2026-07-10

### Fixed
- **Receipt match double-counted multi-quantity items.** Applying a receipt match wrote the receipt line **total** into `Item.price`, but `Item.price` is per-unit everywhere else (item cards, running total, and history all multiply by `unitQty`) — so an item with quantity 2 showed double its real cost. The match screen now derives a per-unit price when the list item's quantity is above 1: it prefers the receipt's unit price, falling back to dividing the line total by the receipt quantity (or the list quantity if the receipt has none). Single-quantity items are unchanged.

## [1.30.2] - 2026-07-10

### Fixed
- **Running total counted items you never bought.** The shopping-mode total summed *all* items, substituting a predicted price (from price history) for anything unpriced — so an unchecked leftover item (e.g. the original of a receipt line you added as a new item because matching failed) silently inflated the total past the printed receipt. The total now counts checked items only; predicted prices still fill in for checked items without a real price. This also fixes the stored trip total on "Done shopping", which previously baked in predicted prices of unbought items.

## [1.30.1] - 2026-07-10

### Changed
- **Batch item add/update no longer blocks on network sync.** `ItemManager.addItemsBatch`/`updateItemsBatch` now fire their per-item Firebase pushes in the background (same fire-and-forget pattern `updateItem` already used) instead of awaiting one round trip per item. Applying a long receipt (20+ items) previously held the "Apply/Done" spinner for the duration of ~30 sequentialish network writes; the screen now closes as soon as the local batch transaction lands. Failed pushes still land in the sync queue for retry, unchanged.

## [1.30.0] - 2026-07-10

### Added
- **Select all / Deselect all toggle for unmatched receipt items.** The receipt match screen's "Unmatched receipt items" section now has a bulk toggle at the top, so long receipts (20+ new items) no longer require tapping '+' on every row. Works from any entry point (previously only the Home-screen scan path pre-selected everything via `autoAddAll`).

## [1.29.14] - 2026-07-03

### Changed
- **Storage split complete — store-layouts extracted, LocalStorageManager is now a pure facade.** 6 store-layout methods + model mapper moved verbatim into `src/services/storage/storeLayouts.ts` (`StoreLayoutsStorage`). `LocalStorageManager` is down from 1,879 lines (pre-split) to 333: it owns the singleton DB handle, `executeTransaction`, `clearAllData`, and one-line delegations to 6 domain modules (`lists`, `items`, `syncQueue`, `urgentItems`, `history`, `storeLayouts`) sharing that handle. Zero call-site changes anywhere in the app; full suite 81/81 green. Pending AVD sync validation before merge to master.

## [1.29.13] - 2026-07-03

### Changed
- **Storage split step 6/6 (domains) — history extracted.** Category-history (5 methods + model mapper) and price-history (5 methods) moved verbatim into `src/services/storage/history.ts` (`HistoryStorage`). Existing `saveCategoryHistoryBatch` regression tests stay green against the unchanged facade API.

## [1.29.12] - 2026-07-03

### Changed
- **Storage split step 5/6 — urgent-items domain extracted.** 10 methods (urgent-item CRUD, batch upsert with `hasUrgentItemChanged` no-op guard, active/resolved observers) moved verbatim into `src/services/storage/urgentItems.ts` (`UrgentItemsStorage`). Facade API unchanged.

## [1.29.11] - 2026-07-03

### Changed
- **Storage split step 4/6 — sync-queue domain extracted.** `addToSyncQueue`/`getSyncQueue`/`removeFromSyncQueue`/`updateSyncQueueOperation`/`clearSyncQueue` + `markSyncedIfUnchanged` moved verbatim into `src/services/storage/syncQueue.ts` (`SyncQueueStorage`). Facade API unchanged; queue behavior pinned by the 1.29.7 characterization tests.

## [1.29.10] - 2026-07-03

### Changed
- **Storage split step 3/6 — items domain extracted.** 11 methods (item CRUD, `saveItemsBatch`/`saveItemsBatchUpsert`/`deleteItemsBatch`, `observeItemsForList`) moved verbatim into `src/services/storage/items.ts` (`ItemsStorage`). The upsert LWW guard + tombstone resurrection stay pinned by the 1.29.7 characterization tests, which run against the facade unchanged.

## [1.29.9] - 2026-07-03

### Changed
- **Storage split step 2/6 — lists domain extracted.** 15 methods (list CRUD, completed-list queries, receipt data, expenditure queries, `observeAllLists`/`observeList`) moved verbatim into `src/services/storage/lists.ts` (`ListsStorage`, shares the DB handle). `LocalStorageManager` delegates; public API unchanged.

## [1.29.8] - 2026-07-03

### Changed
- **Storage split step 1/6 — core extracted.** `src/services/storage/database.ts` now owns WatermelonDB construction (`createDatabase()`), and `src/services/storage/mappers.ts` owns the pure model↔type mappers (`applyListCreate/FullUpdate`, `applyItemCreate/FullUpdate`, `listModelToType`, `itemModelToType`, `urgentItemModelToType`, `hasListChanged`). `LocalStorageManager` API unchanged (−167 lines); behavior pinned by the 1.29.7 characterization tests.

## [1.29.7] - 2026-07-03

### Added
- Characterization tests for `LocalStorageManager`'s sync-critical paths (20 tests, in-memory LokiJS): `saveItemsBatchUpsert` last-write-wins guard (strictly-newer local record wins; equal timestamps apply the incoming write), tombstone resurrection after `deleteItem`/`deleteItemsBatch`, sync-queue FIFO ordering + corrupt-entry skipping + retry-field updates, and `markSyncedIfUnchanged` conditional marking. Written ahead of the storage-domain split so behavior is pinned before any code moves. Also pins a pre-existing quirk: `getItem` (`collection.find`) still serves a cached soft-deleted record while query-based reads exclude it.

## [1.29.6] - 2026-07-02

### Changed
- Extracted `CategoryItemList` + `DraggableItemRow` from `ListDetailScreen` into `src/components/CategoryItemList.tsx` (screen now 1,494 lines, from 1,627 at the start of this pass). Deeper decomposition (sync/observer hooks) deliberately deferred: the drag-reorder and sync paths are the app's twice-broken, device-validated hot spots and shouldn't be restructured without an AVD pass.

## [1.29.5] - 2026-07-02

### Changed
- `HomeScreen` renders lists with `FlatList` (virtualized) instead of `ScrollView` + `.map()`.

## [1.29.4] - 2026-07-02

### Changed
- `HomeScreen` no longer writes to Firebase RTDB directly — the "family group deleted" cleanup moved into `AuthenticationModule.clearFamilyGroupReference()`. It was the only place a screen bypassed the service layer.

## [1.29.3] - 2026-07-02

### Changed
- **`AnimatedItemCard` owns its styles.** The card took 16 style props from `ListDetailScreen` despite already having a theme hook; the styles moved inside (net −90 lines) and the checkbox ✓ became a themed Ionicons checkmark. `CategoryItemList` lost its now-unused `styles: any` prop.

## [1.29.2] - 2026-07-02

### Added
- **Receipt data now renders as a thermal receipt** — new `ReceiptCard` component with SVG serrated top/bottom edges, dashed rules (`ReceiptRule`), and monospaced "print" (`RECEIPT_FONT`: Menlo/monospace) for merchant, items and prices. The TOTAL moved below the item list behind a dashed rule, the way a till prints it. This is the app's signature visual — reserved for receipt/cost breakdowns.

## [1.29.1] - 2026-07-02

### Changed
- **UI control emoji replaced with Ionicons across 15 files** — close (✕), save/cancel (✔️/✖️), edit (✏️), delete (🗑), checkmarks, status-bar icons (🛒/🔒/✅/📡), expand chevrons (▼/▲), calendar (📅), camera (📷), receipt (📄), store (🏪), history/stats (📊), time (🕐), warning (⚠️ in ErrorBoundary), and the suggestion bulb (💡). Emoji render differently per Android vendor and can't take theme colors. **Deliberately kept as emoji (content, not controls):** category icons (🥬🥛…), role avatars, the urgent screen's 🔥 identity, notification message text, and inline-sentence emphasis (e.g. "⚠️ Low confidence…").

## [1.29.0] - 2026-07-02

### Added
- **Receipt scanning gets its own visible button** — a small camera FAB above the main one. Scanning was only reachable via an undiscoverable long-press with a permanent "Hold to scan receipt" hint caption; the hint is gone, the long-press still works, and the main FAB's `+` is now a real icon (optically centered) instead of a text glyph.

## [1.28.5] - 2026-07-02

### Changed
- **Dates unified to en-GB via a shared `src/utils/date.ts`** (`formatDateLong` "Tue, 1 Jul 2026", `formatDateShort` "01/07/2026", `formatDateTime`). Replaces en-US strings in HomeScreen list names/date button ("Jul 1" → "1 Jul"), the hand-rolled DD/MM/YYYY in HomeScreen, the device-locale-dependent dates in BudgetScreen/ReceiptViewScreen, and the analytics month labels.

## [1.28.4] - 2026-07-02

### Changed
- **List sync status is now a cloud icon instead of a bare colored dot** (`cloud-done` / `cloud-upload-outline` / `cloud-offline-outline`, themed via `theme.sync`). The dot communicated by color alone — colorblind-hostile and unexplained. `AnimatedListCard` takes `syncStatus` instead of a raw `syncColor`.

## [1.28.3] - 2026-07-02

### Changed
- **All money text now uses tabular (fixed-width) numerals** via a shared `NUMERIC` style token (`fontVariant: ['tabular-nums']`): item prices and totals in list/history/receipt/budget/analytics/subscription screens. Digit columns align vertically and totals no longer shift width as values change.

## [1.28.2] - 2026-07-02

### Changed
- **Raised secondary/tertiary text contrast.** Dark theme: secondary 45%→65% white, tertiary 30%→45%, dim 20%→25%; light theme: secondary 55%→70%, tertiary 40%→50%, dim 25%→30%. The old tertiary/dim values failed WCAG small-text contrast on the app backgrounds (e.g. the 11px FAB hint was near-invisible in bright light). `dim` is now documented as disabled/placeholder-only.

## [1.28.1] - 2026-07-02

### Fixed
- **Light theme showed dark-theme colors in several places.** Sync-status dot colors were hardcoded dark-theme hexes in `HomeScreen`; the completed-list card tint, shopping badge background, and `AnimatedItemCard` measurement colors were hardcoded rgba/hex too. Added semantic theme tokens (`theme.sync.synced/pending/failed`, `accent.greenSubtle`, `accent.orangeDim`) with proper light-theme values and switched all four call sites over. Removed dead `scanButton*` styles from `HomeScreen.styles`.

## [1.28.0] - 2026-07-02

### Added
- **Store detection now covers the full retailer set the OCR server recognises** (17 chains: Asda, Aldi, Morrisons, Waitrose, Costco, Iceland, Spar, Nisa, Booths, Budgens, Londis, One Stop, M&S added to the existing Tesco/Lidl/Sainsbury's/Co-op). Previously anything outside the original four collapsed to `'other'`. `ReceiptData['store']` widened to the new `ReceiptStoreSlug` union; the mapping mirrors `_KNOWN_RETAILERS` in the receipt-ocr repo.

## [1.27.3] - 2026-07-02

### Fixed
- **OCR server health check could hang forever.** RN's `fetch` has no default timeout, so a dead/unreachable OCR server left the settings-screen health probe spinning indefinitely. Now aborts after 10s.

### Changed
- OCR requests send an `X-OCR-Key` header. The server (receipt-ocr repo) enforces it only when its `OCR_SHARED_SECRET` env var is set to the matching value — set `OCR_SHARED_SECRET=fsl-ocr-7f3d9a2e8b514c06` as a secret on the HF Space to close the public `/ocr` endpoint to drive-by use. Until then the header is ignored and nothing changes.
- `currency` default extracted to a named `DEFAULT_CURRENCY` constant.

## [1.27.2] - 2026-07-02

### Fixed
- **"Try again" (retry OCR) failed for any receipt already uploaded to Cloud Storage.** `ImageStorageManager.uploadReceipt` overwrites the list's `receiptUrl` with the Storage path (`receipts/{group}/{list}/…jpg`), and `ReceiptOCRService.retryOCR` fed that path straight into the OCR upload as if it were a local file — the form part had nothing to read, so the request always failed. Retry now detects a Storage path and downloads the image back to the local cache (`storage writeToFile` → `CACHES_DIRECTORY/ocr-retry-{listId}.jpg`) before re-running OCR. Not reproducible on the AVD (free tier has no Storage bucket — receipt uploads are device-only), which is why it survived emulator validation.

## [1.27.1] - 2026-07-01

### Fixed
- **Google Sign-In failed on every attempt** with `[auth/unknown] Exception in HostFunction: accessToken cannot be empty`. `AuthenticationModule.signInWithGoogle` built the Firebase credential with `auth.GoogleAuthProvider.credential(idToken)` — no `accessToken`. RNFB's `OAuthCredential` resolves the native bridge's secret slot to `''` (empty string, not `null`) when `accessToken` is omitted (`OAuthCredential.ts` → `resolveOAuthBridgeFields`), and that empty string is passed straight to the native `GoogleAuthProvider.getCredential(idToken, accessToken)` call, which the current firebase-auth Android SDK rejects as empty rather than tolerating it. Fixed by fetching the real access token via `GoogleSignin.getTokens()` and passing both to the credential. **Device-validated on AVD** — Google Sign-In confirmed working end-to-end.

## [1.27.0] - 2026-06-30

### Changed
- **Upgraded React Native 0.85.2 → 0.86.0** and the `@react-native/*` toolchain in lockstep: `babel-preset`, `metro-config`, `eslint-config`, `typescript-config`, `gradle-plugin`, and `jest-preset` all → `^0.86.0`. `react` stays `19.2.3` (RN 0.86 peer is `^19.2.3`); `@react-native-community/cli*` stay `^20.2.0` (latest, RN-aligned).
  - **No native template changes required.** The official `rn-diff-purge` `0.85.2..0.86.0` upgrade-helper diff touches **only `package.json`** — every Android template file (`build.gradle`, `app/build.gradle`, `settings.gradle`, `gradle.properties`, `gradle-wrapper.properties`, `MainApplication.java`, `MainActivity.java`) is unchanged between the two releases, so the repo's native customizations were left untouched. The app stays on Java (template did not migrate to Kotlin) and on Gradle 8.13 / AGP 8.6.0 / Kotlin 2.1.20.
  - **Clean reinstall** regenerated `node_modules` + `package-lock.json` at 0.86.0 — this sidesteps the `@react-native/virtualized-lists@0.85.2` exact-pin that blocked an in-place bump (the blocker noted in 1.26.0's "Deferred" section). `@react-native/jest-preset` was **kept** (RN 0.86 template dropped it, but `jest.config.js` references `preset: '@react-native/jest-preset'` — removing it would break the suite).
  - **patch-package:** both patches re-apply cleanly against the 0.86 tree — `react-native-reorderable-list@0.18.0` ✔ and `react-native-svg@15.15.4` ✔ (both libs are version-pinned and unchanged by the RN bump).
  - **Peer-dep compatibility (verified, no coordinated bumps needed):** `react-native-reanimated@4.5.0` and `react-native-worklets@0.10.0` both declare `react-native: "0.83 - 0.86"` (0.86 is the upper bound, supported); `gesture-handler@2.32`, `@react-native-firebase/*@25`, `screens@4.25`, `safe-area-context@5.8`, `svg@15.15`, `reorderable-list@0.18` all accept RN 0.86.
  - **babel chain preserved:** `babel-plugin-react-compiler` (target 19) remains **first**, `react-native-worklets/plugin` remains **last** — unchanged by the babel-preset bump.
  - **JS gates green:** `tsc --noEmit` clean, **61/61** jest tests pass, `eslint .` 0 errors (11 pre-existing warnings).
  - **NOT device-validated** — pending owner AVD build (`assembleDebug`/`installDebug`), New-Arch launch check, logcat sweep, and drag-to-reorder re-test on `ListDetailScreen` (reanimated + native bump + compiler interaction).

## [1.26.1] - 2026-06-30

### Fixed
- **Deleted lists no longer reappear as stale "active" ghosts on devices that were offline at delete time.** `ShoppingListManager.deleteList` was soft-deleting locally (`status='deleted'`) but syncing the delete to Firebase as a **hard node removal** (`SyncEngine.pushChange('list', id, 'delete')` → `remove()`). A device that was closed/offline during the delete missed the live `onChildRemoved` event, and the cold-start list load is upsert-only — it cannot prune a locally-present list that is absent from the Firebase snapshot — so the deleted list lingered as an `active` ghost forever (e.g. one device showing 2 lists while another showed 1). Delete is now soft on Firebase too: it writes `status='deleted'` to the node (kept as a tombstone), mirroring `markListAsCompleted`, so every device — online or returning from offline — reconciles it on the next load. The `onChildRemoved` handler is retained for backward-compat with older clients still doing hard removes. Added a regression test asserting `deleteList` pushes an `update` (status=deleted) and never a hard `delete` op. (Surfaced during 1.26.0 device validation.)

## [1.26.0] - 2026-06-30

### Device validation (AVD, 2026-06-30) — React Compiler
React Compiler (1.26.0) was validated on a Pixel 6 AVD (Android 14 image). `installDebug` built and installed clean; the app launched on the New Architecture (Bridgeless ReactHost + Fabric JNI + TurboModule), Metro bundled all 2511 modules through the compiler transform without error, and the app ran the entire session on a single process with no crash/restart. A full logcat sweep was empty (no FATAL / native crash / worklet / reanimated error). Confirmed working at runtime under the compiler:
- **List reorder drag on `ListDetailScreen`** (highest-risk path) — long-press drag-to-reorder swapped two items in a category, then back again, both directions clean with no worklet/reanimated error. The reanimated-4.5 reorderable-list flow patched in 1.25.15 is unaffected by the stacked compiler memoization.
- **Home (Shopping Lists), `ListDetailScreen` (categorized + completed sections), Analytics (SVG stat cards / sub-tabs), and the item details + delete-confirm modals** all mount and render correctly.
- Pre-existing dev-only noise (RevenueCat test-key config error, RNFirebase namespaced-API deprecation warning) is unrelated to the compiler.


### Added
- **React Compiler enabled** (`babel-plugin-react-compiler@1.0.0`, exact-pinned) for automatic memoization across all components. Build-time only — no new runtime dependency: React 19.2.3 ships the compiler runtime (`react/compiler-runtime`), so no `react-compiler-runtime` polyfill is required.
  - **babel wiring:** added as the **first** plugin in `babel.config.js` with `{ target: '19' }`; `react-native-worklets/plugin` remains **last** (reanimated requirement). Verified the transform emits the `react/compiler-runtime` memo-cache for a sample component.
  - **Mode:** global (`'all'`) — the compiler attempts every component and conservatively **bails** (skips, leaving code untouched) on any it can't prove safe, so it cannot emit incorrect output.
  - **Readiness:** `react-compiler-healthcheck` compiled 30/30 sampled components, found **no incompatible libraries** (reanimated 4.5 / worklets 0.10 are compatible) and no StrictMode. A full pass of the `eslint-plugin-react-hooks@7` compiler diagnostics surfaced 55 advisory findings — all resolve to per-component bailouts, none to miscompilation. The 6 in the behavior-sensitive categories were reviewed: 4 `preserve-manual-memoization` are explicit "Compilation Skipped" (manual memo retained untouched), and 2 `purity` (`Date.now()`) trigger bailouts (one is in an async handler, not render). No source changes were required.
  - Verified at the JS layer: tsc clean, 60/60 tests, `eslint .` 0 errors. ✅ Device-validated on AVD 2026-06-30 (see "Device validation" above).

### Device validation (AVD, 2026-06-29)
The native-dependency batch (1.25.10–1.25.14) was validated on a Pixel 6 AVD (Android 16 image). `assembleDebug` + `installDebug` build clean, app launches on the New Architecture (Fabric), and a full logcat error sweep was empty (no FATAL / native crash / worklet error). Confirmed working at runtime:
- **firebase 25** — auth session restored, RTDB lists synced and rendered, crashlytics native crash handler initialized, analytics + crashlytics collection enabled.
- **reanimated 4.5 / worklets 0.10 / gesture-handler 2.32** — `ListDetailScreen` (host of the `react-native-reorderable-list` panGesture) mounts, scrolls, and re-renders cleanly. Manual drag-reorder testing **surfaced a real regression** under reanimated 4.5 (crash + cards left hidden) — **fixed via a library patch** in 1.25.15 below; reorder now works correctly (up/down, all rows, data persists). Worklet-driven UI otherwise healthy.
- **purchases 10.4** — SDK initializes, offerings API call returns 304 (auth/network OK), CustomerInfo cache works. The `[RevenueCat] Error fetching offerings` toast is a benign dashboard config message (Test Store key, no test products registered) — not a regression.
- **targetSdk 36 edge-to-edge** — status bar and bottom tab bar render correctly, no clipped/overlapping UI.
- Native minors (screens 4.25, safe-area 5.8, async-storage 3.1) — exercised implicitly by the rendered nav/list UI.

Not testable on the AVD (environmental, physical-device only): FCM push delivery, Firebase Storage (free-tier has no bucket), App Check attestation (needs console). These remain open.

### Deferred (tracked, not yet applied)
- **React Native 0.86 — deferred to a dedicated session.** The npm bump alone does not resolve cleanly: `@react-native/virtualized-lists@0.85.2` (a transitive dep of RN) pins `react-native@"0.85.2"` exactly, so 0.86 needs a clean `node_modules` reinstall, not an in-place bump. It also requires the native `android/` template diff (gradle plugin / build files via the RN upgrade-helper) plus a real build — none verifiable from the test suite. Highest blast radius of the pending upgrades; do it on its own branch with a build in the loop.
- **gesture-handler 3 — blocked upstream** (see 1.25.12): `react-native-reorderable-list@0.18.0` is not GH3-compatible.
- **`react-native-google-mobile-ads` 16.4 — blocked by project Kotlin version** (see 1.25.14): 16.4.0 pulls `play-services-ads 25.4.0`, compiled with Kotlin metadata 2.3.0, but the project is on Kotlin 2.1.20 → `:react-native-google-mobile-ads:compileDebugKotlin` fails. Revisit when the project's Kotlin is raised to 2.3.x (couples to the RN 0.86 upgrade).

## [1.25.16] - 2026-06-29

### Fixed
- **`brace-expansion` override broke ESLint (regression from 1.25.09 batch)** — the override had been pinned to an exact `5.0.6`, which forced an API-incompatible major into `@eslint/config-array`'s bundled `minimatch` (it calls the older `expand()` default-export signature). Result: `npx eslint .` crashed with `TypeError: expand is not a function`, failing the pre-push hook and the CI verify job's lint step. Reverted the override to `^2.0.2` (master's value) — still resolves the brace-expansion ReDoS (CVE-2025-5889, fixed in 2.0.2) and restores the export shape ESLint expects. Verified: `eslint .` exits 0 (0 errors), `npm audit` shows 0 high/0 critical (6 moderate dev-tooling, accepted), tsc clean, 60/60 tests.

## [1.25.15] - 2026-06-29

### Fixed
- **List item reorder broken under reanimated 4.5 (regression from 1.25.13)** — dragging an item to reorder it threw `TypeError: Cannot read property 'id' of undefined` (red box + surface reload), and dragging downward left cards hidden until the screen was remounted. Root cause traced via on-device debug logging: on drop, `react-native-reorderable-list@0.18.0`'s `withTiming` completion callback fires **twice** under reanimated 4.5 / worklets 0.10's worklet scheduling; the second fire runs with `draggedIndex` already reset to `-1`, so the library's internal `reorder(-1, …)` calls `markCells(-1, …)` → `keyExtractor(data[-1])` = `undefined`, corrupting cell animation bookkeeping. The data was always correct; only the library's animation state was left stuck (hence "remount heals it").
  - **Fix:** patched `react-native-reorderable-list@0.18.0` (`reorder()` now early-returns on a negative `fromIndex`/`toIndex`), persisted via `patch-package`. This keeps reanimated **4.5** (no revert) and is a one-line guard at the source of the spurious event. Verified on the Pixel 6 AVD: 3/3 drags log only valid reorders, zero `from=-1` fires, zero `undefined` keyExtractor calls, items stay visible and land in the correct order.
  - The repo's existing `react-native-reorderable-list` patch (the Android `Gesture.Simultaneous` duplicate-handler crash fix, commit 877fd01) was regenerated in patch-package 8's current format alongside this change; both hunks now live in one patch file. No behavior change to the Android fix.

## [1.25.14] - 2026-06-29

### Reverted
- **`react-native-google-mobile-ads` 16.4.0 → 16.3.3** (back to pre-1.25.10 version). The 16.4.0 bump dragged in `play-services-ads 25.4.0`, which is compiled with Kotlin metadata 2.3.0 while the project's Kotlin compiler is 2.1.20 — the Android build fails at `compileDebugKotlin` with "Module was compiled with an incompatible version of Kotlin". Surfaced only by an actual device build (passed tsc + tests). 16.3.3 is known-good and builds clean (`assembleDebug` SUCCESSFUL). See Deferred note above.

## [1.25.13] - 2026-06-28

### Changed
- **`react-native-reanimated` 4.3 → 4.5** with **`react-native-worklets` 0.8 → 0.10** (bumped together — reanimated 4.5 peer-requires worklets 0.10.x). Both dedupe cleanly across reanimated and reorderable-list; babel already wires `react-native-worklets/plugin`. tsc clean, 60 tests pass.
  - ⚠️ **NEEDS DEVICE VALIDATION** — native modules + worklets runtime. Verify reorder animations, charts, and any reanimated-driven UI on a device.

## [1.25.12] - 2026-06-28

### Changed
- **`react-native-gesture-handler` 2.31.1 → 2.32.0** (minor). tsc clean, 60 tests pass.
  - ⚠️ **NEEDS DEVICE VALIDATION** — native module.

### Notes
- **gesture-handler 3 deferred (blocked upstream).** v3 introduces an incompatible `PanGesture` type that clashes with `react-native-reorderable-list@0.18.0` (the app's list-reorder dependency, used in `ListDetailScreen`'s `panGesture` prop). 0.18.0 is the latest reorderable-list and is still built against gesture-handler 2; there is no GH3-compatible release. Revisit when reorderable-list ships GH3 support.

## [1.25.11] - 2026-06-28

### Changed
- **`@react-native-firebase/*` 24 → 25.1.0** (all 8 modules in lockstep: app, analytics, app-check, auth, crashlytics, database, messaging, storage; app-check kept exact-pinned). Typecheck is clean against the v25 typed API (no removed-API breakage at the JS layer) and all 60 tests pass.
  - ⚠️ **NEEDS DEVICE VALIDATION** — bumps the native Firebase Android SDK. Verify auth, RTDB sync, messaging/FCM, crashlytics, storage, and App Check attestation on an AVD/device before merging.

## [1.25.10] - 2026-06-28

### Changed
- **Native dependency minor/patch bumps** — `react-native-screens` 4.24→4.25.2, `react-native-safe-area-context` 5.7→5.8, `react-native-google-mobile-ads` 16.3.3→16.4, `react-native-purchases(-ui)` 10.0.1→10.4, `@react-native-async-storage/async-storage` 3.0.2→3.1.1. (`react-native-svg` held at 15.15.4 to keep its pinned patch valid.)
  - ⚠️ **NEEDS DEVICE VALIDATION** — native modules; verified at JS level (tsc + 60 tests) only. Run an AVD/device build before merging to master.

## [1.25.9] - 2026-06-28

### Changed
- **`targetSdkVersion` 35 → 36** (compileSdk was already 36) to get ahead of Google Play's API 36 targeting deadline (~Aug 2026). Opts into Android 16 behaviour changes (edge-to-edge enforcement, etc.) — requires on-device validation before release.
- **Renamed `patches/react-native-svg+15.15.0.patch` → `+15.15.4.patch`** to match the installed version. The patch content was already applying to 15.15.4; the stale filename only produced a version-mismatch warning on every install, now silenced.
- **`firebase-admin` 12 → 14** (Node maintenance scripts in `scripts/` only — not in the app bundle). Cleared part of the moderate-severity transitive tree.
- **`@babel/*` bumped to 7.29.7** (patch within babel 7). Held at babel 7 deliberately: `@react-native/babel-preset` depends on `@babel/core ^7.25.2` and dozens of `@babel/plugin-* ^7.x`, so babel 8 would break Metro transforms.
- **Pinned `brace-expansion` override to `5.0.6`** (was `^2.0.2`, which didn't cover the vulnerable 5.x line under `minimatch`). brace-expansion's API is a single stable `expand()` export, so forcing one version everywhere is safe. Cleared the brace-expansion DoS advisory.

### Security notes
- **Remaining audit advisories (26, all moderate, all dev/build-only): accepted risk.** Two roots remain — `js-yaml` 3.x (inside jest's `@istanbuljs/load-nyc-config` coverage tooling) and `uuid` <11.1.1 (inside `firebase-admin`'s internals). npm's only offered "fix" for each is a **destructive downgrade** (jest→25, firebase-admin→10), so they are intentionally not applied. Both are DoS-class and neither ships in the release APK. Net: 48 → 26, with the critical and all 11 highs eliminated.

## [1.25.8] - 2026-06-28

### Security
- **Cleared the critical and all high-severity dependency advisories** via `npm audit fix` (non-breaking). The critical (`shell-quote`) and 11 highs (`axios`, `ws`, `lodash`, `@grpc/grpc-js`, `node-forge`, `fast-xml-parser`/`fast-xml-builder`, `protobufjs`, `form-data`, `tmp`, `@babel/*`) all live in build/dev/CI tooling, not in the shipped APK. Vulnerability count dropped 48 → 29 (remaining are all in the `firebase-admin` tree, addressed by the 12→14 upgrade).

### Fixed
- **Test suite no longer breaks from a jest internal version skew.** `audit fix` bumped `jest-runtime` to 30.4.2, which calls `jest-mock`'s `clearMocksOnScope`; `@react-native/jest-preset` pinned a nested `jest-mock@29.7.0` lacking that API, failing all 5 suites. Added a `jest-mock ^30.4.1` override to align the tree.

### Changed
- **Bumped JS-only and dev-tooling dependencies to latest minor/patch** (no native modules touched, fully verified by typecheck + tests + lint): `@react-navigation/native` 7.2.2→7.3.4, `@react-navigation/bottom-tabs` 7.15.11→7.18.3, `@react-navigation/stack` 7.8.11→7.10.6, `@supabase/supabase-js` 2.105.1→2.108.2, `uuid` 14.0.0→14.0.1, `react-native-gifted-charts` 1.4.76→1.4.77, `prettier` 3.8.3→3.9.1, `knip` 6.15.0→6.22.0, `@types/node`, `@types/react`, `@react-native-community/cli(-platform-android)` 20.1.3→20.2.0.

## [1.25.7] - 2026-06-13

### Security
- **Resolved Supabase database-linter findings on `urgent_items` / `device_tokens`** (live DB had drifted from migration history — objects were created by hand in the dashboard and never captured in a committed migration). Migration `20260613000000_harden_supabase_linter_findings.sql` (idempotent):
  - **Dropped the permissive "for all users" RLS policies** on both tables. These granted `anon`/`authenticated` full `SELECT`/`INSERT`/`UPDATE`/`DELETE` with `USING(true)`. The `SELECT USING(true)` pair (which the linter hides) let any holder of the public anon key read **every family's** urgent items and **every device's** FCM token cross-tenant. The client never reaches these via PostgREST (urgent items sync over Firebase RTDB; edge functions use the service role), so removing them closes a real cross-tenant data exposure with no app impact.
  - **Dropped orphan `notify_urgent_item_created()`** — wired to no trigger, a weaker hand-created duplicate of `handle_new_urgent_item` (hardcoded project URL, forwarded the caller's own `Authorization` header instead of the service-role key). Clears its mutable-search_path and PUBLIC-executable findings at once.
  - **Pinned `search_path = ''`** on `handle_new_urgent_item` and `check_rate_limit` (bodies verified fully schema-qualified against the live definitions), and **revoked the default PUBLIC/anon/authenticated `EXECUTE`** on `handle_new_urgent_item` (the trigger still fires).
  - Root fix mirrored in `setup-urgent-items.sql` so a re-run cannot reintroduce any of it.

## [1.25.6] - 2026-06-09

### Changed
- **Removed dead `AuthenticationModule.joinFamilyGroup`** — zero callers (the live path is `submitJoinRequest` → member approval), and it wrote `memberIds` directly, which the current RTDB rules reject anyway. Deleting it removes a misleading second join path.
- **Gated production debug logging.** Unconditional `console.warn` calls that reached release logcat are now `__DEV__`-guarded (`RevenueCatContext` config/paywall/restore warnings, `useShoppingLists` group-consistency diagnostics, the two backfill failures, and `LocalStorageManager`'s corrupt-queue-entry skip). The one genuinely silent background failure — tier reconciliation — now routes to `CrashReporting.recordError` instead of a swallowed `console.warn`.

## [1.25.5] - 2026-06-09

### Fixed
- **Editable receipt prices no longer mangle zero / blank input.** `ReceiptViewScreen` parsed the total with `parseFloat(text) || null` (typing `0` saved `null`, so a £0 total was impossible) and line-item prices with `parseFloat(text) || 0` (clearing a price silently saved £0.00 instead of empty). Both now use the existing NaN-safe `sanitizePrice()` helper, which returns `null` for blank/invalid and preserves a genuine `0`.
- **`HistoryDetailScreen` total math uses `??` instead of `||`** for item-price defaults, so a stored `0` is no longer treated as falsy when summing list totals.

## [1.25.4] - 2026-06-09

### Fixed
- **`reconcile-subscription` no longer rejects every legitimate call.** It validated `familyGroupId` against a UUID regex, but family-group IDs are Firebase `push()` keys (e.g. `-NEb7Jk-qLmnOp12Q34R5`), never UUIDs — so every reconcile returned `400 Invalid familyGroupId format` and a paying user's tier never synced from RevenueCat to RTDB on cold-start. `familyGroupId` is only string-compared to the user's stored group at the ownership check (it's never a path segment), so the UUID check added no security. Replaced it with a light injection guard (length + no `/` or `..`), matching the sibling `upsert-urgent-item` function.

## [1.25.3] - 2026-06-06

### Fixed
- **Rollback scripts now derive the edge-function list from the target ref** (`scripts/rollback.sh` + `.ps1`). They hard-coded the current function set including `health`, so rolling back to a ref that predates a function (e.g. `health`, added in 1.25.0) would run `supabase functions deploy health` from a worktree where `supabase/functions/health` doesn't exist — and with `set -e` / `$ErrorActionPreference="Stop"` that aborted the rollback partway. Now each script lists `git ls-tree -d <ref>:supabase/functions`, deploying exactly the functions present in that ref. (Codex PR #36 P2.)

## [1.25.2] - 2026-06-06

### Changed
- **Tightened edge-function rate limits to real usage.** `upsert-urgent-item` 30→10/min: it's the single sync path for create *and* resolve, so the per-UID budget is shared — 10/min covers normal use (one tap-type-done = 1 call) and only rapid bulk-resolve of 10+ items in a minute trips it, which fails safe (resolves locally, syncs on retry). `notify-shopping-started` 20→5/min: each call pushes a notification to *every* family member, so a loose cap is notification-spam exposure, not just backend cost — nobody legitimately starts shopping 5+ times a minute. `reconcile-subscription` (5) and `register-device-token` (10) unchanged.

## [1.25.1] - 2026-06-06

### Changed
- **Removed dead `UsageTracker` numeric-limit code** — `canProcessOCR`, `incrementOCRCounter`, and `getRemainingUsage` had zero callers (OCR is ad-gated now), and the surviving comments falsely claimed "enforcement is in Cloud Functions" (no such function exists). Removed the three dead methods and corrected the class/method docs to state the truth: numeric caps are disabled on every tier (ad-based model), `canCreateList` always allows today and is a UX gate only, and there is no server-side count enforcement. No behavior change — `getUsageSummary` (subscription screen) and `canCreateList`/`incrementListCounter` (list create flow) are untouched.

### Notes
- **Backlog — family-member cap is unenforced.** `TIER_FEATURES` advertises "Up to 10 Family Members" for the family tier, but `maxFamilyMembers` is null on every tier and nothing enforces it. Deferred deliberately (this pass was infra/security only). When implemented, enforce server-side at join-approval — either a maintained `memberCount` checked in the RTDB rule, or a join-approval edge function — not client-side.

## [1.25.0] - 2026-06-06

### Added
- **`health` edge function** — a public liveness probe for an external uptime monitor. Checks that both backends are reachable (Postgres via a trivial select, RTDB via an unauthenticated shallow probe) and returns 200 (`ok`) or 503 (`degraded`). Returns no data, and caches its result for 15s so a monitor (or abuser) can't add load. Added to the deploy workflow; RUNBOOK §6 lists it as a second monitor target alongside OCR.
- **One-command backend rollback** — `scripts/rollback.ps1` (+ `.sh`) redeploys the edge functions *and* RTDB rules from a known-good git ref via a throwaway git worktree (working tree untouched). Does not touch migrations (forward-only). Documented in RUNBOOK §3.

### Changed
- **RUNBOOK refresh** — §3 documents the rollback script; §6 adds the backend health endpoint; §7 rewritten to match reality (server-side CI verify job was dropped — quality is gated by local git hooks, branch protection is Pro-gated); new §10 documents a quarterly secret-rotation schedule.

## [1.24.0] - 2026-06-06

### Added
- **App Check (device attestation) wired into the client** — added `@react-native-firebase/app-check` and `src/services/AppCheckService.ts`, initialized first in `App.tsx` so attestation tokens attach to subsequent Firebase traffic. Release builds use Play Integrity (Android) / App Attest (iOS); `__DEV__` uses the debug provider so the AVD keeps working. Init is resilient — a failure never blocks startup. **Enforcement is a deliberate console step, not enabled here:** every API stays unenforced (monitor mode) until App Check metrics show verified traffic dominates, then enforce one API at a time. Requires a native rebuild. See RUNBOOK §9 for the debug-token + enforcement ramp.

## [1.23.1] - 2026-06-06

### Fixed
- **RevenueCat webhook is now idempotent on retries** — RC re-delivers the same `event.id` on any non-2xx/blip. The webhook already ratcheted tier writes on `tierUpdatedAt` (a replay couldn't move a tier backward), but it re-did Firebase/RevenueCat work each time. It now claims the event id in a new `processed_webhook_events` ledger (RLS-deny, 30-day pg_cron sweep) before processing and **acks duplicates with 200 without reprocessing**; if processing throws, the claim is released so RC's retry re-runs. Fails open on any ledger error (the ratchet keeps a reprocess harmless). **Apply migration `20260606010000_add_processed_webhook_events.sql` before/with deploy.**

## [1.23.0] - 2026-06-06

### Added
- **Per-UID rate limiting on edge functions** — the one missing security control before a public release. A Postgres fixed-window counter (`rate_limit_buckets` + atomic `check_rate_limit()` RPC, RLS-deny, hourly pg_cron sweep) is checked post-auth, keyed on the verified Firebase uid, in `upsert-urgent-item` (30/min), `notify-shopping-started` (20/min), `register-device-token` (10/min), and `reconcile-subscription` (5/min). Over-limit returns 429 + `Retry-After`. The check **fails open** on any limiter error — it's abuse/cost protection layered on top of auth + membership, never the access boundary itself, so a limiter blip never denies a legit caller. **Apply migration `20260606000000_add_rate_limit_buckets.sql` before/with deploy** (functions degrade gracefully if it's missing).

## [1.22.5] - 2026-06-06

### Security
- **`reconcile-subscription` now verifies the caller** — the edge function previously authorized only by an ownership check (does this `appUserId` belong to this `familyGroupId`), leaving it callable by anyone who could guess a valid uid/group pair. It now requires a Firebase ID token, verifies the signature/claims inline (same pattern as `upsert-urgent-item`), and rejects unless the verified `uid === appUserId` (401/403). The client sends a fresh ID token with the reconcile call.
- **Removed the unused Google Cloud Vision API key from the build** — OCR has routed through a server-side function since the key was dropped from `ReceiptOCRProcessor` (v earlier), but `GOOGLE_CLOUD_VISION_API_KEY` was still injected into the APK/IPA build `.env` by CI and declared in `@env`. Removed the dead references from `android-build.yml`, `ios-build.yml`, `src/types/env.d.ts`, `setup-secrets.ps1`, and `.env.example` so the key never enters the client bundle env. (The GitHub secret can be deleted separately.)

## [1.22.4] - 2026-06-05

### Fixed
- **Family group join was impossible (`permission-denied`)** — `submitJoinRequest` read the whole `/familyGroups/$groupId` node, which RTDB rules restrict to existing members, so a prospective joiner was always denied before a request could be sent. The flow now reads only joiner-permitted paths: the group name comes from the world-readable invitation, and the "already a member" check reads the user's own `memberIds/$uid` entry. No security rules were changed. Validated end-to-end on device (submit → approve → auto-complete → navigate into group)

### Changed
- **Invitations now store `groupName`** — written in both `createFamilyGroup` and `ensureInvitationCode` so a joiner can show the group name on the waiting screen without reading the members-only group node. Invitations created before this release have no `groupName` and fall back to "your family group" (display-only; self-heals on the next invite-code regeneration)

## [1.22.3] - 2026-06-05

### Fixed
- **CI lint failure in `upsert-urgent-item`** — removed the unused `created_by` destructured from the request body; the body's `created_by` is intentionally never trusted (attribution uses the verified caller / stored value), so the binding was dead code tripping `no-unused-vars`

## [1.22.2] - 2026-06-05

### Added
- **Pre-push static-analysis gate** — `.git/hooks/pre-push` runs `knip` (dead code + unused deps), `tsc --noEmit` (type errors), and `eslint src/` (lint) before every push; any failure blocks the push (bypass with `git push --no-verify`)
- **`knip` dev dependency** — pinned locally so the pre-push hook runs offline and fast instead of fetching via `npx`; `knip.json` tuned to ignore React Native tooling false positives (`@env`, `metro-config`, gradle plugin, etc.)
- **Changelog enforcement** — pre-commit hook now blocks a `package.json` version bump unless `CHANGELOG.md` is also staged

### Changed
- **Rewrote `RUNBOOK.md` in plain language** — added a two-backend intro, clickable section index, and why-before-how explanations; no procedures, commands, or secrets changed

### Removed
- **Dead exports flagged by knip** — removed unused `PRODUCT_TIER_MAP` (`SubscriptionConfig.ts`), `OCRStatusType` + `OCRError` (`types.ts`), and `MainTabParamList` (`navigation.ts`); each had zero references
- **Unused `ReceiptOCRProcessor` service** — dead Google Cloud Vision code path; OCR has routed through `ReceiptOCRService` (self-hosted PaddleOCR) since v1.x
- **`react-native-fs` dependency** — last consumer removed alongside `ReceiptOCRProcessor`; file uploads now stream from URI via FormData
- **13 stale local-only doc files** — removed git-ignored, ~4-month-stale reference docs (`API_DOCUMENTATION`, `COMPONENT_DOCUMENTATION`, `DATABASE_SCHEMA`, `design`, setup guides, etc.); were never tracked in git

## [1.17.0] - 2026-04-12
### Added
- **In-camera OCR preview overlay** — receipt scan now auto-triggers OCR immediately after capture, showing parsed fields (merchant, date, total, item count, confidence) in a bottom overlay before the user confirms; supports retake during loading with fetch cancellation via AbortController; single atomic write on confirm saves both `receiptUrl` and `receiptData` together

### Fixed
- **Receipt data not syncing across devices** — `receiptData` writes from OCR processing, retry, and manual edits now route through `ShoppingListManager.updateList` (which sets `syncStatus: 'pending'` and triggers `SyncEngine.pushChange`); previously went through `LocalStorageManager.saveReceiptData` which bypassed sync entirely
- **Backfill for pre-fix receipt data** — one-shot migration marks orphan `receiptData` rows as `sync_status: 'pending'` so they sync on next launch; batched in a single WatermelonDB transaction, deferred via `InteractionManager.runAfterInteractions`, capped at 3 retry attempts

### Changed
- **Split `extractReceipt` from `processReceipt`** — new `extractReceipt(localFilePath, signal?)` method performs OCR without persisting, accepts `AbortSignal` for cancellation; `processReceipt` now delegates to `extractReceipt` then persists via `ShoppingListManager`; removed dead `RNFS.readFile` base64 read and `react-native-fs` import from `ReceiptOCRService`

## [1.16.0] - 2026-03-30
### Changed
- **Redesigned analytics screen** — added tab navigation (Overview, Items, Stores, Prices); replaced flat summary list with 2×2 colored stat grid; items tab now shows top 8 with gold/silver/bronze rank badges; stores tab has spend-proportion progress bars; price analytics (store comparison, volatile items, smart savings) moved to dedicated Prices tab; smaller pie chart with inline legend

## [1.15.1] - 2026-03-30
### Fixed
- **Analytics showing wrong spending totals** — store totals, overall spending, monthly trends, and budget comparisons now use `receiptData.totalAmount` (the actual receipt total) when available, falling back to summing individual item prices; previously only summed item prices which produced incorrect/zero totals when items lacked individual prices

## [1.15.0] - 2026-03-30
### Changed
- **Redesigned login & signup screens** — replaced inline email/password form with two clear buttons: "Sign in with Google" and "Sign in with Email"; email/password forms moved to dedicated `EmailLoginScreen` and `EmailSignUpScreen`; added multicolor Google logo SVG component
- **Improved auth error messages** — email/password login failure now suggests Google Sign-In if the user may have signed up with Google; Google Sign-In on an existing email/password account shows a clear "use email instead" message

## [1.14.1] - 2026-03-29
### Fixed
- **Stale FCM token cleanup** — notification Edge Functions (`notify-shopping-started`, `notify-urgent-item`) now delete device tokens that FCM reports as UNREGISTERED/NOT_FOUND; `clearToken()` called on sign-out and account deletion to remove server-side tokens; tightened App.tsx FCM registration useEffect dependency to `[user?.uid, user?.familyGroupId]` to prevent redundant re-registrations

## [1.14.0] - 2026-03-28
### Added
- **Google Sign-In** — users can now register and log in with their Google account on both LoginScreen and SignUpScreen; uses `@react-native-google-signin/google-signin` v16 with Firebase Auth credential linking; handles new users (creates RTDB record) and returning users (fetches existing record); `signOut()` and `deleteUserAccount()` revoke Google access; added `auth/account-exists-with-different-credential` error handling; requires Firebase Console setup (SHA-1 fingerprint + Google provider enabled) and `GOOGLE_WEB_CLIENT_ID` env variable

## [1.13.2] - 2026-03-26
### Performance
- **Complete WatermelonDB batching** — converted remaining sequential writes (`updateItemsBatch`, `clearSyncQueue`, `clearAllData`) to `prepareUpdate`/`prepareMarkAsDeleted` + `database.batch()`; added descriptive labels to all `database.write()` calls for easier debugging; added perf timing logs to batch methods

## [1.13.1] - 2026-03-26
### Fixed
- **Android edge-to-edge support (SDK 35)** — added `EdgeToEdge.enable()` in `MainActivity.java` with `androidx.activity:activity:1.9.0` dependency to handle Android 15 enforced edge-to-edge display and migrate away from deprecated `statusBarColor`/`navigationBarColor` APIs; set `StatusBar translucent={true}` with transparent background in `App.tsx`; wrapped 4 headerless auth screens (`LoginScreen`, `SignUpScreen`, `FamilyGroupScreen`, `TermsAcceptanceScreen`) in `SafeAreaView` to prevent content rendering behind system bars

## [1.13.0] - 2026-03-26
### Added
- **Shopping started push notification** — when a user starts shopping (selects a store), all other family members receive a push notification: "🛒 [Name] is shopping at [Store]"; new `notify-shopping-started` Supabase Edge Function sends FCM V1 notifications to family group device tokens; fire-and-forget from `ListDetailScreen` via `NotificationManager.notifyShoppingStarted()`

## [1.12.1] - 2026-03-20
### Performance
- **WatermelonDB batch write optimization** — converted 8 batch methods + 2 singular upsert methods in `LocalStorageManager` from sequential `await update()`/`await create()` to `prepareUpdate`/`prepareCreate` + `database.batch()`, collapsing N native bridge round-trips per write block down to 1; each method has a try/catch fallback that re-queries fresh models and falls back to individual writes if `batch()` fails; `deleteItemsBatch` uses `prepareMarkAsDeleted` + batch (no fallback — dirty model invariant); `saveList`/`saveItem` singular replaced try-find/catch-create with query-based upsert to avoid JS exception overhead on the create path

## [1.12.0] - 2026-03-19
### Removed
- **Automatic measurement assignment** — items no longer get auto-assigned measurement units (ml, g, kg, L) on add or category change; manual measurement editing via SizeEditModal is unchanged
- Deleted `MeasurementService.ts` and `normalize.ts` (unused utility)
- Removed Firebase item preferences sync listener (`startListeningToItemPreferences`/`stopListeningToItemPreferences`)
- Removed `ItemPreference` type and all `LocalStorageManager` item preference methods (`getItemPreference`, `saveItemPreference`, `saveItemPreferencesBatch`, `deleteItemPreference`)
- Removed suggestion chip UI from SizeEditModal

## [1.11.2] - 2026-03-18
### Fixed
- **Auth fires twice on cold start** — `onAuthStateChanged` fires twice (cached credential then server validation), tearing down and re-creating Firebase RTDB listeners each time; now tracks `lastProcessedUid` to skip duplicate setup and uses `latestFirebaseUser` mutable ref so the claims listener always calls `getIdToken` on the freshest instance
- **ListDetail double observer setup** — main useEffect depended on `[listId, currentUserId]`; when `currentUserId` resolved async, React tore down all observers and re-set them up; now depends only on `[listId]` with a `currentUserIdRef` for the observer callback and a dedicated effect for lock/mode state
- **Firebase initial load race (lists & items)** — `child_added` buffer + `once('value')` sentinel had a race where the sentinel fired before all `child_added` events arrived; replaced with `once('value')` as sole initial load path; `child_added` is a no-op until `once()` completes, then handles only genuinely new records
- **Lost quantity increments on rapid tap** — observer could overwrite in-flight optimistic values; added `optimisticQtyRef` that preserves user's intended quantity until DB confirms the value matches; added 300ms per-item debounce to coalesce rapid taps into a single WMDB+Firebase write, flushed on unmount

### Chores
- Removed race condition diagnostic logger (`raceConditionLogger.ts`) and all `[RACE]` log calls

## [1.11.1] - 2026-03-18
### Fixed
- **Crash: `NativeModule.RNDeviceInfo is null`** — `sp-react-native-in-app-updates` static import triggered native module resolution at JS load time before try/catch could catch it; replaced with `NativeModules.RNDeviceInfo` guard + dynamic `require()` inside try/catch so the app launches gracefully even if native module is unlinked
- **Predicted prices not showing on list open** — `loadPredictions` captured `list?.familyGroupId` from a stale render closure; with the writer queue clear (batching fix), the timing race became deterministic and the closure was always null; switched to `listFamilyGroupIdRef.current` which always reads the latest value

### Performance
- **197 queued WatermelonDB writers on startup** — all Firebase listeners (lists, urgent items, category history, item preferences, store layouts) each fired a separate `database.write()` per `child_added` event on attach; applied the buffered `child_added` + `once('value')` sentinel pattern so all initial records are batch-upserted in a single writer per listener

## [1.11.0] - 2026-03-15
### Added
- **In-app update prompt** — checks Google Play for available updates on app launch; shows "Update Available" popup; tapping "Update" opens the Play Store listing; silently degrades on non-Play-Store installs
- **Proguard rules for Play Core** — added keep rules for `com.google.android.play.**` to prevent release-build stripping
- **Security: 0 npm audit vulnerabilities** — added `underscore>=1.13.8` override (DoS via unbounded recursion), fixed `flatted<3.4.0` (DoS via unbounded recursion in parse)

## [1.10.5] - 2026-03-15
### Fixed
- **Crash on first open with category history data** — `snapshot.val()` returns `null` when a Firebase node is empty/deleted between event dispatch and processing; `Object.keys(null)` threw a TypeError in both `child_added` and `child_changed` callbacks in the category history listener; added `!categoriesForItem || typeof categoriesForItem !== 'object'` guard before the loop
- **$0.00 budget silently lost on sync** — `firebaseData.budget || null` coerced `0` to `null`; changed to `?? null` so a zero budget syncs correctly
- **$0.00 urgent item price silently lost on sync** — same `||` vs `??` bug in the urgent item mapper; `firebaseData.price ?? null` now preserves zero prices
- **WatermelonDB observer killed by JSON.parse throw** — `receiptData` and `categoryOrder` fields parsed with bare `JSON.parse`; an invalid value (e.g. empty string from WatermelonDB default on a non-optional column) throws and kills the observer; replaced both with `safeJsonParse<T>()` helper that returns a typed fallback on error
- **WatermelonDB setup errors silently swallowed** — `onSetUpError` callback was empty; now logs via `CrashReporting.recordError`; existing comment claiming Crashlytics requires JS init was wrong — the native SDK is always active

## [1.10.4] - 2026-03-12
### Fixed
- **SizeEditModal size value lost on split entry** — entering unit via pill then typing a number (or vice versa) saved `null` for the value (e.g. card showed "kg" instead of "1kg"); both pill→type and type→pill paths now capture the numeric value via `parseFloat` fallback

## [1.10.3] - 2026-03-11
### Performance
- **Fix 1 — Haptic ref cache:** `handleToggleItem` no longer calls `AsyncStorage.getItem('hapticFeedbackEnabled')` on every toggle; value is cached in `hapticEnabledRef` via `useFocusEffect`, refreshed each time the screen gains focus
- **Fix 2 — Batch DB write for drag reorder:** `LocalStorageManager.updateItemsBatch` now runs all N item updates in a single WatermelonDB transaction (was N separate transactions); `ItemManager.updateItemsBatch` fires sync pushes in parallel; `addItemsBatch`/`deleteItemsBatch` also parallelised
- **Fix 3 — addItem sort order:** Replaced full table scan (`getItemsForList` + reduce) with `Date.now()` as monotonically-increasing sort key; saves N DB rows loaded on every item add
- **Fix 4 — SyncEngine skip redundant reads:** `pushChange` accepts optional `data` param; callers thread their freshly-written data through, eliminating 1 DB read per create/update; delete no longer reads entity (data unused by `.remove()`)
- **Fix 5 — PricePredictionService N+1:** `calculatePredictions` now issues a single `getItemsForLists(listIds)` query instead of one `getItemsForList` per completed list
- **Fix 6 — Remove dead verify-find:** `saveList` post-write `find()` verify removed (WatermelonDB `find` throws on missing record, so the null guard was permanently unreachable)
- **Fix 7 — syncPendingChanges double queue read:** `processOperationQueue` returns `QueueProcessResult` with processed/deferred counts; `syncPendingChanges` uses those counts directly (1 queue read normal path, 0 reads busy path); `ListDetailScreen` now calls `syncPendingChanges` on connectivity restore

## [1.10.2] - 2026-03-11
### Fixed
- **SizeEditModal text field shows unit** — when an item had a unit but no value, the text input was pre-filled with the unit string (e.g. "g"); it now stays empty and the unit is reflected via the pill selection and badge only
- **SizeEditModal "Set g" save button** — save button incorrectly showed "Set g" when a unit was selected but no value was entered; it now shows "Done" unless both a value and unit are present

## [1.10.1] - 2026-03-10
### Style
- **Category label on item card** — category name shown below item name in category colour, inline with size badge
- **DetailsEditModal no autoFocus** — keyboard no longer opens on modal entry, category grid is fully visible; user taps name field explicitly to edit

## [1.9.1] - 2026-03-09
### Changed
- **Split ItemEditModal into 3 focused modals** — Replaced the monolithic `ItemEditModal` with purpose-built `PriceEditModal`, `SizeEditModal`, and `DetailsEditModal`, each opening only the fields relevant to the tapped zone on the card:
  - `PriceEditModal`: large £ price input, quick-fill chips from recent store history (up to 4), "View Price History" button that opens `PriceHistoryModal` as a sibling (no z-index stacking)
  - `SizeEditModal`: combined measurement input with live unit badge, smart suggestion chip, Volume/Weight pill groups, "Clear" footer button
  - `DetailsEditModal`: large auto-focused name input, 2-column category grid with per-category color selection, Delete button with confirmation
  - Shared `ModalBottomSheet` wrapper (gradient + handle bar) extracted to avoid duplication
  - `parseCombinedInput()` extracted to `src/utils/measurement.ts` (single source of truth)
  - `ListDetailScreen` uses discriminated union `activeModal` state instead of separate `editModalVisible` / `selectedItem` / `editModalFocusField`
  - Measurement auto-assign on category change moved to `handleDetailsSave` handler
  - `HistoryDetailScreen` swapped to `PriceEditModal` (was `ItemEditModal priceOnly`)

## [1.9.0] - 2026-03-08
### Style
- **Full app visual overhaul "Liquid Glass v2"** — Unified design system across all 37+ files on branch `ui/visual-overhaul-v2`:
  - New background palette: `#0D0D14` primary, `#1E1E2E` secondary, `#181825` tertiary
  - New accent palette: blue `#6EA8FE`, purple `#A78BFA` (replacing `#007AFF` / `#AF52DE`)
  - Glass surfaces: reduced to `rgba(255,255,255,0.03)` bg / `rgba(255,255,255,0.05)` border (was 0.08/0.12)
  - Text hierarchy: white primary, `rgba(255,255,255,0.45)` secondary, `rgba(255,255,255,0.3)` tertiary
  - All primary/confirm buttons: blue→purple LinearGradient (`#6EA8FE` → `#A78BFA`)
  - Bottom-sheet modals: gradient background + handle bar (40×4px pill)
  - Tab bar: new blue active tint, `rgba(13,13,20,0.95)` bg, border opacity 0.05
  - Navigation theme: updated `primary`, `background`, `card`, `border`, `notification`
  - RADIUS: large=14, xlarge=16, added modal=24
  - Added `COMMON_STYLES.label` (11px/700/uppercase), `modalHandle`, `modalHandleContainer`
  - Added `COLORS.gradient` token group
  - ItemEditModal: combined measurement input ("500ml"), grouped pills (Volume/Weight), suggestion chip
  - All screens/components updated: auth, history, analytics, settings, subscription, receipts, budget, urgent items

## [1.8.8] - 2026-03-07
### Performance
- **Stop CategoryItemList re-rendering on every keystroke** — Wrapped `handleToggleItem`, `handleItemTap`, and `handleCategoryDragEnd` in `useCallback([], [])`. Added `isListLockedRef` to avoid capturing `isListLocked` state in the `handleItemTap` closure, keeping all three deps arrays empty so `memo`-wrapped `CategoryItemList` instances no longer re-render when the "add item" input changes.

## [1.8.7] - 2026-03-07
### Fixed
- **App crash on category change** — Moving an item to a different category crashed the app because `NestedReorderableList` received an updated `data` prop that conflicted with its internal drag-state. Fixed by keying each `CategoryItemList` on the sorted set of item IDs in that category, so the reorderable list remounts cleanly when items join or leave.

## [1.8.6] - 2026-03-06
### Refactor
- **Style extraction** — Moved inline `StyleSheet` blocks out of `ListDetailScreen` (593 lines), `SettingsScreen` (376 lines), and `HomeScreen` (290 lines) into sibling `.styles.ts` files. No behaviour change.
- **Dead code removal** — Deleted `useListDetail` hook (289 lines) that was never imported by any screen, and removed it from the hooks barrel export.

## [1.8.5] - 2026-03-06
### Fixed
- **History tab highlight** — Tapping a list in History tab no longer switches the active tab highlight back to "Shopping Lists". History now has its own stack navigator, so navigation stays within the History tab.

## [1.8.4] - 2026-03-06
### Fixed
- **History items missing** — On a fresh install or new device, completed list items were never synced to local storage (items are only synced while a list is actively open). HistoryDetailScreen now falls back to a one-time Firebase fetch when local DB returns 0 items, and persists results locally so subsequent opens are instant.

## [1.8.3] - 2026-03-05
### Fixed
- **Empty items in HistoryDetailScreen** — Three compounding issues caused completed lists to show zero items:
  1. Ghost `child_removed` events (Firebase SDK reconnection) were trusted blindly, permanently deleting items from local WatermelonDB. Fix: verify item is actually gone from Firebase before deleting locally.
  2. `saveItemsBatchUpsert` failed to recover items after they were soft-deleted (`_status='deleted'`), hitting a SQLite unique constraint on `create()`. Fix: physically destroy stale deleted records before the upsert loop using `adapter.destroyDeletedRecords`.
  3. WatermelonDB observer in HistoryDetailScreen could overwrite seeded items with `[]` (race condition). Fix: removed the observer — completed list items are immutable; price edits already reload via `loadListDetails()`.

## [1.8.2] - 2026-03-05
### Fixed
- **Measurement auto-assign on category change** — Changing a category in ItemEditModal now auto-suggests the default measurement unit (e.g., Meat → g) when no unit is currently set. Explicit user choices are never overridden.

## [1.8.1] - 2026-03-05
### Fixed
- **HistoryDetailScreen infinite spinner** — Completed lists now display immediately. Two bugs combined to cause an infinite "Loading details..." spinner: (1) items fetched by `getListDetails()` were discarded instead of seeded into state; (2) the loading guard checked `items.length === 0` which was always true before the WatermelonDB subscription fired. Fix: seed items from the initial fetch (`setItems(details.items)`) and simplify the guard to `if (loading)`.

## [1.8.0] - 2026-03-04
### Added
- **Measurement unit recognition** — Items auto-assigned a measurement unit (ml, L, g, kg) based on category and keyword rules. Learned preferences are stored per item name per family and persist across sessions.
  - Static defaults: Dairy/Beverages → ml, Meat/Fish/Pantry/Frozen → g
  - Keyword overrides: butter/cheese/yogurt → g, oil → ml
  - Learned preferences stored in new `item_preferences` table (schema v14) and synced via Firebase
- **Measurement display on item cards** — Small muted label below item name shows measurement (e.g. "500ml", "g") when set
- **Measurement editing in item modal** — Pill buttons (ml | L | g | kg) + optional numeric amount input; changes are saved as learned preferences only on explicit user edit; clearing restores static defaults
- **Schema v14** — New `item_preferences` table; `measurement_unit` and `measurement_value` columns on `items`
- **Firebase sync** — Measurement fields synced across devices via existing item sync; item preferences synced inline via `/itemPreferences` node (same architecture as category history)
- **Frequent item add fix** — `handleAddFrequentItem` now runs full category + measurement lookup, matching manual add behavior

## [1.7.13] - 2026-03-04
### Fixed
- **Completed list: "Not Purchased (N)" section** — Unchecked items now appear under an amber "Not Purchased (N)" section header above the green "Purchased" section, replacing the old amber banner. Count is visible in the header.
- **Completed list: price-only editing** — Tapping an item in a completed list opens a "Set Price" modal (price input + View Price History only; name and category fields hidden). Firebase sync listener removed from `HistoryDetailScreen` — completed lists don't need real-time updates.

## [1.7.12] - 2026-03-01
### Changed
- **Tier restructure** — Free tier list cap removed; OCR restricted to premium+ (hard-blocked at 0). Premium repositioned as ad-free for the individual; family as ad-free for the whole group under one subscription. Rewarded-ad gate for urgent items unchanged. `TIER_FEATURES` rewritten for all tiers to reflect the new value proposition.
- **Dead code removal** — `canCreateUrgentItem()` and `incrementUrgentItemCounter()` removed from `UsageTracker` (never called). `canProcessOCR` handles `maxOCRPerMonth === 0` with a clear message instead of "You've used your 0 OCR scans this month."

## [1.7.11] - 2026-03-01
### Security
- **reconcile-subscription Edge Function** — Replaced client-side `subscriptionTier` write in `RevenueCatContext` with a server-side Edge Function. Family group ownership is verified via Firebase before the RevenueCat REST API is called for the authoritative entitlement check. Client can no longer forge tier by manipulating local SDK state. Function also acts as a startup re-validation sync.

## [1.7.10] - 2026-02-27
### Security
- **User data moved to EncryptedStorage** — `@user` cache in `AuthenticationModule` (email, uid, familyGroupId) now stored in `react-native-encrypted-storage` instead of plaintext `AsyncStorage`. All 6 write paths and both clear paths updated. `signOut` and `deleteUserAccount` also remove the legacy AsyncStorage entry on upgrade.

## [1.7.9] - 2026-02-27
### Security
- **npm dependency vulnerabilities resolved** — `npm audit fix` patched `axios` (DoS via `__proto__`), `ajv`, `js-yaml`, `node-forge`, `qs`. Added `overrides` in `package.json` to pin `fast-xml-parser >=5.3.8` (stack overflow / entity expansion) and `@babel/runtime@<7.26.10 → 7.26.10` (ReDoS in named capturing group transpilation) without touching parent package versions. Result: 0 vulnerabilities.

## [1.7.8] - 2026-02-27
### Fixed
- **`sanitizeError` allowlist — 3 missing entries** — `'Urgent item name is required'` (UrgentItemManager validation), `'No receipt found for this list'` (retryFailedOCR path), and `'Item not found'` (concurrent-delete edge case in ItemManager) were not covered by the v1.7.5 allowlist and silently degraded to the generic fallback message.

## [1.7.7] - 2026-02-27
### Security
- **Deep link `listId` validation** — `ListDetailScreen` validates `listId` as a UUID on mount and rejects invalid formats immediately. `loadListMetadata` verifies `list.familyGroupId === currentUser.familyGroupId` after fetching — a foreign `listId` from a crafted deep link is rejected with "Access Denied" before any subscription or data operation starts.

## [1.7.6] - 2026-02-27
### Security
- **FCM tokens moved to EncryptedStorage** — `@fcm_token` and `@fcm_token_data` in `NotificationManager` now use `react-native-encrypted-storage`. Migration in `getFCMToken()` moves the token from AsyncStorage on first access after upgrade — existing users continue receiving notifications without re-registering.

## [1.7.5] - 2026-02-27
### Security
- **Sanitize error messages at UI boundary** — Added `sanitizeError(error)` to `sanitize.ts` and applied it across all screen-level `showAlert` catch blocks. Raw Firebase/WatermelonDB/Supabase error details no longer reach the UI. An allowlist passes through known user-facing service messages unchanged.

## [1.7.4] - 2026-02-27
### Security
- **Remove Vision API key from client bundle** — Removed `apiKey` constructor param, `this.apiKey` field, and `process.env.GOOGLE_CLOUD_VISION_API_KEY` reference from `ReceiptOCRProcessor`. The field was unused — OCR already routes through `supabase.functions.invoke('process-ocr')`.

## [1.7.3] - 2026-02-27
### Security
- **Firebase rules: `createdAt` type validation** — `createdAt` must now be a positive number on `lists`, `familyGroups/urgentItems`, and top-level `urgentItems`. Follows the `priceHistory.recordedAt` pattern already in the rules.

## [1.7.2] - 2026-02-27
### Security
- **Unicode normalization in sanitizeText** — Added `.normalize('NFKC')` before `.trim()` to prevent homograph-style injection via look-alike Unicode characters.

## [1.7.1] - 2026-02-27
### Security
- **Block direct anon REST access to Supabase tables** — `urgent_items` and `device_tokens` no longer have any RLS policies for `anon` or `authenticated` roles. All client access is now routed through Edge Functions that use `service_role` server-side, so the exposed anon key cannot be used to read or write any data.
- **New Edge Function: `upsert-urgent-item`** — replaces direct REST POST to `/rest/v1/urgent_items` from `UrgentItemManager`.
- **New Edge Function: `register-device-token`** — replaces direct REST POST to `/rest/v1/device_tokens` from `NotificationManager`.
- **`UrgentItemManager`** — `syncToSupabase` now uses `supabase.functions.invoke('upsert-urgent-item')` instead of raw fetch with anon key.
- **`NotificationManager`** — `registerToken` now uses `supabase.functions.invoke('register-device-token')` instead of raw fetch with anon key.

## [1.7.0] - 2026-02-27
### Added
- **Unchecked items flow on completion** — "Done Shopping" now intercepts when items remain unchecked and presents three options:
  - **Full Shop** — complete normally; the history card shows an amber "X items not bought" indicator.
  - **Partial Shop** — complete the current list and carry unchecked items (with their categories) into a new active list with the same name. A loading overlay covers the async work; on `createList` failure the item names are listed so the user can re-add them manually.
  - **Cancel** — dismiss the dialog and return to shopping mode.
  - If all items are checked, the existing optimistic completion flow runs unchanged.
- **`unchecked_items_count` on completed lists** — stored in DB (schema v13, migration from v12), synced through Firebase, and used by HistoryScreen cards to display the amber indicator.
- **HistoryScreen amber indicator** — cards restructured to `flexDirection: column` with an inner row; an amber "X items not bought" line appears below the date/total row when `uncheckedItemsCount > 0`.
- **HistoryDetailScreen banner + title** — items section title changes to "Items (Y/Z bought)"; an amber banner appears above items when unchecked items exist.
- **`category` support in `addItemsBatch`** — items passed to the batch creator now carry their original category, so Partial Shop preserves category assignments.

### Changed
- DB schema bumped to v13 (`unchecked_items_count` column on `shopping_lists`, optional).

## [1.6.1] - 2026-02-26
### Fixed
- **Dead import cleanup** — Removed unused `AuthenticationModule` import from HistoryDetailScreen (leftover from pre-reactive price stats code).

## [1.6.0] - 2026-02-26
### Fixed
- **History detail shows 0 items after reinstall** — HistoryDetailScreen now subscribes to WatermelonDB item observer and starts a Firebase items listener, so items sync from Firebase on fresh installs. Price stats load reactively once items arrive. Removed item delete from history (items are immutable). Made `onDelete` optional in ItemEditModal.
- **Store picker Cancel behavior** — "Skip" button renamed to "Cancel" and now aborts entirely (just closes the modal) instead of proceeding with an empty store name that would lock the list.

### Added
- **Store Price Comparison dashboard** — New ItemStoreComparison component in Analytics tab. Select any tracked item to see a bar chart comparing prices across stores, with date range filter (30/90/365 days), avg/latest price toggle, per-store volatility indicators (Low/Med/High), and text-based insights (cheapest store, most stable, latest vs average delta).
- **Most Volatile Prices chart** — Bar chart of top 10 items with the biggest price swings across all purchase history.
- **Smart Savings card** — Shows potential savings per shop by identifying the cheapest store for each item bought from multiple stores, with total savings banner.
- **`getDistinctTrackedItems()`** — New LocalStorageManager method to query all unique items with price history.
- **`getAllTrackedItems()`** — New PriceHistoryService wrapper for tracked item retrieval.
- **Price Analytics section** — New section in AnalyticsScreen below spending charts, guarded by familyGroupId availability.

## [1.5.1] - 2026-02-25
### Fixed
- **Store banner position** — Store banner (no-store warning + change-store row) now renders above the add item input for better visibility.
- **Scroll blocked on item cards** — Pan gesture handler on `NestedReorderableList` captured all touch events immediately, blocking the outer `ScrollViewContainer` scroll. Extracted `CategoryItemList` component with `Gesture.Pan().activateAfterLongPress(250)` via `panGesture` prop — pan stays in WAITING state for 250ms, letting normal scrolls pass through. Removed ineffective `scrollEnabled={false}`.

### Added
- **Category reorder arrows** — Up/down chevron arrows on category headers (when list has a store and is not locked) allow reordering categories locally. A Save button appears in the title bar to persist the new order to the store layout.

## [1.5.0] - 2026-02-23
### Added
- **Change store button** — Lists with a store set (not locked, not completed) now show a row with the current store name and a "Change" link. Tapping it opens the store picker in banner mode, updating the store name without locking the list.

### Fixed
- **Gesture crash + scroll freeze on Android (regression from v1.4.6)** — `scrollable={true}` resolved the original crash but introduced a touch-freeze at scroll boundaries. Root cause: `scrollable` activated a nested autoscroll worklet that competed with the outer `ScrollView` at the same edge pixels. Fix: patched `react-native-reorderable-list@0.18.0` to unconditionally skip `Gesture.Simultaneous` on Android (the real fix for the duplicate handler tag crash), removed `scrollable={true}` from both `NestedReorderableList` instances, and pinned the library to `0.18.0` to prevent the patch being broken by an update.
- **Items loading one-by-one on first install** — The `.catch()` fallback in `startListeningToItems` attached `child_added` with `initialItemIds` still empty, so every item was written individually. New approach: attach `child_added` immediately on a filtered ref, buffer events until Firebase's `value` fires (guaranteed after all initial `child_added` events), then flush the buffer in one batch write. `child_changed` and `child_removed` also moved from the root ref to the filtered ref to avoid processing other lists' events.

## [1.4.6] - 2026-02-23
### Fixed
- **Gesture handler crash on Android with 2+ categories** — Opening a list with items in multiple categories crashed with `Handler with tag N already exists`. Root cause: `ScrollViewContainer` creates one `Gesture.Native()` instance and shares it via context; each `NestedReorderableList` was re-registering the same native gesture tag in its own `GestureDetector` → Android threw on the second registration. Fixed by adding `scrollable={true}` to both `NestedReorderableList` elements in `ListDetailScreen`, activating the library's built-in Android fast-path that skips including the shared outer gesture in `Gesture.Simultaneous`. Inner auto-scroll is a no-op in this layout anyway (lists are unconstrained height inside the outer `ScrollView`).

## [1.4.5] - 2026-02-22
### Fixed
- **VirtualizedList warning suppressed** — `react-native-reorderable-list` requires its own `FlatList` inside `Animated.ScrollView` as part of its drag-and-drop scroll coordination architecture. Suppressed the noisy Metro warning with `LogBox.ignoreLogs`.

## [1.4.4] - 2026-02-22
### Performance
- **Items now appear all at once when opening a list** — Firebase was firing `child_added` for every existing item individually, causing N WatermelonDB writes → N observer fires → N UI re-renders. Replaced with a `once('value')` bulk fetch followed by a single `saveItemsBatchUpsert()` write inside one `database.write()` transaction — one observer fire for all items.
- **`child_added` attached after batch completes** — Listener is now attached inside `.then()` so `initialItemIds` is fully populated before streaming begins, eliminating the race condition where initial items were double-processed.
- **Firebase server-side indexes** — Added `.indexOn: ["listId"]` on the `items` node and `.indexOn: ["recordedAt"]` on `priceHistory`. Without these, Firebase downloaded all items for the whole family group and filtered client-side. Now filtering runs on the server.

### Fixed
- **`quantity: 0` and `price: 0.00` silently dropped** — `firebaseData.quantity || null` and `firebaseData.price || null` treated `0` as falsy, writing `null` to the DB. Changed to `?? null` in `syncItemToLocal`.

## [1.4.3] - 2026-02-21
### Fixed
- **Drag not working** — Long-press on item cards was swallowed by nested `TouchableOpacity` components inside `AnimatedItemCard`. Fixed by passing the `drag()` function via render prop from `DraggableItemRow` into `AnimatedItemCard`, where it is applied as `onLongPress` directly on the content touchable. Drag now works reliably on the full item text/price area.
- **StoreLayoutEditor crash** — `ReorderableList` was imported as a named export but is only a default export in `react-native-reorderable-list@0.18.0`, causing a render crash that also corrupted gesture handler state for the whole screen.
- **`sortOrder=0` silently dropped** — `item.sortOrder || null` treated `0` as falsy, writing `null` to the DB for the first item in every category. Changed to `item.sortOrder ?? null` in `LocalStorageManager` and `FirebaseSyncListener`.
- **Items not sorted by drag order** — Observer was sorting items by `createdAt` instead of `sortOrder`, ignoring saved drag positions on next load. Fixed to sort by `sortOrder ?? createdAt`.
- **Firebase echo-back corrupting sort order** — After a drag, the local write triggered a Firebase `child_changed` event which was written back to local DB with stale data, overwriting the new `sortOrder`. Fixed by skipping sync writes where `existingItem.updatedAt > firebaseData.updatedAt`.

## [1.4.2] - 2026-02-21
### Fixed
- **CI build broken** — `react-native-reorderable-list` caused npm to silently upgrade `react-native-reanimated` from `3.10.0` → `3.19.5` in the lock file. Version `3.19.5` requires React Native 0.78+, breaking the Android CI build. Pinned reanimated to exactly `3.16.7` — which requires only RN 0.71+ and satisfies the `>=3.12.0` peer dependency of `react-native-reorderable-list`.

## [1.4.1] - 2026-02-21
### Fixed
- **Drag-and-drop wrong-item bug** — Migrated item drag-and-drop in `ListDetailScreen` and `StoreLayoutEditor` from `react-native-draggable-flatlist` to `react-native-reorderable-list`. The new library runs drag gestures on the UI thread via Reanimated worklets, eliminating the stale-closure bug that caused the wrong item to move.
- **Removed old drag library** — Uninstalled `react-native-draggable-flatlist`; no longer referenced anywhere.
- **react-native-reanimated pinned to 3.10.0** for compatibility with React Native 0.74.

## [1.4.0] - 2026-02-20
### Added
- **Store layout** — Save the physical aisle/category order for a store so the shopping list shows items grouped in the order you'll encounter them. Layouts are stored per store name and synced across family members via Firebase RTDB.
- **Layout toggle** — "Sort by store layout" / "Store layout active" toggle button on lists that have a store name. Layout is off by default; users opt in per list.
- **Store Layout Editor** — New screen to drag-and-drop the 12 predefined categories into store order. Long-press a row to drag.
- **Per-category item drag-and-drop** — Within each category group, items can be reordered by long-press drag. Order persists to local DB and syncs via Firebase.
- **Layout resets on store change** — Changing a list's store name automatically clears `layoutApplied`.
- **WatermelonDB schema v12** — New `store_layouts` table; `layout_applied` boolean column on `shopping_lists`.
- **Firebase rules** — `storeLayouts` node added under `familyGroups.$groupId` with member-only read/write and field validation.

## [1.3.0] - 2026-02-19
### Added
- **Permanent price history (cloud-synced)** — Price records are now stored in a dedicated `price_history` WatermelonDB table (schema v11) and mirrored to Firebase RTDB. History survives reinstall and phone changes.
- **Price recorded on check-off** — When an item with a non-null price is checked off, a record is written to both local DB and Firebase. Price records are per store (`storeName` from the shopping list).
- **Firebase bulk-then-stream sync** — On mount, all existing Firebase price records are fetched in one `once('value')` batch write. New records arriving from other devices are streamed via `child_added` filtered to post-session timestamps only (no re-download of history on foreground return).
- **One-time backfill** — On first launch after upgrade, all checked items with prices from completed local lists are back-filled into the new table and written to Firebase. Uses deterministic IDs (`backfill_<listId>_<itemId>`) — safe to re-run, duplicates are skipped.
- **Graceful upgrade window** — `getPriceHistory()` falls back to legacy completed-list reconstruction until the backfill flag is set, so price history screens never go blank during the upgrade.
- **WatermelonDB migration v10 → v11** — `createTable` migration adds the `price_history` table for existing installs.

## [1.2.3] - 2026-02-18
### Fixed
- **Consent dialog before login** — `AdMobProvider` was mounted outside the auth gate, causing the UMP consent dialog to appear on the login screen. Moved `AdMobProvider` inside the authenticated branch so it never mounts for unauthenticated users.
- **Thank-you alert fires immediately after login** — `AdConsentGate` mounted fresh after login but found `consentObtained=true` from the pre-login consent run and fired the alert instantly. Resolved by the same `AdMobProvider` relocation above.
- **Banner and interstitial ads never displaying** — Premature consent/loading race prevented ads from initialising. Fixed alongside the above; ads now initialise only after the user's tier is confirmed.
- **Ads race condition** — Added `setIsLoading(true)` at the start of `handleUser` in `RevenueCatContext` to keep `isLoading=true` for the entire async window while RevenueCat and Firebase resolve the user's tier.

## [1.2.2] - 2026-02-17
### Fixed
- `CustomAlert` background was semi-transparent; made it solid.
- Consent form re-triggered on every app foreground after first acceptance; added guard.
- Stale `showInterstitial` ref caused interstitial not to show.
- Ad shown on list completion even for premium users; added tier check.
- Empty-list guard missing before showing interstitial.
- App did not navigate back after list completion.

## [1.2.1] - 2026-02-16
### Fixed
- Urgent item Firebase sync failed with `permission-denied` — `createdAt` was a `Date` object; converted to `Number()` before writing.
- Supabase urgent item sync failed with `401 Invalid API key`.
- WatermelonDB observer did not fire when urgent item status changed from `active` to `resolved`; switched to broad query + JS filter.

## [1.2.0] - 2026-02-15
### Added
- Interstitial ad shown when opening a list (2-minute cooldown between shows).
- One-time "thank you for using the app" alert shown after consent is obtained.

## [1.1.1] - 2026-02-14
### Fixed
- Premium users were shown the UMP consent flow; skipped consent for premium tier.

## [1.1.0] - 2026-02-13
### Added
- AdMob banner and interstitial ads for free-tier users.
- UMP consent flow (GDPR) before showing ads.

## [1.0.1] - 2026-02-12
### Fixed
- Keyboard dismissed incorrectly on certain input fields.
- Error type cleanup across auth screens.

## [1.0.0] - 2026-02-11
### Added
- Initial Play Store release.
