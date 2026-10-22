<# ============================================================================
  TallyLink — installer build script
  ============================================================================
  Publishes the app as a self-contained, single-file win-x64 binary and then
  compiles installer\TallyLink.iss with Inno Setup's ISCC.exe.

  Usage
  -----
    .\installer\build-installer.ps1                      # defaults
    .\installer\build-installer.ps1 -Configuration Release -Version 2.0.1
    .\installer\build-installer.ps1 -IsccPath "C:\Tools\ISCC.exe"

  What it does
  ------------
    1. Locates ISCC.exe (param, $env:ISCC_PATH, or the standard install dirs).
       Fails loudly with a clear message if it is not found — we never want a
       silent "setup.exe not produced" surprise.
    2. `dotnet publish` the WPF app into .\publish (single file, self-contained,
       win-x64, ReadyToRun off so the publish stays fast).
    3. Copies app_icon.ico next to the publish output (the .iss [Files] section
       picks it up from ..\app_icon.ico relative to the script).
    4. Runs ISCC.exe on TallyLink.iss; the resulting setup lands in
       installer\output\TallyLink-Setup.exe.

  Notes
  -----
    * The publish output folder is reused between runs; we delete it first so a
      stale TallyLink.exe can never be packaged.
    * `-c AgentA` is used by default so parallel agents building the same project
      do not contend over bin\obj. Pass -Configuration to override.
  ============================================================================ #>

