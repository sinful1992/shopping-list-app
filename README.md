# Family Shopping List App

An Android React Native app for collaborative family shopping lists: real-time
sync, offline-first storage, receipt capture with OCR, and expenditure tracking.

## 🚦 Release Status

**On Google Play, in closed testing.** The app is published to the Play Console
on a **closed testing track** — it is not publicly listed, does not appear in
Play Store search, and can only be installed by invited testers who have
accepted the opt-in. There is no open testing or production release, so a Play
Store link is of no use to anyone outside the tester list.

- **Package**: `com.familyshoppinglist.app`
- **Track**: closed testing (invite-only)
- **Platform**: Android only — there is no `ios/` project in this repository
- **Builds**: signed AAB/APK produced by GitHub Actions; see [.github/workflows](./.github/workflows)

## 📱 Features

- **User Authentication** — email/password sign up and login via Firebase
- **Family Groups** — create or join a group with an invitation code
- **Shopping Lists** — create, view, and manage lists
- **Real-Time Items** — add, edit, check off, and delete items
- **Real-Time Sync** — multi-user collaboration over Firebase Realtime Database
- **Offline Support** — full functionality offline, with automatic sync
- **Receipt Capture** — photograph receipts
- **Receipt OCR** — extract merchant, date, total, and line items via a self-hosted PaddleOCR server
- **Expenditure Tracking** — spending with date-range filtering
- **Shopping History** — completed shopping trips with their receipts
- **Budget Analysis** — spending patterns over time
- **Subscription Management** — RevenueCat, with free/premium/family tiers
- **Legal** — in-app Privacy Policy and Terms, with a versioned acceptance flow

## 🏗 Architecture

Offline-first: every write lands in WatermelonDB on the device, then syncs. The
app stays fully usable with no network.

- **Frontend**: React Native with TypeScript
- **Backend**: Firebase (Authentication, Realtime Database, Cloud Storage) and Supabase edge functions
- **Local Database**: WatermelonDB
- **OCR**: self-hosted PaddleOCR server (no per-request cloud cost)
- **State Management**: React Context API + local storage

Most of the behaviour lives in `src/services/`. `SyncEngine`,
`LocalStorageManager` and `ShoppingListManager` are the three to read first.

## 📦 Setup

Prerequisites: Node.js >= 18, a React Native Android environment (Android
Studio + JDK), and a Firebase project.

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure Firebase**
   - Enable Authentication (Email/Password provider)
   - Create a Realtime Database and deploy `database.rules.json` from this
     repository rather than hand-writing rules in the console — CI does not
     deploy them
   - Enable Cloud Storage
   - Download `google-services.json` into `android/app/`

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Then fill in the Firebase, Supabase, and RevenueCat credentials.

4. **Run the app**
   ```bash
   npm run android
   ```

## 🛠 Development

Scripts live in `package.json` (`test`, `lint`, `typecheck`, `knip`). Two things
that are not obvious from there:

- `npm run test:rules` runs the Realtime Database rules tests against the
  Firebase emulator, and needs **JDK 21+**.
- Git hooks enforce the gates: **pre-commit** runs the encoding check and the
  full jest suite, and refuses a `src/` change that has not bumped the version
  in `package.json`; **pre-push** runs knip, `tsc` and eslint — the same gates
  CI runs.

## 🔐 Security

- Firebase Security Rules enforce family group access control
- Firebase ID tokens verified server-side in Supabase edge functions
- Per-UID rate limiting on sensitive edge functions
- Offline data encrypted at rest (platform-provided)

## 📋 Documentation

- **[RUNBOOK.md](./RUNBOOK.md)** — deployment, backups, restores, key rotation, release testing
- **[CHANGELOG.md](./CHANGELOG.md)** — recent fixes and changes
- **[LICENSE](./LICENSE)** — proprietary licence terms
- **[docs/DESIGN_AUDIT.md](./docs/DESIGN_AUDIT.md)** — design system audit and its follow-up
- **[docs/DATA_SAFETY.md](./docs/DATA_SAFETY.md)** — Play Console data-safety declarations
- **[docs/store-layouts.md](./docs/store-layouts.md)** — per-store category order capture

## 📝 License

**Proprietary — all rights reserved.** See [LICENSE](./LICENSE). This is not open
source: being able to read the code grants no right to use, copy, modify or
distribute it. Third-party dependencies keep their own licences, and people who
install the published app are covered by the in-app Terms of Service in
[`src/legal/`](./src/legal), not by this repository licence.

## 📞 Support

Open an issue in the repository.
