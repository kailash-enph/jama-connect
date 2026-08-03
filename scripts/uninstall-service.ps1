<#
.SYNOPSIS
    Removes the Jama MCP Backend scheduled task and stops the backend.

.DESCRIPTION
    Stops the running backend (if any), removes the "JamaMCPBackend"
    scheduled task, and cleans up the PID file.

.EXAMPLE
    .\uninstall-service.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$TaskName = "JamaMCPBackend"
$PidFile = Join-Path $env:USERPROFILE ".jama-mcp-v2" "backend.pid"

# Stop the task if running
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    if ($task.State -eq "Running") {
        Write-Host "Stopping running task..." -ForegroundColor Yellow
        Stop-ScheduledTask -TaskName $TaskName
        Start-Sleep -Seconds 2
    }
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task '$TaskName'." -ForegroundColor Green
} else {
    Write-Host "Task '$TaskName' does not exist." -ForegroundColor Yellow
}

# Try graceful shutdown via REST API
try {
    $null = Invoke-RestMethod -Uri "http://localhost:8765/settings/server/stop" -Method POST -TimeoutSec 5
    Write-Host "Sent stop signal to backend." -ForegroundColor Cyan
    Start-Sleep -Seconds 2
} catch {
    Write-Host "Backend not running or already stopped." -ForegroundColor Gray
}

# Clean up PID file
if (Test-Path $PidFile) {
    $oldPid = (Get-Content $PidFile -Raw).Trim()
    try {
        $proc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "Killing remaining backend process (PID $oldPid)..." -ForegroundColor Yellow
            Stop-Process -Id $oldPid -Force
        }
    } catch {}
    Remove-Item $PidFile -Force
    Write-Host "Cleaned up PID file." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Jama MCP Backend service uninstalled." -ForegroundColor Green
