# Build Debug APK Locally (No Secrets Required)

> ## ⚠️ SECURITY NOTICE
>
> This guide uses **INTENTIONALLY FAKE** credentials for build testing only.
> The resulting APK will NOT connect to any real services.
>
> **NEVER commit real credentials to version control.**
>
> For a working app, get real credentials from:
> - Firebase Console (google-services.json)
> - Google Cloud Console (Vision API key)
> - RevenueCat Dashboard (API keys)

You can build a debug APK on your local machine without any Firebase configuration or signing keys.

## Prerequisites

1. **Node.js** installed (check: `node --version`)
2. **Java JDK 17** installed (check: `java -version`)
3. **Android SDK** installed via Android Studio

## Quick Build (5 Steps)

### Step 1: Install Dependencies

```bash
cd C:\Users\barku\Documents\shoping
npm install
```

### Step 2: Create Dummy .env File

> **WARNING:** These are FAKE credentials - the app will NOT work with these!

```bash
# Create a basic .env file (app will build but won't connect to Firebase)
echo FIREBASE_API_KEY=FAKE_KEY_FOR_BUILD_TEST_ONLY > .env
echo FIREBASE_AUTH_DOMAIN=fake-project.firebaseapp.com >> .env
echo FIREBASE_DATABASE_URL=https://fake-project.firebaseio.com >> .env
echo FIREBASE_PROJECT_ID=fake-project >> .env
echo FIREBASE_STORAGE_BUCKET=fake-project.appspot.com >> .env
echo FIREBASE_MESSAGING_SENDER_ID=000000000000 >> .env
echo FIREBASE_APP_ID=1:000000000000:android:fake123 >> .env
echo GOOGLE_CLOUD_VISION_API_KEY=FAKE_VISION_KEY_FOR_BUILD_TEST >> .env
echo REVENUECAT_ANDROID_API_KEY=FAKE_REVENUECAT_KEY >> .env
```

### Step 3: Create Dummy google-services.json

```bash
# Create directory if it doesn't exist
mkdir -p android\app

# Create a minimal google-services.json
```

Save this content to `android/app/google-services.json`:

> **WARNING:** This is a FAKE configuration for build testing only.
> Get real credentials from Firebase Console for a working app.

```json
{
  "project_info": {
    "project_number": "000000000000",
    "firebase_url": "https://fake-project.firebaseio.com",
    "project_id": "fake-project",
    "storage_bucket": "fake-project.appspot.com"
  },
  "client": [
    {
      "client_info": {
        "mobilesdk_app_id": "1:000000000000:android:fake123",
        "android_client_info": {
          "package_name": "com.shoppinglistapp"
        }
      },
      "oauth_client": [],
      "api_key": [
        {
          "current_key": "FAKE_API_KEY_FOR_BUILD_TEST_ONLY"
        }
      ],
      "services": {
        "appinvite_service": {
          "other_platform_oauth_client": []
        }
      }
    }
  ],
  "configuration_version": "1"
}
```

### Step 4: Build Debug APK

```bash
cd android
.\gradlew assembleDebug
```

**This will take 5-10 minutes the first time** (downloading dependencies).

### Step 5: Install APK

The APK will be at:
```
android\app\build\outputs\apk\debug\app-debug.apk
```

**Install it:**

```bash
# If you have a phone connected via USB
adb install android\app\build\outputs\apk\debug\app-debug.apk

# Or copy the file to your phone and tap to install
```

## ⚠️ Important Notes

**The app WILL build successfully** ✅
**The app will NOT work at runtime** ❌ (no real Firebase)

This debug APK:
- ✅ Tests that your code compiles
- ✅ Tests that build process works
- ✅ Can be installed on device
- ✅ Shows you what the app looks like
- ❌ Cannot connect to Firebase (dummy config)
- ❌ Cannot upload receipts (no Storage)
- ❌ Cannot sync data (no Database)

**To get a WORKING app, you need real Firebase credentials.**

---

## Alternative: GitHub Actions Debug Build

You can also build on GitHub with minimal secrets:

1. **Add only these 3 secrets:**
   - `GOOGLE_SERVICES_JSON` - Your real file (Base64)
   - `FIREBASE_API_KEY` - Your real API key
   - `FIREBASE_PROJECT_ID` - Your real project ID

2. **Modify workflow to skip signing:**

   See `BUILD_DEBUG_GITHUB.md` for instructions.

---

## Troubleshooting

### Error: "SDK location not found"

**Fix:** Set `ANDROID_HOME` environment variable:

```bash
# In PowerShell
$env:ANDROID_HOME = "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk"

# Or add to System Environment Variables permanently
```

### Error: "java: invalid target release: 17"

**Fix:** Install Java JDK 17:
- Download from: https://adoptium.net/
- Install and set `JAVA_HOME`

### Error: "Execution failed for task ':app:processDebugGoogleServices'"

**Fix:** Ensure `google-services.json` exists at `android/app/google-services.json`

### Build is very slow

**Normal!** First build downloads ~500MB of dependencies. Subsequent builds are much faster.

### Gradle daemon issues

**Fix:**
```bash
cd android
.\gradlew --stop
.\gradlew clean
.\gradlew assembleDebug
```

---

## Fast Rebuild

After first build, rebuilds are fast:

```bash
cd android
.\gradlew assembleDebug --offline
```

Uses cached dependencies (5x faster).

---

## Build Statistics

**First build:**
- Time: 10-15 minutes
- Download: ~500 MB dependencies
- Disk space: ~2 GB

**Subsequent builds:**
- Time: 2-3 minutes
- No downloads (cached)
- Uses existing dependencies

---

## Next Steps

Once debug build works:

1. ✅ Verify your build environment is set up correctly
2. ⏳ Set up real Firebase project
3. ⏳ Add real credentials to `.env`
4. ⏳ Build release APK with signing
5. ⏳ Set up GitHub Actions with secrets

---

## Summary

```bash
# Quick build commands:
npm install
# (create dummy .env and google-services.json)
cd android
.\gradlew assembleDebug

# APK location:
android\app\build\outputs\apk\debug\app-debug.apk
```

**This proves your build system works!** 🎉
