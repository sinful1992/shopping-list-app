# 🚀 Quick Build Test (No Secrets)

Want to test if everything works? Build a debug APK locally without any Firebase setup!

## ⚡ Super Quick Method

**Just run this:**

```bash
build-debug.bat
```

This will:
1. Install dependencies
2. Build debug APK
3. Show you where the APK is

**Time:** 10-15 minutes (first time)

---

## 📋 Prerequisites

Before building, you need:

### 1. Node.js (Check: `node --version`)
Download from: https://nodejs.org/

### 2. Java JDK 17 (Check: `java -version`)
Download from: https://adoptium.net/

### 3. Android SDK (via Android Studio)
Download from: https://developer.android.com/studio

**Set environment variables:**
```
ANDROID_HOME = C:\Users\YourName\AppData\Local\Android\Sdk
JAVA_HOME = C:\Program Files\Eclipse Adoptium\jdk-17.x.x.x-hotspot
```

Add to PATH:
```
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\tools
%ANDROID_HOME%\cmdline-tools\latest\bin
```

---

## 🎯 Step-by-Step Build

### Step 1: Install Dependencies

```bash
cd C:\Users\barku\Documents\shoping
npm install
```

This installs all JavaScript packages (~5 minutes).

### Step 2: Check Android Setup

```bash
cd android
.\gradlew --version
```

**If you get an error**, the Android project isn't initialized yet. This is normal for a new React Native project.

### Step 3: Build APK

```bash
cd android
.\gradlew assembleDebug
```

**First build takes 10-15 minutes** (downloads Gradle, Android build tools, etc.)

---

## ✅ What You Get

**APK Location:**
```
android\app\build\outputs\apk\debug\app-debug.apk
```

**File size:** ~50-80 MB

**Can install?** ✅ Yes!
**Will it work?** ⚠️ Partially (builds with dummy Firebase config)

---

## 📱 Install on Phone

### Method 1: USB Cable + ADB

```bash
# Check if phone is connected
adb devices

# Install APK
adb install android\app\build\outputs\apk\debug\app-debug.apk
```

### Method 2: Direct Transfer

1. Copy `app-debug.apk` to your phone
2. Open file on phone
3. Tap "Install"
4. Enable "Install from Unknown Sources" if prompted

---

## ⚠️ What Works vs What Doesn't

**✅ Will Work:**
- App builds successfully
- App installs on phone
- App opens (UI loads)
- You can see all screens
- Navigation works

**❌ Won't Work:**
- Login/Signup (no Firebase Auth)
- Creating shopping lists (no Firebase Database)
- Adding items (no Firebase Database)
- Uploading receipts (no Firebase Storage)
- OCR processing (no Vision API)
- Data sync (no Firebase)

**Why?** The `.env` file contains dummy values. The app builds but can't connect to real services.

---

## 🔧 Common Build Errors

### Error: "SDK location not found"

**Problem:** Android SDK not configured

**Fix:**
```bash
# Create local.properties file
echo sdk.dir=C:\\Users\\YourName\\AppData\\Local\\Android\\Sdk > android\local.properties
```

Replace `YourName` with your Windows username.

### Error: "Could not find or load main class org.gradle.wrapper.GradleWrapperMain"

**Problem:** Gradle wrapper not initialized

**Fix:**
```bash
cd android
gradle wrapper
.\gradlew assembleDebug
```

### Error: "Execution failed for task ':app:processDebugGoogleServices'"

**Problem:** google-services.json is invalid

**Fix:** Already created! Check that `android/app/google-services.json` exists (it should - I created it for you).

### Error: "Java heap space" or "Out of memory"

**Problem:** Not enough memory for build

**Fix:** Create `android/gradle.properties`:
```
org.gradle.jvmargs=-Xmx4096m -XX:MaxPermSize=512m -XX:+HeapDumpOnOutOfMemoryError
```

---

## 🎓 Understanding the Build

### What's Being Built?

```
Your React Native Code
       ↓
JavaScript Bundle (Metro bundler)
       ↓
Android APK (Gradle)
       ↓
Installable app-debug.apk
```

### Build Artifacts

- **APK:** The installable Android app
- **Bundle:** JavaScript code (assets/index.android.bundle)
- **Resources:** Images, fonts, etc.
- **Native Libs:** React Native native modules

### Debug vs Release

| Feature | Debug APK | Release APK |
|---------|-----------|-------------|
| Size | Large (~80MB) | Smaller (~40MB) |
| Speed | Slower | Faster (optimized) |
| Signing | Debug key | Release key required |
| Distribution | Testing only | Can publish |
| JS Source Maps | Included | Stripped |

---

## 🚀 Next Steps After Build

Once the debug build works:

1. ✅ **Your build environment is set up correctly!**

2. **To get a WORKING app:**
   - Create Firebase project
   - Update `.env` with real credentials
   - Replace `google-services.json` with real file
   - Rebuild

3. **For distribution:**
   - Generate signing key
   - Build release APK
   - Test thoroughly
   - Distribute or publish

---

## 📊 Build Performance

**First Build:**
```
npm install:        5-8 min
gradlew build:      10-15 min
Total:              15-23 min
Downloads:          ~600 MB
Disk space used:    ~2.5 GB
```

**Second Build (cached):**
```
npm install:        0 min (cached)
gradlew build:      2-3 min
Total:              2-3 min
Downloads:          0 MB
```

---

## 🎯 Quick Commands Reference

```bash
# Full clean build
npm install
cd android
.\gradlew clean assembleDebug

# Fast rebuild (skip tests)
.\gradlew assembleDebug

# Even faster (offline, uses cache)
.\gradlew assembleDebug --offline

# Check what's wrong
.\gradlew assembleDebug --stacktrace

# Super verbose (for debugging)
.\gradlew assembleDebug --debug
```

---

## 💡 Pro Tips

1. **First build is slow** - Go make coffee ☕
2. **Use offline mode** - After first build: `--offline`
3. **Clean when stuck** - `.\gradlew clean`
4. **Check logs** - Look in `android/app/build/outputs/logs/`
5. **Gradle daemon** - Speeds up builds (auto-enabled)

---

## ✅ Success Checklist

- [ ] Node.js installed
- [ ] Java JDK 17 installed
- [ ] Android SDK installed
- [ ] Environment variables set
- [ ] `npm install` completed
- [ ] `gradlew assembleDebug` completed
- [ ] APK file exists
- [ ] APK installs on phone
- [ ] App opens (even if features don't work)

---

## 🎉 You're Ready!

**If the debug APK builds and installs successfully**, your development environment is perfect!

**Next:** Get real Firebase credentials to make the app actually work.

Run `setup-secrets.bat` when ready! 🚀
