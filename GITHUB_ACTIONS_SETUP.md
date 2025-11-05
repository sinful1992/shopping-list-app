# GitHub Actions CI/CD Setup Guide

This guide will help you set up automated builds for your Shopping List app using GitHub Actions.

## What GitHub Actions Will Do

✅ Automatically build APK/AAB on every push
✅ Run builds for pull requests
✅ Create release artifacts
✅ Support manual builds via workflow dispatch
✅ Build both debug (for testing) and release (for production) versions

---

## Prerequisites

1. GitHub account
2. Your code pushed to a GitHub repository
3. Android signing key generated
4. Firebase project configured

---

## Step 1: Push Code to GitHub

```bash
cd C:\Users\barku\Documents\shoping

# Initialize git (if not already done)
git init

# Create .gitignore
echo "node_modules/" >> .gitignore
echo ".env" >> .gitignore
echo "android/app/google-services.json" >> .gitignore
echo "ios/GoogleService-Info.plist" >> .gitignore
echo "android/app/*.keystore" >> .gitignore
echo "android/gradle.properties" >> .gitignore

# Add files
git add .
git commit -m "Initial commit"

# Create GitHub repository and push
# Go to github.com → New Repository → Create
git remote add origin https://github.com/YOUR_USERNAME/shopping-list-app.git
git branch -M main
git push -u origin main
```

---

## Step 2: Generate Android Signing Key

```bash
cd android/app

# Generate keystore
keytool -genkeypair -v -storetype PKCS12 \
  -keystore release.keystore \
  -alias shopping-list-key \
  -keyalg RSA -keysize 2048 \
  -validity 10000

# Enter passwords when prompted - SAVE THESE!
# Store password: [your-store-password]
# Key password: [your-key-password]
```

**Convert keystore to Base64:**

```bash
# On Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore")) | Set-Clipboard

# On macOS/Linux
base64 release.keystore | pbcopy  # macOS
base64 release.keystore | xclip -selection clipboard  # Linux
```

Save this Base64 string - you'll need it for GitHub secrets.

---

## Step 3: Prepare Firebase Configuration

### For Android (google-services.json)

```bash
# Convert to Base64
# Windows PowerShell
$content = Get-Content -Path "android/app/google-services.json" -Raw
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content)) | Set-Clipboard

# macOS/Linux
cat android/app/google-services.json | base64 | pbcopy
```

### For iOS (GoogleService-Info.plist)

```bash
# Convert to Base64
cat ios/ShoppingListApp/GoogleService-Info.plist | base64 | pbcopy
```

---

## Step 4: Configure GitHub Secrets

Go to your GitHub repository:
**Settings → Secrets and variables → Actions → New repository secret**

### Required Secrets for Android Build

