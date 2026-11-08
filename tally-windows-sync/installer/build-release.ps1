[CmdletBinding()]
param([string]$OutputDir = '', [string]$IsccPath = '')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = Split-Path -Parent $PSScriptRoot
$project = Join-Path $projectRoot 'TallySyncApp.csproj'
[xml]$projectXml = Get-Content -Raw -LiteralPath $project
$version = [string]$projectXml.Project.PropertyGroup.Version
if (-not $OutputDir) { $OutputDir = Join-Path $projectRoot "publish\releases\$version" }
$OutputDir = [IO.Path]::GetFullPath($OutputDir)
if ((Test-Path -LiteralPath $OutputDir) -and (Get-ChildItem -LiteralPath $OutputDir -Force | Select-Object -First 1)) {
    throw 'Release output is not empty. Choose a new -OutputDir to preserve previous artifacts.'
}
if (-not $IsccPath) {
    $candidates = @(
        (Join-Path $env:USERPROFILE 'AppData\Local\Programs\Inno Setup 6\ISCC.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
        (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
    )
    $IsccPath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $IsccPath) { throw 'Inno Setup 6 ISCC.exe was not found. Pass -IsccPath.' }
$iss = Join-Path $PSScriptRoot 'SyncoraConnector.iss'
if (-not (Select-String -LiteralPath $iss -SimpleMatch "#define AppVersion `"$version`"" -Quiet)) { throw 'Installer and project versions do not match.' }
$appDir = Join-Path $OutputDir 'app'
New-Item -ItemType Directory -Path $appDir -Force | Out-Null
& dotnet publish $project -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -p:PublishReadyToRun=false -p:DebugType=None -p:DebugSymbols=false -o $appDir
if ($LASTEXITCODE -ne 0) { throw 'Release publish failed.' }

$configPath = Join-Path $appDir 'appsettings.json'
$config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
function Protect-ClientConfig($node) {
    foreach ($property in $node.PSObject.Properties) {
        if ($property.Value -is [System.Management.Automation.PSCustomObject]) { Protect-ClientConfig $property.Value }
        elseif ($property.Name -match 'ServiceRole|Secret|Password|BotToken|AccessToken|RefreshToken') { $property.Value = '' }
        elseif ($property.Name -match 'ApiKey|AnonKey' -and $property.Value) {
            $key = [string]$property.Value
            if ($key.StartsWith('sb_publishable_')) { continue }
            if ($key.StartsWith('sb_secret_') -or $key.Split('.').Count -ne 3) { throw "Unrecognized public key in $($property.Name)" }
            $payload = $key.Split('.')[1].Replace('-', '+').Replace('_', '/')
            $payload = $payload.PadRight($payload.Length + ((4 - $payload.Length % 4) % 4), '=')
            $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
            if ($claims.role -ne 'anon') { throw "Non-public API key in $($property.Name)" }
        }
    }
}
Protect-ClientConfig $config
$config.SyncSettings.SyncOwnerId = ''
$config.UpdateSettings.CurrentVersion = $version
$config.SyncSettings.LicencePurchaseUrl = 'https://tallyonmob.vercel.app/subscription'
$config | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $configPath -Encoding utf8
$exe = Join-Path $appDir 'SyncoraConnector.exe'
if ((Get-Item -LiteralPath $exe).VersionInfo.ProductVersion -notlike "$version*") { throw 'Executable version does not match release version.' }
& $IsccPath /Qp "/DPublishDir=$appDir" "/O$OutputDir" "/FSyncoraConnector-Setup-$version" $iss
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
$installer = Join-Path $OutputDir "SyncoraConnector-Setup-$version.exe"
if (-not (Test-Path -LiteralPath $installer)) { throw 'Installer was not produced.' }
Get-FileHash -LiteralPath $installer -Algorithm SHA256 | Format-List
Write-Output "Installer: $installer"
