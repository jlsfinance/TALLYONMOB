@echo off
cd /d "%~dp0"
set "NODE_EXE=%~dp0node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
if not exist ".tmp" mkdir ".tmp"
set PUPPETEER_SKIP_DOWNLOAD=true
set TEMP=%~dp0.tmp
set TMP=%~dp0.tmp
if not exist "node_modules\whatsapp-web.js\package.json" (
  echo Installing whatsapp-notifier dependencies...
  call npm install --no-audit --no-fund
)
"%NODE_EXE%" server.js
