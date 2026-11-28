$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$ProjectDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$TmpRoot = Join-Path $RepoRoot "..\.tmp"
New-Item -ItemType Directory -Force -Path $TmpRoot | Out-Null
$env:TEMP = (Resolve-Path $TmpRoot).Path
$env:TMP = $env:TEMP
$env:PUPPETEER_SKIP_DOWNLOAD = "true"

$PublishInput = Join-Path $ProjectDir "publish\installer-input"
$WaSource = Join-Path $ProjectDir "whatsapp-notifier"
$WaTarget = Join-Path $PublishInput "whatsapp-notifier"

Write-Host "1. Cleaning publish staging folder: $PublishInput"
if (Test-Path $PublishInput) {
    Remove-Item -Path $PublishInput -Recurse -Force
}

Write-Host "2. Running dotnet publish (win-x64 self-contained, folder layout)..."
Push-Location $ProjectDir
try {
    dotnet publish "TallySyncApp.csproj" -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o $PublishInput
    if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed with exit code $LASTEXITCODE" }
}
finally {
    Pop-Location
}

Write-Host "3. Verifying whatsapp-notifier dependencies exist locally..."
if (-not (Test-Path (Join-Path $WaSource "node_modules\whatsapp-web.js\package.json"))) {
    Write-Host "   Installing whatsapp-notifier node_modules (PUPPETEER_SKIP_DOWNLOAD=true)..."
    Push-Location $WaSource
    try {
        npm install --omit=dev --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
    }
    finally {
        Pop-Location
    }
}

Write-Host "4. Bundling clean node_modules + portable node.exe into installer payload..."
New-Item -ItemType Directory -Force -Path $WaTarget | Out-Null
$TargetNodeModules = Join-Path $WaTarget "node_modules"
New-Item -ItemType Directory -Force -Path $TargetNodeModules | Out-Null

$robocopyArgs = @(
    (Join-Path $WaSource "node_modules"),
    $TargetNodeModules,
    "/E",
    "/R:2",
    "/W:1",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/XD", ".cache", ".wwebjs_auth", ".wwebjs_cache", ".tmp", "test", "tests", "docs",
    "/XF", "*.map", "*.env"
)
& robocopy @robocopyArgs | Out-Null
$rc = $LASTEXITCODE
if ($rc -ge 8) {
    throw "robocopy failed with exit code $rc"
}

$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
    throw "node.exe was not found on PATH to bundle into the installer."
}
Copy-Item -Path $NodeCmd.Source -Destination (Join-Path $WaTarget "node.exe") -Force

# Verify required runtime files inside payload
foreach ($req in @(
    (Join-Path $WaTarget "node.exe"),
    (Join-Path $WaTarget "server.js"),
    (Join-Path $WaTarget "package.json"),
    (Join-Path $WaTarget "node_modules\whatsapp-web.js\package.json")
)) {
    if (-not (Test-Path $req)) {
        throw "Required bundled WhatsApp helper file missing: $req"
    }
}

Write-Host "5. Compiling Inno Setup installer..."
$Iscc = "C:\Users\Admin\AppData\Local\Programs\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $Iscc)) {
    throw "Inno Setup compiler not found at $Iscc"
}
& $Iscc (Join-Path $PSScriptRoot "SyncoraConnector.iss")
if ($LASTEXITCODE -ne 0) {
    throw "ISCC.exe failed with exit code $LASTEXITCODE"
}

Write-Host "Done! Installer compiled cleanly with bundled Node.js and node_modules."
