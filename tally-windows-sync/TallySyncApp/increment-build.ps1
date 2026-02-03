$path = "build.json"
if (-not (Test-Path $path)) {
    Write-Host "build.json not found!"
    exit 0
}
$json = Get-Content $path | ConvertFrom-Json
$json.build = $json.build + 1
$json | ConvertTo-Json -Depth 3 | Set-Content $path
Write-Host "Build number updated to $($json.build)"
