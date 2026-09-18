#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Full build and install pipeline for jama-connect.

.DESCRIPTION
    One command to go from source to running:

      Step 0  Kill daemon       — stop any running jama-rest process (avoids
                                  file-lock during pip reinstall on Windows)
      Step 1  Extension JS      — compile vscode-extension via esbuild
      Step 2  Extension tests   — vitest (fails the script if any test fails)
      Step 3  Package VSIX      — vsce package (skipped with -SkipVsix)
      Step 4  Sync pip data     — copy out/ and .vsix into backend/src/data/
      Step 5  Python tests      — pytest (fails the script if any test fails)
      Step 6  Build wheel       — uv build  →  dist/jama_connect-*.whl
      Step 7  pip install       — uv pip install --force-reinstall <wheel>

    After the script finishes, run:
        jama-post-install

    That single command will install the extensions into VS Code and Devin,
    then start the backend daemon.

.PARAMETER SkipVsix
    Skip vsce packaging (faster; use when only JS changed, not package.json).

.PARAMETER SkipTests
    Skip both extension and Python tests.

.PARAMETER Port
    Backend REST port to stop before reinstalling (default: 8765).

.EXAMPLE
    # Normal release build
    .\client\scripts\build-and-install.ps1

    # Fast JS-only update (no vsix rebuild, no tests)
    .\client\scripts\build-and-install.ps1 -SkipVsix -SkipTests
#>

param(
    [switch]$SkipVsix,
    [switch]$SkipTests,
    [int]$Port = 8765
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$sw = [System.Diagnostics.Stopwatch]::StartNew()

function Step($n, $msg) {
    Write-Host "`n[$n] $msg" -ForegroundColor Cyan
}
function Ok($msg)   { Write-Host "  OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  WARN $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Error "  FAIL $msg" }

# Resolve directories relative to this script's location
$scriptDir  = $PSScriptRoot                                          # client/scripts/
$clientDir  = Split-Path $scriptDir -Parent                         # client/
$extDir     = Join-Path $clientDir "vscode-extension"
$backendDir = Join-Path $clientDir "backend"
$dataDir    = Join-Path $backendDir "src\jama_mcp_v2\data"
$extOutDst  = Join-Path $dataDir "extension_out"

# ---------------------------------------------------------------------------
# Step 0: Kill running daemon (avoid file lock during pip reinstall on Windows)
# ---------------------------------------------------------------------------
Step 0 "Stop running daemon (port $Port)"
try {
    $resp = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue
    # Daemon is up — send shutdown
    Write-Host "  Daemon running — sending shutdown request ..."
    try {
        Invoke-RestMethod -Uri "http://127.0.0.1:$Port/settings/server/stop" -Method Post -TimeoutSec 5 -ErrorAction SilentlyContinue
    } catch { <# connection close is normal #> }
    # Wait up to 6 s
    $stopped = $false
    for ($i = 0; $i -lt 12; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -Method Get -TimeoutSec 1 -ErrorAction Stop | Out-Null
        } catch {
            $stopped = $true; break
        }
    }
    if ($stopped) { Ok "Daemon stopped cleanly." }
    else {
        Warn "Graceful shutdown timed out — force-killing ..."
        Get-CimInstance Win32_Process | Where-Object {
            $_.CommandLine -and ($_.CommandLine -match 'jama_mcp_v2' -or $_.CommandLine -match 'jama-rest')
        } | ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            Write-Host "  Killed PID $($_.ProcessId)"
        }
        Start-Sleep -Seconds 1
    }
} catch {
    Ok "Daemon not running."
}

# ---------------------------------------------------------------------------
# Step 1: Compile VS Code extension
# ---------------------------------------------------------------------------
Step 1 "Compile VS Code extension (esbuild)"
Push-Location $extDir
try {
    node esbuild.mjs
    if ($LASTEXITCODE -ne 0) { Fail "esbuild failed (exit $LASTEXITCODE)" }
    $files = (Get-ChildItem (Join-Path $extDir "out") -Recurse -File).Count
    Ok "Compiled ($files file(s) in out/)"
} finally { Pop-Location }

# ---------------------------------------------------------------------------
# Step 2: Extension tests
# ---------------------------------------------------------------------------
if ($SkipTests) {
    Write-Host "`n[2] Extension tests — SKIPPED (-SkipTests)" -ForegroundColor DarkGray
} else {
    Step 2 "VS Code extension tests (vitest)"
    Push-Location $extDir
    try {
        npm test
        if ($LASTEXITCODE -ne 0) { Fail "Extension tests failed — fix before installing." }
        Ok "All extension tests passed."
    } finally { Pop-Location }
}

# ---------------------------------------------------------------------------
# Step 3: Package VSIX
# ---------------------------------------------------------------------------
if ($SkipVsix) {
    Write-Host "`n[3] Package VSIX — SKIPPED (-SkipVsix)" -ForegroundColor DarkGray
} else {
    Step 3 "Package VSIX (vsce)"
    Push-Location $extDir
    try {
        # Remove any stale .vsix files
        Get-ChildItem $extDir -Filter "*.vsix" | Remove-Item -Force
        npx vsce package --no-dependencies 2>&1 | Select-Object -Last 5
        if ($LASTEXITCODE -ne 0) { Fail "vsce package failed (exit $LASTEXITCODE)" }
        $vsix = Get-ChildItem $extDir -Filter "*.vsix" | Select-Object -First 1
        if (-not $vsix) { Fail "No .vsix produced." }
        Ok "Packaged: $($vsix.Name) ($([math]::Round($vsix.Length / 1KB)) KB)"
    } finally { Pop-Location }
}

# ---------------------------------------------------------------------------
# Step 4: Sync compiled assets into pip package data/
# ---------------------------------------------------------------------------
Step 4 "Sync compiled assets to pip package data/"

# 4a: extension out/ → data/extension_out/
$outSrc = Join-Path $extDir "out"
New-Item -ItemType Directory -Force -Path $extOutDst | Out-Null
robocopy $outSrc $extOutDst /MIR /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { Fail "robocopy failed (exit $LASTEXITCODE)" }
$nFiles = (Get-ChildItem $extOutDst -Recurse -File).Count
Ok "extension_out/ synced ($nFiles file(s))"

# 4b: .vsix → data/jama-editor.vsix (only if built)
if (-not $SkipVsix) {
    $vsix = Get-ChildItem $extDir -Filter "*.vsix" | Select-Object -First 1
    if ($vsix) {
        $vsixDst = Join-Path $dataDir "jama-editor.vsix"
        Copy-Item $vsix.FullName $vsixDst -Force
        Ok "jama-editor.vsix updated ($([math]::Round($vsix.Length / 1KB)) KB)"
    }
}

# ---------------------------------------------------------------------------
# Step 5: Python backend tests
# ---------------------------------------------------------------------------
if ($SkipTests) {
    Write-Host "`n[5] Python tests — SKIPPED (-SkipTests)" -ForegroundColor DarkGray
} else {
    Step 5 "Python backend tests (pytest)"
    Push-Location $backendDir
    try {
        uv run pytest tests/ -q
        if ($LASTEXITCODE -ne 0) { Fail "Python tests failed — fix before installing." }
        Ok "All Python tests passed."
    } finally { Pop-Location }
}

# ---------------------------------------------------------------------------
# Step 6: Build wheel
# ---------------------------------------------------------------------------
Step 6 "Build Python wheel (uv build)"
Push-Location $backendDir
try {
    # Clean old wheels so we always install the freshest one
    $distDir = Join-Path $backendDir "dist"
    if (Test-Path $distDir) { Remove-Item -Recurse -Force $distDir }
    uv build
    if ($LASTEXITCODE -ne 0) { Fail "uv build failed (exit $LASTEXITCODE)" }
    $wheel = Get-ChildItem $distDir -Filter "*.whl" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $wheel) { Fail "No .whl file found in dist/." }
    Ok "Built: $($wheel.Name) ($([math]::Round($wheel.Length / 1MB, 1)) MB)"
} finally { Pop-Location }

