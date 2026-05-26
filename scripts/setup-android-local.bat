@echo off
setlocal

set "REPO_ROOT=%~dp0.."
set "MOBILE_DIR=%REPO_ROOT%\mobile"

cd /d "%REPO_ROOT%"
echo === avihay-books: Android local setup ===
echo Repo: %CD%

if not defined ANDROID_HOME (
    if exist "%LOCALAPPDATA%\Android\Sdk" (
        set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
        echo Using ANDROID_HOME=%ANDROID_HOME%
    ) else (
        echo ERROR: ANDROID_HOME is not set and default SDK path was not found.
        echo Install Android Studio and set ANDROID_HOME to your SDK path.
        exit /b 1
    )
)

where adb >nul 2>&1
if errorlevel 1 (
    echo ERROR: adb not found. Add %%ANDROID_HOME%%\platform-tools to PATH.
    exit /b 1
)

echo adb:
adb version
if errorlevel 1 exit /b 1

if not exist "%MOBILE_DIR%\.env.production" (
    echo WARNING: mobile\.env.production is missing. Copy from mobile\.env.production.example before release builds.
)

cd /d "%MOBILE_DIR%"
set "EXPO_NO_METRO_WORKSPACE_ROOT=1"

echo.
echo === expo-doctor ===
call npx expo-doctor
if errorlevel 1 (
    echo expo-doctor reported issues. Fix critical items before continuing.
)

echo.
echo === expo prebuild (android) ===
call npx expo prebuild --platform android
if errorlevel 1 exit /b 1

echo.
echo === local.properties ===
call node scripts\write-local-properties.cjs
if errorlevel 1 exit /b 1

echo.
echo === Setup complete ===
echo Next: from repo root run build-release.bat or: npm run mobile:apk:release
endlocal
