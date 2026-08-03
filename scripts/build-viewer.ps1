<#
.SYNOPSIS
    Build the Next.js viewer as a static export and copy into Python package.

.DESCRIPTION
    Runs npm ci + npm run build in jama-viewer/, then copies the output
    to src/jama_mcp_v2/viewer_static/ for inclusion in the pip wheel.

.EXAMPLE
    .\scripts\build-viewer.ps1
#>

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$ViewerDir = Join-Path $ProjectDir "jama-viewer"
$TargetDir = Join-Path (Join-Path (Join-Path $ProjectDir "src") "jama_mcp_v2") "viewer_static"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Build Jama Viewer - Static Export"
Write-Host "============================================"
Write-Host ""

# Check Node.js
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Error "Node.js not found. Install Node.js >= 18."
    exit 1
}

$nodeVersion = (node --version) -replace '^v', '' -split '\.' | Select-Object -First 1
if ([int]$nodeVersion -lt 18) {
    Write-Error "Node.js >= 18 required (found v$nodeVersion)."
    exit 1
}

Write-Host "  Node.js: $(node --version)"
Write-Host "  npm:     $(npm --version)"
Write-Host "  Viewer:  $ViewerDir"
Write-Host "  Output:  $TargetDir"
Write-Host ""

# Install dependencies
Write-Host "[1/3] Installing npm dependencies..." -ForegroundColor Cyan
Push-Location $ViewerDir
npm ci --silent

# Build
Write-Host "[2/3] Building static export..." -ForegroundColor Cyan
npm run build
Pop-Location

# Copy to Python package
Write-Host "[3/3] Copying to Python package..." -ForegroundColor Cyan
if (Test-Path $TargetDir) {
    Remove-Item -Recurse -Force $TargetDir
}
Copy-Item -Recurse (Join-Path $ViewerDir "out") $TargetDir

$fileCount = (Get-ChildItem -Recurse -File $TargetDir).Count
Write-Host ""
Write-Host "Build complete!" -ForegroundColor Green
Write-Host "  Files: $fileCount"
Write-Host "  Path:  $TargetDir"
Write-Host ""
Write-Host "Next: build the pip wheel with 'uv build' or 'python -m build'" -ForegroundColor Cyan
