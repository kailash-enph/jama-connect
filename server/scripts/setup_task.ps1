<#
.SYNOPSIS
    Register a Windows Task Scheduler task to run generate_caches.py nightly.
.DESCRIPTION
    Creates a scheduled task that runs at 2:00 AM every day.
    Edit the task in Task Scheduler if you want a different time.
.EXAMPLE
    .\setup_task.ps1 -PythonPath "C:\Python312\python.exe"
#>

param(
    [string]$PythonPath = "python",
    [string]$WorkDir = $PSScriptRoot,
    [string]$TaskName = "JamaConnectCacheGenerate",
    [string]$RunTime = "02:00"
)

$script = Join-Path $WorkDir "generate_caches.py"
$envFile = Join-Path (Split-Path $WorkDir -Parent) ".env"
$logFile = Join-Path $WorkDir "generate_caches.log"

$action = New-ScheduledTaskAction -Execute $PythonPath -Argument "`"$script`" --env `"$envFile`" >> `"$logFile`" 2>&1" -WorkingDirectory $WorkDir

$trigger = New-ScheduledTaskTrigger -Daily -At $RunTime

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 4) `
    -RestartCount 0 `
    -StartWhenAvailable

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal
    Write-Host "Scheduled task '$TaskName' registered — runs daily at $RunTime"
    Write-Host "Log file: $logFile"
} catch {
    Write-Error "Failed to register task: $_"
    exit 1
}
