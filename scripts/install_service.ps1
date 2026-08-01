# Run EchoVoiceAgent install with admin rights (Task Scheduler needs elevation).
# Double-click this from File Explorer, or run in PowerShell as Administrator.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $root 'scripts\echo_up.bat'

if (-not (Test-Path $launcher)) { throw "Launcher not found: $launcher" }

# Restart self elevated if not already admin
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit
}

schtasks /Delete /TN 'EchoVoiceAgent' /F 2>$null
$action = New-ScheduledTaskAction -Execute $launcher
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName 'EchoVoiceAgent' -Action $action -Trigger $trigger `
  -Settings $settings -Description 'Echo voice agent 24/7 (server + Tailscale Funnel)' -Force
Write-Host "Registered 'EchoVoiceAgent' to start at logon (elevated)."
Read-Host "Press Enter to exit"
