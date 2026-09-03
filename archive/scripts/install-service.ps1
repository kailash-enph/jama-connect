<#
.SYNOPSIS
    Installs the Jama MCP Backend as a Windows Task Scheduler task.
    The backend will start automatically at logon for the current user.

.DESCRIPTION
    Creates a scheduled task "JamaMCPBackend" that runs the unified
    Jama backend on port 8765 at user logon. The backend binds to
    127.0.0.1 (localhost only) for security.

    Prerequisites:
    - uv (Python package manager) must be on PATH
    - jama-mcp-v2 project directory must exist

.PARAMETER Port
    REST API port (default: 8765)

.PARAMETER Uninstall
    Remove the scheduled task instead of creating it

.EXAMPLE
    .\install-service.ps1
    .\install-service.ps1 -Port 8765
    .\install-service.ps1 -Uninstall
#>

[CmdletBinding()]
param(
    [int]$Port = 8765,
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$TaskName = "JamaMCPBackend"

# Resolve paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir  # jama-mcp-v2 root

# Find uv on PATH
$UvPath = (Get-Command uv -ErrorAction SilentlyContinue).Source
if (-not $UvPath) {
    Write-Error "uv not found on PATH. Install it first: https://docs.astral.sh/uv/"
    exit 1
}

# --- Uninstall ---
if ($Uninstall) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed scheduled task '$TaskName'." -ForegroundColor Green
    } else {
        Write-Host "Task '$TaskName' does not exist." -ForegroundColor Yellow
    }
    exit 0
}

# --- Install ---
Write-Host "Installing Jama MCP Backend as scheduled task..." -ForegroundColor Cyan
Write-Host "  Project: $ProjectDir"
Write-Host "  uv:      $UvPath"
Write-Host "  Port:    $Port"
Write-Host ""

# Remove existing task if present
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Removing existing task..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# Log directory
$LogDir = Join-Path $env:USERPROFILE ".jama-mcp-v2" "logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}
$LogFile = Join-Path $LogDir "service.log"

# Build the command
# We use cmd /c to set the working directory and redirect output to log file
$Arguments = "/c `"cd /d `"$ProjectDir`" && `"$UvPath`" run --link-mode=copy python -m jama_mcp_v2 --rest-only --port $Port >> `"$LogFile`" 2>&1`""

# Create action
$Action = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument $Arguments `
    -WorkingDirectory $ProjectDir

# Create trigger: at logon for current user
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Trigger.UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

# Create settings
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 0)  # No time limit

# Disable the execution time limit (0 = unlimited)
$Settings.ExecutionTimeLimit = "PT0S"

# Register the task
Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "Jama MCP v2 unified backend (REST API on port $Port)" `
    -RunLevel Limited | Out-Null

Write-Host ""
Write-Host "Scheduled task '$TaskName' created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "  Task will start at next logon." -ForegroundColor Cyan
Write-Host "  To start it now:  Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Cyan
Write-Host "  To check status:  Get-ScheduledTask -TaskName '$TaskName' | Select State" -ForegroundColor Cyan
Write-Host "  To remove:        .\install-service.ps1 -Uninstall" -ForegroundColor Cyan
Write-Host "  Log file:         $LogFile" -ForegroundColor Cyan
Write-Host ""

# Offer to start now
$startNow = Read-Host "Start the backend now? (y/N)"
if ($startNow -eq 'y' -or $startNow -eq 'Y') {
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "Task started. Backend should be available at http://localhost:$Port in a few seconds." -ForegroundColor Green
}
