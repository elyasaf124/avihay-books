@echo off
setlocal EnableExtensions

set "REPO_ROOT=%~dp0.."
set "MOBILE_DIR=%REPO_ROOT%\mobile"
set "DEFAULT_SDK=%LOCALAPPDATA%\Android\Sdk"

cd /d "%REPO_ROOT%"
echo === avihay-books: Android local setup ===
echo Repo: %CD%

call "%~dp0resolve-android-env.bat"

if "%ANDROID_HOME%"=="" (
    echo ERROR: ANDROID_HOME is empty and default SDK was not found:
    echo   %DEFAULT_SDK%
    echo Install Android Studio, then set ANDROID_HOME in Windows Environment Variables.
    exit /b 1
)

if not exist "%ANDROID_HOME%\platform-tools\adb.exe" (
    echo ERROR: adb not found under:
    echo   %ANDROID_HOME%\platform-tools
    echo Open Android Studio ^> SDK Manager and install "Android SDK Platform-Tools".
    exit /b 1
)

echo Using ANDROID_HOME=%ANDROID_HOME%

echo adb:
"%ANDROID_HOME%\platform-tools\adb.exe" version
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
set "ANDROID_HOME=%ANDROID_HOME%"
call node scripts\write-local-properties.cjs
if errorlevel 1 exit /b 1

echo.
echo === Setup complete ===
echo Next: from repo root run build-release.bat or: npm run mobile:apk:release
echo.
echo Tip: fix empty ANDROID_HOME permanently in Windows:
echo   System Properties ^> Environment Variables ^> ANDROID_HOME = %ANDROID_HOME%
echo   PATH add: %%ANDROID_HOME%%\platform-tools
endlocal
