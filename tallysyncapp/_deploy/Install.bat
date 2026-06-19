@echo off
echo ========================================
echo   TallyLink Desktop App Installer
echo ========================================
echo.
echo This will install TallyLink to C:\TallyLink
echo and create a desktop shortcut.
echo.
pause
powershell -ExecutionPolicy Bypass -File "%~dp0Install-TallyLink.ps1"