[CmdletBinding()]
param(
    # MSBuild configuration used for the publish.
    [string]$Configuration = 'AgentA',

    # Version stamped into the installer (informational only — the .iss has its
    # own AppVersion; kept in sync by the caller).
    [string]$Version = '2.0.1',

    # Optional explicit path to ISCC.exe.
    [string]$IsccPath = '',

    # Optional path to the project file.
    [string]$ProjectPath = '',

    # Skip the dotnet publish step (use an existing .\publish folder).
    [switch]$SkipPublish
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ---------------------------------------------------------------------------
# Resolve paths relative to this script (works regardless of caller cwd).
# ---------------------------------------------------------------------------
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot   = Split-Path -Parent $ScriptDir
$ProjectFile = if ($ProjectPath) { $ProjectPath } else { Join-Path $RepoRoot 'TallySyncApp.csproj' }
$PublishDir  = Join-Path $RepoRoot 'publish'
$IssFile     = Join-Path $ScriptDir 'TallyLink.iss'
$OutputDir   = Join-Path $ScriptDir 'output'
$IconSource  = Join-Path $RepoRoot 'app_icon.ico'

function Write-Step([string]$Message) {
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "    $Message" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# 1. Locate ISCC.exe
# ---------------------------------------------------------------------------
function Find-Iscc {
    if ($IsccPath) {
        if (Test-Path -LiteralPath $IsccPath) { return (Resolve-Path -LiteralPath $IsccPath).Path }
        throw "ISCC.exe not found at the path given in -IsccPath: $IsccPath"
    }

    if ($env:ISCC_PATH -and (Test-Path -LiteralPath $env:ISCC_PATH)) {
        return (Resolve-Path -LiteralPath $env:ISCC_PATH).Path
    }

    # Standard Inno Setup 6 install locations (x86 then native).
    $candidates = @(
        (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
        (Join-Path $env:ProgramFiles        'Inno Setup 6\ISCC.exe'),
        (Join-Path $env:LOCALAPPDATA        'Programs\Inno Setup 6\ISCC.exe')
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    }

    # Last resort: ask PATH.
    $onPath = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }

    return $null
}

# ---------------------------------------------------------------------------
# 2. Publish
# ---------------------------------------------------------------------------
function Publish-App {
    Write-Step "Publishing TallyLink ($Configuration, win-x64, self-contained single file)"

    if (-not (Test-Path -LiteralPath $ProjectFile)) {
        throw "Project file not found: $ProjectFile"
    }

    # Start from a clean publish folder so no stale binary can be packaged.
    if (Test-Path -LiteralPath $PublishDir) {
        Write-Ok "Removing previous publish output: $PublishDir"
        Remove-Item -LiteralPath $PublishDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $PublishDir -Force | Out-Null

    $publishArgs = @(
        'publish', $ProjectFile
        '-c', $Configuration
        '-r', 'win-x64'
        '--self-contained', 'true'
        '-p:PublishSingleFile=true'
        '-p:SelfContained=true'
        '-p:RuntimeIdentifier=win-x64'
        '-p:IncludeAllContentForSelfExtract=true'
        '-p:DebugType=embedded'
        '-p:PublishReadyToRun=false'
        '-o', $PublishDir
    )

    Write-Ok "dotnet $($publishArgs -join ' ')"
    & dotnet @publishArgs

    if ($LASTEXITCODE -ne 0) {
        throw "dotnet publish failed with exit code $LASTEXITCODE. The installer was NOT built."
    }

    $exe = Join-Path $PublishDir 'TallyLink.exe'
    if (-not (Test-Path -LiteralPath $exe)) {
        throw "dotnet publish reported success but $exe is missing."
    }

    $sizeMb = [math]::Round((Get-Item -LiteralPath $exe).Length / 1MB, 1)
    Write-Ok "Published $exe ($sizeMb MB)"
}

# ---------------------------------------------------------------------------
# 3. Stage the icon next to the publish output
# ---------------------------------------------------------------------------
function Stage-Icon {
    Write-Step 'Staging app icon for the installer'
    if (Test-Path -LiteralPath $IconSource) {
        Copy-Item -LiteralPath $IconSource -Destination (Join-Path $PublishDir 'app_icon.ico') -Force
        Write-Ok "Copied app_icon.ico into the publish folder"
    }
    else {
        # The .iss also has a ..\app_icon.ico source, so this is only a warning.
        Write-Warning "app_icon.ico not found at $IconSource — shortcuts will fall back to the exe icon."
    }
}

# ---------------------------------------------------------------------------
# 4. Compile the installer
# ---------------------------------------------------------------------------
function Invoke-Iscc([string]$Iscc) {
    Write-Step "Compiling installer with ISCC.exe"
    Write-Ok "ISCC: $Iscc"

    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

    # ISCC resolves relative Source: paths against the current directory, so run
    # it from the installer folder (where the .iss lives).
    Push-Location $ScriptDir
    try {
        & $Iscc /Q /O"$OutputDir" /F"TallyLink-Setup" "$IssFile"
        if ($LASTEXITCODE -ne 0) {
            throw "ISCC.exe failed with exit code $LASTEXITCODE. See the output above."
        }
    }
    finally {
        Pop-Location
    }

    $setup = Join-Path $OutputDir 'TallyLink-Setup.exe'
    if (-not (Test-Path -LiteralPath $setup)) {
        throw "ISCC.exe reported success but $setup is missing."
    }

    $sizeMb = [math]::Round((Get-Item -LiteralPath $setup).Length / 1MB, 1)
    Write-Ok "Built $setup ($sizeMb MB)"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
try {
    Write-Host ''
    Write-Host "TallyLink installer build — v$Version" -ForegroundColor White
    Write-Host ("=" * 60)

    $iscc = Find-Iscc
    if (-not $iscc) {
        Write-Host ''
        Write-Host 'ERROR: Inno Setup compiler (ISCC.exe) was not found.' -ForegroundColor Red
        Write-Host ''
        Write-Host '  Install Inno Setup 6.x from https://jrsoftware.org/isdl.php' -ForegroundColor Yellow
        Write-Host '  or point this script at an existing compiler with one of:' -ForegroundColor Yellow
        Write-Host '      -IsccPath "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"' -ForegroundColor Yellow
        Write-Host '      $env:ISCC_PATH = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"' -ForegroundColor Yellow
        Write-Host ''
        Write-Host '  The app was NOT published and no setup.exe was produced.' -ForegroundColor Red
        exit 1
    }

    if (-not $SkipPublish) { Publish-App } else { Write-Step 'Skipping publish (-SkipPublish)' }

    Stage-Icon
    Invoke-Iscc $iscc

    Write-Host ''
    Write-Host 'TallyLink installer build completed successfully.' -ForegroundColor Green
    Write-Host "Setup: $(Join-Path $OutputDir 'TallyLink-Setup.exe')" -ForegroundColor Green
    exit 0
}
catch {
    Write-Host ''
    Write-Host "BUILD FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ''
    exit 1
}
