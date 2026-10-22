# TallyLink Release Automation Script
# Usage: .\create_release.ps1 [Version] [GitHubToken]
# Example: .\create_release.ps1 2.0.3 ghp_123456...

param (
    [string]$Version = "2.0.2",
    [string]$GitHubToken
)

$ErrorActionPreference = "Stop"

# 1. Check prerequisites
if (-not (Get-Command squirrel -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Squirrel Tool..."
    dotnet tool install -g Clowd.Squirrel.Tool
}

# 2. Update .csproj version (Simple regex replacement)
$csprojPath = "TallySyncApp\TallySyncApp.csproj"
$content = Get-Content $csprojPath
$newContent = $content -replace "<Version>.*</Version>", "<Version>$Version</Version>"
Set-Content $csprojPath $newContent

# 3. Publish the app
Write-Host "Publishing TallyLink v$Version..."
dotnet publish TallySyncApp\TallySyncApp.csproj -c Release -r win-x64 --self-contained -o PublishOutput

# 4. Create Squirrel Release
Write-Host "Packaging for Squirrel..."
squirrel pack --packId "TallyLink" --packVersion "$Version" --packAuthors "ShauryaTechSol" --packTitle "TallyLink" --releaseDir "Releases" --packDir "PublishOutput"

# 5. Output instructions
Write-Host "------------------------------------------------"
Write-Host "Release created in 'Releases' folder!"
Write-Host "Upload the following files to GitHub Release v${Version}:"
Write-Host "1. TallyLink Setup.exe"
Write-Host "2. TallyLink-$Version-full.nupkg"
Write-Host "3. RELEASES"
Write-Host "------------------------------------------------"
