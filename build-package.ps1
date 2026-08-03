# Build jama-connect package with viewer and VS Code extension
# This script:
# 1. Builds the Next.js viewer (static export)
# 2. Builds the VS Code extension
# 3. Packages everything into a wheel

param(
    [switch]$SkipViewer,
    [switch]$SkipExtension,
    [switch]$SkipWheel
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Building jama-connect package..." -ForegroundColor Green

# 1. Build Viewer (Next.js static export)
if (-not $SkipViewer) {
    Write-Host "`n[1/3] Building Next.js viewer..." -ForegroundColor Cyan
    
    $viewerDir = Join-Path $scriptDir "viewer"
    if (Test-Path $viewerDir) {
        Push-Location $viewerDir
        try {
            Write-Host "Installing viewer dependencies..."
            npm ci
            
            Write-Host "Building static export..."
            npm run build
            
            # Copy built files to viewer_static
            $outDir = Join-Path $viewerDir "out"
            $staticDir = Join-Path $scriptDir "src\jama_mcp_v2\viewer_static"
            
            if (Test-Path $outDir) {
                Write-Host "Copying static files to $staticDir"
                if (Test-Path $staticDir) {
                    Remove-Item $staticDir -Recurse -Force
                }
                Copy-Item $outDir $staticDir -Recurse
                Write-Host "Viewer built successfully!" -ForegroundColor Green
            } else {
                Write-Host "ERROR: Viewer build output not found at $outDir" -ForegroundColor Red
                exit 1
            }
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "WARNING: Viewer directory not found at $viewerDir" -ForegroundColor Yellow
    }
}

# 2. Build VS Code Extension
if (-not $SkipExtension) {
    Write-Host "`n[2/3] Building VS Code extension..." -ForegroundColor Cyan
    
    $extDir = Join-Path $scriptDir "vscode-extension"
    if (Test-Path $extDir) {
        Push-Location $extDir
        try {
            Write-Host "Installing extension dependencies..."
            npm ci
            
            Write-Host "Compiling extension..."
            npm run compile
            
            Write-Host "Packaging extension..."
            npm run package
            
            # The VSIX will be created in the extension directory
            $vsixFile = Get-ChildItem $extDir -Filter "*.vsix" | Select-Object -First 1
            if ($vsixFile) {
                Write-Host "Extension packaged: $($vsixFile.Name)" -ForegroundColor Green
            }
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "WARNING: Extension directory not found at $extDir" -ForegroundColor Yellow
    }
}

# 3. Build Python Wheel
if (-not $SkipWheel) {
    Write-Host "`n[3/3] Building Python wheel..." -ForegroundColor Cyan
    
    Push-Location $scriptDir
    try {
        Write-Host "Building wheel with uv..."
        uv build
        
        $wheel = Get-ChildItem (Join-Path $scriptDir "dist") -Filter "*.whl" | Select-Object -First 1
        if ($wheel) {
            Write-Host "Wheel built successfully: $($wheel.Name)" -ForegroundColor Green
            Write-Host "`nTo install locally:" -ForegroundColor Cyan
            Write-Host "  pip install dist/$($wheel.Name)" -ForegroundColor Gray
            Write-Host "`nTo publish to PyPI:" -ForegroundColor Cyan
            Write-Host "  twine upload --repository-url http://nz-lnx-01/pypi dist/$($wheel.Name)" -ForegroundColor Gray
        } else {
            Write-Host "ERROR: Wheel build failed" -ForegroundColor Red
            exit 1
        }
    } finally {
        Pop-Location
    }
}

Write-Host "`njama-connect build complete!" -ForegroundColor Green
