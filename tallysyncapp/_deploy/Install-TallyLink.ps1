param([string]$InstallDir = "C:\TallyLink")
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "ERROR: Run as Administrator!" -ForegroundColor Red
    pause; exit 1
}

Write-Host "[1/3] Installing certificate..." -ForegroundColor Yellow
$cer = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2
$cer.Import((Join-Path $ScriptDir "TallySyncCert.cer"))
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")
$store.Open("ReadWrite"); $store.Add($cer); $store.Close()
Write-Host "  Done" -ForegroundColor Green

Write-Host "[2/3] Installing app..." -ForegroundColor Yellow
if (!(Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null }
Copy-Item (Join-Path $ScriptDir "TallyLink.exe") $InstallDir -Force
Write-Host "  Installed to $InstallDir" -ForegroundColor Green

Write-Host "[3/3] Creating shortcut..." -ForegroundColor Yellow
$sc = (New-Object -ComObject WScript.Shell).CreateShortcut("$([Environment]::GetFolderPath('Desktop'))\TallyLink.lnk")
$sc.TargetPath = "$InstallDir\TallyLink.exe"
$sc.WorkingDirectory = $InstallDir
$sc.Save()
Write-Host "  Done" -ForegroundColor Green

Write-Host "`nInstallation Complete!" -ForegroundColor Green
pause