# ---------------------------------------------------------------------------
# Step 7: pip install
# ---------------------------------------------------------------------------
Step 7 "pip install --force-reinstall"
# --no-deps: jama-connect is pure Python; dependencies (pydantic-core etc.) are
# already installed and their native .pyd files may be locked by Windsurf/other
# processes. Re-installing only the jama-connect wheel is safe and avoids the
# "Access is denied" error on locked .pyd files.
uv pip install --system --no-deps --force-reinstall $wheel.FullName
if ($LASTEXITCODE -ne 0) { Fail "pip install failed (exit $LASTEXITCODE)" }
Ok "jama-connect $($wheel.Name -replace '.*-(\d+\.\d+\.\d+)-.*','$1') installed."

# ---------------------------------------------------------------------------
# Done — print post-install reminder
# ---------------------------------------------------------------------------
$elapsed = [math]::Round($sw.Elapsed.TotalSeconds, 1)
Write-Host ""
Write-Host ("=" * 60) -ForegroundColor Green
Write-Host "  BUILD + INSTALL COMPLETE  ($($elapsed)s)" -ForegroundColor Green
Write-Host ("=" * 60) -ForegroundColor Green
Write-Host ""
Write-Host "  Now run the post-install step:" -ForegroundColor Yellow
Write-Host ""
Write-Host "      jama-post-install" -ForegroundColor White
Write-Host ""
Write-Host "  This will:" -ForegroundColor DarkGray
Write-Host "    * Install extension into VS Code (~/.vscode/extensions/)" -ForegroundColor DarkGray
Write-Host "    * Install extension into Devin  (~/.devin/extensions/)" -ForegroundColor DarkGray
Write-Host "    * Start the backend daemon      (http://localhost:$Port)" -ForegroundColor DarkGray
Write-Host ""
