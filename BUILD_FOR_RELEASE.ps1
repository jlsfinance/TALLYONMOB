# TallyLink Single-File Build & Setup Automation
# This script publishes the app as a single executable and prepares it for distribution.

$Version = "2.10.2"
$ProjectDir = Get-Location
$ProjectFile = "tally-windows-sync/TallySyncApp.csproj"
$OutputFolderName = "tallysyncapp"
$OutputDir = Join-Path $ProjectDir $OutputFolderName

Write-Host "Starting TallyLink Single-File Setup Build (v$Version)..." -ForegroundColor Cyan

# 1. Update Version in CSPROJ
Write-Host "Updating version to $Version..."
$content = Get-Content $ProjectFile
$newContent = $content -replace '<Version>.*</Version>', "<Version>$Version</Version>"
Set-Content $ProjectFile $newContent

# 2. Clean previous output
if (Test-Path $OutputDir) {
    Write-Host "Cleaning $OutputFolderName folder..."
    Remove-Item -Path "$OutputDir\*" -Recurse -Force -ErrorAction SilentlyContinue
}
else {
    New-Item -ItemType Directory -Path $OutputDir
}

# 3. Publish Single-File Executable
Write-Host "Publishing Single-File EXE (win-x64)..."
dotnet publish $ProjectFile `
    -c Release `
    -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:PublishReadyToRun=true `
    -o $OutputDir

# 4. Verify Output
if (Test-Path "$OutputDir\TallyLink.exe") {
    $exeSize = (Get-Item "$OutputDir\TallyLink.exe").Length / 1MB
    Write-Host "Success! Single-file EXE created at: $OutputDir\TallyLink.exe" -ForegroundColor Green
    Write-Host "EXE Size: $([Math]::Round($exeSize, 2)) MB"
}
else {
    Write-Host "Error: TallyLink.exe not found in output." -ForegroundColor Red
    exit 1
}

# 5. Create Portable ZIP
Write-Host "Creating Portable ZIP..."
$ZipPath = Join-Path $ProjectDir "TallyLink_v$($Version)_Portable.zip"
if (Test-Path $ZipPath) { Remove-Item $ZipPath }
Compress-Archive -Path "$OutputDir\*" -DestinationPath $ZipPath
Write-Host "Portable ZIP created: $ZipPath" -ForegroundColor Green

# 6. Handle Installer (Inno Setup)
$ISCC = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
$ISS_File = "tally-windows-sync/installer/TallyLink.iss"

if (Test-Path $ISCC) {
    Write-Host "Compiling Installer with Inno Setup..."
    & $ISCC /dAppVersion=$Version $ISS_File
    Write-Host "Installer created in tally-windows-sync/installer/Output" -ForegroundColor Green
}
else {
    Write-Host "Inno Setup not found. Skipping installer compilation." -ForegroundColor Yellow
    Write-Host "You can still distribute the single-file EXE from the $OutputFolderName folder."
}

Write-Host "------------------------------------------------"
Write-Host "Done! TallyLink is ready for distribution." -ForegroundColor Cyan
