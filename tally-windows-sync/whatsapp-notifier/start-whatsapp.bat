@echo off
cd /d "%~dp0"
if not exist ".tmp" mkdir ".tmp"
set PUPPETEER_SKIP_DOWNLOAD=true
set TEMP=%~dp0.tmp
set TMP=%~dp0.tmp
if not exist "node_modules\qrcode" (
  echo Installing whatsapp-notifier dependencies...
  call npm install --no-audit --no-fund
)
start "" "http://127.0.0.1:3001/qr"
node server.js
