@echo off
echo.
echo ================================================
echo   Building Debug APK (No Secrets Required)
echo ================================================
echo.
echo This will build a debug APK for testing.
echo The app will build successfully but won't connect to Firebase.
echo.
pause

echo.
echo [1/3] Installing Node.js dependencies...
echo.
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

echo.
echo [2/3] Building Android Debug APK...
echo This will take 5-10 minutes on first run...
echo.
cd android
call gradlew.bat assembleDebug
if %errorlevel% neq 0 (
    echo ERROR: Build failed
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo ================================================
echo   Build Successful!
echo ================================================
echo.
echo APK Location:
echo android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo To install on your phone:
echo 1. Copy app-debug.apk to your phone
echo 2. Tap the file to install
echo 3. Enable "Install from Unknown Sources" if prompted
echo.
echo Or use ADB:
echo   adb install android\app\build\outputs\apk\debug\app-debug.apk
echo.
pause
