@echo off
setlocal EnableExtensions EnableDelayedExpansion

call "%~dp0resolve-android-env.bat"

set "APK=%~dp0..\mobile\android\app\build\outputs\apk\release\app-release.apk"
set "PKG=com.avihay.books"
set "REQUESTED=%~1"
set "SERIAL="
set "HAS_UNAUTHORIZED=0"

if not exist "%APK%" (
    echo ERROR: APK not found.
    echo Run from repo root: build-release.bat
    echo Expected: %APK%
    exit /b 1
)

echo === Checking adb ===
adb version >nul 2>&1
if errorlevel 1 (
    echo ERROR: adb not found. Set ANDROID_HOME and add platform-tools to PATH.
    exit /b 1
)

echo === Connected devices ===
adb devices -l
echo.

if not "%REQUESTED%"=="" (
    for /f "skip=1 tokens=1,2" %%A in ('adb devices') do (
        if "%%A"=="%REQUESTED%" (
            if "%%B"=="device" set "SERIAL=%%A"
            if "%%B"=="unauthorized" set "HAS_UNAUTHORIZED=1"
        )
    )
    if not "!SERIAL!"=="" goto :found
    if "!HAS_UNAUTHORIZED!"=="1" goto :unauthorized
    echo ERROR: Device %REQUESTED% not found or not ready.
    exit /b 1
)

for /f "skip=1 tokens=1,2" %%A in ('adb devices') do (
    if "%%B"=="device" (
        set "SERIAL=%%A"
        goto :found
    )
    if "%%B"=="unauthorized" set "HAS_UNAUTHORIZED=1"
)

if "!HAS_UNAUTHORIZED!"=="1" goto :unauthorized

echo ERROR: No authorized Android device connected.
echo Enable USB debugging on the phone and accept the computer prompt.
exit /b 1

:unauthorized
echo ERROR: Phone connected but UNAUTHORIZED for USB debugging.
echo.
echo On the phone:
echo   1. Unlock the screen
echo   2. Look for "Allow USB debugging?" and tap Allow
echo   3. Optional: check "Always allow from this computer"
echo.
echo If no dialog appears:
echo   Settings - Developer options - Revoke USB debugging authorizations
echo   Unplug USB, plug again, then run this script again
echo.
echo Or restart adb:
echo   adb kill-server
echo   adb start-server
exit /b 1

:found
echo Using device: !SERIAL!
echo APK: %APK%
for %%A in ("%APK%") do echo Size: %%~zA bytes
echo.

echo === Uninstalling old app (fixes signature mismatch) ===
adb -s !SERIAL! uninstall %PKG% 2>nul
echo.

echo === Installing ===
adb -s !SERIAL! install -r -d "%APK%"
set "RC=!ERRORLEVEL!"

if !RC! neq 0 (
    echo.
    echo ========================================
    echo INSTALL FAILED ^(exit !RC!^)
    echo ========================================
    echo Common causes:
    echo   - device unauthorized: approve USB debugging on the phone
    echo   - Old app still installed with different signature: uninstall manually, then retry
    echo   - Play Protect blocked the APK: disable temporarily in Play Store settings
    echo   - Not enough storage on the phone
    echo   - Corrupted APK copy ^(use USB/adb, not WhatsApp^)
    echo.
    exit /b !RC!
)

echo.
echo ========================================
echo SUCCESS: App installed on !SERIAL!
echo ========================================
endlocal
