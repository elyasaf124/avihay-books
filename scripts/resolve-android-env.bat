@echo off
REM Sets ANDROID_HOME (if empty) and prepends platform-tools to PATH. No-op if adb already works.
set "DEFAULT_SDK=%LOCALAPPDATA%\Android\Sdk"

if not defined ANDROID_HOME set "ANDROID_HOME="
if "%ANDROID_HOME%"=="" (
    if exist "%DEFAULT_SDK%" (
        set "ANDROID_HOME=%DEFAULT_SDK%"
    )
)

if not "%ANDROID_HOME%"=="" (
    if exist "%ANDROID_HOME%\platform-tools" (
        set "PATH=%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools;%PATH%"
    )
)
