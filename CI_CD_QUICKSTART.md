# CI/CD Quick Start - Get Your App Built Automatically! 🚀

## What is GitHub Actions?

GitHub Actions automatically builds your app every time you push code. No need to manually run build commands!

```
You push code → GitHub builds APK → Download and install
```

## Simple 3-Step Setup

### 1️⃣ Push to GitHub (5 minutes)

```bash
cd C:\Users\barku\Documents\shoping

# Create repository on GitHub.com first, then:
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/shopping-list-app.git
git push -u origin main
```

### 2️⃣ Generate Signing Key (2 minutes)

```bash
cd android/app
keytool -genkeypair -v -storetype PKCS12 -keystore release.keystore -alias shopping-list-key -keyalg RSA -keysize 2048 -validity 10000
```

**Save the passwords you create!**

### 3️⃣ Add Secrets to GitHub (10 minutes)

Go to: `github.com/YOUR_USERNAME/shopping-list-app/settings/secrets/actions`

**Click "New repository secret" and add these:**

#### Minimum Required (8 secrets):

1. **FIREBASE_API_KEY** - Get from Firebase Console → Project Settings
2. **FIREBASE_AUTH_DOMAIN** - `your-project.firebaseapp.com`
3. **FIREBASE_DATABASE_URL** - `https://your-project.firebaseio.com`
4. **FIREBASE_PROJECT_ID** - Your Firebase project ID
5. **FIREBASE_STORAGE_BUCKET** - `your-project.appspot.com`
6. **FIREBASE_MESSAGING_SENDER_ID** - From Firebase Console
7. **FIREBASE_APP_ID** - From Firebase Console
8. **GOOGLE_CLOUD_VISION_API_KEY** - From Google Cloud Console

#### For Signed Builds (4 more secrets):

9. **GOOGLE_SERVICES_JSON**
   ```bash
   # Windows PowerShell
   $json = Get-Content android/app/google-services.json -Raw
   [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
   ```

10. **ANDROID_KEYSTORE_BASE64**
    ```bash
    # Windows PowerShell
    [Convert]::ToBase64String([IO.File]::ReadAllBytes("android/app/release.keystore"))
    ```

11. **ANDROID_KEY_ALIAS** - Value: `shopping-list-key`

12. **ANDROID_STORE_PASSWORD** - The password you created in step 2

13. **ANDROID_KEY_PASSWORD** - The password you created in step 2

---

## ✅ Done! Now What?

### Automatic Builds

Every time you push code:
```bash
git add .
git commit -m "Added new feature"
git push
```

GitHub automatically builds your APK!

### View Build Status

1. Go to your repository on GitHub
2. Click **Actions** tab
3. Watch your build run (takes ~10 minutes)

### Download Your APK

1. Build finishes ✅
2. Scroll down to **Artifacts**
3. Download **app-release.apk**
4. Transfer to your phone
5. Install and test!

---

## Build Flow Diagram

```
┌─────────────────┐
│  You Push Code  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ GitHub Actions  │
│  Starts Build   │
└────────┬────────┘
         │
         ├──► Install Node.js dependencies (npm install)
         │
         ├──► Create .env with Firebase config
         │
         ├──► Add google-services.json
         │
         ├──► Setup Android SDK & Java
         │
         ├──► Build APK (./gradlew assembleRelease)
         │
         ├──► Build AAB for Play Store
         │
         ▼
┌─────────────────┐
│   APK Ready!    │
│ Download & Test │
└─────────────────┘
```

---

## Manual Build Trigger

Want to build without pushing?

1. Go to **Actions** tab
2. Select **Android Build**
3. Click **Run workflow** button
4. Select:
   - **debug** (for testing - faster)
   - **release** (for production - signed)
5. Click **Run workflow**

---

## What Gets Built?

### On Pull Request:
- ✅ **Debug APK** (for code review testing)

### On Push to main/develop:
- ✅ **Release APK** (signed, for distribution)
- ✅ **Release AAB** (for Google Play Store)

### Build Artifacts Location:
- APK: `Artifacts → app-release.apk`
- AAB: `Artifacts → app-release-bundle.aab`

---

## Cost

**FREE** for public repositories!

For private repos:
- 2,000 minutes/month free
- Each build = ~10 minutes
- = ~200 builds/month free

---

## Troubleshooting

### ❌ Build Failed: "google-services.json not found"

**Fix:** Make sure you added the `GOOGLE_SERVICES_JSON` secret (step 9 above).

### ❌ Build Failed: "Signing failed"

**Fix:** Check that all 4 signing secrets (9-13) are added correctly.

### ❌ Build Failed: "gradlew permission denied"

**Fix:**
```bash
git update-index --chmod=+x android/gradlew
git commit -m "Fix gradlew permissions"
git push
```

### ❌ "No space left on device"

**Fix:** GitHub runners have limited space. Add cleanup step or optimize build.

---

## Pro Tips

### Add Build Status Badge

Add to your README.md:
```markdown
![Build Status](https://github.com/YOUR_USERNAME/shopping-list-app/workflows/Android%20Build/badge.svg)
```

### Auto-Deploy to Play Store

Once set up, builds from `main` branch can automatically upload to Play Store Internal Testing track.

See `GITHUB_ACTIONS_SETUP.md` for details.

### Faster Builds

- Use `gradle` caching (already configured ✅)
- Only build when necessary (already configured ✅)
- Use debug builds for testing (faster, no signing)

---

## Common Commands

```bash
# View workflow runs
gh workflow list

# View specific run
gh run view

# Download artifacts
gh run download

# Trigger manual build
gh workflow run "Android Build"
```

---

## Security Checklist

✅ `.gitignore` includes `.env`
✅ `.gitignore` includes `google-services.json`
✅ `.gitignore` includes `*.keystore`
✅ All secrets stored in GitHub Secrets (not in code)
✅ Keystore backed up securely offline

---

## What's Next?

1. ✅ Set up GitHub Actions (you just did!)
2. ⏳ Test automated builds
3. ⏳ Set up Play Store deployment
4. ⏳ Add automated testing
5. ⏳ Add version bumping automation

---

## Need Help?

- 📖 Full guide: `GITHUB_ACTIONS_SETUP.md`
- 📖 Installation guide: `INSTALLATION_GUIDE.md`
- 🐛 Build logs: Actions tab → Click failed build → View logs
- 💬 GitHub Issues: Ask questions

---

**That's it! Push your code and get automatic builds! 🎉**
