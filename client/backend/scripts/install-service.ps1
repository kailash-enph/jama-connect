<#
.SYNOPSIS
  Install Jama Connect backend as a Windows Task Scheduler login service.

.PARAMETER Port
  REST API port (default: 8765).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install-service.ps1 -Port 8765
#>

param(
    [int]$Port = 8765
)

$TaskName  = "JamaMCPBackend"
$JamaRest  = (Get-Command jama-rest -ErrorAction SilentlyContinue)?.Source

if (-not $JamaRest) {
    Write-Error "jama-rest not found in PATH. Install with: pip install jama-mcp-v2"
    exit 1
}

# Remove existing task if present
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$Action  = New-ScheduledTaskAction -Execute $JamaRest -Argument "--port $Port"
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null

Write-Host "Installed '$TaskName' — jama-rest will start automatically at login on port $Port."
Write-Host "To start now: Start-ScheduledTask -TaskName '$TaskName'"
Start-ScheduledTask -TaskName $TaskName
Write-Host "Started."
