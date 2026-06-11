@echo off
setlocal EnableExtensions

call "%~dp0scripts\resolve-android-env.bat"

REM Run from repo root (e.g. C:\dev\avihay-books-V2\build-release.bat)
set "MOBILE_DIR=%~dp0mobile"

if not exist "%MOBILE_DIR%" (
    echo ERROR: mobile\ not found under %~dp0
    exit /b 1
)

cd /d "%MOBILE_DIR%"

if not exist "android\" (
    echo ERROR: mobile\android\ not found.
    echo Run from repo root: scripts\setup-android-local.bat
    exit /b 1
)

if not exist "android\local.properties" (
    echo Writing android\local.properties...
    call node scripts\write-local-properties.cjs
    if errorlevel 1 exit /b 1
)

echo === push (FCM) check ===
call node scripts\check-google-services.cjs --strict
if errorlevel 1 exit /b 1

REM Kill any Metro process on port 8081
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8081 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul

set "NODE_ENV=production"
set "EXPO_ENV_MODE=production"
set "EXPO_NO_METRO_WORKSPACE_ROOT=1"

echo === Building release APK ===
echo Repo: %~dp0
echo Mobile: %MOBILE_DIR%
call npx dotenv -e .env.production -- npx expo run:android --variant release --no-install

echo === Done ===
if exist "android\app\build\outputs\apk\release\app-release.apk" (
    echo.
    echo ========================================
    echo APK ready: %MOBILE_DIR%android\app\build\outputs\apk\release\app-release.apk
    echo Install on phone: scripts\install-release-apk.bat
    echo ========================================
) else (
    echo Build may have failed - check output above
    exit /b 1
)

endlocal
