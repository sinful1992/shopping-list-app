# Family Shopping List App

A React Native mobile application for collaborative family shopping list management with real-time synchronization, offline support, receipt capture, OCR, and expenditure tracking.

## 📱 Features

### ✅ Implemented
- **User Authentication** - Email/password sign up and login via Firebase
- **Family Groups** - Create or join family groups with invitation codes *(Navigation fixed Nov 2025)*
- **Shopping Lists** - Create, view, and manage shopping lists
- **Real-Time Items** - Add, edit, check off, and delete items
- **Real-Time Sync** - Multi-user collaboration with Firebase Realtime Database *(Import fixed Nov 2025)*
- **Offline Support** - Full functionality when offline with automatic sync *(WatermelonDB config fixed Nov 2025)*
- **Cross-Platform** - iOS and Android support
- **CI/CD Pipeline** - Automated Android builds via GitHub Actions *(Fully functional Nov 2025)*
- **In-App Legal Viewer** - Privacy Policy and Terms of Service rendered in-app with markdown
- **Terms Acceptance** - Versioned terms acceptance flow with decline/logout option
- **Subscription Management** - RevenueCat integration with free/premium/family tiers
- **Receipt Capture** - Photo capture of receipts
- **Receipt OCR** - Extract merchant, date, total, and line items via a self-hosted PaddleOCR server
- **Expenditure Tracking** - Track spending with date-range filtering
- **Shopping History** - View completed shopping trips with receipts
- **Budget Analysis** - Analyze spending patterns over time

## 🏗 Architecture

The app follows a rigorous specification-architect methodology with complete traceability from requirements to implementation:

- **Frontend**: React Native with TypeScript
- **Backend**: Firebase (Authentication, Realtime Database, Cloud Storage)
- **Local Database**: WatermelonDB for offline-first architecture
- **OCR**: Self-hosted PaddleOCR server (no per-request cloud cost)
- **State Management**: React Context API + local storage

### Core Services

1. **AuthenticationModule** - User auth and family group management
2. **LocalStorageManager** - Offline data persistence with WatermelonDB
3. **SyncEngine** - Real-time synchronization with conflict resolution
4. **ShoppingListManager** - Shopping list CRUD operations
5. **ItemManager** - Item management with real-time updates

## 📦 Installation

### Prerequisites

- Node.js >= 18
- React Native development environment setup
  - **iOS**: Xcode, CocoaPods
  - **Android**: Android Studio, Java JDK
- Firebase project

### Setup Steps

1. **Clone the repository**
   ```bash
   cd shoping
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **iOS specific setup**
   ```bash
   cd ios && pod install && cd ..
   ```

4. **Configure Firebase**

   a. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)

   b. Enable Authentication (Email/Password provider)

   c. Create Realtime Database and set security rules:
   ```json
   {
     "rules": {
       "users": {
         "$uid": {
           ".read": "$uid === auth.uid",
           ".write": "$uid === auth.uid"
         }
       },
       "familyGroups": {
         "$groupId": {
           ".read": "auth != null && data.child('memberIds').val().contains(auth.uid)",
           ".write": "auth != null && data.child('memberIds').val().contains(auth.uid)"
         }
       }
     }
   }
   ```

   d. Enable Firebase Cloud Storage

   e. Download configuration files:
      - iOS: `GoogleService-Info.plist` → Place in `ios/` folder
      - Android: `google-services.json` → Place in `android/app/` folder

5. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your Firebase, Supabase, and RevenueCat credentials

6. **Run the app**
   ```bash
   # iOS
   npm run ios

   # Android
   npm run android
   ```

## 📂 Project Structure

```
shoping/
├── App.tsx                          # Main app entry point
├── package.json                     # Dependencies
├── tsconfig.json                    # TypeScript configuration
├── .env.example                     # Environment variables template
├── src/
│   ├── models/
│   │   └── types.ts                # TypeScript interfaces
│   ├── database/
│   │   ├── schema.ts               # WatermelonDB schema
│   │   └── models/                 # Database models
│   │       ├── ShoppingList.ts
│   │       ├── Item.ts
│   │       └── SyncQueue.ts
│   ├── services/
│   │   ├── AuthenticationModule.ts  # User authentication
│   │   ├── LocalStorageManager.ts   # Offline storage
│   │   ├── SyncEngine.ts            # Real-time sync
│   │   ├── ShoppingListManager.ts   # List management
│   │   └── ItemManager.ts           # Item management
│   ├── components/
│   │   └── SimpleMarkdown.tsx       # Lightweight markdown renderer
│   ├── legal/
│   │   ├── index.ts                 # Legal exports & CURRENT_TERMS_VERSION
│   │   ├── PrivacyPolicy.ts         # Privacy policy content
│   │   └── TermsOfService.ts        # Terms of service content
│   └── screens/
│       ├── auth/
│       │   ├── LoginScreen.tsx
│       │   ├── SignUpScreen.tsx
│       │   ├── FamilyGroupScreen.tsx
│       │   └── TermsAcceptanceScreen.tsx  # Terms acceptance flow
│       ├── settings/
│       │   ├── SettingsScreen.tsx
│       │   └── LegalDocumentScreen.tsx    # In-app legal viewer
│       ├── lists/
│       │   ├── HomeScreen.tsx       # Main list view
│       │   └── ListDetailScreen.tsx # Item management
│       ├── budget/
│       │   └── BudgetScreen.tsx     # Expenditure tracking
│       └── history/
│           └── HistoryScreen.tsx    # Shopping history
```

## 🔐 Security

- Firebase Security Rules enforce family group access control
- Firebase ID tokens verified server-side in Supabase edge functions
- Per-UID rate limiting on sensitive edge functions
- Offline data encrypted at rest (platform-provided)

## 💰 Cost Estimate

### Development Costs
- Timeline: 18 weeks
- Team: 1-2 developers
- Estimated: $40,000-$80,000 (varies by location/rates)

### Ongoing Costs
- **Firebase**: Free tier sufficient for small families; ~$25-50/month for larger usage
- **OCR**: Self-hosted PaddleOCR — no per-request cost
- **App Store Fees**: $99/year (Apple) + $25 one-time (Google)

## 📋 Documentation

- **[CHANGELOG.md](./CHANGELOG.md)** - Recent fixes and changes
- **[RUNBOOK.md](./RUNBOOK.md)** - Operational runbook (backups, rollback, secrets)
- **[CLAUDE.md](./CLAUDE.md)** - Project workflow and conventions

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run with coverage
npm test -- --coverage

# Run linting
npm run lint
```

## 🚀 Deployment

### iOS App Store

1. Configure app identifier in Xcode
2. Create App Store Connect listing
3. Build release: Product → Archive in Xcode
4. Upload via Xcode or Transporter
5. Submit for review

### Android Play Store

1. Generate upload key and keystore
2. Configure signing in `android/app/build.gradle`
3. Build release: `cd android && ./gradlew bundleRelease`
4. Upload to Play Console
5. Submit for review

## 📝 License

Proprietary - All rights reserved

## 👥 Contributors

Implementation based on specification-architect methodology

## 📞 Support

For issues or questions, please refer to the specification documents or create an issue in the repository.

---

**Generated with**: Specification Architect AI
**Last Updated**: February 2026
