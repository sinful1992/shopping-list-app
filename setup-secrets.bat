@echo off
echo.
echo ================================================
echo   GitHub Actions Secrets Setup
echo ================================================
echo.
echo This will help you configure GitHub secrets for automated builds.
echo.
pause

powershell -ExecutionPolicy Bypass -File "%~dp0setup-secrets.ps1"

pause
