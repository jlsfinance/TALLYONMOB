param()
$ErrorActionPreference = 'Stop'
Set-Location "d:\New folder (2)\tally-sync-backend"
Write-Host "Starting Tally Sync Backend on http://localhost:5000 ..."
node src/index.js
