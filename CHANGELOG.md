# Changelog

All notable changes to the Shopping List App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.15.0] - 2026-02-08

### Added
- **Item Quantity**: +/- buttons in edit modal to buy multiples of the same item (e.g., 2 breads at £1.00 = £2.00)
- Quantity badge ("x3") displayed on item cards when qty > 1
- Running total and smart suggestions now reflect quantity multiplier
- New `unit_qty` database column (schema v10) with migration from v9

### Fixed
- **Critical**: Fixed lists disappearing after pull-refresh - added SQLite write verification in `saveList` to ensure database persistence before returning
- Price of £0.00 no longer falls back to predicted price (changed `||` to `??`)

### Removed
- Dead `renderItem` function in ListDetailScreen (75 lines, replaced by inline `.map()`)
- Unused `FlatList` import

## [0.14.0] - 2026-02-08

### Added
- **Play Store Readiness**: In-app legal document viewer with `SimpleMarkdown` renderer
- **Terms Acceptance Flow**: New `TermsAcceptanceScreen` with Accept / Decline & Log Out, versioned via `CURRENT_TERMS_VERSION`
- **License Grant**: Added License Grant clause to Terms of Service
- **Hosted Legal Pages**: Separate `familyshoppinglist-legal` repo with GitHub Pages for Play Console privacy policy URL
- **Data Safety Reference**: `docs/DATA_SAFETY.md` for Play Console Data Safety form

### Changed
- Synced `build.gradle` versionCode (1312) and versionName ("0.13.12") to match `package.json`
- Settings footer now reads version dynamically from `package.json` (no more version drift)
- Privacy Policy and Terms of Service open in-app instead of external browser
- Strengthened RevenueCat data-sharing disclosure in Privacy Policy (purchase history explicitly mentioned)
- Legal section icons changed from `open-outline` to `chevron-forward-outline`
- Bumped Privacy Policy and Terms of Service "Last Updated" to February 2026

### Added (Types)
- `termsAcceptedVersion` and `termsAcceptedAt` fields on `User` interface

## [0.13.8] - 2026-02-02

### Added
- Real-time user data synchronization - App now automatically updates when user data changes in Firebase
- `refreshUserData()` method in AuthenticationModule to fetch latest user data
- Auto-generated keystores for CI builds (no manual keystore management required)
- Babel decorators plugin support for WatermelonDB models

### Fixed
- **Critical**: Fixed lists disappearing when app returns from background - `useShoppingLists` now fetches lists directly from database on mount, foreground return, and manual refresh instead of relying solely on WatermelonDB observer (which can be unreliable on component remount)
- **Critical**: Fixed family group navigation issue - App now automatically navigates to main screen after creating/joining a family group
- **Critical**: Fixed Android build failure due to incorrect NetInfo import path (`@react-native-netinfo/netinfo` → `@react-native-community/netinfo`)
- **Critical**: Fixed Android build failure due to missing Babel decorators configuration for WatermelonDB
- **Critical**: Fixed Android build signing errors by auto-generating keystore during CI build
- Fixed keystore path configuration in GitHub Actions workflow
- Fixed AsyncStorage not updating after family group operations

### Changed
- iOS workflow now only runs on manual trigger (workflow_dispatch) to focus on Android builds
- GitHub Actions workflow now generates keystores dynamically instead of using stored secrets
- Enhanced `onAuthStateChanged` to listen for real-time Firebase Database changes
- Updated family group creation/join flows to refresh user data immediately

### Removed
- Dependency on `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_STORE_PASSWORD`, and `ANDROID_KEY_PASSWORD` GitHub secrets

## [1.0.0] - 2025-01-XX

### Added
- Initial release
- User authentication with Firebase (email/password)
- Family group creation and joining with invitation codes
- Shopping list creation and management
- Real-time item management with check-off functionality
- Offline support with WatermelonDB
- Real-time synchronization with Firebase Realtime Database
- Cross-platform support (iOS and Android)

---

## Build Fixes Summary (November 2025)

During the initial CI/CD setup, several critical build issues were identified and resolved:

1. **Module Resolution Error**: NetInfo package import path was incorrect
2. **Babel Parser Error**: WatermelonDB decorators required Babel plugin configuration
3. **Keystore Authentication Error**: Simplified by auto-generating keystores during build
4. **Navigation Bug**: User state not updating after family group operations

All issues have been resolved and the Android build pipeline is now fully functional.
