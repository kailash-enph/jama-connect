<#
.SYNOPSIS
  Clean build and deploy the Jama Editor VS Code extension.
.DESCRIPTION
  Removes stale output, rebuilds from source via esbuild, packages VSIX,
  verifies the bundle contains expected symbols, and installs into VS Code.
.PARAMETER Force
  Force npm install even if node_modules exists.
.EXAMPLE
  .\build-and-deploy.ps1
  .\build-and-deploy.ps1 -Force
#>
param(
    [switch]$Force,
    [switch]$NoBackendRestart
)

$ErrorActionPreference = 'Stop'
$sw = [System.Diagnostics.Stopwatch]::StartNew()

function Step($msg) {
    Write-Host "`n==> $msg" -ForegroundColor Cyan
}

$root = $PSScriptRoot
Set-Location $root

# ---------- 1. Clean ----------
Step "Cleaning stale outputs"
if (Test-Path "$root\out") {
    Remove-Item -Recurse -Force "$root\out"
    Write-Host "  Deleted out/"
}
Get-ChildItem -Path $root -Filter "*.vsix" | ForEach-Object {
    Remove-Item -Force $_.FullName
    Write-Host "  Deleted $($_.Name)"
}

# Remove incorrectly-named workspace-level extension folder (from manual Copy-Item)
$wsStale = Join-Path (Split-Path $root -Parent | Split-Path -Parent | Split-Path -Parent) ".devin\extensions\jama-editor"
if (Test-Path $wsStale) {
    Remove-Item -Recurse -Force $wsStale
    Write-Host "  Deleted stale workspace extension: $wsStale"
}

# ---------- 2. Install deps ----------
if ($Force -or -not (Test-Path "$root\node_modules")) {
    Step "Installing npm dependencies"
    npm install --no-audit --no-fund 2>&1 | Out-Null
    Write-Host "  Done"
} else {
    Write-Host "`n==> node_modules exists, skipping npm install (use -Force to override)" -ForegroundColor DarkGray
}

# ---------- 3. Compile ----------
Step "Compiling (esbuild)"
npm run compile
if ($LASTEXITCODE -ne 0) {
    Write-Error "Compile failed (exit code $LASTEXITCODE)"
}

# ---------- 4. Verify bundle ----------
Step "Verifying bundle"
$bundle = Get-Content "$root\out\extension.js" -Raw
$patterns = "/cycles","/runs","jamaTestRunner","selectProject","lastProjectId","summary-card","pushTestPlan","openTestDetail"
$descs = "test cycles URL","test runs URL","test runner view ID","select project command","project persistence key","summary card CSS","push test plan method","open test detail command"
$allOk = $true
for ($i = 0; $i -lt $patterns.Count; $i++) {
    if ($bundle.Contains($patterns[$i])) {
        Write-Host "  OK  $($descs[$i])" -ForegroundColor Green
    } else {
        Write-Host "  FAIL  $($descs[$i]) - '$($patterns[$i])' not found" -ForegroundColor Red
        $allOk = $false
    }
}
if (-not $allOk) {
    Write-Error "Bundle verification failed - stale code may still be present."
}

# ---------- 5. Package VSIX ----------
Step "Packaging VSIX"
npx vsce package --no-dependencies 2>&1 | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) {
    Write-Error "VSIX packaging failed (exit code $LASTEXITCODE)"
}
$vsix = Get-ChildItem -Path $root -Filter "*.vsix" | Select-Object -First 1
if (-not $vsix) {
    Write-Error "No .vsix file found after packaging."
}
Write-Host "  Created: $($vsix.Name) ($([math]::Round($vsix.Length / 1KB)) KB)"

# ---------- 6. Install ----------
Step "Installing extension"
# Install to both .devin/extensions (Windsurf) and .vscode/extensions (VS Code)
$extName = "enphase.jama-editor-0.1.0"
$targets = @(
    "$env:USERPROFILE\.devin\extensions\$extName",
    "$env:USERPROFILE\.vscode\extensions\$extName"
)
foreach ($target in $targets) {
    if (Test-Path $target) {
        Remove-Item -Recurse -Force $target
    }
    $parentDir = Split-Path $target -Parent
    if (Test-Path $parentDir) {
        # Extract VSIX (it's a zip — rename for Expand-Archive)
        $tempDir = "$env:TEMP\jama-editor-vsix-$$"
        $zipCopy = "$env:TEMP\jama-editor-temp.zip"
        Copy-Item $vsix.FullName $zipCopy -Force
        Expand-Archive -Path $zipCopy -DestinationPath $tempDir -Force
        Remove-Item $zipCopy -Force -ErrorAction SilentlyContinue
        # VSIX extracts to extension/ subfolder
        if (Test-Path "$tempDir\extension") {
            Copy-Item -Recurse -Force "$tempDir\extension" $target
        }
        Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
        Write-Host "  Installed to $target" -ForegroundColor Green
    } else {
        Write-Host "  Skipped $target (parent dir not found)" -ForegroundColor DarkGray
    }
}

# ---------- 7. Restart editor backend ----------
if (-not $NoBackendRestart) {
    Step "Restarting editor backend (port 8766)"
    # Kill existing editor backend process
    $editorProcs = Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -and $_.CommandLine -match 'jama_editor.*--port\s*8766'
    }
    foreach ($p in $editorProcs) {
        Write-Host "  Killing PID $($p.ProcessId)" -ForegroundColor Yellow
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1

    # Re-launch editor backend
    $jamaMcpDir = Join-Path (Split-Path $root -Parent | Split-Path -Parent) "mcp-servers\jama-mcp-v2"
    if (Test-Path $jamaMcpDir) {
        Start-Process -FilePath "uv" -ArgumentList "run","--link-mode=copy","python","-m","jama_editor","--port","8766" `
            -WorkingDirectory $jamaMcpDir -WindowStyle Minimized
        Write-Host "  Editor backend started (port 8766)" -ForegroundColor Green
    } else {
        Write-Host "  WARNING: jama-mcp-v2 dir not found at $jamaMcpDir" -ForegroundColor Red
    }
} else {
    Write-Host "`n==> Skipping backend restart (--NoBackendRestart)" -ForegroundColor DarkGray
}

# ---------- Done ----------
$sw.Stop()
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  BUILD + DEPLOY COMPLETE ($([math]::Round($sw.Elapsed.TotalSeconds, 1))s)" -ForegroundColor Green
Write-Host "  Reload VS Code:  Ctrl+Shift+P -> Developer: Reload Window" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Green
