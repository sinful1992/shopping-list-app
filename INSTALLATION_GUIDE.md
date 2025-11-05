# Installation Guide

This guide will help you install and run the Family Shopping List app on your device.

## Prerequisites

### Required Software

1. **Node.js** (v18 or later)
   - Download from https://nodejs.org/
   - Verify: `node --version`

2. **npm or yarn**
   - Comes with Node.js
   - Verify: `npm --version`

3. **React Native CLI**
   ```bash
   npm install -g react-native-cli
   ```

### For Android Development

4. **Java Development Kit (JDK 17)**
   - Download from https://adoptium.net/
   - Set `JAVA_HOME` environment variable

5. **Android Studio**
   - Download from https://developer.android.com/studio
   - During installation, select:
     - Android SDK
     - Android SDK Platform
     - Android Virtual Device (AVD)

6. **Android SDK Configuration**
   - Open Android Studio → Settings → Appearance & Behavior → System Settings → Android SDK
   - Install:
     - Android 13.0 (Tiramisu) - API Level 33
     - Android SDK Platform-Tools
     - Android SDK Build-Tools
   - Set environment variables:
     ```
     ANDROID_HOME = C:\Users\YourUsername\AppData\Local\Android\Sdk
     Add to PATH: %ANDROID_HOME%\platform-tools
     Add to PATH: %ANDROID_HOME%\emulator
     ```

### For iOS Development (macOS only)

7. **Xcode** (macOS only)
   - Download from Mac App Store
   - Install Command Line Tools: `xcode-select --install`

8. **CocoaPods** (macOS only)
   ```bash
   sudo gem install cocoapods
   ```

---

## Step 1: Install Dependencies

Open terminal in the project directory (`C:\Users\barku\Documents\shoping`):

```bash
# Install JavaScript dependencies
npm install

# For iOS only (macOS)
cd ios && pod install && cd ..
```

---

## Step 2: Configure Firebase

1. **Create Firebase Project**
   - Go to https://console.firebase.google.com/
   - Create a new project
   - Enable Authentication (Email/Password)
   - Create Realtime Database
   - Enable Cloud Storage

2. **Android Configuration**
   - In Firebase Console → Project Settings → Add Android app
   - Package name: `com.shoppinglistapp` (or your chosen package)
   - Download `google-services.json`
   - Place it in: `android/app/google-services.json`

3. **iOS Configuration (if building for iOS)**
   - In Firebase Console → Project Settings → Add iOS app
   - Bundle ID: `com.shoppinglistapp`
   - Download `GoogleService-Info.plist`
   - Place it in: `ios/ShoppingListApp/GoogleService-Info.plist`

4. **Create .env file**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your Firebase credentials:
   ```
   FIREBASE_API_KEY=your_api_key
   FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   FIREBASE_DATABASE_URL=https://your_project.firebaseio.com
   FIREBASE_PROJECT_ID=your_project_id
   FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   FIREBASE_APP_ID=your_app_id
   GOOGLE_CLOUD_VISION_API_KEY=your_vision_api_key
   ```

---

## Step 3: Development Installation

### Option A: Run on Android Emulator

1. **Create Android Virtual Device**
   - Open Android Studio → Device Manager
   - Click "Create Device"
   - Select Pixel 5 or similar
   - Download and select system image (API 33)
   - Finish setup

2. **Start the emulator**
   - In Android Studio → Device Manager → Click ▶️ on your device
   - Or via command line:
   ```bash
   emulator -avd Your_AVD_Name
   ```

3. **Run the app**
   ```bash
   # Start Metro bundler (in one terminal)
   npm start

   # Run on Android (in another terminal)
   npm run android
   # or
   npx react-native run-android
   ```

### Option B: Run on Physical Android Device

1. **Enable Developer Options on your phone**
   - Go to Settings → About Phone
   - Tap "Build Number" 7 times
   - Go back → Developer Options
   - Enable "USB Debugging"

2. **Connect your phone**
   - Connect via USB cable
   - Accept USB debugging prompt on phone
   - Verify connection: `adb devices`

3. **Run the app**
   ```bash
   # Start Metro bundler
   npm start

   # Run on Android device
   npm run android
   ```

### Option C: Run on iOS (macOS only)

```bash
# Start Metro bundler
npm start

# Run on iOS
npm run ios
# or specify simulator
npx react-native run-ios --simulator="iPhone 14"
```

---

## Step 4: Production Installation (Android APK)

### Build Release APK

1. **Generate signing key**
   ```bash
   cd android/app
   keytool -genkeypair -v -storetype PKCS12 -keystore shopping-list-release-key.keystore -alias shopping-list-key -keyalg RSA -keysize 2048 -validity 10000
   ```
   - Remember the password you set!

