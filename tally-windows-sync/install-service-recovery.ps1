param(
  [string]$Executable = "$PSScriptRoot\TallyLink.exe",
  [string]$TaskName = "SYNCORA TallyLink Background Sync"
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Executable)) { throw "Executable not found: $Executable" }

$action = New-ScheduledTaskAction -Execute $Executable -Argument '--minimized'
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Startup recovery configured: $TaskName"
