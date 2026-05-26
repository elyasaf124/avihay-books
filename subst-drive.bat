@echo off
REM LEGACY (optional): maps B: to the OneDrive repo path for shorter builds.
REM Prefer cloning the project to C:\dev\avihay-books-V2 — see docs\LOCAL_ANDROID_BUILD.md

subst B: /d 2>nul
subst B: "C:\Users\ELYAS\OneDrive\Desktop\elyasaf projects\avihay-books-V2"
if %errorlevel% equ 0 (
    echo Drive B: created successfully ^(legacy — use C:\dev for new builds^)
    subst
) else (
    echo Failed to create drive B:
)