2. **Configure signing in android/gradle.properties**
   Add:
   ```
   MYAPP_RELEASE_STORE_FILE=shopping-list-release-key.keystore
   MYAPP_RELEASE_KEY_ALIAS=shopping-list-key
   MYAPP_RELEASE_STORE_PASSWORD=your_password
   MYAPP_RELEASE_KEY_PASSWORD=your_password
   ```

3. **Update android/app/build.gradle**
   Add inside `android` block:
   ```gradle
   signingConfigs {
       release {
           if (project.hasProperty('MYAPP_RELEASE_STORE_FILE')) {
               storeFile file(MYAPP_RELEASE_STORE_FILE)
               storePassword MYAPP_RELEASE_STORE_PASSWORD
               keyAlias MYAPP_RELEASE_KEY_ALIAS
               keyPassword MYAPP_RELEASE_KEY_PASSWORD
           }
       }
   }
   buildTypes {
       release {
           signingConfig signingConfigs.release
           minifyEnabled true
           proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
       }
   }
   ```

4. **Build the APK**
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

   APK location: `android/app/build/outputs/apk/release/app-release.apk`

5. **Build AAB for Play Store** (recommended)
   ```bash
   cd android
   ./gradlew bundleRelease
   ```

   AAB location: `android/app/build/outputs/bundle/release/app-release.aab`

### Install APK on Device

**Method 1: ADB Install**
```bash
adb install android/app/build/outputs/apk/release/app-release.apk
```

**Method 2: Direct Transfer**
1. Copy `app-release.apk` to your phone
2. Open file on phone
3. Enable "Install from Unknown Sources" if prompted
4. Tap Install

**Method 3: Google Play Store**
1. Go to https://play.google.com/console
2. Create app listing
3. Upload AAB file
4. Complete store listing
5. Submit for review
6. Once approved, download from Play Store

---

## Step 5: Production Installation (iOS)

### Build for iOS (macOS only)

1. **Open Xcode**
   ```bash
   open ios/ShoppingListApp.xcworkspace
   ```

2. **Configure Signing**
   - Select project in Xcode
   - Go to Signing & Capabilities
   - Select your Team (Apple Developer account required)
   - Xcode will automatically manage provisioning

3. **Build for Device**
   - Select your physical device or "Any iOS Device"
   - Product → Archive
   - Once archived, click "Distribute App"
   - Choose distribution method:
     - **Ad Hoc**: For testing on specific devices
     - **App Store**: For App Store submission

4. **Install on Device**
   - For Ad Hoc: Use TestFlight or direct install via Xcode
   - For App Store: Submit to App Store Connect → Review → Publish

---

## Quick Start Commands

```bash
# 1. Install dependencies
npm install

# 2. Start Metro bundler
npm start

# 3. In another terminal:
# For Android
npm run android

# For iOS (macOS only)
npm run ios

# 4. Build release APK
cd android && ./gradlew assembleRelease
```

---

## Troubleshooting

### Metro Bundler Issues
```bash
# Clear cache
npm start -- --reset-cache

# Or
npx react-native start --reset-cache
```

### Android Build Issues
```bash
# Clean build
cd android
./gradlew clean

# Clear gradle cache
rm -rf ~/.gradle/caches/
```

### Port Already in Use
```bash
# Kill process on port 8081
npx react-native start --port 8082
```

### Dependencies Issues
```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install

# For iOS
cd ios && pod install && cd ..
```

### WatermelonDB Native Issues
```bash
# Rebuild native modules
cd android && ./gradlew clean
cd ios && pod install
```

---

## Firebase Configuration Checklist

- [ ] Firebase project created
- [ ] Authentication enabled (Email/Password)
- [ ] Realtime Database created
- [ ] Storage enabled
- [ ] Security rules configured
- [ ] `google-services.json` added (Android)
- [ ] `GoogleService-Info.plist` added (iOS)
- [ ] `.env` file configured
- [ ] Google Cloud Vision API enabled
- [ ] API key added to `.env`

---

## Cost Estimates

- **Firebase (Spark/Free Plan)**:
  - 10,000 Realtime Database connections/month
  - 1GB Storage
  - 10GB/month download

- **Google Cloud Vision API**:
  - 1,000 requests/month free
  - $1.50 per 1,000 requests after

- **Google Play Store**: $25 one-time fee
- **Apple App Store**: $99/year

---

## Next Steps

1. ✅ Install dependencies
2. ✅ Configure Firebase
3. ✅ Run in development mode
4. ⏳ Test all features
5. ⏳ Build production APK/IPA
6. ⏳ Deploy to app stores

For detailed troubleshooting, see README.md or open an issue.
