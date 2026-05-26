@echo off
setlocal

set "MOBILE_DIR=C:\dev\avihay-books-V2\mobile"

if not exist "%MOBILE_DIR%" (
    echo ERROR: Expected project at %MOBILE_DIR%
    echo Copy the repo to C:\dev\avihay-books-V2 and run scripts\setup-android-local.bat first.
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

REM Kill any Metro process on port 8081
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8081 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul

set "NODE_ENV=production"
set "EXPO_ENV_MODE=production"
set "EXPO_NO_METRO_WORKSPACE_ROOT=1"

echo === Building release APK from %MOBILE_DIR% ===
call npx dotenv -e .env.production -- npx expo run:android --variant release --no-install

echo === Done ===
if exist "android\app\build\outputs\apk\release\app-release.apk" (
    echo.
    echo ========================================
    echo APK ready: %MOBILE_DIR%\android\app\build\outputs\apk\release\app-release.apk
    echo ========================================
) else (
    echo Build may have failed - check output above
    exit /b 1
)

endlocal
