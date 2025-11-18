## AI Assistant Instructions for FamilyShoppingList Repo

Short goal: help contributors implement features and fixes quickly while preserving the app's offline-first sync semantics and Firebase integration.

- Big picture
  - Frontend: React Native (TypeScript). Entry: `App.tsx`.
  - Offline DB: WatermelonDB under `src/database/` (`schema.ts`, `models/*`). Local operations go through `LocalStorageManager`.
  - Sync: `src/services/SyncEngine.ts` (queue, exponential backoff, conflict resolution). Remote listeners: `src/services/FirebaseSyncListener.ts`.
  - Domain logic: `src/services/ShoppingListManager.ts`, `ItemManager.ts`, `UrgentItemManager.ts` (use these instead of touching DB directly).
  - Auth & groups: `src/services/AuthenticationModule.ts` and `src/screens/auth/*` — familyGroupId drives sync.

- Important design patterns (use these when editing or adding code)
  - Offline-first flow: write to local DB first (via `LocalStorageManager.save*`), then call `SyncEngine.pushChange(entityType, id, operation)` to enqueue or push to Firebase.
    - Example: see `ShoppingListManager.createList` — save locally, increment usage, then `SyncEngine.pushChange('list', id, 'create')`.
  - Local-only fields: `syncStatus` is intentionally local and must NOT be written to Firebase. SyncEngine strips it before sending (see `syncToFirebase`). Preserve `syncStatus` when merging remote changes (see `App.tsx` remote-change handler).
  - Conflict resolution: use `SyncEngine.resolveConflict` rules (checked vs deleted semantics, last-write-wins fallback). Follow those rules when adding new entity types.
  - Queueing and retries: SyncEngine queues operations when offline and uses exponential backoff with jitter. Prefer adding operations through `SyncEngine.pushChange` rather than direct Firebase writes.
  - Listener dedup: `FirebaseSyncListener` guards against duplicate listeners using an internal map; follow that pattern when adding new listeners.

- Critical files to reference when working on features
  - `App.tsx` — auth flow, how SyncEngine and NotificationManager are initialized and how remote changes are applied to local DB.
  - `src/services/SyncEngine.ts` — pushChange, processOperationQueue, conflict rules, and queue behavior.
  - `src/services/FirebaseSyncListener.ts` — remote-to-local mapping, listener lifecycle (start/stop), and path conventions (`/familyGroups/{id}/lists`, `.../items`).
  - `src/services/LocalStorageManager.ts` — single source for DB reads/writes; always use it for local DB interactions.
  - `src/database/models/*` and `src/database/schema.ts` — canonical shape of stored entities.

- Developer workflows & commands (verified in `package.json`)
  - Install: `npm install` (Node >= 18)
  - Start Metro: `npm run start`
  - Run Android emulator: `npm run android` (ensure Android SDK + emulator configured)
  - Run iOS simulator: `npm run ios` (mac only; run `cd ios && pod install` first)
  - Tests: `npm test` (Jest). Lint: `npm run lint`.

- Environment and integrations you must configure locally
  - Firebase: add `GoogleService-Info.plist` (iOS) and `android/app/google-services.json` (Android). Follow README -> "Configure Firebase".
  - Google Cloud Vision API: API key required for OCR features; see `.env.example` and README.
  - RevenueCat (payments) is initialized in `App.tsx` via `PaymentService` — check `src/services/PaymentService.ts` before changing payments.

- Conventions and pitfalls
  - Preserve `syncStatus` and local-only metadata when applying remote changes. `App.tsx` demonstrates preserving `syncStatus` and is the canonical example.
  - Prefer high-level service APIs (`ShoppingListManager`, `ItemManager`) for business logic. Avoid duplicating sync/queue logic across components.
  - When adding Firebase paths, follow existing structure: lists and items are namespaced under a family group; urgent items use `urgentItems/{familyGroupId}` in `FirebaseSyncListener`.
  - Use WatermelonDB observers for UI subscriptions (see `ShoppingListManager.subscribeToListChanges`). Avoid polling.

- Quick examples
  - Create a list (pattern):
    1. call `LocalStorageManager.saveList(list)`
    2. `UsageTracker.incrementListCounter(userId)` (if applicable)
    3. `SyncEngine.pushChange('list', list.id, 'create')`

  - Add a remote listener (pattern):
    - Use `FirebaseSyncListener.startListeningToLists(familyGroupId)` and keep the returned unsubscribe to stop it when appropriate.

- What to do if something is missing or ambiguous
  - If you need a data field's shape, check `src/database/models/*` and `src/models/types.ts` first.
  - If unsure about whether to write to Firebase directly or queue, default to `SyncEngine.pushChange` (it handles both online and offline cases).
  - For tests, add Jest unit tests under `__tests__` following existing patterns (there are no repo-wide tests to merge here).

If any section is unclear or you want more examples (e.g., wiring a new entity through LocalStorageManager -> SyncEngine -> Firebase), tell me which area to expand.
