#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Compile the VS Code extension and sync the output into the pip package data.

.DESCRIPTION
    1. Runs `node esbuild.mjs` in client/vscode-extension/ to produce:
         out/extension.js  out/extension.js.map
         out/webview/tiptap.js  out/webview/tiptap.js.map
         out/webview/toolkit.js  out/webview/toolkit.js.map
    2. Copies those files into client/backend/src/jama_mcp_v2/data/extension_out/
       so they are bundled into the pip wheel.
    3. Optionally (--vsix) packages a .vsix and copies it to data/jama-editor.vsix.

.PARAMETER Vsix
    Also package and copy the .vsix file (requires vsce).

.EXAMPLE
    .\client\scripts\build_extension.ps1
    .\client\scripts\build_extension.ps1 -Vsix
#>

param(
    [switch]$Vsix
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root     = Split-Path $PSScriptRoot -Parent                     # client/
$extDir   = Join-Path $root "vscode-extension"
$dataDir  = Join-Path $root "backend\src\jama_mcp_v2\data\extension_out"

# ── 1. Compile ────────────────────────────────────────────────────────────────
Write-Host "==> Compiling VS Code extension..." -ForegroundColor Cyan
Push-Location $extDir
try {
    node esbuild.mjs
    if ($LASTEXITCODE -ne 0) { throw "esbuild failed (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}

# ── 2. Sync out/ → pip data ──────────────────────────────────────────────────
Write-Host "==> Syncing compiled files to pip package data..." -ForegroundColor Cyan
$outSrc = Join-Path $extDir "out"
if (-not (Test-Path $outSrc)) { throw "out/ directory not found after build: $outSrc" }

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

# Robocopy: /MIR mirrors (adds new, updates changed, removes deleted)
# /NFL /NDL /NJH /NJS = suppress noisy file-list output
robocopy $outSrc $dataDir /MIR /NFL /NDL /NJH /NJS | Out-Null
# Robocopy exit codes 0-7 are success (bit flags for files copied/extra/etc.)
if ($LASTEXITCODE -ge 8) { throw "robocopy failed (exit $LASTEXITCODE)" }

$files = Get-ChildItem $dataDir -Recurse -File
Write-Host "  Synced $($files.Count) file(s) to $dataDir" -ForegroundColor Green

# ── 3. Optional: package .vsix ───────────────────────────────────────────────
if ($Vsix) {
    Write-Host "==> Packaging .vsix..." -ForegroundColor Cyan
    Push-Location $extDir
    try {
        $vsceOut = & npx vsce package --no-dependencies 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "vsce package failed: $vsceOut"
        } else {
            $vsixFile = Get-ChildItem $extDir -Filter "*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($vsixFile) {
                $vsixDst = Join-Path (Split-Path $dataDir -Parent) "jama-editor.vsix"
                Copy-Item $vsixFile.FullName $vsixDst -Force
                Write-Host "  Copied $($vsixFile.Name) -> data/jama-editor.vsix" -ForegroundColor Green
            }
        }
    } finally {
        Pop-Location
    }
}

Write-Host ""
Write-Host "Done. Run 'pip install -e .' and then 'jama-post-install' to update all hosts." -ForegroundColor Green
