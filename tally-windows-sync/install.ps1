Write-Host "🚀 Building LiveKeeping Tally Sync..." -ForegroundColor Cyan
# Build the project as a single file executable
dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o ./publish

$sourceExe = "$PSScriptRoot\publish\TallyLink.exe"
$destDir = "$env:LOCALAPPDATA\LiveKeepingSync"
$destExe = "$destDir\TallyLink.exe"
$appSettings = "$PSScriptRoot\appsettings.json"

if (!(Test-Path $sourceExe)) {
    Write-Error "❌ Build failed! Could not find $sourceExe"
    exit
}

Write-Host "📂 Installing to $destDir..." -ForegroundColor Cyan
# Create directory if not exists
if (!(Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir | Out-Null }

# Stop running process if exists
$proc = Get-Process "TallyLink" -ErrorAction SilentlyContinue
if ($proc) {
    Write-Host "⚠️ Stopping running instance..." -ForegroundColor Yellow
    Stop-Process -Name "TallyLink" -Force
    Start-Sleep -Seconds 2
}

# Copy files
Copy-Item -Path $sourceExe -Destination $destExe -Force
if (Test-Path $appSettings) {
    Copy-Item -Path $appSettings -Destination "$destDir\appsettings.json" -Force
}

Write-Host "🔗 Creating Startup Registry Key..." -ForegroundColor Cyan
# Add to Registry for Auto-Start
$regKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
Set-ItemProperty -Path $regKey -Name "LiveKeepingSync" -Value $destExe

Write-Host "🖥️ Creating Desktop Shortcut..." -ForegroundColor Cyan
# Create Desktop Shortcut
$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut("$env:USERPROFILE\Desktop\LiveKeeping Sync.lnk")
$shortcut.TargetPath = $destExe
$shortcut.WorkingDirectory = $destDir
$shortcut.Description = "Sync Tally ERP to Mobile"
$shortcut.Save()

Write-Host "✅ Installation Complete! App will now start." -ForegroundColor Green
Start-Process $destExe
