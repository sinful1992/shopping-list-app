# GitHub Secrets Setup Script for Windows PowerShell
# Run this script to generate and set up all required secrets

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  GitHub Actions Secrets Setup" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$repoPath = Get-Location

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: Please run this script from the project root directory" -ForegroundColor Red
    exit 1
}

Write-Host "Step 1: Generate Android Signing Key" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow

$keystorePath = "android\app\release.keystore"

if (Test-Path $keystorePath) {
    Write-Host "Keystore already exists at: $keystorePath" -ForegroundColor Green
    $regenerate = Read-Host "Do you want to regenerate it? (y/N)"
    if ($regenerate -ne "y") {
        Write-Host "Using existing keystore..." -ForegroundColor Green
    } else {
        Remove-Item $keystorePath -Force
        Write-Host "Generating new keystore..." -ForegroundColor Yellow

        Write-Host ""
        Write-Host "Enter keystore password (save this!):" -ForegroundColor Cyan
        $storePass = Read-Host -AsSecureString
        $storePlainPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($storePass))

        Write-Host "Enter key password (save this!):" -ForegroundColor Cyan
        $keyPass = Read-Host -AsSecureString
        $keyPlainPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($keyPass))

        $keyAlias = "shopping-list-key"

        & keytool -genkeypair -v -storetype PKCS12 `
            -keystore $keystorePath `
            -alias $keyAlias `
            -keyalg RSA -keysize 2048 `
            -validity 10000 `
            -storepass $storePlainPass `
            -keypass $keyPlainPass `
            -dname "CN=Shopping List App, OU=Development, O=MyCompany, L=City, ST=State, C=US"

        Write-Host "Keystore generated successfully!" -ForegroundColor Green
    }
} else {
    Write-Host "Keystore not found. Generating new one..." -ForegroundColor Yellow

    Write-Host ""
    Write-Host "Enter keystore password (save this!):" -ForegroundColor Cyan
    $storePass = Read-Host -AsSecureString
    $storePlainPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($storePass))

    Write-Host "Enter key password (save this!):" -ForegroundColor Cyan
    $keyPass = Read-Host -AsSecureString
    $keyPlainPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($keyPass))

    $keyAlias = "shopping-list-key"

    New-Item -Path "android\app" -ItemType Directory -Force | Out-Null

    & keytool -genkeypair -v -storetype PKCS12 `
        -keystore $keystorePath `
        -alias $keyAlias `
        -keyalg RSA -keysize 2048 `
        -validity 10000 `
        -storepass $storePlainPass `
        -keypass $keyPlainPass `
        -dname "CN=Shopping List App, OU=Development, O=MyCompany, L=City, ST=State, C=US"

    Write-Host "Keystore generated successfully!" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 2: Convert Files to Base64" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow

# Convert keystore to base64
if (Test-Path $keystorePath) {
    $keystoreBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($keystorePath))
    Write-Host "✓ Keystore converted to Base64" -ForegroundColor Green
} else {
    Write-Host "✗ Keystore not found!" -ForegroundColor Red
    exit 1
}

# Convert google-services.json to base64
$googleServicesPath = "android\app\google-services.json"
if (Test-Path $googleServicesPath) {
    $googleServicesJson = Get-Content $googleServicesPath -Raw
    $googleServicesBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($googleServicesJson))
    Write-Host "✓ google-services.json converted to Base64" -ForegroundColor Green
} else {
    Write-Host "⚠ google-services.json not found (you'll need to add this manually)" -ForegroundColor Yellow
    $googleServicesBase64 = "NOT_FOUND"
}

Write-Host ""
Write-Host "Step 3: Collect Firebase Configuration" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow

