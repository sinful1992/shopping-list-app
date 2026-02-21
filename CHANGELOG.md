# Changelog

All notable changes to this project will be documented in this file.

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