| Secret Name | Description | How to Get |
|------------|-------------|------------|
| `FIREBASE_API_KEY` | Firebase API key | From Firebase Console → Project Settings |
| `FIREBASE_AUTH_DOMAIN` | Firebase auth domain | `your-project.firebaseapp.com` |
| `FIREBASE_DATABASE_URL` | Realtime Database URL | `https://your-project.firebaseio.com` |
| `FIREBASE_PROJECT_ID` | Firebase project ID | From Firebase Console |
| `FIREBASE_STORAGE_BUCKET` | Storage bucket | `your-project.appspot.com` |
| `FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID | From Firebase Console |
| `FIREBASE_APP_ID` | Firebase app ID | From Firebase Console |
| `GOOGLE_CLOUD_VISION_API_KEY` | Vision API key | From Google Cloud Console |
| `GOOGLE_SERVICES_JSON` | google-services.json | Base64 encoded file content |
| `ANDROID_KEYSTORE_BASE64` | Signing keystore | Base64 encoded keystore file |
| `ANDROID_KEY_ALIAS` | Key alias | `shopping-list-key` (or your alias) |
| `ANDROID_STORE_PASSWORD` | Keystore password | Password you set when creating keystore |
| `ANDROID_KEY_PASSWORD` | Key password | Password you set when creating keystore |

### Additional Secrets for iOS Build

| Secret Name | Description |
|------------|-------------|
| `GOOGLE_SERVICE_INFO_PLIST` | GoogleService-Info.plist | Base64 encoded file |
| `IOS_CERTIFICATE_BASE64` | Signing certificate (optional) | Base64 encoded .p12 file |
| `IOS_CERTIFICATE_PASSWORD` | Certificate password (optional) | Password for .p12 |
| `IOS_PROVISIONING_PROFILE_BASE64` | Provisioning profile (optional) | Base64 encoded .mobileprovision |

---

## Step 5: Add Secrets to GitHub

### Example: Adding FIREBASE_API_KEY

1. Go to repository → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `FIREBASE_API_KEY`
4. Value: `AIzaSyC...` (your actual API key)
5. Click **Add secret**

**Repeat for all secrets listed above.**

---

## Step 6: Update Android Build Configuration

Edit `android/app/build.gradle` to support signing:

```gradle
android {
    ...

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
            shrinkResources true
            proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
        }
    }
}
```

**Commit and push:**

```bash
git add android/app/build.gradle
git commit -m "Configure signing for release builds"
git push
```

---

## Step 7: Trigger Your First Build

### Automatic Build (on push)

```bash
git add .
git commit -m "Trigger CI build"
git push
```

GitHub Actions will automatically start building!

### Manual Build (workflow dispatch)

1. Go to repository → **Actions** tab
2. Select **Android Build** workflow
3. Click **Run workflow**
4. Choose build type: `debug` or `release`
5. Click **Run workflow**

---

## Step 8: Download Build Artifacts

1. Go to **Actions** tab in your repository
2. Click on the completed workflow run
3. Scroll down to **Artifacts** section
4. Download:
   - `app-debug.apk` (for testing)
   - `app-release.apk` (for distribution)
   - `app-release-bundle.aab` (for Play Store)

---

## Build Triggers

The workflows are configured to run on:

### Android Build
- ✅ Push to `main` or `develop` branches → Creates Release APK + AAB
- ✅ Pull requests → Creates Debug APK
- ✅ Manual workflow dispatch → Choose debug or release

### iOS Build (macOS runner)
- ✅ Push to `main` or `develop` branches
- ✅ Pull requests
- ✅ Manual workflow dispatch

---

## Understanding Build Types

### Debug APK
- For testing on your device
- Larger file size
- Contains debugging symbols
- Not signed for distribution

### Release APK
- For direct distribution (not via Play Store)
- Smaller, optimized
- Signed with your release key
- Can be installed on any device

### Release AAB (Android App Bundle)
- For Google Play Store ONLY
- Smaller downloads (Google optimizes per device)
- Recommended by Google
- Cannot be directly installed

---

## Cost of GitHub Actions

- **Public repositories**: Unlimited free minutes
- **Private repositories**:
  - Free tier: 2,000 minutes/month
  - Each build takes ~10-15 minutes
  - ~130-200 builds/month on free tier

---

## Monitoring Builds

### View Build Status

Add badges to your README.md:

```markdown
![Android Build](https://github.com/YOUR_USERNAME/shopping-list-app/workflows/Android%20Build/badge.svg)
![iOS Build](https://github.com/YOUR_USERNAME/shopping-list-app/workflows/iOS%20Build/badge.svg)
```

### Email Notifications

GitHub automatically sends emails on build failures. Configure in:
**Settings → Notifications → Actions**

---

## Advanced: Automatic Play Store Deployment

To automatically deploy to Google Play Store, add this to the workflow:

```yaml
- name: Deploy to Play Store
  if: github.ref == 'refs/heads/main'
  uses: r0adkll/upload-google-play@v1
  with:
    serviceAccountJsonPlainText: ${{ secrets.PLAY_STORE_SERVICE_ACCOUNT_JSON }}
    packageName: com.shoppinglistapp
    releaseFiles: android/app/build/outputs/bundle/release/app-release.aab
    track: internal
```

**Setup required:**
1. Create service account in Google Cloud Console
2. Grant access in Play Console
3. Add `PLAY_STORE_SERVICE_ACCOUNT_JSON` secret

---

## Troubleshooting

### Build Fails: "Task assembleRelease not found"

**Solution:** Ensure `android/gradlew` is executable:
```bash
git update-index --chmod=+x android/gradlew
git commit -m "Make gradlew executable"
git push
```

### Build Fails: "Keystore not found"

**Solution:** Verify `ANDROID_KEYSTORE_BASE64` secret is set correctly.

### Build Fails: "google-services.json not found"

**Solution:** Ensure `GOOGLE_SERVICES_JSON` secret contains the full Base64 string.

### iOS Build Fails: "No such module 'Firebase'"

**Solution:** Ensure CocoaPods installation step completed successfully.

### Out of GitHub Actions Minutes

**Solution:**
- Optimize workflow (reduce unnecessary runs)
- Upgrade to paid plan
- Use self-hosted runners

---

## Security Best Practices

✅ **Never commit secrets to git**
✅ Keep `.env`, `google-services.json`, `*.keystore` in `.gitignore`
✅ Use GitHub Secrets for sensitive data
✅ Rotate signing keys periodically
✅ Use different keys for debug/release
✅ Enable 2FA on GitHub account

---

## Next Steps

1. ✅ Configure all GitHub secrets
2. ✅ Push code to trigger first build
3. ✅ Download and test APK
4. ⏳ Set up Play Store deployment
5. ⏳ Add status badges to README
6. ⏳ Configure release automation

---

## Quick Reference Commands

```bash
# Check workflow status
gh workflow list
gh run list --workflow="Android Build"

# View workflow logs
gh run view [run-id] --log

# Download artifacts
gh run download [run-id]

# Re-run failed workflow
gh run rerun [run-id]
```

For more help, see [GitHub Actions Documentation](https://docs.github.com/en/actions).