if (Test-Path ".env") {
    Write-Host "Loading from .env file..." -ForegroundColor Cyan

    $envContent = Get-Content ".env" -Raw

    # Parse .env file
    $firebaseApiKey = if ($envContent -match "FIREBASE_API_KEY=(.+)") { $matches[1].Trim() } else { "" }
    $firebaseAuthDomain = if ($envContent -match "FIREBASE_AUTH_DOMAIN=(.+)") { $matches[1].Trim() } else { "" }
    $firebaseDatabaseUrl = if ($envContent -match "FIREBASE_DATABASE_URL=(.+)") { $matches[1].Trim() } else { "" }
    $firebaseProjectId = if ($envContent -match "FIREBASE_PROJECT_ID=(.+)") { $matches[1].Trim() } else { "" }
    $firebaseStorageBucket = if ($envContent -match "FIREBASE_STORAGE_BUCKET=(.+)") { $matches[1].Trim() } else { "" }
    $firebaseMessagingSenderId = if ($envContent -match "FIREBASE_MESSAGING_SENDER_ID=(.+)") { $matches[1].Trim() } else { "" }
    $firebaseAppId = if ($envContent -match "FIREBASE_APP_ID=(.+)") { $matches[1].Trim() } else { "" }
    $googleCloudVisionApiKey = if ($envContent -match "GOOGLE_CLOUD_VISION_API_KEY=(.+)") { $matches[1].Trim() } else { "" }

    Write-Host "✓ Firebase config loaded from .env" -ForegroundColor Green
} else {
    Write-Host ".env file not found. Please enter values manually:" -ForegroundColor Yellow
    Write-Host ""
    $firebaseApiKey = Read-Host "FIREBASE_API_KEY"
    $firebaseAuthDomain = Read-Host "FIREBASE_AUTH_DOMAIN"
    $firebaseDatabaseUrl = Read-Host "FIREBASE_DATABASE_URL"
    $firebaseProjectId = Read-Host "FIREBASE_PROJECT_ID"
    $firebaseStorageBucket = Read-Host "FIREBASE_STORAGE_BUCKET"
    $firebaseMessagingSenderId = Read-Host "FIREBASE_MESSAGING_SENDER_ID"
    $firebaseAppId = Read-Host "FIREBASE_APP_ID"
    $googleCloudVisionApiKey = Read-Host "GOOGLE_CLOUD_VISION_API_KEY"
}

Write-Host ""
Write-Host "Step 4: Set GitHub Secrets" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow

# Set secrets using gh CLI
Write-Host "Setting secrets on GitHub..." -ForegroundColor Cyan

gh secret set FIREBASE_API_KEY --body $firebaseApiKey
gh secret set FIREBASE_AUTH_DOMAIN --body $firebaseAuthDomain
gh secret set FIREBASE_DATABASE_URL --body $firebaseDatabaseUrl
gh secret set FIREBASE_PROJECT_ID --body $firebaseProjectId
gh secret set FIREBASE_STORAGE_BUCKET --body $firebaseStorageBucket
gh secret set FIREBASE_MESSAGING_SENDER_ID --body $firebaseMessagingSenderId
gh secret set FIREBASE_APP_ID --body $firebaseAppId
gh secret set GOOGLE_CLOUD_VISION_API_KEY --body $googleCloudVisionApiKey

Write-Host "✓ Firebase secrets set" -ForegroundColor Green

if ($googleServicesBase64 -ne "NOT_FOUND") {
    gh secret set GOOGLE_SERVICES_JSON --body $googleServicesBase64
    Write-Host "✓ GOOGLE_SERVICES_JSON secret set" -ForegroundColor Green
} else {
    Write-Host "⚠ Skipping GOOGLE_SERVICES_JSON (file not found)" -ForegroundColor Yellow
}

gh secret set ANDROID_KEYSTORE_BASE64 --body $keystoreBase64
gh secret set ANDROID_KEY_ALIAS --body "shopping-list-key"

if ($storePlainPass -and $keyPlainPass) {
    gh secret set ANDROID_STORE_PASSWORD --body $storePlainPass
    gh secret set ANDROID_KEY_PASSWORD --body $keyPlainPass
    Write-Host "✓ Android signing secrets set" -ForegroundColor Green
} else {
    Write-Host "⚠ Please set ANDROID_STORE_PASSWORD and ANDROID_KEY_PASSWORD manually" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Go to: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)" -ForegroundColor White
Write-Host "2. Click 'Actions' tab" -ForegroundColor White
Write-Host "3. Select 'Android Build' workflow" -ForegroundColor White
Write-Host "4. Click 'Run workflow' to start your first build!" -ForegroundColor White
Write-Host ""
Write-Host "Or push changes to trigger automatic build:" -ForegroundColor Cyan
Write-Host "  git add . && git commit -m 'Update' && git push" -ForegroundColor White
Write-Host ""
