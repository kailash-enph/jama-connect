<#
.SYNOPSIS
    Windows unified installer for jama-mcp-v2.

.DESCRIPTION
    Checks Python >= 3.12, installs the pip package from internal PyPI,
    and optionally installs the Windows Task Scheduler login service.

.EXAMPLE
    .\scripts\install.ps1
#>

$ErrorActionPreference = "Stop"

$PyPiUrl = "http://nz-lnx-01/pypi"
$Package = "jama-mcp-v2"
$MinPythonMajor = 3
$MinPythonMinor = 12
$Port = 8765

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Jama MCP v2 - Windows Installer"
Write-Host "============================================"
Write-Host ""

# ---------- Check Python ----------
$pythonCmd = $null
foreach ($cmd in @("python", "python3", "py")) {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($found) {
        try {
            $ver = & $cmd -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
            $parts = $ver -split '\.'
            if ([int]$parts[0] -ge $MinPythonMajor -and [int]$parts[1] -ge $MinPythonMinor) {
                $pythonCmd = $cmd
                break
            }
        } catch { }
    }
}

if (-not $pythonCmd) {
    Write-Error "Python >= ${MinPythonMajor}.${MinPythonMinor} not found."
    Write-Host ""
    Write-Host "Install Python from https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

$pyVer = & $pythonCmd --version
Write-Host "[1/3] Python: $pyVer ($pythonCmd)" -ForegroundColor Cyan

# ---------- Install pip package ----------
Write-Host "[2/3] Installing $Package from $PyPiUrl..." -ForegroundColor Cyan
& $pythonCmd -m pip install --upgrade $Package `
    --extra-index-url $PyPiUrl `
    --trusted-host nz-lnx-01 `
    --quiet

# Verify installation
$installed = & $pythonCmd -m pip show $Package 2>$null | Select-String "Version"
Write-Host "  Installed: $installed"
Write-Host ""

# ---------- Optional: install login service ----------
$installService = Read-Host "[3/3] Install as login service (auto-start at login)? (y/N)"
if ($installService -match '^[Yy]$') {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $serviceScript = Join-Path $scriptDir "install-service.ps1"

    if (Test-Path $serviceScript) {
        & powershell -ExecutionPolicy Bypass -File $serviceScript -Port $Port
    } else {
        Write-Host ""
        Write-Host "Login service script not found at $serviceScript" -ForegroundColor Yellow
        Write-Host "Run manually: install-service.ps1 -Port $Port"
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host "============================================"
Write-Host ""
Write-Host "  Start backend:  jama-rest" -ForegroundColor Cyan
Write-Host "  Open viewer:    http://localhost:${Port}/viewer" -ForegroundColor Cyan
Write-Host "  Configure:      http://localhost:${Port}/viewer/settings" -ForegroundColor Cyan
Write-Host ""
